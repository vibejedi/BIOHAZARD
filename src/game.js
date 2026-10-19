import * as THREE from 'three';
import { createWorld, createZombie, createWeapon } from './world.js';
import { GameAudio } from './audio.js';
import { loadClassicAssets } from './classic-assets.js';
import { loadDust2World } from './bsp-world.js';
import { DIFFICULTIES, WEAPONS, circleBlocked, findPath, reloadAmmo, waveSize } from './rules.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const formatTime = seconds => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;

export class BiohazardGame {
  constructor(container, { onState, icon }) {
    this.container = container; this.onState = onState; this.icon = icon;
    this.state = 'home'; this.audio = new GameAudio(); this.sensitivity = 1;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.02;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', 'Biohazard 3D game view');
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 110); this.camera.rotation.order = 'YXZ';
    this.world = createWorld(this.scene);
    this.world.id = 'ashen'; this.world.name = 'ASHEN YARD';
    this.worlds = { ashen: { scene: this.scene, world: this.world } };
    this.weaponScene = new THREE.Scene(); this.weaponCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 5);
    this.weaponScene.add(new THREE.HemisphereLight(0xf1ead4, 0x545e46, 3));
    const gunLight = new THREE.DirectionalLight(0xffdeb5, 3); gunLight.position.set(-3, 4, -2); this.weaponScene.add(gunLight);
    this.weapons = {}; for (const id of Object.keys(WEAPONS)) { this.weapons[id] = createWeapon(id); this.weaponScene.add(this.weapons[id].group); this.weapons[id].group.visible = false; this.weapons[id].group.scale.setScalar(id === 'usp' ? 0.85 : 0.72); }
    this.keys = new Set(); this.enemies = []; this.effects = []; this.corpses = [];
    this.raycaster = new THREE.Raycaster(); this.center = new THREE.Vector2();
    this.yaw = 0; this.pitch = 0; this.jumpVelocity = 0; this.jumpHeight = 0; this.mouseDown = false; this.aiming = false; this.dragging = false;
    this.moveInput = { x: 0, z: 0 }; this.touch = matchMedia('(pointer: coarse)').matches;
    this.clock = new THREE.Clock(); this.elapsed = 0; this.lifeTime = 0; this.recoil = 0; this.bannerTime = 0; this.notificationTime = 0;
    this.hitTime = 0; this.damageTime = 0; this.reloadTime = 0; this.lastShot = -10; this.shootTimer = 0;
    this.hadPointerLock = false; this.menuTime = 0; this.uiTime = 0; this.stamina = 100; this.bob = 0;
    this.radar = $('radar').getContext('2d');
    this.installControls(); this.resize(); this.onState('home');
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setQuality(value) {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, value === 'low' ? 1 : 1.6));
    this.renderer.shadowMap.enabled = value !== 'low';
    this.scene.traverse(object => { if (object.material) { const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => { material.needsUpdate = true; }); } });
    this.resize();
  }

  async loadClassicAssets() {
    if (this.classicAssets) return this.classicAssets;
    const assets = await loadClassicAssets();
    if (!assets) return null;
    this.classicAssets = assets;
    for (const id of ['m4', 'ak', 'usp']) assets.installWeapon(this.weapons[id], id);
    await this.audio.loadSamples(assets.manifest.sounds);
    if (assets.manifest.world) {
      this.worlds.dust2 = await loadDust2World(assets.manifest.world);
      if (new URLSearchParams(location.search).get('map') !== 'ashen') this.selectMap('dust2');
    }
    return assets;
  }

  selectMap(id) {
    if (!this.worlds[id]) return;
    this.clearEntities();
    this.scene = this.worlds[id].scene; this.world = this.worlds[id].world;
    this.eyeHeight = this.world.eyeHeight || 1.7; this.groundY = this.world.playerSpawn?.y || 0;
    this.camera.far = id === 'dust2' ? 320 : 110; this.camera.updateProjectionMatrix();
    document.querySelector('.mission-title h2').textContent = this.world.name;
    document.querySelector('.mission-title p').textContent = id === 'dust2' ? 'Original CS 1.6 map · Zombie quarantine' : 'Industrial district · Quarantine sector 07';
    document.querySelector('.scene-label strong').textContent = this.world.name;
    document.querySelector('.radar-label').innerHTML = `${this.world.name} <b>${id === 'dust2' ? 'D2' : '07'}</b>`;
    const select = document.getElementById('map-select'); if (select) select.value = id;
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.weaponCamera.aspect = width / height;
    this.camera.updateProjectionMatrix(); this.weaponCamera.updateProjectionMatrix();
  }

  setState(state) { this.state = state; this.onState(state); this.resize(); }

  start(primary = 'm4', difficulty = 'operator') {
    this.clearEntities(); this.audio.unlock();
    this.primary = primary; this.difficulty = DIFFICULTIES[difficulty] || DIFFICULTIES.operator;
    this.health = this.difficulty.health; this.maxHealth = this.health; this.stamina = 100;
    this.cash = 0; this.kills = 0; this.shots = 0; this.headshots = 0; this.elapsed = 0;
    this.wave = 0; this.spawnRemaining = 0; this.spawnTimer = 0; this.nextWaveTimer = 3;
    this.eyeHeight = this.world.eyeHeight || 1.7; this.groundY = this.world.playerSpawn?.y || 0;
    if (this.world.playerSpawn) { this.camera.position.copy(this.world.playerSpawn); this.camera.position.y += this.eyeHeight; }
    else this.camera.position.set(0, this.eyeHeight, 19);
    this.yaw = this.world.playerYaw || 0; this.pitch = -0.025; this.jumpHeight = 0; this.jumpVelocity = 0;
    this.recoil = 0; this.reloadTime = 0; this.hitTime = 0; this.damageTime = 0; this.lastShot = -10; this.shootTimer = 0;
    this.ammunition = Object.fromEntries(Object.entries(WEAPONS).map(([id, definition]) => [id, { ammo: definition.capacity, reserve: definition.reserve }]));
    this.keys.clear(); this.mouseDown = false; this.aiming = false; this.moveInput = { x: 0, z: 0 };
    $('killfeed').innerHTML = ''; $('reload-indicator').hidden = true; $('damage-vignette').style.opacity = 0;
    this.switchWeapon(primary); this.setState('playing'); this.requestPointer();
    this.banner('OPERATION / 007', 'HOLD THE LINE.', 2.7);
    this.notify(this.touch ? 'LEFT STICK TO MOVE · DRAG RIGHT TO LOOK' : 'WASD TO MOVE · CLICK TO FIRE · R TO RELOAD', 4);
    this.updateHud();
  }

  requestPointer() {
    if (this.touch) return;
    try {
      const request = this.renderer.domElement.requestPointerLock();
      request?.catch(() => { if (this.state === 'playing') this.notify('CLICK THE YARD TO CAPTURE YOUR MOUSE · OR DRAG TO LOOK', 5); });
    } catch { this.notify('DRAG TO LOOK · CLICK TO FIRE', 4); }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused'); this.keys.clear(); this.mouseDown = false; this.aiming = false; this.dragging = false;
    this.moveInput = { x: 0, z: 0 }; $('joystick').querySelector('i').style.transform = '';
    if (document.pointerLockElement) document.exitPointerLock();
  }

  resume() { if (this.state === 'paused') { this.setState('playing'); this.requestPointer(); this.clock.getDelta(); } }
  home() { this.setState('home'); if (document.pointerLockElement) document.exitPointerLock(); this.keys.clear(); this.mouseDown = false; this.clearEntities(); }

  finish(won) {
    if (this.state !== 'playing') return;
    this.setState(won ? 'won' : 'dead'); if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear(); this.mouseDown = false; this.aiming = false;
    $('result-kicker').textContent = won ? 'QUARANTINE SECURED' : 'SIGNAL LOST';
    $('result-title').textContent = won ? (this.world.id === 'dust2' ? 'SECTOR SECURED.' : 'YARD SECURED.') : 'OVERRUN.';
    $('result-description').textContent = won ? 'Five waves. One operator. You made every round count.' : 'You held the line. Until you couldn’t. The quarantine deserves another shot.';
    $('result-wave').textContent = String(this.wave).padStart(2, '0');
    $('result-kills').textContent = this.kills; $('result-time').textContent = formatTime(this.elapsed);
    let best = 0; try { best = Number(localStorage.getItem('bh-best') || 0); if (this.kills > best) localStorage.setItem('bh-best', this.kills); } catch { /* Storage is optional. */ }
    $('best-score').textContent = `PERSONAL BEST / ${Math.max(best, this.kills)} HOSTILES DOWN`;
  }

  installControls() {
    document.addEventListener('keydown', event => {
      if (this.state !== 'playing') { if (this.state === 'paused' && event.code === 'KeyP') this.resume(); return; }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      this.keys.add(event.code);
      if (event.repeat) return;
      if (event.code === 'KeyR') this.reload();
      if (event.code === 'Digit1') this.switchWeapon(this.primary);
      if (event.code === 'Digit2') this.switchWeapon('usp');
      if (event.code === 'KeyE') this.resupply();
      if (event.code === 'KeyP' || event.code === 'Escape') this.pause();
      if (event.code === 'Space' && this.jumpHeight <= 0.001) this.jumpVelocity = 5.2;
    });
    document.addEventListener('keyup', event => this.keys.delete(event.code));
    document.addEventListener('mousemove', event => {
      if (this.state === 'playing' && (document.pointerLockElement || this.dragging)) this.look(event.movementX, event.movementY);
    });
    this.renderer.domElement.addEventListener('mousedown', event => {
      if (this.state !== 'playing') return;
      if (!document.pointerLockElement) { this.dragging = true; this.requestPointer(); }
      if (event.button === 0) { this.mouseDown = true; this.shoot(); }
      if (event.button === 2) this.aiming = true;
    });
    document.addEventListener('mouseup', event => { if (event.button === 0) this.mouseDown = false; if (event.button === 2) this.aiming = false; this.dragging = false; });
    this.renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement === this.renderer.domElement) this.hadPointerLock = true;
      else if (this.hadPointerLock && this.state === 'playing') this.pause();
    });
    window.addEventListener('blur', () => { if (this.state === 'playing') this.pause(); });
    this.installTouch();
  }

  look(x, y) {
    this.yaw -= x * 0.0022 * this.sensitivity * (this.aiming ? 0.6 : 1);
    this.pitch = clamp(this.pitch - y * 0.0022 * this.sensitivity * (this.aiming ? 0.6 : 1), -1.35, 1.35);
    this.camera.rotation.set(this.pitch + this.recoil * 0.3, this.yaw, 0);
  }

  installTouch() {
    let stickId = null, lookId = null, lookX = 0, lookY = 0;
    const joystick = $('joystick'), knob = joystick.querySelector('i');
    const moveStick = event => {
      const r = joystick.getBoundingClientRect(), x = (event.clientX - r.left - r.width / 2) / 35, z = (event.clientY - r.top - r.height / 2) / 35;
      const length = Math.max(1, Math.hypot(x, z));
      this.moveInput = { x: x / length, z: z / length }; knob.style.transform = `translate(${this.moveInput.x * 30}px, ${this.moveInput.z * 30}px)`;
    };
    joystick.addEventListener('pointerdown', event => { if (this.state !== 'playing') return; event.preventDefault(); stickId = event.pointerId; joystick.setPointerCapture(stickId); moveStick(event); });
    joystick.addEventListener('pointermove', event => { if (event.pointerId === stickId) moveStick(event); });
    const reset = event => { if (event.pointerId === stickId) { stickId = null; this.moveInput = { x: 0, z: 0 }; knob.style.transform = ''; } };
    joystick.addEventListener('pointerup', reset); joystick.addEventListener('pointercancel', reset);
    this.renderer.domElement.addEventListener('pointerdown', event => { if (this.state === 'playing' && event.pointerType !== 'mouse') { event.preventDefault(); lookId = event.pointerId; lookX = event.clientX; lookY = event.clientY; this.renderer.domElement.setPointerCapture(lookId); } });
    this.renderer.domElement.addEventListener('pointermove', event => { if (event.pointerId === lookId) { this.look((event.clientX - lookX) * 1.8, (event.clientY - lookY) * 1.8); lookX = event.clientX; lookY = event.clientY; } });
    const resetLook = event => { if (event.pointerId === lookId) lookId = null; };
    this.renderer.domElement.addEventListener('pointerup', resetLook); this.renderer.domElement.addEventListener('pointercancel', resetLook);
    $('touch-fire').addEventListener('pointerdown', event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); if (this.state === 'playing') { this.mouseDown = true; this.shoot(); } });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('touch-fire').addEventListener(type, () => { this.mouseDown = false; });
    $('touch-reload').addEventListener('click', () => this.reload());
    $('touch-switch').addEventListener('click', () => this.switchWeapon(this.weaponId === 'usp' ? this.primary : 'usp'));
    $('touch-supply').addEventListener('click', () => this.resupply());
  }

  switchWeapon(id) {
    if (!WEAPONS[id]) return;
    this.weaponId = id; this.reloadTime = 0; this.recoil = 0; this.shootTimer = 0;
    const native = this.weapons[id]; native.animation?.play(native.idleAnimation);
    for (const [key, weapon] of Object.entries(this.weapons)) weapon.group.visible = key === id;
    $('reload-indicator').hidden = true;
    if (this.ammunition) this.updateHud();
  }

  reload() {
    if (this.state !== 'playing' || this.reloadTime > 0) return;
    const ammo = this.ammunition[this.weaponId], weapon = WEAPONS[this.weaponId];
    if (ammo.ammo === weapon.capacity) return;
    if (ammo.reserve <= 0) { this.notify('NO RESERVE AMMO · SWITCH WEAPON OR FIND SUPPLIES'); return; }
    this.reloadTime = weapon.reload; this.reloadDuration = weapon.reload; this.audio.reload();
    this.weapons[this.weaponId].animation?.play(this.weapons[this.weaponId].reloadAnimation, weapon.reload, true);
    $('reload-indicator').hidden = false; $('reload-indicator').style.setProperty('--reload-time', `${weapon.reload}s`);
  }

  shoot() {
    if (this.state !== 'playing' || this.reloadTime > 0 || this.shootTimer > 0) return;
    const weapon = WEAPONS[this.weaponId], ammunition = this.ammunition[this.weaponId];
    if (ammunition.ammo <= 0) { this.reload(); return; }
    ammunition.ammo--; this.shots++; this.lastShot = this.elapsed; this.shootTimer = weapon.interval; this.recoil += weapon.recoil;
    this.audio.fire(this.weaponId);
    const view = this.weapons[this.weaponId]; view.flash.visible = true; view.flash.rotation.z = Math.random() * 6; view.light.intensity = 1.5;
    view.animation?.play(view.shootAnimation, 0.25, true);
    this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(this.center, this.camera); this.raycaster.far = 90;
    const hits = this.raycaster.intersectObjects([...this.world.walls, ...this.enemies.flatMap(enemy => enemy.hits)], false);
    let hitPoint = this.raycaster.ray.at(45, new THREE.Vector3());
    if (hits.length) {
      const hit = hits[0], enemy = hit.object.userData.enemy;
      hitPoint = hit.point;
      if (enemy && !enemy.dead) {
        const headshot = hit.object.userData.head;
        enemy.health -= weapon.damage * (headshot ? 3 : 1); enemy.stagger = 0.14;
        this.burst(hit.point, 0x7c3c25, 8);
        if (enemy.health <= 0) this.kill(enemy, headshot);
        this.hitTime = 0.16; $('hitmarker').classList.add('visible'); $('hitmarker').classList.toggle('kill', enemy.dead);
        this.audio.hit(enemy.dead);
      } else this.burst(hit.point, 0xd0b68a, 4);
    }
    const start = new THREE.Vector3(0.25, -0.18, -0.7).applyMatrix4(this.camera.matrixWorld);
    const geometry = new THREE.BufferGeometry().setFromPoints([start, hitPoint]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe6c78b, transparent: true, opacity: 0.5 })); this.scene.add(line);
    this.effects.push({ object: line, ttl: 0.05, max: 0.05 });
    this.updateHud();
  }

  burst(position, color, amount) {
    const positions = new Float32Array(amount * 3), velocities = [];
    for (let i = 0; i < amount; i++) { positions.set([position.x, position.y, position.z], i * 3); velocities.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const object = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 0.055, transparent: true })); this.scene.add(object);
    this.effects.push({ object, velocities, ttl: 0.4, max: 0.4 });
  }

  kill(enemy, headshot) {
    enemy.dead = true; this.kills++; this.cash += headshot ? 150 : 100; if (headshot) this.headshots++;
    enemy.animation?.play(headshot ? 'dieheadshot' : 'diesimple', 1.2, true, false);
    this.enemies = this.enemies.filter(other => other !== enemy);
    this.corpses.push({ ...enemy, floor: enemy.groundY ?? enemy.group.position.y, time: 0, tilt: (Math.random() - 0.5) * 0.5 });
    const item = document.createElement('div');
    item.innerHTML = `<span>YOU</span>${this.icon('target')}<b>${enemy.runner ? 'RUNNER' : 'INFECTED'}</b>${headshot ? '<em>HEADSHOT</em>' : ''}`;
    $('killfeed').appendChild(item); if ($('killfeed').children.length > 4) $('killfeed').firstElementChild.remove();
    setTimeout(() => item.remove(), 4500);
    this.updateHud();
  }

  resupply() {
    if (this.state !== 'playing') return;
    if (this.distanceToSupply() > 3.5) { this.notify('FIND THE GREEN FIELD SUPPLY CRATE · CHECK YOUR RADAR'); return; }
    if (this.cash < 500) { this.notify(`RESUPPLY COSTS $500 · YOU HAVE $${this.cash}`); return; }
    this.cash -= 500; this.health = this.maxHealth; this.reloadTime = 0; $('reload-indicator').hidden = true;
    for (const [id, definition] of Object.entries(WEAPONS)) this.ammunition[id] = { ammo: definition.capacity, reserve: definition.reserve };
    this.audio.tone(520, 0.25, 0.04, 'triangle', 780); this.notify('HEALTH RESTORED · AMMUNITION REFILLED'); this.updateHud();
  }

  distanceToSupply() { const pos = this.camera.position, supply = this.world.supplies; return Math.abs((this.groundY || 0) - supply.y) > 1.5 ? Infinity : Math.hypot(pos.x - supply.x, pos.z - supply.z); }

  takeDamage(amount) {
    if (this.state !== 'playing') return;
    this.health = Math.max(0, this.health - amount); this.damageTime = 0.5; this.audio.hurt();
    this.pitch = clamp(this.pitch + 0.025, -1.35, 1.35); this.updateHud();
    if (this.health <= 0) this.finish(false);
  }

  startWave() {
    this.wave++; this.spawnRemaining = waveSize(this.wave); this.spawnTimer = 0.1; this.nextWaveTimer = null;
    this.banner(`THREAT LEVEL / ${this.difficulty.label.toUpperCase()}`, `WAVE ${String(this.wave).padStart(2, '0')} INBOUND`, 3.5);
    this.audio.wave(); this.updateHud();
  }

  spawnEnemy() {
    const runner = this.wave >= 3 && Math.random() < 0.25;
    const zombie = this.classicAssets ? this.classicAssets.createZombie() : createZombie(runner);
    const candidates = this.world.getSpawns?.({ x: this.camera.position.x, y: this.groundY, z: this.camera.position.z }) || this.world.spawns;
    const spawn = candidates.filter(s => s.distanceTo(this.camera.position) > 8);
    const source = spawn[Math.floor(Math.random() * spawn.length)] || this.world.spawns[0];
    zombie.group.position.copy(source);
    const enemy = { ...zombie, groundY: source.y, health: (65 + this.wave * 9) * this.difficulty.enemyHealth, speed: (runner ? 2.7 : 1.05 + this.wave * 0.09) * this.difficulty.speed, runner, dead: false, path: [], pathTime: Math.random(), attackTimer: 0.6, stagger: 0, phase: Math.random() * 7 };
    enemy.hits.forEach(mesh => { mesh.userData.enemy = enemy; });
    this.enemies.push(enemy); this.scene.add(enemy.group); return enemy;
  }

  moveEntity(position, dx, dz, radius, ground = position.y) {
    if (this.world.move) return this.world.move(position, dx, dz, ground);
    if (!circleBlocked(position.x + dx, position.z, radius, this.world.obstacles)) position.x += dx;
    if (!circleBlocked(position.x, position.z + dz, radius, this.world.obstacles)) position.z += dz;
    return 0;
  }

  updatePlayer(dt) {
    let x = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.moveInput.x;
    let z = (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) + this.moveInput.z;
    const moving = Math.hypot(x, z) > 0.01, sprinting = moving && (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && this.stamina > 1 && !this.aiming;
    const speed = this.aiming ? 2.2 : sprinting ? 6 : 3.6;
    const length = Math.max(1, Math.hypot(x, z)); x = x / length * speed * dt; z = z / length * speed * dt;
    this.groundY = this.moveEntity(this.camera.position, x * Math.cos(this.yaw) + z * Math.sin(this.yaw), z * Math.cos(this.yaw) - x * Math.sin(this.yaw), 0.38, this.groundY);
    this.stamina = clamp(this.stamina + (sprinting ? -27 : 20) * dt, 0, 100);
    if (this.jumpHeight > 0 || this.jumpVelocity > 0) { this.jumpVelocity -= 14 * dt; this.jumpHeight = Math.max(0, this.jumpHeight + this.jumpVelocity * dt); if (this.jumpHeight === 0) this.jumpVelocity = 0; }
    if (this.world.collision && !this.world.collision.canStand(this.camera.position.x, this.groundY + this.jumpHeight + 0.04, this.camera.position.z)) { this.jumpHeight = Math.max(0, this.jumpHeight - Math.max(0, this.jumpVelocity * dt)); this.jumpVelocity = Math.min(0, this.jumpVelocity); }
    this.bob += dt * (moving ? (sprinting ? 14 : 10) : 2);
    this.camera.position.y = this.groundY + (this.eyeHeight || 1.7) + this.jumpHeight + (moving && !this.aiming ? Math.sin(this.bob) * 0.035 : 0);
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 12, dt);
    this.camera.rotation.set(this.pitch + this.recoil * 0.3, this.yaw, moving && !this.aiming ? Math.sin(this.bob * 0.5) * 0.003 : 0);
    const fov = this.aiming ? 52 : sprinting ? 78 : 72;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 9, dt); this.camera.updateProjectionMatrix();
    const weaponView = this.weapons[this.weaponId], gun = weaponView.group;
    weaponView.animation?.update(dt);
    const reloadProgress = this.reloadTime > 0 ? 1 - this.reloadTime / this.reloadDuration : 0;
    const reloadTilt = this.reloadTime > 0 ? Math.sin(reloadProgress * Math.PI) : 0;
    const aim = this.aiming ? 1 : 0;
    gun.position.x = THREE.MathUtils.damp(gun.position.x, (weaponView.classic ? -0.015 : 0.3) * (1 - aim), 12, dt);
    gun.position.y = THREE.MathUtils.damp(gun.position.y, (weaponView.classic ? -0.015 : -0.26) + aim * (weaponView.classic ? 0.05 : 0.16) - reloadTilt * (weaponView.classic ? 0 : 0.22) + Math.sin(this.bob) * (moving ? 0.008 : 0.002), 12, dt);
    gun.position.z = (weaponView.classic ? -0.16 : -0.56) + this.recoil * 2 + reloadTilt * (weaponView.classic ? 0 : 0.16);
    gun.rotation.set(this.recoil * 2 - reloadTilt * (weaponView.classic ? 0 : 0.65), reloadTilt * (weaponView.classic ? 0 : 0.3), -reloadTilt * (weaponView.classic ? 0 : 0.5));
    $('crosshair').classList.toggle('aiming', this.aiming); $('crosshair').classList.toggle('firing', this.shootTimer > WEAPONS[this.weaponId].interval * 0.6);
    if (this.mouseDown && WEAPONS[this.weaponId].automatic) this.shoot();
    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        const ammo = this.ammunition[this.weaponId]; Object.assign(ammo, reloadAmmo(ammo.ammo, ammo.reserve, WEAPONS[this.weaponId].capacity));
        $('reload-indicator').hidden = true; this.audio.reload(); this.updateHud();
      }
    }
    const lastFire = this.elapsed - this.lastShot;
    const view = this.weapons[this.weaponId]; view.flash.visible = lastFire < 0.045; view.light.intensity = lastFire < 0.045 ? 1.5 : 0;
    $('interaction').hidden = this.distanceToSupply() > 3.5;
  }

  updateEnemies(dt) {
    const player = this.camera.position;
    for (const enemy of this.enemies) {
      const pos = enemy.group.position, dx = player.x - pos.x, dz = player.z - pos.z, distance = Math.hypot(dx, dz);
      enemy.attackTimer -= dt; enemy.stagger = Math.max(0, enemy.stagger - dt); enemy.pathTime -= dt;
      enemy.animation?.update(dt);
      enemy.group.rotation.y = Math.atan2(dx, dz);
      if (distance > 1.15 || Math.abs((enemy.groundY ?? pos.y) - this.groundY) > 1) {
        enemy.animation?.play('walk');
        if (enemy.pathTime <= 0) { enemy.path = this.world.findPath ? this.world.findPath({ x: pos.x, y: enemy.groundY, z: pos.z }, { x: player.x, y: this.groundY, z: player.z }) : findPath(pos, player, this.world.obstacles); enemy.pathTime = 0.9 + Math.random() * 0.8; }
        let tx = player.x, tz = player.z;
        if ((this.world.findPath || distance > 2.5) && enemy.path.length) {
          while (enemy.path.length > 1 && Math.hypot(pos.x - enemy.path[0].x, pos.z - enemy.path[0].z) < 0.45) enemy.path.shift();
          tx = enemy.path[0].x; tz = enemy.path[0].z;
        }
        let vx = tx - pos.x, vz = tz - pos.z;
        // Separation avoids enemies becoming an indistinguishable single stack.
        for (const other of this.enemies) { if (other === enemy) continue; const ox = pos.x - other.group.position.x, oz = pos.z - other.group.position.z, d = Math.hypot(ox, oz); if (d < 0.7 && d > 0.001) { vx += ox / d * 1.5; vz += oz / d * 1.5; } }
        const length = Math.max(0.001, Math.hypot(vx, vz)), speed = enemy.stagger > 0 ? enemy.speed * 0.15 : enemy.speed;
        enemy.groundY = this.moveEntity(pos, vx / length * speed * dt, vz / length * speed * dt, 0.35, enemy.groundY);
        enemy.phase += dt * enemy.speed * 5;
        enemy.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(enemy.phase + i * Math.PI) * 0.48; });
        enemy.arms.forEach((arm, i) => { arm.rotation.x = -0.9 + Math.sin(enemy.phase + i) * 0.15; });
        enemy.group.position.y = enemy.groundY + Math.abs(Math.sin(enemy.phase)) * 0.035;
      } else {
        enemy.animation?.play('attack1');
        enemy.arms.forEach(arm => { arm.rotation.x = -1.4 + Math.sin(this.elapsed * 10) * 0.3; });
        if (enemy.attackTimer <= 0 && this.jumpHeight < 0.8) { enemy.attackTimer = 1.15; this.takeDamage(this.difficulty.damage); }
      }
      this.audio.growl(distance);
    }
  }

  updateWaves(dt) {
    if (this.spawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnEnemy(); this.spawnRemaining--; this.spawnTimer = this.wave < 3 ? 1.2 : 0.85; }
    }
    if (!this.spawnRemaining && !this.enemies.length && this.nextWaveTimer === null) {
      if (this.wave === 5) { this.finish(true); return; }
      this.nextWaveTimer = 8; this.cash += 200; this.health = Math.min(this.maxHealth, this.health + 15);
      for (const id of [this.primary, 'usp']) this.ammunition[id].reserve += id === 'usp' ? 12 : 30;
      this.banner(`WAVE ${String(this.wave).padStart(2, '0')} CLEARED`, 'A MOMENT TO BREATHE.', 4);
      this.notify('+$200 · +15 HEALTH · RESERVE AMMO RECOVERED', 4);
    }
    if (this.nextWaveTimer !== null) { this.nextWaveTimer -= dt; if (this.nextWaveTimer <= 0) this.startWave(); }
  }

  updateEffects(dt) {
    this.effects = this.effects.filter(effect => {
      effect.ttl -= dt;
      if (effect.ttl <= 0) { this.scene.remove(effect.object); effect.object.geometry.dispose(); effect.object.material.dispose(); return false; }
      effect.object.material.opacity = effect.ttl / effect.max;
      if (effect.velocities) {
        const attribute = effect.object.geometry.attributes.position;
        effect.velocities.forEach((velocity, i) => { velocity.y -= dt * 6; attribute.setXYZ(i, attribute.getX(i) + velocity.x * dt, attribute.getY(i) + velocity.y * dt, attribute.getZ(i) + velocity.z * dt); });
        attribute.needsUpdate = true;
      }
      return true;
    });
    this.corpses = this.corpses.filter(corpse => {
      corpse.time += dt;
      corpse.animation?.update(Math.min(dt, Math.max(0, 1.2 - corpse.time + dt)));
      if (!corpse.classic) { corpse.group.rotation.x = Math.min(Math.PI / 2, corpse.time * 4); corpse.group.rotation.z = corpse.tilt; }
      corpse.group.position.y = (corpse.floor || 0) + (corpse.time > 5 ? -(corpse.time - 5) * 0.3 : (corpse.classic ? 0 : 0.15));
      if (corpse.time > 8) { this.disposeEntity(corpse); return false; }
      return true;
    });
  }

  disposeEntity(entity) {
    this.scene.remove(entity.group); const materials = new Set(), skeletons = new Set();
    entity.animation?.dispose();
    entity.group.traverse(object => { if (object.skeleton) skeletons.add(object.skeleton); if (object.userData.sharedAsset) return; object.geometry?.dispose(); if (object.material) materials.add(object.material); });
    skeletons.forEach(skeleton => skeleton.dispose());
    materials.forEach(material => material.dispose());
  }

  clearEntities() {
    this.enemies.forEach(enemy => this.disposeEntity(enemy)); this.corpses.forEach(corpse => this.disposeEntity(corpse));
    this.effects.forEach(effect => { this.scene.remove(effect.object); effect.object.geometry.dispose(); effect.object.material.dispose(); });
    this.enemies = []; this.corpses = []; this.effects = [];
  }

  banner(kicker, text, duration = 3) {
    $('wave-banner').querySelector('span').textContent = kicker; $('wave-banner').querySelector('strong').textContent = text;
    $('wave-banner').classList.add('visible'); this.bannerTime = duration;
  }
  notify(text, duration = 2.5) { $('notification').textContent = text; $('notification').classList.add('visible'); this.notificationTime = duration; }

  updateHud() {
    if (!this.ammunition) return;
    const ammo = this.ammunition[this.weaponId], weapon = WEAPONS[this.weaponId];
    $('health').textContent = Math.ceil(this.health); $('health-bar').style.width = `${this.health / this.maxHealth * 100}%`;
    $('stamina-bar').style.width = `${this.stamina}%`; $('cash').textContent = `$${this.cash.toLocaleString()}`; $('kills').textContent = `${this.kills} KILLS`;
    $('ammo').textContent = String(ammo.ammo).padStart(2, '0'); $('reserve').textContent = ammo.reserve; $('weapon-name').textContent = weapon.name; $('caliber').textContent = weapon.caliber;
    document.querySelector('.ammo-panel').classList.toggle('low', ammo.ammo <= 5);
    $('wave').textContent = String(Math.max(1, this.wave)).padStart(2, '0');
    $('remaining').textContent = this.nextWaveTimer !== null ? `NEXT WAVE IN ${Math.ceil(this.nextWaveTimer)}s` : `${this.spawnRemaining + this.enemies.length} HOSTILES REMAINING`;
    const degrees = ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('heading').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
    this.drawRadar();
  }

  drawRadar() {
    if (this.world.drawRadar) return this.world.drawRadar(this.radar, this.camera.position, this.enemies, this.yaw, this.groundY);
    const ctx = this.radar, size = 160, scale = 2.5;
    ctx.clearRect(0, 0, size, size); ctx.fillStyle = '#1c2b23'; ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#b5c59d15'; ctx.lineWidth = 1;
    for (let i = 0; i < size; i += 20) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, size); ctx.moveTo(0, i); ctx.lineTo(size, i); ctx.stroke(); }
    ctx.fillStyle = '#7f8d7066';
    for (const o of this.world.obstacles) ctx.fillRect(80 + (o.x - o.w / 2) * scale, 80 + (o.z - o.d / 2) * scale, o.w * scale, o.d * scale);
    ctx.fillStyle = '#bacb8a'; ctx.fillRect(80 + this.world.supplies.x * scale - 2, 80 + this.world.supplies.z * scale - 2, 4, 4);
    for (const enemy of this.enemies) { ctx.fillStyle = enemy.runner ? '#f9b875' : '#ee693b'; ctx.beginPath(); ctx.arc(80 + enemy.group.position.x * scale, 80 + enemy.group.position.z * scale, 2.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.save(); ctx.translate(80 + this.camera.position.x * scale, 80 + this.camera.position.z * scale); ctx.rotate(-this.yaw);
    ctx.fillStyle = '#eff2da'; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(-3.5, 4); ctx.lineTo(0, 2); ctx.lineTo(3.5, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c1d9a51c'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 25, -Math.PI * 0.7, -Math.PI * 0.3); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#c4cfaf'; ctx.font = '8px monospace'; ctx.fillText('N', 77, 10);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05); this.lifeTime += dt;
    if (this.state === 'home') {
      this.menuTime += dt;
      if (this.world.menuPosition) { this.camera.position.copy(this.world.menuPosition); this.camera.position.x += Math.sin(this.menuTime * 0.04) * 0.4; this.camera.lookAt(this.world.menuTarget); }
      else { this.camera.position.set(7 + Math.sin(this.menuTime * 0.04) * 1.5, 4.2, 24); this.camera.lookAt(-3, 2.5, -9); }
      this.camera.fov = 64; this.camera.updateProjectionMatrix();
    } else if (this.state === 'playing') {
      this.elapsed += dt; this.shootTimer = Math.max(0, this.shootTimer - dt);
      this.updatePlayer(dt); this.updateEnemies(dt);
      if (this.state === 'playing') this.updateWaves(dt);
      this.updateEffects(dt);
      this.bannerTime -= dt; this.notificationTime -= dt; this.hitTime -= dt; this.damageTime = Math.max(0, this.damageTime - dt);
      if (this.bannerTime <= 0) $('wave-banner').classList.remove('visible');
      if (this.notificationTime <= 0) $('notification').classList.remove('visible');
      if (this.hitTime <= 0) $('hitmarker').classList.remove('visible');
      $('damage-vignette').style.opacity = this.damageTime * 1.5 + (this.health < 25 ? 0.13 : 0);
      this.uiTime += dt; if (this.uiTime > 0.09) { this.updateHud(); this.uiTime = 0; }
    }
    this.world.dust.forEach(particles => { particles.rotation.y = Math.sin(this.lifeTime * 0.008) * 0.05; });
    this.world.update?.(this.camera, this.state);
    this.scene.updateMatrixWorld();
    this.renderer.autoClear = true; this.renderer.render(this.scene, this.camera);
    if (['playing', 'paused', 'dead', 'won'].includes(this.state) && this.weaponId) {
      this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.weaponScene, this.weaponCamera);
    }
  }
}
