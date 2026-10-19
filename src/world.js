import * as THREE from 'three';

const palette = { concrete: 0x9e9780, edge: 0x696d60, metal: 0x3d514c, dark: 0x272e2b, sand: 0xb1a58b, orange: 0xe96b35 };

function rng(seed = 17) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

function surface(kind, color) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d'), random = rng(45);
  ctx.fillStyle = color; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) {
    ctx.fillStyle = random() > 0.5 ? `rgba(255,255,235,${random() * 0.09})` : `rgba(0,0,0,${random() * 0.13})`;
    ctx.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 3);
  }
  if (kind === 'brick') {
    ctx.strokeStyle = 'rgba(36,38,30,.3)'; ctx.lineWidth = 2;
    for (let y = 0; y <= 256; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
      for (let x = (y % 64 ? -32 : 0); x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(kind === 'asphalt' ? 18 : 2, kind === 'asphalt' ? 18 : 2);
  texture.anisotropy = 4;
  return texture;
}

export function createWorld(scene) {
  const obstacles = [], walls = [], dust = [], spawns = [new THREE.Vector3(-14, 0, -23), new THREE.Vector3(14, 0, -23), new THREE.Vector3(-16, 0, 11), new THREE.Vector3(16, 0, -5), new THREE.Vector3(3, 0, -24)];
  const materials = {
    plaster: new THREE.MeshStandardMaterial({ map: surface('plaster', '#afa58a'), roughness: 1 }),
    brick: new THREE.MeshStandardMaterial({ map: surface('brick', '#96846c'), roughness: 1 }),
    grey: new THREE.MeshStandardMaterial({ map: surface('plaster', '#828b7e'), roughness: 0.95 }),
    asphalt: new THREE.MeshStandardMaterial({ map: surface('asphalt', '#666960'), roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: palette.metal, roughness: 0.72, metalness: 0.3 }),
    dark: new THREE.MeshStandardMaterial({ color: palette.dark, roughness: 0.85 }),
    sand: new THREE.MeshStandardMaterial({ color: palette.sand, roughness: 1 }),
    orange: new THREE.MeshStandardMaterial({ color: palette.orange, roughness: 0.7 }),
    wood: new THREE.MeshStandardMaterial({ map: surface('wood', '#81735a'), roughness: 1 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x344340, roughness: 0.4, metalness: 0.35 }),
    light: new THREE.MeshStandardMaterial({ color: 0xf5c78a, emissive: 0xeec18c, emissiveIntensity: 1.6 }),
  };
  function box(x, y, z, w, h, d, material, collide = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof material === 'string' ? materials[material] : material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
    if (collide) { obstacles.push({ x, z, w, d }); walls.push(mesh); }
    return mesh;
  }
  function cylinder(x, y, z, r, h, material, segments = 12) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, segments), typeof material === 'string' ? materials[material] : material);
    mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh); return mesh;
  }
  function sign(text, x, y, z, w, h, bg = '#283c36', fg = '#d4d0ba', rotation = 0) {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = Math.round(768 * h / w);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = fg; ctx.lineWidth = 3; ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    ctx.fillStyle = fg; ctx.font = `bold ${Math.min(canvas.height * 0.57, 105)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 384, canvas.height / 2 + 2, 710);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: texture, roughness: 1, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh); return mesh;
  }
  // Ground, long shadows, and warm late-afternoon haze.
  scene.background = new THREE.Color(0xb4b6a4);
  scene.fog = new THREE.FogExp2(0xb4b6a4, 0.014);
  scene.add(new THREE.HemisphereLight(0xe0e1c9, 0x50564a, 2.2));
  const sun = new THREE.DirectionalLight(0xffe0ac, 3.7); sun.position.set(-25, 35, -20); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -42; sun.shadow.camera.right = sun.shadow.camera.top = 42;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 110; sun.shadow.normalBias = 0.04; sun.shadow.bias = -0.0002; scene.add(sun);
  box(0, -0.17, 0, 80, 0.3, 80, 'asphalt');
  for (let z = -26; z < 28; z += 7) box(0, 0.003, z, 0.13, 0.013, 2.7, 'sand');
  for (const x of [-17, 17]) box(x, 0.05, 0, 1.2, 0.12, 58, 'grey');
  // The playable yard is framed by shuttered industrial buildings.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = side * 24, z = -22 + i * 14, h = 8 + (i % 3) * 2.5;
      box(x, h / 2, z, 11, h, 13.8, i % 2 ? 'plaster' : 'brick', true);
      box(x - side * 5.55, h - 0.2, z, 0.3, 0.4, 14, 'sand');
      box(x - side * 5.6, 3.7, z, 0.25, 0.2, 13.7, 'dark');
      for (let floor = 0; floor < Math.floor(h / 3) - 1; floor++) {
        for (let j = 0; j < 3; j++) {
          const wy = 5.1 + floor * 2.8, wz = z - 4 + j * 4;
          box(x - side * 5.57, wy, wz, 0.12, 1.8, 1.7, 'dark');
          box(x - side * 5.65, wy, wz, 0.1, 1.5, 1.4, 'glass');
          box(x - side * 5.75, wy, wz, 0.12, 0.09, 1.4, 'metal');
          box(x - side * 5.75, wy, wz, 0.12, 1.5, 0.07, 'metal');
        }
      }
      // Ground-level rolling shutters and pipes.
      box(x - side * 5.58, 1.6, z + 2.5, 0.18, 3.2, 4.2, 'metal');
      for (let j = 0; j < 13; j++) box(x - side * 5.7, 0.15 + j * 0.24, z + 2.5, 0.1, 0.04, 4.1, 'dark');
      cylinder(x - side * 5.9, 3, z - 5.8, 0.11, 6, 'metal');
      if (i % 2 === 0) {
        box(x - side * 5.85, 4, z - 2, 0.5, 0.7, 1.3, 'grey');
        box(x - side * 6.13, 4, z - 2, 0.03, 0.46, 1, 'dark');
      }
    }
  }
  box(-17.2, 3.2, -28, 24, 6.4, 2, 'grey', true);
  box(17.2, 3.2, -28, 24, 6.4, 2, 'grey', true);
  box(0, 6.8, -28, 11, 2.4, 2, 'plaster');
  box(0, 2.8, -29, 10.5, 5.6, 0.3, 'dark', true);
  sign('QUARANTINE  /  SECTOR 07', 0, 6.7, -26.94, 10, 1.1);
  sign('NO ENTRY', 0, 2.5, -28.8, 3.5, 0.8, '#b85730', '#eee1bd');
  box(0, 1.8, 29, 58, 3.6, 1, 'grey', true);
  sign('TURN BACK', 0, 2, 28.46, 3.5, 0.8, '#29352d', '#d2c9ad', Math.PI);
  // Shipping container, corrugated side panels, and locking bars.
  box(-9.4, 1.5, -8.4, 6.4, 3, 3, 'metal', true);
  for (let i = 0; i < 19; i++) box(-12.5 + i * 0.34, 1.5, -6.85, 0.075, 2.9, 0.1, 'dark');
  box(-9.4, 0.12, -6.77, 6.5, 0.2, 0.16, 'metal');
  box(-9.4, 2.87, -6.77, 6.5, 0.2, 0.16, 'metal');
  sign('07 · BIOLOGICAL MATERIAL', -9.3, 2.1, -6.68, 3.4, 0.53, '#3c514a', '#d5cfab');
  for (const x of [-11.6, -10.5, -8.5, -7.4]) cylinder(x, 1.45, -6.66, 0.025, 2.7, 'sand', 6);
  // Break up sightlines with pallets, crates, and sandbag barricades.
  function crate(x, z, size = 1.8, y = 0) {
    box(x, y + size / 2, z, size, size, size, 'wood', true);
    for (const dz of [-size / 2 - 0.02, size / 2 + 0.02]) {
      for (const dx of [-size * 0.35, size * 0.35]) box(x + dx, y + size / 2, z + dz, 0.13, size, 0.07, 'dark');
      box(x, y + size * 0.16, z + dz, size, 0.1, 0.07, 'dark');
      box(x, y + size * 0.85, z + dz, size, 0.1, 0.07, 'dark');
    }
    sign('↑  FRAGILE', x, y + size * 0.54, z + size / 2 + 0.07, size * 0.65, size * 0.3, '#88795c', '#373c30');
  }
  crate(6, -5, 2.1); crate(8.3, -5, 2.1); crate(7.15, -5, 1.7, 2.1);
  crate(-7, 7, 1.8); crate(-9, 7, 1.8); crate(-9, 7, 1.6, 1.8);
  crate(12, -16, 2); crate(14.1, -16, 2);
  for (const [x, z] of [[-14, -2], [-14, 0], [12, 6], [13.2, 6], [12.6, 7.3]]) {
    walls.push(cylinder(x, 0.6, z, 0.43, 1.2, 'metal'));
    for (const y of [0.16, 0.95]) cylinder(x, y, z, 0.45, 0.05, 'dark');
    obstacles.push({ x, z, w: 0.9, d: 0.9 });
  }
  for (let i = 0; i < 3; i++) {
    const x = -2.4 + i * 1.6;
    box(x, 0.5, -17, 1.5, 1, 0.9, 'grey', true);
    sign('/////', x, 0.5, -16.53, 1.45, 0.4, '#c3ae78', '#252f29');
  }
  // Abandoned utility truck.
  const truck = new THREE.Group(); scene.add(truck); truck.position.set(11, 0, 16);
  function part(x, y, z, w, h, d, mat) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[mat]); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; truck.add(m); return m;
  }
  part(0, 0.9, 0, 2.8, 0.7, 5.6, 'metal'); part(0, 1.7, -1.4, 2.6, 1.35, 2.1, 'grey');
  part(0, 2, -2.48, 2.3, 0.7, 0.035, 'glass'); part(0, 1.3, -2.8, 2.75, 0.35, 0.35, 'dark');
  part(0, 1.3, 1.3, 2.6, 0.7, 2.6, 'wood');
  for (const side of [-1, 1]) {
    part(side * 1.25, 1.9, -1.4, 0.04, 0.6, 1.5, 'glass');
    for (const z of [-1.65, 1.75]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 12), materials.dark); m.rotation.z = Math.PI / 2; m.position.set(side * 1.34, 0.6, z); m.castShadow = true; truck.add(m);
    }
    part(side * 0.9, 1.1, -3, 0.4, 0.25, 0.05, 'light');
  }
  obstacles.push({ x: 11, z: 16, w: 3, d: 6 }); walls.push(...truck.children);
  // Resupply station: a readable landmark and gameplay interaction.
  box(-12.5, 0.58, 17, 2.4, 1.15, 1.6, 'metal', true);
  box(-12.5, 1.2, 17, 2.55, 0.17, 1.7, 'sand');
  sign('+  FIELD SUPPLIES', -12.5, 0.65, 17.82, 2.1, 0.6, '#34493b', '#e3d9b4');
  sign('EVACUATION →', 3, 3.4, 28.4, 4, 0.65, '#3d5146', '#d8d4b7', Math.PI);
  sign('RESTRICTED AREA', 18.42, 3.5, 4.7, 3.5, 0.8, '#b6643f', '#ead8b4', -Math.PI / 2);
  // Utility poles, suspended cables, and sodium lamps.
  for (const [x, z] of [[-16.5, -16], [16.5, 2], [-16.5, 19]]) {
    cylinder(x, 3.7, z, 0.1, 7.4, 'dark');
    box(x + (x < 0 ? 0.65 : -0.65), 7.3, z, 1.4, 0.09, 0.12, 'dark');
    box(x + (x < 0 ? 1.3 : -1.3), 7.22, z, 0.65, 0.12, 0.35, 'light');
    const light = new THREE.PointLight(0xffc77f, 6, 10); light.position.set(x, 6.7, z); scene.add(light);
  }
  for (const z of [-16, 6, 24]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-19, 9, z), new THREE.Vector3(0, 7.1, z), new THREE.Vector3(19, 10, z)]);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.025, 4, false), materials.dark));
  }
  // Subtle airborne dust catches the sun.
  const positions = new Float32Array(270 * 3), random = rng(32);
  for (let i = 0; i < 270; i++) { positions[i * 3] = (random() - 0.5) * 58; positions[i * 3 + 1] = random() * 12; positions[i * 3 + 2] = (random() - 0.5) * 58; }
  const dustGeometry = new THREE.BufferGeometry(); dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const particles = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xe5dcc3, size: 0.055, transparent: true, opacity: 0.45, depthWrite: false })); scene.add(particles); dust.push(particles);
  return { obstacles, walls, spawns, dust, supplies: new THREE.Vector3(-12.5, 0, 17) };
}

export function createZombie(runner = false) {
  const group = new THREE.Group(), hits = [];
  const skin = new THREE.MeshStandardMaterial({ color: runner ? 0x9b9b79 : 0x8d9d83, roughness: 1, flatShading: true });
  const shirt = new THREE.MeshStandardMaterial({ color: [0x4c5b4a, 0x665c4c, 0x536064, 0x746551][Math.floor(Math.random() * 4)], roughness: 1 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x343c39, roughness: 1 });
  const blood = new THREE.MeshStandardMaterial({ color: 0x5f2920, roughness: 1 });
  const boot = new THREE.MeshStandardMaterial({ color: 0x292b29, roughness: 1 });
  const eye = new THREE.MeshStandardMaterial({ color: 0xdfb46c, emissive: 0xa43e19, emissiveIntensity: 1.8 });
  function part(geo, mat, x, y, z, head = false, parent = group) {
    const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh); mesh.userData.head = head; hits.push(mesh); return mesh;
  }
  const torso = part(new THREE.BoxGeometry(0.58, 0.65, 0.3), shirt, 0, 1.22, 0);
  torso.rotation.z = -0.06;
  part(new THREE.BoxGeometry(0.2, 0.3, 0.02), blood, -0.12, 1.28, 0.165);
  part(new THREE.CylinderGeometry(0.08, 0.1, 0.17, 6), skin, 0, 1.6, 0);
  const head = part(new THREE.SphereGeometry(0.21, 7, 6), skin, 0.015, 1.82, 0.04, true); head.scale.set(0.85, 1.2, 0.85);
  part(new THREE.BoxGeometry(0.22, 0.07, 0.03), blood, 0, 1.72, 0.2, true);
  for (const x of [-0.075, 0.075]) part(new THREE.BoxGeometry(0.045, 0.03, 0.035), eye, x, 1.86, 0.208, true);
  const legs = [], arms = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.16, 0.95, 0); group.add(leg); legs.push(leg);
    part(new THREE.CylinderGeometry(0.12, 0.095, 0.76, 6), pants, 0, -0.4, 0, false, leg);
    part(new THREE.BoxGeometry(0.21, 0.17, 0.34), boot, 0, -0.87, 0.06, false, leg);
    const arm = new THREE.Group(); arm.position.set(side * 0.37, 1.48, 0); group.add(arm); arms.push(arm);
    arm.rotation.x = runner ? -0.55 : -1.05;
    part(new THREE.CylinderGeometry(0.1, 0.08, 0.4, 6), shirt, 0, -0.18, 0, false, arm);
    part(new THREE.CylinderGeometry(0.075, 0.055, 0.4, 6), skin, 0, -0.53, 0.01, false, arm);
    part(new THREE.BoxGeometry(0.12, 0.16, 0.12), skin, 0, -0.76, 0.01, false, arm);
  }
  return { group, hits, legs, arms };
}

export function createWeapon(id) {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x303935, metalness: 0.65, roughness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1f2623, metalness: 0.2, roughness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x885334, roughness: 0.6 });
  const glove = new THREE.MeshStandardMaterial({ color: 0x4f5945, roughness: 1 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x776e52, roughness: 1 });
  function box(x, y, z, w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); group.add(m); return m; }
  function tube(x, y, z, r, length, mat) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, length, 12), mat); m.rotation.x = Math.PI / 2; m.position.set(x, y, z); group.add(m); return m; }
  if (id === 'usp') {
    box(0, 0, -0.12, 0.1, 0.09, 0.3, steel); box(0, -0.08, -0.025, 0.085, 0.17, 0.11, black).rotation.x = -0.2;
    tube(0, 0.01, -0.31, 0.027, 0.11, steel);
    for (const z of [-0.01, -0.05, -0.09]) box(0.052, 0, z, 0.005, 0.06, 0.012, black);
    box(0, 0.055, -0.25, 0.02, 0.025, 0.025, black); box(0, 0.05, 0, 0.07, 0.02, 0.03, black);
    box(0, -0.17, 0.07, 0.13, 0.16, 0.25, glove).rotation.x = -0.4;
  } else {
    box(0, 0, -0.12, 0.13, 0.14, 0.37, steel);
    box(0, -0.08, 0.07, 0.1, 0.22, 0.12, black).rotation.x = -0.3;
    box(0, -0.14, -0.13, 0.09, 0.25, 0.13, black).rotation.x = id === 'ak' ? -0.24 : 0.13;
    tube(0, 0.02, -0.52, 0.024, 0.48, steel);
    box(0, 0, -0.4, 0.115, 0.12, 0.27, id === 'ak' ? wood : black);
    for (let i = 0; i < 7; i++) box(0, 0.07, -0.3 - i * 0.033, 0.13, 0.018, 0.016, steel);
    box(0, 0, 0.23, 0.11, 0.09, 0.27, black); box(0, -0.04, 0.35, 0.1, 0.21, 0.04, black);
    box(0, 0.14, -0.02, 0.04, 0.1, 0.045, steel); box(0, 0.14, -0.6, 0.025, 0.11, 0.025, steel);
    box(0, 0.08, -0.05, 0.13, 0.025, 0.3, black);
    box(0, -0.18, 0.07, 0.13, 0.16, 0.22, glove).rotation.x = -0.35;
    box(-0.04, -0.1, -0.4, 0.15, 0.12, 0.22, glove).rotation.z = -0.3;
    box(-0.13, -0.2, -0.15, 0.15, 0.15, 0.4, sleeve).rotation.y = -0.3;
  }
  box(0.03, -0.29, 0.21, 0.16, 0.23, 0.35, sleeve).rotation.x = -0.35;
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.3, 5), new THREE.MeshBasicMaterial({ color: 0xffdf8f, transparent: true, opacity: 0.9, depthWrite: false }));
  flash.rotation.x = -Math.PI / 2; flash.position.set(0, 0.02, id === 'usp' ? -0.43 : -0.89); flash.visible = false; group.add(flash);
  const light = new THREE.PointLight(0xffb154, 0, 3); light.position.copy(flash.position); group.add(light);
  return { group, flash, light };
}
