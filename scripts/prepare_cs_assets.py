#!/usr/bin/env python3
"""Convert user-supplied GoldSrc studio models to local, self-contained GLBs.

Reads data only. Never launches the installer, native libraries, or game scripts.
Generated files stay in ignored game-assets/, outside public/ and dist/.
"""
from __future__ import annotations

import argparse
from collections import Counter
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import shutil
import struct

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]


def quaternion(angles):
    x, y, z = np.asarray(angles) * 0.5
    sx, sy, sz = np.sin([x, y, z])
    cx, cy, cz = np.cos([x, y, z])
    return np.array([sx * cy * cz - cx * sy * sz,
                     cx * sy * cz + sx * cy * sz,
                     cx * cy * sz - sx * sy * cz,
                     cx * cy * cz + sx * sy * sz])


def transform(position, rotation):
    x, y, z, w = rotation
    result = np.eye(4)
    result[:3, :3] = [
        [1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
        [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
        [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)],
    ]
    result[:3, 3] = position
    return result


BASIS = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=float)


def web_position(position):
    return BASIS @ position / 32


def web_rotation(q):
    # Conjugation by a -90 degree X rotation converts Z-up to Y-up.
    # Mapping the vector part is equivalent and preserves the scalar part.
    return np.array([q[0], q[2], -q[1], q[3]])


def anim_value(data, offset, frame):
    """Decode one channel of the studio format's valid/total RLE stream."""
    for _ in range(10000):
        valid, total = struct.unpack_from('<BB', data, offset)
        if not total or valid > total:
            raise ValueError('Invalid studio animation RLE run')
        if frame < total:
            return struct.unpack_from('<h', data, offset + 2 * min(frame + 1, valid))[0] if valid else 0
        frame -= total
        offset += 2 * (valid + 1)
    raise ValueError('Animation channel did not terminate')


def triangle_indices(count):
    """Negative counts encode fans; positive counts encode alternating strips."""
    n = abs(count)
    return [(0, i - 1, i) if count < 0 else ((i - 2, i - 1, i) if i % 2 == 0 else (i - 1, i - 2, i)) for i in range(2, n)]


class GLB:
    def __init__(self):
        self.binary = bytearray()
        self.doc = dict(asset={'version': '2.0', 'generator': 'BIOHAZARD local GoldSrc importer'},
                        buffers=[{'byteLength': 0}], bufferViews=[], accessors=[], nodes=[], meshes=[], skins=[],
                        materials=[], images=[], textures=[], animations=[], scenes=[{'nodes': [0]}], scene=0,
                        samplers=[{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}])

    def view(self, data):
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        index = len(self.doc['bufferViews'])
        self.doc['bufferViews'].append({'buffer': 0, 'byteOffset': len(self.binary), 'byteLength': len(data)})
        self.binary.extend(data)
        return index

    def accessor(self, values, kind, component=5126):
        dtype = '<f4' if component == 5126 else '<u2'
        values = np.asarray(values, dtype=dtype)
        index = len(self.doc['accessors'])
        item = {'bufferView': self.view(values.tobytes()), 'componentType': component, 'count': len(values), 'type': kind}
        if kind in ('SCALAR', 'VEC3') and len(values):
            item['min'] = np.min(values.reshape(len(values), -1), axis=0).astype(float).tolist()
            item['max'] = np.max(values.reshape(len(values), -1), axis=0).astype(float).tolist()
        self.doc['accessors'].append(item)
        return index

    def material(self, name, pixels, masked=False):
        image = BytesIO()
        Image.fromarray(pixels).save(image, format='PNG')
        self.doc['images'].append({'bufferView': self.view(image.getvalue()), 'mimeType': 'image/png'})
        self.doc['textures'].append({'source': len(self.doc['images']) - 1, 'sampler': 0})
        material = {'name': name, 'doubleSided': True, 'pbrMetallicRoughness': {
            'baseColorTexture': {'index': len(self.doc['textures']) - 1}, 'metallicFactor': 0, 'roughnessFactor': 0.9}}
        if masked:
            material.update(alphaMode='MASK', alphaCutoff=0.5)
        self.doc['materials'].append(material)
        return len(self.doc['materials']) - 1

    def save(self, path):
        for node in self.doc['nodes']:
            if node.get('children') == []: del node['children']
        self.doc['buffers'][0]['byteLength'] = len(self.binary)
        js = json.dumps(self.doc, separators=(',', ':'), allow_nan=False).encode()
        js += b' ' * (-len(js) % 4)
        self.binary.extend(b'\0' * (-len(self.binary) % 4))
        total = 12 + 8 + len(js) + 8 + len(self.binary)
        path.write_bytes(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(js), 0x4E4F534A) + js
                         + struct.pack('<II', len(self.binary), 0x004E4942) + self.binary)


class Studio:
    def __init__(self, path):
        self.path = path
        self.data = path.read_bytes()
        if self.data[:4] != b'IDST' or self.i(4) != 10 or self.i(72) != len(self.data):
            raise ValueError(f'Invalid GoldSrc studio model: {path.name}')
        self.bones = []
        for i in range(self.i(140)):
            offset = self.i(144) + i * 112
            values = np.array(self.unpack('6f', offset + 64))
            self.bones.append({'name': self.string(offset, 32), 'parent': self.i(offset + 32),
                               'values': values, 'scale': np.array(self.unpack('6f', offset + 88)),
                               'position': values[:3], 'rotation': quaternion(values[3:])})
        self.world = []
        for bone in self.bones:
            local = transform(bone['position'], bone['rotation'])
            self.world.append(self.world[bone['parent']] @ local if bone['parent'] >= 0 else local)

    def unpack(self, fmt, offset): return struct.unpack_from('<' + fmt, self.data, offset)
    def i(self, offset): return self.unpack('i', offset)[0]
    def string(self, offset, size): return self.data[offset:offset+size].split(b'\0')[0].decode('latin1')

    def hitboxes(self):
        result = []
        for index in range(self.i(156)):
            bone, group, *bounds = self.unpack('ii6f', self.i(160) + index * 32)
            if not 0 <= bone < len(self.bones):
                raise ValueError('Invalid studio hitbox bone')
            a, b = web_position(np.array(bounds[:3])), web_position(np.array(bounds[3:]))
            result.append({'bone': bone, 'group': group, 'min': np.minimum(a, b).tolist(), 'max': np.maximum(a, b).tolist()})
        return result

    def attachments(self):
        result = []
        for index in range(self.i(212)):
            offset = self.i(216) + index * 88
            bone = self.i(offset + 36)
            if not 0 <= bone < len(self.bones):
                raise ValueError('Invalid studio attachment bone')
            result.append({'bone': bone, 'position': web_position(np.array(self.unpack('3f', offset + 40))).tolist()})
        return result

    def convert(self, output, wanted):
        glb = GLB()
        # GoldSrc is Z-up; the web world is Y-up. 32 source units = 1 meter.
        basis = np.eye(4); basis[:3, :3] = BASIS / 32
        glb.doc['nodes'].append({'name': self.path.stem, 'children': []})
        for index, bone in enumerate(self.bones):
            node = {'name': bone['name'], 'translation': web_position(bone['position']).tolist(), 'rotation': web_rotation(bone['rotation']).tolist(), 'children': []}
            glb.doc['nodes'].append(node)
            parent = bone['parent'] + 1 if bone['parent'] >= 0 else 0
            glb.doc['nodes'][parent]['children'].append(index + 1)
        inverse = np.array([np.linalg.inv(basis @ matrix @ np.linalg.inv(basis)).flatten(order='F') for matrix in self.world])
        glb.doc['skins'].append({'joints': list(range(1, len(self.bones) + 1)), 'inverseBindMatrices': glb.accessor(inverse, 'MAT4')})
        texture_data = self.data
        if not self.i(180):
            texture_path = self.path.with_name(self.path.stem + 't.mdl')
            texture_data = texture_path.read_bytes()
            if texture_data[:4] != b'IDST': raise ValueError('Invalid external texture model')
        texture_count, texture_index = struct.unpack_from('<ii', texture_data, 180)
        sizes = []
        for i in range(texture_count):
            offset = texture_index + i * 80
            name = texture_data[offset:offset+64].split(b'\0')[0].decode('latin1')
            flags, w, h, pixels = struct.unpack_from('<4i', texture_data, offset+64)
            if not (0 < w <= 4096 and 0 < h <= 4096): raise ValueError('Invalid studio texture dimensions')
            indexed = np.frombuffer(texture_data, np.uint8, w*h, pixels).reshape(h, w)
            palette = np.frombuffer(texture_data, np.uint8, 768, pixels+w*h).reshape(256, 3)
            rgba = np.concatenate([palette[indexed], np.full((h, w, 1), 255, dtype=np.uint8)], axis=2)
            if flags & 0x40: rgba[indexed == 255, 3] = 0
            glb.material(name, rgba, bool(flags & 0x40)); sizes.append((w, h))
        skin_count, _, skin_index = self.unpack('3i', 192)
        skin_refs = self.unpack(f'{skin_count}h', skin_index) if skin_count else list(range(texture_count))
        # A split texture model carries the skin table when the main file has none.
        if not skin_count:
            count, _, offset = struct.unpack_from('<3i', texture_data, 192)
            if count: skin_refs = struct.unpack_from(f'<{count}h', texture_data, offset)
        primitives = []
        bounds = []
        for body in range(self.i(204)):
            part = self.i(208) + body * 76
            model = self.i(part + 72)  # first submodel of each body group
            meshes, mesh_index, vertex_count, bone_info, vertices = self.unpack('5i', model + 72)
            for mesh in range(meshes):
                mesh_offset = mesh_index + mesh * 20
                _, command, skin, _, _ = self.unpack('5i', mesh_offset)
                material = skin_refs[skin]
                w, h = sizes[material]
                pos, uv, joints, weights = [], [], [], []
                while True:
                    count = self.unpack('h', command)[0]; command += 2
                    if count == 0: break
                    if abs(count) > 20000: raise ValueError('Invalid studio triangle command')
                    strip = [self.unpack('4h', command + j * 8) for j in range(abs(count))]; command += abs(count) * 8
                    for triangle in triangle_indices(count):
                        for k in triangle:
                            vertex, _, s, t = strip[k]
                            if not (0 <= vertex < vertex_count): raise ValueError('Studio vertex out of bounds')
                            bone = self.data[bone_info + vertex]
                            local = np.array([*self.unpack('3f', vertices + vertex * 12), 1])
                            position = (self.world[bone] @ local)[:3]
                            pos.append(web_position(position)); bounds.append(position)
                            uv.append([s/w, t/h]); joints.append([bone, 0, 0, 0]); weights.append([1, 0, 0, 0])
                if pos:
                    attributes = {'POSITION': glb.accessor(pos, 'VEC3'), 'TEXCOORD_0': glb.accessor(uv, 'VEC2'),
                                  'JOINTS_0': glb.accessor(joints, 'VEC4', 5123), 'WEIGHTS_0': glb.accessor(weights, 'VEC4')}
                    for accessor in attributes.values(): glb.doc['bufferViews'][glb.doc['accessors'][accessor]['bufferView']]['target'] = 34962
                    primitives.append({'attributes': attributes, 'material': material})
        glb.doc['meshes'].append({'primitives': primitives})
        mesh_node = len(glb.doc['nodes']); glb.doc['nodes'].append({'name': 'studio_mesh', 'mesh': 0, 'skin': 0})
        glb.doc['scenes'][0]['nodes'].append(mesh_node)
        sequences = []
        for index in range(self.i(164)):
            desc = self.i(168) + index * 176
            name = self.string(desc, 32)
            if name not in wanted: continue
            group = self.i(desc + 156)
            if group: continue  # chosen gameplay sequences are in group zero
            fps = self.unpack('f', desc+32)[0]; frames = self.i(desc+56); motion = self.i(desc+68); motion_bone = self.i(desc+72)
            group_zero = self.i(176)
            group_offset = self.i(group_zero+100)
            animation = self.i(desc+124) + group_offset
            times = np.arange(frames, dtype=float)/fps
            animation_doc = {'name': name, 'samplers': [], 'channels': []}
            time_accessor = glb.accessor(times, 'SCALAR')
            for bone_index, bone in enumerate(self.bones):
                location = animation + bone_index * 12
                offsets = self.unpack('6H', location)
                poses = []
                for frame in range(frames):
                    values = bone['values'].copy()
                    for channel, relative in enumerate(offsets):
                        if relative: values[channel] += anim_value(self.data, location+relative, frame) * bone['scale'][channel]
                    if bone_index == motion_bone:
                        for axis in range(3):
                            if motion & (1 << axis): values[axis] = 0
                    poses.append(values)
                poses = np.array(poses)
                rotations = np.array([web_rotation(quaternion(angles)) for angles in poses[:, 3:]])
                for frame in range(1, frames):
                    if np.dot(rotations[frame-1], rotations[frame]) < 0: rotations[frame] *= -1
                positions = np.array([web_position(position) for position in poses[:, :3]])
                for kind, values, gltf_kind in [('translation', positions, 'VEC3'), ('rotation', rotations, 'VEC4')]:
                    sampler = len(animation_doc['samplers'])
                    animation_doc['samplers'].append({'input': time_accessor, 'output': glb.accessor(values, gltf_kind), 'interpolation': 'LINEAR'})
                    animation_doc['channels'].append({'sampler': sampler, 'target': {'node': bone_index+1, 'path': kind}})
            glb.doc['animations'].append(animation_doc)
            sequences.append({'name': name, 'frames': frames, 'fps': fps})
        glb.save(output)
        bounds = np.array(bounds)
        return {'file': output.name, 'source': str(self.path.name), 'sha256': sha256(self.data).hexdigest(),
                'bones': len(self.bones), 'materials': len(sizes), 'primitives': len(primitives), 'animations': sequences,
                'hitboxes': self.hitboxes(), 'attachments': self.attachments(),
                'bounds': [bounds.min(axis=0).tolist(), bounds.max(axis=0).tolist()], 'bytes': output.stat().st_size}


def prepare(root, output):
    output.mkdir(parents=True, exist_ok=True)
    definitions = {
        'zombie': ('valve/models/zombie.mdl', ['idle1', 'walk', 'attack1', 'attack2', 'diesimple', 'dieheadshot', 'flinchsmall']),
        'headcrab': ('valve/models/headcrab.mdl', ['idle1', 'walk', 'run', 'jump', 'dieback']),
        'm4': ('cstrike/models/v_m4a1.mdl', ['idle_unsil', 'shoot1_unsil', 'reload_unsil', 'draw_unsil']),
        'ak': ('cstrike/models/v_ak47.mdl', ['idle1', 'shoot1', 'reload', 'draw']),
        'usp': ('cstrike/models/v_usp.mdl', ['idle_unsil', 'shoot1_unsil', 'reload_unsil', 'draw_unsil']),
    }
    report = {'format': 1, 'models': {}, 'sounds': {}, 'maps': []}
    for name, (relative, sequences) in definitions.items():
        model = Studio(root / relative)
        report['models'][name] = model.convert(output / f'{name}.glb', sequences)
        print(name, report['models'][name]['bytes'], 'bytes;', len(report['models'][name]['animations']), 'animations')
    sound_paths = {
        'm4': 'cstrike/sound/weapons/m4a1_unsil-1.wav', 'ak': 'cstrike/sound/weapons/ak47-1.wav',
        'usp': 'cstrike/sound/weapons/usp_unsil-1.wav', 'reload': 'cstrike/sound/weapons/m4a1_clipin.wav',
        'zombie1': 'valve/sound/zombie/zo_idle1.wav', 'zombie2': 'valve/sound/zombie/zo_idle2.wav',
        'zombieAttack': 'valve/sound/zombie/zo_attack1.wav', 'hurt': 'valve/sound/player/pl_pain2.wav',
        'crabIdle': 'valve/sound/headcrab/hc_idle1.wav', 'crabAttack': 'valve/sound/headcrab/hc_attack1.wav',
    }
    (output/'sounds').mkdir(exist_ok=True)
    for name, relative in sound_paths.items():
        source = root/relative
        if not source.exists(): raise FileNotFoundError(source)
        if source.read_bytes()[:4] != b'RIFF': raise ValueError(f'Invalid WAV file: {relative}')
        shutil.copyfile(source, output/'sounds'/f'{name}.wav')
        report['sounds'][name] = f'sounds/{name}.wav'
    for path in sorted((root/'cstrike/maps').glob('*.bsp')):
        data = path.read_bytes()
        version = struct.unpack_from('<i', data)[0]
        if version != 30: raise ValueError(f'Unexpected BSP version: {path.name}')
        for lump in range(15):
            start, length = struct.unpack_from('<ii', data, 4+lump*8)
            if start < 0 or length < 0 or start + length > len(data): raise ValueError(f'Invalid BSP lump: {path.name}')
        report['maps'].append({'name': path.stem, 'version': version, 'bytes': len(data), 'sha256': sha256(data).hexdigest()})
    report['source_files'] = {name: len([p for p in (root/name).rglob('*') if p.is_file()]) for name in ['cstrike', 'valve']}
    from prepare_bsp_map import convert_map
    report['world'] = convert_map(root, output)
    report['campaignWorlds'] = [convert_map(root, output, f'valve/maps/{map_id}.bsp', map_id, name) for map_id, name in [
        ('c1a0', 'ANOMALOUS MATERIALS'), ('c1a1', 'UNFORESEEN CONSEQUENCES'), ('c1a2', 'OFFICE COMPLEX')]]
    (output/'manifest.json').write_text(json.dumps(report, indent=2)+'\n')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=REPO/'game-assets/extracted/app')
    parser.add_argument('--output', type=Path, default=REPO/'game-assets/ready')
    arguments = parser.parse_args()
    result = prepare(arguments.source.resolve(), arguments.output.resolve())
    print('Validated', len(result['maps']), 'maps. Prepared local assets in', arguments.output)
