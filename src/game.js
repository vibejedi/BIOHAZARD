import * as THREE from 'three';
import { createWeapon, effectTexture } from './weapon-view.js';
import { GameAudio } from './audio.js';
import { loadClassicAssets } from './classic-assets.js';
import { loadBspWorld } from './bsp-world.js';
import { DIFFICULTIES, WEAPONS, ZOMBIE_HEALTH, shotDamage, killPoints, enemyKind, reloadAmmo, waveSize } from './rules.js';
import { formatRunTime, recordRun, readRuns } from './runs.js';
import { COURSES, courseWaves, stageEndWave } from './campaign.js';

const $ = id => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;

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
    this.flashlightOn = true;
    this.flashlight = new THREE.SpotLight(0xffefd9, 200, 32, Math.PI / 7, 0.6, 1.1);
    this.flashlight.position.set(0.1, -0.12, -0.12); this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024); this.flashlight.shadow.bias = -0.0003; this.flashlight.shadow.normalBias = 0.02;
    const beamTarget = new THREE.Object3D(); beamTarget.position.set(0, -0.15, -20);
    this.camera.add(this.flashlight, beamTarget); this.flashlight.target = beamTarget;
    this.scene.background = new THREE.Color(0x171e19);
    this.world = { id: null, dust: [] }; this.worlds = {}; this.courseId = 'dust2'; this.stageIndex = 0;
    this.bloodTexture = effectTexture('blood');
    this.weaponScene = new THREE.Scene(); this.weaponCamera = new THREE.PerspectiveCamera(65, 1, 0.01, 5);
    this.weaponScene.add(new THREE.HemisphereLight(0xc3d1db, 0x323d35, 0.8));
    const gunLight = new THREE.DirectionalLight(0xe6d4b2, 0.65); gunLight.position.set(-3, 4, -2); this.weaponScene.add(gunLight);
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
      const descriptions = [assets.manifest.world, ...(assets.manifest.campaignWorlds || [])];
      const worlds = await Promise.all(descriptions.map(description => loadBspWorld(description)));
      for (const loaded of worlds) this.worlds[loaded.world.id] = loaded;
      this.selectCourse('dust2');
    }
    return assets;
  }

  selectMap(id) {
    if (!this.worlds[id]) return;
    this.clearEntities();
    this.scene = this.worlds[id].scene; this.world = this.worlds[id].world;
    this.scene.add(this.camera);
    this.eyeHeight = this.world.eyeHeight || 1.7; this.groundY = this.world.playerSpawn?.y || 0;
    this.camera.far = 320; this.camera.updateProjectionMatrix();
    document.querySelector('.scene-label strong').textContent = this.world.name;
    document.querySelector('.radar-label').textContent = this.world.name;
  }

  selectCourse(id) {
    const course = COURSES[id];
    if (this.state !== 'home' || !course || !course.stages.every(stage => this.worlds[stage.map])) return;
    this.courseId = id; this.stageIndex = 0;
    this.selectMap(course.stages[0].map);
    document.querySelector('.mission-title h2').textContent = course.name;
    document.querySelector('.mission-title p').textContent = course.description;
    document.querySelector('.mission-meta span').innerHTML = `${this.icon('skull')} ${courseWaves(id)} HOSTILE WAVES`;
    $('map-select').value = id;
  }

  placePlayer() {
    this.eyeHeight = this.world.eyeHeight || 2; this.groundY = this.world.playerSpawn.y;
    this.camera.position.copy(this.world.playerSpawn); this.camera.position.y += this.eyeHeight;
    this.yaw = this.world.playerYaw || 0; this.pitch = -0.025; this.jumpHeight = 0; this.jumpVelocity = 0; this.recoil = 0;
    this.look(0, 0);
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.weaponCamera.aspect = width / height;
    this.camera.updateProjectionMatrix(); this.weaponCamera.updateProjectionMatrix();
  }

  setState(state) { this.state = state; this.onState(state); this.resize(); }

  start(primary = 'm4', difficulty = 'operator') {
    if (!this.world.id || !this.classicAssets) return;
    this.stageIndex = 0; this.pendingStage = null;
    this.selectMap(COURSES[this.courseId].stages[0].map); this.audio.unlock();
    this.primary = primary; this.difficultyId = DIFFICULTIES[difficulty] ? difficulty : 'operator'; this.difficulty = DIFFICULTIES[this.difficultyId];
    this.health = this.difficulty.health; this.maxHealth = this.health; this.stamina = 100;
    this.cash = 0; this.kills = 0; this.shots = 0; this.headshots = 0; this.elapsed = 0;
    this.score = 0; this.waveSplits = []; this.runStartedAt = performance.now(); this.runCompleted = false;
    this.totalWaves = courseWaves(this.courseId);
    this.spawnSerial = 0; this.setFlashlight(true);
    this.wave = 0; this.spawnRemaining = 0; this.spawnTimer = 0; this.nextWaveTimer = 3;
    this.placePlayer();
    this.recoil = 0; this.reloadTime = 0; this.hitTime = 0; this.damageTime = 0; this.lastShot = -10; this.shootTimer = 0;
    this.ammunition = Object.fromEntries(Object.entries(WEAPONS).map(([id, definition]) => [id, { ammo: definition.capacity, reserve: definition.reserve }]));
    this.keys.clear(); this.mouseDown = false; this.aiming = false; this.moveInput = { x: 0, z: 0 };
    $('killfeed').innerHTML = ''; $('reload-indicator').hidden = true; $('damage-vignette').style.opacity = 0;
    $('hit-feedback').textContent = ''; $('hit-feedback').classList.remove('visible');
    for (const view of Object.values(this.weapons)) { view.flashRemaining = 0; view.flash.visible = false; view.light.intensity = 0; }
    this.switchWeapon(primary); this.setState('playing'); this.requestPointer();
    this.banner(this.courseId === 'hl-campaign' ? 'CHAPTER 1 / 3 · ANOMALOUS MATERIALS' : 'OPERATION / DUST II', 'HOLD THE LINE.', 2.7);
    this.notify(this.touch ? 'LEFT STICK TO MOVE · DRAG RIGHT TO LOOK · TAP FLASHLIGHT TO TOGGLE' : 'WASD TO MOVE · CLICK TO FIRE · R RELOAD · F FLASHLIGHT', 5);
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

  resume() { if (this.state === 'paused') { this.elapsed = (performance.now() - this.runStartedAt) / 1000; this.setState('playing'); this.requestPointer(); this.clock.getDelta(); } }
  home() { this.setState('home'); if (document.pointerLockElement) document.exitPointerLock(); this.keys.clear(); this.mouseDown = false; this.clearEntities(); }

  finish(won) {
    if (this.state !== 'playing') return;
    this.elapsed = (performance.now() - this.runStartedAt) / 1000;
    this.setState(won ? 'won' : 'dead'); if (document.pointerLockElement) document.exitPointerLock();
    this.keys.clear(); this.mouseDown = false; this.aiming = false;
    $('result-kicker').textContent = won ? 'QUARANTINE SECURED' : 'SIGNAL LOST';
    $('result-title').textContent = won ? (this.courseId === 'hl-campaign' ? 'CAMPAIGN CLEARED.' : 'SECTOR SECURED.') : 'OVERRUN.';
    $('result-description').textContent = won ? (this.courseId === 'hl-campaign' ? 'Three chapters. Nine waves. Black Mesa is contained.' : 'Five waves. One operator. You made every round count.') : 'You held the line. Until you couldn’t. The quarantine deserves another shot.';
    $('result-wave').textContent = String(this.wave).padStart(2, '0');
    $('result-kills').textContent = this.kills; $('result-time').textContent = formatRunTime(this.elapsed * 1000);
    $('result-score').textContent = this.score.toLocaleString(); $('result-headshots').textContent = this.headshots;
    let rank = null;
    if (won && this.runCompleted) {
      const result = recordRun({ map: this.courseId, difficulty: this.difficultyId, elapsedMs: Math.round(this.elapsed * 1000), score: this.score, headshots: this.headshots, kills: this.kills, splits: this.waveSplits, date: new Date().toISOString() });
      rank = result.rank;
    }
    $('result-rank').textContent = rank ? `#${rank}` : '—';
    $('result-record-note').textContent = rank ? 'PERSONAL SPEED RANK · THIS DEVICE · PRACTICE POINTS ONLY' : won ? 'PRACTICE COMPLETE · NO RANKED RECORD' : 'CLEAR EVERY WAVE TO RECORD A FINISH TIME';
    this.renderRecords();
    let best = 0; try { best = Number(localStorage.getItem('bh-best') || 0); if (this.kills > best) localStorage.setItem('bh-best', this.kills); } catch { /* Storage is optional. */ }
    $('best-score').textContent = `PERSONAL BEST / ${Math.max(best, this.kills)} HOSTILES DOWN`;
  }

  renderRecords() {
    const rows = readRuns().filter(run => run.map === this.courseId && run.difficulty === ($('difficulty')?.value || 'operator'));
    $('records-course').textContent = COURSES[this.courseId].name;
    $('records-difficulty').textContent = ($('difficulty')?.value || 'operator').toUpperCase();
    const body = $('records-body'); body.replaceChildren();
    rows.slice(0, 10).forEach((run, index) => {
      const row = document.createElement('tr');
      for (const value of [index + 1, formatRunTime(run.elapsedMs), run.score.toLocaleString(), run.headshots]) {
        const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell);
      }
      body.appendChild(row);
    });
    $('records-empty').hidden = rows.length > 0;
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
      if (event.code === 'KeyF') this.setFlashlight(!this.flashlightOn);
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

  setFlashlight(enabled) {
    this.flashlightOn = enabled;
    this.flashlight.visible = enabled && this.state !== 'home';
    const button = $('flashlight-toggle');
    button.textContent = `F · FLASHLIGHT ${enabled ? 'ON' : 'OFF'}`;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', `Turn flashlight ${enabled ? 'off' : 'on'}`);
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
    $('flashlight-toggle').addEventListener('click', () => { if (['playing', 'paused'].includes(this.state)) this.setFlashlight(!this.flashlightOn); });
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
    const view = this.weapons[this.weaponId]; view.flashRemaining = 0.09; view.flash.visible = true; view.flash.material.rotation = Math.random() * Math.PI; view.light.intensity = 4;
    view.animation?.play(view.shootAnimation, 0.25, true);
    this.scene.updateMatrixWorld(true); this.camera.updateMatrixWorld(); this.raycaster.setFromCamera(this.center, this.camera); this.raycaster.far = 90;
    const hits = this.raycaster.intersectObjects([...this.world.walls, ...this.enemies.flatMap(enemy => enemy.hits)], false);
    let hitPoint = this.raycaster.ray.at(45, new THREE.Vector3());
    if (hits.length) {
      const hit = hits[0], enemy = hit.object.userData.enemy;
      hitPoint = hit.point;
      if (enemy && !enemy.dead) {
        const headshot = Boolean(hit.object.userData.head), damage = shotDamage(this.weaponId, headshot);
        enemy.health -= damage; enemy.stagger = 0.14;
        this.score += headshot ? 25 : 5;
        this.burst(hit.point.clone().addScaledVector(this.raycaster.ray.direction, -0.06), 0xd71919, headshot ? 30 : 18, true);
        if (enemy.health <= 0) this.kill(enemy, headshot);
        this.hitTime = headshot ? 0.5 : 0.3; $('hitmarker').classList.add('visible'); $('hitmarker').classList.toggle('kill', enemy.dead); $('hitmarker').classList.toggle('headshot', headshot);
        $('hit-feedback').textContent = headshot ? `HEADSHOT · ${enemy.dead ? '+250 POINTS' : damage}` : `BODY HIT · ${damage}`;
        $('hit-feedback').classList.add('visible'); $('hit-feedback').classList.toggle('headshot', headshot);
        this.audio.hit(enemy.dead);
      } else this.burst(hit.point, 0xd0b68a, 4);
    }
    this.weaponScene.updateMatrixWorld(true);
    const start = view.flash.getWorldPosition(new THREE.Vector3()).applyQuaternion(this.camera.quaternion).add(this.camera.position);
    const geometry = new THREE.BufferGeometry().setFromPoints([start, hitPoint]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xe6c78b, transparent: true, opacity: 0.5 })); this.scene.add(line);
    line.frustumCulled = false;
    this.effects.push({ object: line, ttl: 0.09, max: 0.09, kind: 'tracer' });
    this.updateHud();
  }

  burst(position, color, amount, blood = false) {
    const positions = new Float32Array(amount * 3), velocities = [];
    for (let i = 0; i < amount; i++) { positions.set([position.x, position.y, position.z], i * 3); velocities.push(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3)); }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const object = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: blood ? 7 : 4, sizeAttenuation: false, map: this.bloodTexture, transparent: true, depthWrite: false, toneMapped: false, opacity: 1 }));
    object.frustumCulled = false; object.renderOrder = 5; this.scene.add(object);
    this.effects.push({ object, velocities, ttl: blood ? 0.7 : 0.35, max: blood ? 0.7 : 0.35, kind: blood ? 'blood' : 'impact' });
  }

  kill(enemy, headshot) {
    headshot = Boolean(headshot) && enemy.kind !== 'headcrab';
    enemy.dead = true; this.kills++; this.cash += headshot ? 150 : 100; this.score += killPoints(headshot); if (headshot) this.headshots++;
    enemy.animation?.play(enemy.kind === 'headcrab' ? 'dieback' : headshot ? 'dieheadshot' : 'diesimple', 1.2, true, false);
    this.enemies = this.enemies.filter(other => other !== enemy);
    this.corpses.push({ ...enemy, floor: enemy.groundY ?? enemy.group.position.y, time: 0, tilt: (Math.random() - 0.5) * 0.5 });
    const item = document.createElement('div');
    item.innerHTML = `<span>YOU</span>${this.icon('target')}<b>${enemy.kind === 'headcrab' ? 'HEADCRAB' : enemy.runner ? 'RUNNER' : 'INFECTED'}</b>${headshot ? '<em>HEADSHOT</em>' : ''}`;
    $('killfeed').appendChild(item); if ($('killfeed').children.length > 4) $('killfeed').firstElementChild.remove();
    setTimeout(() => item.remove(), 4500);
    this.updateHud();
  }

  resupply() {
    if (this.state !== 'playing') return;
    if (this.distanceToSupply() > 3.5) { this.notify('FIND THE GREEN FIELD SUPPLY CRATE · CHECK YOUR RADAR'); return; }
    if (this.cash < 500) { this.notify(`RESUPPLY COSTS 500 CREDITS · YOU HAVE ${this.cash}`); return; }
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

  spawnEnemy(kind) {
    kind ||= enemyKind(this.wave, this.spawnSerial++);
    const runner = kind === 'runner', crab = kind === 'headcrab';
    const zombie = crab ? this.classicAssets.createHeadcrab() : this.classicAssets.createZombie();
    const candidates = this.world.getSpawns?.({ x: this.camera.position.x, y: this.groundY, z: this.camera.position.z }) || this.world.spawns;
    const spawn = candidates.filter(s => s.distanceTo(this.camera.position) > 8);
    const source = spawn[Math.floor(Math.random() * spawn.length)] || this.world.spawns[0];
    zombie.group.position.copy(source);
    const enemy = { ...zombie, kind, groundY: source.y, health: crab ? 50 : ZOMBIE_HEALTH, speed: (crab ? 2.4 : runner ? 2.7 : 1.05 + this.wave * 0.09) * this.difficulty.speed, runner, dead: false, path: [], pathTime: Math.random(), attackTimer: 0.6, stagger: 0, phase: Math.random() * 7, leapTime: 0, leapHit: false };
    enemy.animation.mixer.timeScale = runner ? 1.65 : 1;
    enemy.hits.forEach(mesh => { mesh.userData.enemy = enemy; });
    this.enemies.push(enemy); this.scene.add(enemy.group); return enemy;
  }

  moveEntity(position, dx, dz, radius, ground = position.y) {
    return this.world.move(position, dx, dz, ground);
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
    if (this.reloadTime > 0) {
      this.reloadTime -= dt;
      if (this.reloadTime <= 0) {
        const ammo = this.ammunition[this.weaponId]; Object.assign(ammo, reloadAmmo(ammo.ammo, ammo.reserve, WEAPONS[this.weaponId].capacity));
        $('reload-indicator').hidden = true; this.audio.reload(); this.updateHud();
      }
    }
    const view = this.weapons[this.weaponId];
    view.flashRemaining = Math.max(0, view.flashRemaining - dt); view.flash.visible = view.flashRemaining > 0; view.light.intensity = view.flash.visible ? 4 : 0;
    if (this.mouseDown && WEAPONS[this.weaponId].automatic) this.shoot();
    $('interaction').hidden = this.distanceToSupply() > 3.5;
  }

  updateEnemies(dt) {
    const player = this.camera.position;
    for (const enemy of this.enemies) {
      const pos = enemy.group.position, dx = player.x - pos.x, dz = player.z - pos.z, distance = Math.hypot(dx, dz);
      enemy.attackTimer -= dt; enemy.stagger = Math.max(0, enemy.stagger - dt); enemy.pathTime -= dt;
      enemy.animation?.update(dt);
      enemy.group.rotation.y = Math.atan2(dx, dz);
      if (enemy.kind === 'headcrab' && enemy.leapTime > 0) {
        enemy.leapTime = Math.max(0, enemy.leapTime - dt);
        enemy.groundY = this.moveEntity(pos, enemy.leapDirection.x * 5.5 * dt, enemy.leapDirection.y * 5.5 * dt, 0.25, enemy.groundY);
        pos.y = enemy.groundY + Math.sin((1 - enemy.leapTime / 0.65) * Math.PI) * 0.9;
        if (!enemy.leapHit && Math.hypot(player.x - pos.x, player.z - pos.z) < 1 && Math.abs(enemy.groundY - this.groundY) < 0.8 && this.jumpHeight < 0.8) {
          enemy.leapHit = true; this.takeDamage(Math.round(this.difficulty.damage * 0.75));
        }
        if (!enemy.leapTime) { pos.y = enemy.groundY; enemy.animation.play('run'); }
        continue;
      }
      if (enemy.kind === 'headcrab' && distance < 4.5 && enemy.attackTimer <= 0 && Math.abs(enemy.groundY - this.groundY) < 0.8) {
        const origin = pos.clone(); origin.y += 0.45;
        this.raycaster.ray.origin.copy(origin); this.raycaster.ray.direction.copy(player).sub(origin).normalize(); this.raycaster.far = origin.distanceTo(player);
        if (!this.raycaster.intersectObjects(this.world.walls, false).length) {
          enemy.leapTime = 0.65; enemy.leapHit = false; enemy.leapDirection = new THREE.Vector2(dx, dz).normalize(); enemy.attackTimer = 2.2;
          enemy.animation.play('jump', 0.65, true); this.audio.sample('crabAttack', 0.3);
          continue;
        }
      }
      if (distance > 1.15 || Math.abs((enemy.groundY ?? pos.y) - this.groundY) > 1) {
        enemy.animation?.play(enemy.kind === 'headcrab' ? 'run' : 'walk');
        if (enemy.pathTime <= 0) { enemy.path = this.world.findPath({ x: pos.x, y: enemy.groundY, z: pos.z }, { x: player.x, y: this.groundY, z: player.z }); enemy.pathTime = 0.9 + Math.random() * 0.8; }
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
        enemy.animation?.play(enemy.kind === 'headcrab' ? 'run' : 'attack1');
        enemy.arms.forEach(arm => { arm.rotation.x = -1.4 + Math.sin(this.elapsed * 10) * 0.3; });
        if (enemy.attackTimer <= 0 && this.jumpHeight < 0.8) { enemy.attackTimer = 1.15; this.takeDamage(this.difficulty.damage); }
      }
      this.audio.growl(distance, enemy.kind);
    }
  }

  updateWaves(dt) {
    if (this.spawnRemaining > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) { this.spawnEnemy(); this.spawnRemaining--; this.spawnTimer = this.wave < 3 ? 1.2 : 0.85; }
    }
    if (!this.spawnRemaining && !this.enemies.length && this.nextWaveTimer === null) {
      const elapsedMs = Math.round(performance.now() - this.runStartedAt);
      this.waveSplits.push({ wave: this.wave, elapsedMs, map: this.world.id });
      if (this.wave === this.totalWaves) { this.runCompleted = this.waveSplits.length === this.totalWaves; this.finish(true); return; }
      this.nextWaveTimer = 8; this.cash += 200; this.health = Math.min(this.maxHealth, this.health + 15);
      for (const id of [this.primary, 'usp']) this.ammunition[id].reserve += id === 'usp' ? 12 : 30;
      this.banner(`WAVE ${String(this.wave).padStart(2, '0')} CLEARED`, 'A MOMENT TO BREATHE.', 4);
      this.notify('+200 CREDITS · +15 HEALTH · RESERVE AMMO RECOVERED', 4);
      if (this.wave === stageEndWave(this.courseId, this.stageIndex)) {
        this.pendingStage = this.stageIndex + 1;
        this.banner(`CHAPTER ${this.stageIndex + 1} CLEARED`, 'MOVING TO THE NEXT SECTOR.', 5);
      }
    }
    if (this.nextWaveTimer !== null) {
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) {
        if (this.pendingStage !== null) {
          this.stageIndex = this.pendingStage; this.pendingStage = null;
          this.selectMap(COURSES[this.courseId].stages[this.stageIndex].map); this.placePlayer();
          this.keys.clear(); this.mouseDown = false; this.aiming = false; this.moveInput = { x: 0, z: 0 }; this.recoil = 0;
          this.notify(`CHAPTER ${this.stageIndex + 1} / 3 · ${this.world.name}`, 5);
        }
        this.startWave();
      }
    }
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
    $('stamina-bar').style.width = `${this.stamina}%`; $('cash').textContent = `${this.cash.toLocaleString()} CR`; $('kills').textContent = `${this.kills} KILLS`;
    $('run-time').textContent = formatRunTime(this.elapsed * 1000); $('run-score').textContent = `${this.score.toLocaleString()} PTS`; $('run-headshots').textContent = `${this.headshots} HEADSHOTS`;
    $('ammo').textContent = String(ammo.ammo).padStart(2, '0'); $('reserve').textContent = ammo.reserve; $('weapon-name').textContent = weapon.name; $('caliber').textContent = weapon.caliber;
    document.querySelector('.ammo-panel').classList.toggle('low', ammo.ammo <= 5);
    $('wave').textContent = String(Math.max(1, this.wave)).padStart(2, '0');
    $('wave-total').textContent = `/ ${String(this.totalWaves).padStart(2, '0')}`;
    $('run-stage').textContent = this.courseId === 'hl-campaign' ? `CHAPTER ${this.stageIndex + 1} / 3 · ${this.world.name}` : 'DUST II · SURVIVAL';
    $('remaining').textContent = this.nextWaveTimer !== null ? `NEXT WAVE IN ${Math.ceil(this.nextWaveTimer)}s` : `${this.spawnRemaining + this.enemies.length} HOSTILES REMAINING`;
    const degrees = ((-this.yaw * 180 / Math.PI) % 360 + 360) % 360;
    $('heading').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(degrees / 45) % 8];
    this.drawRadar();
  }

  drawRadar() {
    this.world.drawRadar(this.radar, this.camera.position, this.enemies, this.yaw, this.groundY);
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05); this.lifeTime += dt;
    if (['playing', 'paused'].includes(this.state)) {
      this.elapsed = (performance.now() - this.runStartedAt) / 1000;
      $('run-time').textContent = formatRunTime(this.elapsed * 1000);
    }
    if (this.state === 'home') {
      this.menuTime += dt;
      if (this.world.menuPosition) { this.camera.position.copy(this.world.menuPosition); this.camera.position.x += Math.sin(this.menuTime * 0.04) * 0.4; this.camera.lookAt(this.world.menuTarget); }
      else { this.camera.position.set(7 + Math.sin(this.menuTime * 0.04) * 1.5, 4.2, 24); this.camera.lookAt(-3, 2.5, -9); }
      this.camera.fov = 64; this.camera.updateProjectionMatrix();
    } else if (this.state === 'playing') {
      this.shootTimer = Math.max(0, this.shootTimer - dt);
      this.updatePlayer(dt); this.updateEnemies(dt);
      if (this.state === 'playing') this.updateWaves(dt);
      this.updateEffects(dt);
      this.bannerTime -= dt; this.notificationTime -= dt; this.hitTime -= dt; this.damageTime = Math.max(0, this.damageTime - dt);
      if (this.bannerTime <= 0) $('wave-banner').classList.remove('visible');
      if (this.notificationTime <= 0) $('notification').classList.remove('visible');
      if (this.hitTime <= 0) { $('hitmarker').classList.remove('visible'); $('hit-feedback').classList.remove('visible'); }
      $('damage-vignette').style.opacity = this.damageTime * 1.5 + (this.health < 25 ? 0.13 : 0);
      this.uiTime += dt; if (this.uiTime > 0.09) { this.updateHud(); this.uiTime = 0; }
    }
    this.world.dust.forEach(particles => { particles.rotation.y = Math.sin(this.lifeTime * 0.008) * 0.05; });
    this.world.update?.(this.camera, this.state);
    this.flashlight.visible = this.flashlightOn && this.state !== 'home';
    this.scene.updateMatrixWorld();
    this.renderer.autoClear = true; this.renderer.render(this.scene, this.camera);
    if (['playing', 'paused', 'dead', 'won'].includes(this.state) && this.weaponId) {
      this.renderer.autoClear = false; this.renderer.clearDepth(); this.renderer.render(this.weaponScene, this.weaponCamera);
    }
  }
}
