#!/usr/bin/env python3
"""Convert a user-supplied BSP v30 map into browser geometry and navigation."""
from collections import defaultdict, deque
from io import BytesIO
from pathlib import Path
import json
import math
import re
import struct

import numpy as np
from PIL import Image

from prepare_cs_assets import GLB, web_position

INVISIBLE = {'sky', 'clip', 'origin', 'aaatrigger', 'null', 'hint', 'skip', 'bevel', 'contentwater'}


def face_triangles(vertices, normal):
    """Match glTF front faces to BSP normals so dynamic light reaches the room."""
    for i in range(1, len(vertices) - 1):
        forward = np.dot(np.cross(vertices[i] - vertices[0], vertices[i+1] - vertices[0]), normal) > 0
        yield (0, i, i+1) if forward else (0, i+1, i)


def inside_polygon(x, z, vertices):
    signs = []
    for a, b in zip(vertices, vertices[1:] + vertices[:1]):
        cross = (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])
        if abs(cross) > 0.0001: signs.append(cross > 0)
    return not signs or all(signs) or not any(signs)


class BSP:
    def __init__(self, path, root):
        self.path, self.root = path, root
        self.data = path.read_bytes()
        if self.unpack('i', 0)[0] != 30: raise ValueError('Expected a GoldSrc BSP v30 map')
        self.lumps = [self.unpack('2i', 4+i*8) for i in range(15)]
        for offset, size in self.lumps:
            if offset < 0 or size < 0 or offset+size > len(self.data): raise ValueError('Invalid BSP lump bounds')
        self.entities = [dict(re.findall(r'"([^"\n]+)"\s*"([^"\n]*)"', text)) for text in re.findall(r'\{([^}]*)\}', self.lump(0).decode('latin1'))]
        self.planes = [list(v[:4]) for v in self.records(1, '4fi')]
        self.vertices = np.array(list(self.records(3, '3f')))
        self.texinfo = list(self.records(6, '8f2i'))
        self.faces = list(self.records(7, 'Hhihh4Bi'))
        self.clipnodes = [list(v) for v in self.records(9, 'ihh')]
        self.edges = list(self.records(12, '2H'))
        self.surfedges = [v[0] for v in self.records(13, 'i')]
        self.models = list(self.records(14, '9f7i'))
        self.wad_entries = {}
        for path in sorted(root.rglob('*.wad')):
            if path.name.lower() in ['cached.wad', 'tempdecal.wad']: continue
            data = path.read_bytes()
            if data[:4] != b'WAD3': continue
            count, offset = struct.unpack_from('<ii', data, 4)
            for i in range(count):
                start, packed, size, kind, compressed, _, raw = struct.unpack_from('<iiiBBH16s', data, offset+i*32)
                if kind == 67 and not compressed:
                    self.wad_entries[raw.split(b'\0')[0].decode('latin1').lower()] = data[start:start+size]
        self.textures = self.load_textures()
        self.brushes = []
        self.render_models = {0}
        self.solid_models = {0}
        for entity in self.entities:
            if not entity.get('model', '').startswith('*'): continue
            model = int(entity['model'][1:])
            kind = entity['classname']
            if kind.startswith('trigger_') or kind in ['func_buyzone', 'func_bomb_target']: continue
            self.render_models.add(model)
            if kind in ['func_wall', 'func_breakable', 'func_door', 'func_door_rotating']:
                self.solid_models.add(model)
                m = self.models[model]
                low, high = web_position(np.array(m[:3])), web_position(np.array(m[3:6]))
                self.brushes.append([np.minimum(low, high).tolist(), np.maximum(low, high).tolist()])
        self.polygons = []

    def unpack(self, fmt, offset): return struct.unpack_from('<'+fmt, self.data, offset)
    def lump(self, i):
        start, size = self.lumps[i]
        return self.data[start:start+size]
    def records(self, i, fmt): return struct.iter_unpack('<'+fmt, self.lump(i))

    def load_textures(self):
        data = self.lump(2)
        count = struct.unpack_from('<i', data)[0]
        result = []
        for i in range(count):
            offset = struct.unpack_from('<i', data, 4+i*4)[0]
            if offset < 0: result.append(None); continue
            raw, w, h, first, _, _, _ = struct.unpack_from('<16s6I', data, offset)
            name = raw.split(b'\0')[0].decode('latin1')
            source = data[offset:]
            if not first:
                source = self.wad_entries.get(name.lower())
                if source is None:
                    if name.lower() in INVISIBLE: result.append({'name': name}); continue
                    raise ValueError(f'Missing WAD texture: {name}')
                _, w, h, first, _, _, _ = struct.unpack_from('<16s6I', source)
            palette_at = first + (w*h*85)//64
            colors = struct.unpack_from('<H', source, palette_at)[0]
            if colors != 256: raise ValueError(f'Invalid palette in {name}')
            indexed = np.frombuffer(source, np.uint8, w*h, first).reshape(h, w)
            palette = np.frombuffer(source, np.uint8, 768, palette_at+2).reshape(256, 3)
            rgba = np.concatenate([palette[indexed], np.full((h, w, 1), 255, np.uint8)], axis=2)
            if name.startswith('{'): rgba[indexed == 255, 3] = 0
            result.append({'name': name, 'w': w, 'h': h, 'pixels': rgba})
        return result

    def can_stand(self, x, y, z):
        gx, gy, gz = x*32, -z*32, (y+1.125)*32
        index = self.models[0][10]  # expanded standing-player hull
        for _ in range(1024):
            if index < 0: break
            plane, front, back = self.clipnodes[index]
            a, b, c, distance = self.planes[plane]
            index = front if gx*a+gy*b+gz*c-distance >= 0 else back
        if index == -2 or index >= 0: return False
        for low, high in self.brushes:
            if low[0]-.5 < x < high[0]+.5 and low[2]-.5 < z < high[2]+.5 and y+.06 < high[1] and y+2.2 > low[1]: return False
        return True

    def export(self, output, map_id='dust2'):
        glb = GLB()
        glb.doc['nodes'] = [{'name': self.path.stem, 'mesh': 0}]
        for key in ['skins', 'animations']: del glb.doc[key]
        materials = {}
        for i, texture in enumerate(self.textures):
            if texture is None or texture['name'].lower() in INVISIBLE: continue
            materials[i] = glb.material(texture['name'], texture['pixels'], texture['name'].startswith('{'))
        geometry = defaultdict(lambda: {'positions': [], 'normals': [], 'uv': [], 'uv1': []})
        atlas_size = 1024 if map_id == 'dust2' else 2048
        atlas = np.full((atlas_size, atlas_size, 3), 128, np.uint8)
        ax, ay, row = 2, 2, 0
        face_count = 0
        for model_index in sorted(self.render_models):
            model = self.models[model_index]
            for index in range(model[14], model[14]+model[15]):
                plane_id, side, first, count, info_id, *rest = self.faces[index]
                info = self.texinfo[info_id]
                texture_index = info[8]
                if texture_index not in materials: continue
                texture = self.textures[texture_index]
                vertices = []
                for i in range(count):
                    edge = self.surfedges[first+i]
                    vertex = self.edges[abs(edge)][0 if edge >= 0 else 1]
                    vertices.append(self.vertices[vertex])
                vertices = np.array(vertices)
                if len(vertices) < 3: continue
                st = np.array([[np.dot(vertex, info[:3])+info[3], np.dot(vertex, info[4:7])+info[7]] for vertex in vertices])
                minimum = np.floor(st.min(axis=0)/16).astype(int)
                dimensions = np.ceil(st.max(axis=0)/16).astype(int)-minimum+1
                w, h = map(int, dimensions)
                if ax+w+2 >= atlas_size: ax = 2; ay += row+4; row = 0
                if ay+h+2 >= atlas_size: raise ValueError('Lightmap atlas is full')
                light_offset = rest[-1]
                if light_offset >= 0:
                    pixels = np.frombuffer(self.lump(8), np.uint8, w*h*3, light_offset).reshape(h, w, 3)
                else: pixels = np.full((h, w, 3), 150, np.uint8)
                atlas[ay:ay+h, ax:ax+w] = pixels
                # Pad edges to keep bilinear sampling away from neighboring faces.
                atlas[ay-1, ax:ax+w] = pixels[0]; atlas[ay+h, ax:ax+w] = pixels[-1]
                atlas[ay-1:ay+h+1, ax-1] = atlas[ay-1:ay+h+1, ax]
                atlas[ay-1:ay+h+1, ax+w] = atlas[ay-1:ay+h+1, ax+w-1]
                lm = (st/16-minimum+[ax+.5, ay+.5])/atlas_size
                ax += w+4; row = max(row, h)
                normal = np.array(self.planes[plane_id][:3]) * (-1 if side else 1)
                converted = [web_position(vertex).tolist() for vertex in vertices]
                web_normal = web_position(normal)*32
                if normal[2] > 0.55 and model_index in self.solid_models:
                    self.polygons.append({'vertices': converted, 'normal': web_normal.tolist(), 'distance': float(np.dot(web_normal, converted[0]))})
                bucket = geometry[texture_index]
                for triangle in face_triangles(vertices, normal):
                    for v in triangle:
                        bucket['positions'].append(converted[v]); bucket['normals'].append(web_normal)
                        bucket['uv'].append(st[v]/[texture['w'], texture['h']]); bucket['uv1'].append(lm[v])
                face_count += 1
        primitives = []
        for texture, values in geometry.items():
            attributes = {name: glb.accessor(values[source], kind) for name, source, kind in [
                ('POSITION', 'positions', 'VEC3'), ('NORMAL', 'normals', 'VEC3'), ('TEXCOORD_0', 'uv', 'VEC2'), ('TEXCOORD_1', 'uv1', 'VEC2')]}
            for accessor in attributes.values(): glb.doc['bufferViews'][glb.doc['accessors'][accessor]['bufferView']]['target'] = 34962
            primitives.append({'attributes': attributes, 'material': materials[texture]})
        glb.doc['meshes'] = [{'primitives': primitives}]
        glb.save(output/f'{map_id}.glb')
        Image.fromarray(atlas).save(output/f'{map_id}-lightmap.png')
        print(f'{map_id}:', face_count, 'faces,',len(primitives),'texture batches,',len(self.polygons),'walkable polygons', flush=True)
        return {'faces': face_count, 'materials': len(primitives), 'geometry': f'{map_id}.glb', 'lightmap': f'{map_id}-lightmap.png'}

    def export_prop(self, output, model_index):
        """Copy an original brush model with its exact faces and texture UVs."""
        model = self.models[model_index]
        center = web_position((np.array(model[:3]) + np.array(model[3:6])) / 2)
        glb = GLB(); glb.doc['nodes'] = [{'name': f'{self.path.stem}_model_{model_index}', 'mesh': 0}]
        del glb.doc['skins']; del glb.doc['animations']
        geometry, materials = {}, {}
        for index in range(model[14], model[14] + model[15]):
            plane, side, first, count, info_id, *_ = self.faces[index]
            info = self.texinfo[info_id]; texture_index = info[8]; texture = self.textures[texture_index]
            if texture_index not in materials: materials[texture_index] = glb.material(texture['name'], texture['pixels'])
            bucket = geometry.setdefault(texture_index, {'positions': [], 'normals': [], 'uv': []})
            vertices = []
            for edge in self.surfedges[first:first+count]: vertices.append(self.vertices[self.edges[abs(edge)][0 if edge >= 0 else 1]])
            normal = np.array(self.planes[plane][:3]) * (-1 if side else 1)
            vertices = np.array(vertices)
            for triangle in face_triangles(vertices, normal):
                for vertex in vertices[list(triangle)]:
                    bucket['positions'].append(web_position(vertex) - center); bucket['normals'].append(web_position(normal) * 32)
                    bucket['uv'].append([(np.dot(vertex, info[:3])+info[3])/texture['w'], (np.dot(vertex, info[4:7])+info[7])/texture['h']])
        primitives = []
        for texture, values in geometry.items():
            attributes = {name: glb.accessor(values[key], kind) for name, key, kind in [('POSITION', 'positions', 'VEC3'), ('NORMAL', 'normals', 'VEC3'), ('TEXCOORD_0', 'uv', 'VEC2')]}
            for accessor in attributes.values(): glb.doc['bufferViews'][glb.doc['accessors'][accessor]['bufferView']]['target'] = 34962
            primitives.append({'attributes': attributes, 'material': materials[texture]})
        glb.doc['meshes'] = [{'primitives': primitives}]; glb.save(output)
        return {'file': output.name, 'source': f'{self.path.name}#model{model_index}', 'bones': 0, 'materials': len(materials), 'primitives': len(primitives), 'faces': model[15], 'animations': [], 'hitboxes': [], 'attachments': [], 'bytes': output.stat().st_size}

    def navigation(self, step=.5):
        samples = {}
        for polygon in self.polygons:
            vertices, normal, distance = polygon['vertices'], polygon['normal'], polygon['distance']
            x0 = math.ceil(min(p[0] for p in vertices)/step); x1 = math.floor(max(p[0] for p in vertices)/step)
            z0 = math.ceil(min(p[2] for p in vertices)/step); z1 = math.floor(max(p[2] for p in vertices)/step)
            for ix in range(x0, x1+1):
                for iz in range(z0, z1+1):
                    x, z = ix*step, iz*step
                    if not inside_polygon(x, z, vertices): continue
                    y = (distance-normal[0]*x-normal[2]*z)/normal[1]
                    key = (ix, iz, round(y, 3))
                    # Keep graph paths off exact clip-plane edges: small steering or
                    # floating-point differences must not turn a valid lane into solid.
                    if key not in samples and self.can_stand(x, y+.04, z) and all(self.can_stand(x+ox, y+.16, z+oz) for ox, oz in [(.08,0),(-.08,0),(0,.08),(0,-.08)]): samples[key] = [x, round(y, 4), z]
        nodes = list(samples.values()); columns = defaultdict(list)
        for i, p in enumerate(nodes): columns[(round(p[0]/step), round(p[2]/step))].append(i)
        links = [[] for _ in nodes]
        for i, p in enumerate(nodes):
            ix, iz = round(p[0]/step), round(p[2]/step)
            for dx, dz in [(1,0),(-1,0),(0,1),(0,-1)]:
                for j in columns.get((ix+dx, iz+dz), []):
                    q = nodes[j]
                    if abs(p[1]-q[1]) > .63: continue
                    height = max(p[1], q[1])+.04
                    if all(self.can_stand(p[0]+(q[0]-p[0])*t, height, p[2]+(q[2]-p[2])*t) for t in [.2, .4, .6, .8]): links[i].append(j)
        # Discard isolated roofs and decorative ledges; only the main walkable component is used for spawning.
        seen, components = set(), []
        for i in range(len(nodes)):
            if i in seen: continue
            queue, component = deque([i]), []
            seen.add(i)
            while queue:
                j = queue.popleft(); component.append(j)
                for k in links[j]:
                    if k not in seen: seen.add(k); queue.append(k)
            components.append(component)
        main = max(components, key=len)
        remap = {old: new for new, old in enumerate(main)}
        nodes, links = [nodes[i] for i in main], [[remap[j] for j in links[i] if j in remap] for i in main]
        print('Navigation:',len(nodes),'nodes;',len(components),'components; discarded',len(samples)-len(nodes),'isolated nodes')
        def nearest(point): return min(range(len(nodes)), key=lambda i: sum((a-b)**2 for a,b in zip(nodes[i], point)))
        ct = next((e for e in self.entities if e.get('classname') == 'info_player_start'), None)
        if ct is None: ct = next(e for e in self.entities if e.get('classname') == 'info_player_deathmatch')
        ct_pos = web_position(np.array(list(map(float,ct['origin'].split()))))
        start = nodes[nearest(ct_pos)]
        original_spawns = [web_position(np.array(list(map(float, e['origin'].split())))) for e in self.entities if e.get('classname') in ['info_player_start','info_player_deathmatch']]
        spawn_ids = sorted(set(nearest(point) for point in original_spawns))
        # Include graph points in reachable midrange lanes, so waves arrive without a long empty wait.
        spawn_ids += [i for i,p in enumerate(nodes) if 12 < math.dist(p,start) < 27 and i % 43 == 0]
        angle = float(ct['angles'].split()[1]) if 'angles' in ct else float(ct.get('angle', 0))
        return {'step': step, 'nodes': nodes, 'links': links, 'playerSpawn': start,
                'playerYaw': math.radians(angle)-math.pi/2,
                'spawns': [nodes[i] for i in spawn_ids], 'polygons': self.polygons,
                'planes': self.planes, 'clipnodes': self.clipnodes, 'headnode': self.models[0][10], 'brushes': self.brushes,
                'pointNodes': [[record[0], record[1], record[2]] for record in self.records(5, 'i8h2H')],
                'leafContents': [record[0] for record in self.records(10, 'ii6h2H4B')], 'pointHeadnode': self.models[0][9]}


def convert_crate(root, output):
    bsp = BSP(root/'cstrike/maps/de_dust2.bsp', root)
    for entity in bsp.entities:
        if entity.get('classname') != 'func_breakable' or not entity.get('model', '').startswith('*'): continue
        index = int(entity['model'][1:]); model = bsp.models[index]
        if model[15] != 6 or not np.allclose(np.array(model[3:6])-model[:3], [64, 64, 64]): continue
        textures = [bsp.textures[bsp.texinfo[bsp.faces[face][4]][8]]['name'] for face in range(model[14], model[14]+model[15])]
        if not all(name.lower().startswith('mltrycrte') for name in textures): continue
        result = bsp.export_prop(output/'crate.glb', index)
        result['sha256'] = __import__('hashlib').sha256(bsp.data).hexdigest()
        print('Original Dust II supply crate:', result['source'], result['bytes'], 'bytes', flush=True)
        return result
    raise ValueError('An intact original Dust II military crate was not found')


def convert_map(root, output, relative='cstrike/maps/de_dust2.bsp', map_id='dust2', name='DUST II'):
    bsp = BSP(root/relative, root)
    result = bsp.export(output, map_id)
    nav = bsp.navigation()
    result.update(id=map_id, name=name, code=Path(relative).stem, collision=f'{map_id}.json', navigationNodes=len(nav['nodes']))
    (output/f'{map_id}.json').write_text(json.dumps(nav, separators=(',', ':')))
    sky = {}
    (output/'sky').mkdir(exist_ok=True)
    all_files = {p.name.lower(): p for parent in [root/'valve/gfx/env',root/'cstrike/gfx/env'] for p in parent.glob('*') if p.is_file()}
    sky_name = next((e.get('skyname', 'des') for e in bsp.entities if e.get('classname') == 'worldspawn'), 'des').lower()
    for suffix in ['rt','lf','up','dn','bk','ft']:
        source = all_files.get(sky_name+suffix+'.tga')
        if source:
            filename = f'des{suffix}.png' if map_id == 'dust2' else f'{map_id}-{suffix}.png'
            Image.open(source).convert('RGB').save(output/'sky'/filename)
            sky[suffix] = f'sky/{filename}'
    result['sky'] = sky
    print(f'{name} browser geometry:',(output/f'{map_id}.glb').stat().st_size,'bytes', flush=True)
    return result


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1]/'game-assets/extracted/app')
    parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'game-assets/ready')
    args=parser.parse_args()
    output=args.output.resolve();output.mkdir(parents=True,exist_ok=True)
    result=convert_map(args.source.resolve(),output)
    manifest_path=output/'manifest.json'
    manifest=json.loads(manifest_path.read_text())
    manifest['world']=result
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
