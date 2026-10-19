import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MapCollision, NavigationGraph } from './bsp-navigation.js';
import { mediaURL, mediaJSON } from './media.js';

export async function loadDust2World(description) {
  const [model, data, lightmap] = await Promise.all([
    new GLTFLoader().loadAsync(mediaURL(description.geometry)),
    mediaJSON(description.collision),
    new THREE.TextureLoader().loadAsync(mediaURL(description.lightmap)),
  ]);
  // BSP light samples describe illumination, not sRGB surface colors.
  lightmap.flipY = false; lightmap.channel = 1; lightmap.colorSpace = THREE.NoColorSpace;
  const scene = new THREE.Scene(), walls = [], collision = new MapCollision(data), navigation = new NavigationGraph(data);
  scene.background = new THREE.Color(0xc4c4a6); scene.fog = new THREE.FogExp2(0xc9c6ac, 0.001);
  scene.add(new THREE.HemisphereLight(0xffedd2, 0x786a51, 2.2));
  const light = new THREE.DirectionalLight(0xffe4b8, 1.8); light.position.set(-20, 60, 20); scene.add(light);
  model.scene.traverse(object => {
    if (!object.isMesh) return;
    object.material.lightMap = lightmap; object.material.lightMapIntensity = 6.4; object.material.needsUpdate = true;
    object.material.map.anisotropy = 4;
    walls.push(object);
  });
  scene.add(model.scene);
  if (Object.keys(description.sky || {}).length === 6) {
    scene.background = await new THREE.CubeTextureLoader().loadAsync(['rt', 'lf', 'up', 'dn', 'bk', 'ft'].map(face => mediaURL(description.sky[face])));
    scene.background.colorSpace = THREE.SRGBColorSpace;
  }
  const playerSpawn = new THREE.Vector3(...data.playerSpawn);
  const supplyCandidates = data.nodes.filter(p => Math.hypot(p[0] - playerSpawn.x, p[2] - playerSpawn.z) > 2.3 && Math.hypot(p[0] - playerSpawn.x, p[2] - playerSpawn.z) < 3.3 && Math.abs(p[1] - playerSpawn.y) < 0.5);
  const supplies = new THREE.Vector3(...(supplyCandidates[0] || data.playerSpawn));
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.7), new THREE.MeshStandardMaterial({ color: 0x3d6245, roughness: 0.8 }));
  crate.position.copy(supplies); crate.position.y += 0.4; scene.add(crate); walls.push(crate);
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#263e2d'; ctx.fillRect(0, 0, 512, 128); ctx.fillStyle = '#e5e5c7'; ctx.font = 'bold 36px monospace'; ctx.textAlign = 'center'; ctx.fillText('+ FIELD SUPPLIES', 256, 78);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: true, transparent: true, opacity: 0.9 })); label.position.copy(supplies); label.position.y += 1.3; label.scale.set(1.5, 0.3, 1); label.visible = false; scene.add(label);
  const world = {
    id: 'dust2', name: 'DUST II', code: 'DE_DUST2', eyeHeight: 2,
    scene, collision, navigation, walls, dust: [], obstacles: [], supplies, playerSpawn, playerYaw: data.playerYaw,
    spawns: data.spawns.map(p => new THREE.Vector3(...p)),
    move: (position, dx, dz, ground) => collision.move(position, dx, dz, ground),
    findPath: (start, goal) => navigation.path(start, goal),
    update(camera, state) { const distance = camera.position.distanceTo(label.position); label.visible = state === 'playing' && distance > 3.5 && distance < 14; },
    getSpawns: point => navigation.nearbySpawns(point).map(p => new THREE.Vector3(...p)),
    menuPosition: playerSpawn.clone().add(new THREE.Vector3(0.4, 2.1, -0.5)),
    menuTarget: playerSpawn.clone().add(new THREE.Vector3(-Math.sin(data.playerYaw) * 13, 2, -Math.cos(data.playerYaw) * 13)),
    drawRadar(ctx, player, enemies, yaw, ground) {
      const scale = 2.1, x = player.x, z = player.z;
      ctx.clearRect(0, 0, 160, 160); ctx.fillStyle = '#19271f'; ctx.fillRect(0, 0, 160, 160);
      ctx.save(); ctx.translate(80 - x * scale, 80 - z * scale);
      ctx.fillStyle = '#a4ad7966'; ctx.strokeStyle = '#d1d4a833'; ctx.lineWidth = 0.5;
      for (const polygon of data.polygons) {
        if (Math.abs(polygon.vertices[0][1] - ground) > 6) continue;
        ctx.beginPath(); polygon.vertices.forEach((p, i) => { if (!i) ctx.moveTo(p[0] * scale, p[2] * scale); else ctx.lineTo(p[0] * scale, p[2] * scale); }); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#c9df9e'; ctx.fillRect(supplies.x * scale - 2, supplies.z * scale - 2, 4, 4);
      enemies.forEach(enemy => { ctx.fillStyle = enemy.runner ? '#ffbc77' : '#ee693b'; ctx.beginPath(); ctx.arc(enemy.group.position.x * scale, enemy.group.position.z * scale, 2.5, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore(); ctx.save(); ctx.translate(80, 80); ctx.rotate(-yaw); ctx.fillStyle = '#eff1d7'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3.5, 4); ctx.lineTo(0, 2); ctx.lineTo(3.5, 4); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#d3d9ba'; ctx.font = '8px monospace'; ctx.fillText('N', 77, 10);
    },
  };
  scene.updateMatrixWorld(true);
  return { scene, world };
}
