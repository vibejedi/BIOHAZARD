import * as THREE from 'three';
import { WEAPONS } from './rules.js';

const $ = id => document.getElementById(id);
const axis = value => Math.max(-1, Math.min(1, value));
const time = ms => `${Math.floor(Math.max(0, ms) / 60000)}:${String(Math.floor(Math.max(0, ms) / 1000) % 60).padStart(2, '0')}`;

export class MultiplayerClient {
  constructor(game, wallet) {
    this.wallet = wallet;
    this.game = game; this.socket = null; this.avatars = new Map(); this.id = null; this.matchId = null;
    this.applyingState = false; this.sequence = 0; this.inputTimer = 0; this.serverOffset = 0; this.nextStartAt = 0; this.unlockProgress = 1;
    try { $('mp-endpoint').value = localStorage.getItem('bh-match-server') || import.meta.env.VITE_MULTIPLAYER_URL || ''; $('mp-name').value = localStorage.getItem('bh-callsign') || 'Operator'; } catch { /* Optional preferences. */ }
    $('mp-join').addEventListener('click', () => this.join());
    $('mp-leave').addEventListener('click', () => { this.send({ type: 'leave' }); this.disconnect(); });
    this.displayTimer = setInterval(() => {
      if (this.nextStartAt) $('mp-countdown').textContent = `NEXT BATCH: ${time(this.nextStartAt - (Date.now() + this.serverOffset))}`;
    }, 250);
  }

  send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }

  join() {
    if (this.wallet && !this.wallet.canPlay()) return;
    let url;
    try {
      url = new URL($('mp-endpoint').value);
      if (!['ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw new Error();
      if (location.protocol === 'https:' && url.protocol !== 'wss:') throw new Error();
    } catch { $('mp-status').textContent = 'Enter the match server WebSocket address. Public HTTPS play requires wss:// and a valid TLS certificate.'; return; }
    try { localStorage.setItem('bh-match-server', url.href); localStorage.setItem('bh-callsign', $('mp-name').value); } catch { /* Optional preferences. */ }
    if (this.socket?.readyState === WebSocket.OPEN) { this.send({ type: 'join', name: this.wallet?.profile?.username || $('mp-name').value, authToken: this.wallet?.token }); return; }
    this.disconnect(false); $('mp-join').disabled = true; $('mp-status').textContent = 'Connecting to USA West match server…';
    const socket = new WebSocket(url.href); this.socket = socket;
    const timeout = setTimeout(() => { if (socket.readyState !== WebSocket.OPEN) { socket.close(); $('mp-status').textContent = 'Server connection timed out. Check that the VPS is running and the address is correct.'; } }, 8000);
    socket.addEventListener('open', () => { clearTimeout(timeout); this.send({ type: 'join', name: this.wallet?.profile?.username || $('mp-name').value, authToken: this.wallet?.token }); });
    socket.addEventListener('message', event => {
      try { this.receive(JSON.parse(event.data)); } catch (error) { console.warn('Match message could not be applied:', error.message); }
    });
    socket.addEventListener('error', () => { $('mp-status').textContent = 'Cannot reach the match server. Campaign remains available; check the VPS address and TLS setup.'; });
    socket.addEventListener('close', () => {
      clearTimeout(timeout); if (this.socket !== socket) return;
      this.socket = null; $('mp-join').disabled = false; $('mp-leave').disabled = true;
      if (this.matchId) { this.game.notify('MATCH SERVER DISCONNECTED', 8); this.end({ standings: [] }, true); }
    });
  }

  receive(message) {
    if (Number.isFinite(message.serverNow)) this.serverOffset = message.serverNow - Date.now();
    if (message.type === 'welcome') { this.id = message.id; this.nextStartAt = message.nextStartAt; }
    else if (message.type === 'queued') {
      this.nextStartAt = message.nextStartAt; $('mp-status').textContent = `Queued in USA West · position ${message.position}. Waiting for the next five-minute batch.`;
      $('mp-queue-count').textContent = `${message.count} QUEUED · MAX 10 / MATCH`; $('mp-join').disabled = true; $('mp-leave').disabled = false;
    } else if (message.type === 'matched') {
      this.matchId = message.matchId; this.startedAt = message.startedAt; this.endsAt = message.endsAt; this.nextStartAt = 0;
      $('multiplayer-dialog').close(); this.begin(message);
    } else if (message.type === 'snapshot' && message.matchId === this.matchId) this.snapshot(message);
    else if (message.type === 'combat' && this.matchId) this.combat(message);
    else if (message.type === 'finished' && message.matchId === this.matchId) this.end(message);
    else if (message.type === 'purchase') { $('armory-message').textContent = message.message; this.game.notify(message.message); }
    else if (message.type === 'error') { $('mp-status').textContent = message.message; $('mp-join').disabled = false; }
  }

  begin(message) {
    const g = this.game;
    this.clearAvatars(); g.networkSession = null; g.selectCourse('dust2'); g.start('usp', 'operator');
    g.networkSession = this; g.networkDead = false; this.sequence = 0; this.inputTimer = 0; this.position = null;
    g.totalWaves = 15; g.nextWaveTimer = 999999; g.waveStats = null;
    $('wave-mode').textContent = 'FFA'; $('wave-summary').hidden = true;
    $('pause-description').textContent = 'The online match keeps running while paused.';
    g.banner('USA WEST · UP TO 10 PLAYERS', 'FREE FOR ALL.', 3);
    g.notify('SERVER-VERIFIED DEATHMATCH · 5 MINUTES · E SUPPLY CRATE', 6);
    this.endsAt = message.endsAt;
  }

  snapshot(message) {
    const g = this.game, own = message.players.find(player => player.id === this.id); if (!own) return;
    this.players = message.players; this.endsAt = message.endsAt;
    this.unlockProgress = Math.min(15, 1 + Math.floor((message.serverNow - this.startedAt) / (this.endsAt - this.startedAt) * 15));
    const wasDead = g.networkDead;
    if (own.health < g.health) { g.damageTime = 0.5; g.audio.hurt(); }
    g.networkDead = own.health <= 0; g.health = own.health; g.kills = own.frags; g.headshots = own.headshots; g.score = own.frags * 100;
    this.position = new THREE.Vector3(own.x, own.y + own.jump + g.eyeHeight, own.z); this.ground = own.y;
    if (wasDead && !g.networkDead || g.camera.position.distanceTo(this.position) > 3) {
      g.camera.position.copy(this.position); g.groundY = own.y; g.jumpHeight = own.jump; g.jumpVelocity = 0;
    }
    const self = message.self; g.cash = self.cash; g.ownedWeapons = [...self.ownedWeapons]; g.primary = self.primary; g.sidearm = self.sidearm;
    g.ammunition = structuredClone(self.ammunition); g.stamina = self.stamina;
    this.applyingState = true;
    if (g.weaponId !== self.weaponId) g.switchWeapon(self.weaponId);
    this.applyingState = false;
    const reload = Math.max(0, (self.reloadAt - message.serverNow) / 1000);
    if (reload > 0 && g.reloadTime <= 0) { const view = g.weapons[g.weaponId]; view.animation.play(view.reloadAnimation, reload, true); }
    g.reloadDuration = WEAPONS[self.weaponId].reload; g.reloadTime = reload; $('reload-indicator').hidden = reload <= 0;
    if (g.networkDead) { g.closeArmory(); g.notify(`RESPAWNING IN ${Math.max(1, Math.ceil((self.respawnAt - message.serverNow) / 1000))}s`, 2); }
    const seen = new Set();
    for (const player of message.players) {
      if (player.id === this.id) continue; seen.add(player.id);
      let avatar = this.avatars.get(player.id);
      if (!avatar) { avatar = g.classicAssets.createPlayer(); g.scene.add(avatar.group); this.avatars.set(player.id, avatar); avatar.group.position.set(player.x, player.y + player.jump, player.z); }
      avatar.target = new THREE.Vector3(player.x, player.y + player.jump, player.z); avatar.yaw = player.yaw + Math.PI;
      avatar.group.visible = player.connected && player.health > 0; avatar.name = player.name;
    }
    for (const [id, avatar] of this.avatars) if (!seen.has(id)) { g.disposeEntity(avatar); this.avatars.delete(id); }
    if (g.shopping) g.renderArmory(); g.updateHud(); this.hud();
  }

  update(dt) {
    const g = this.game; this.inputTimer += dt;
    if (this.position) {
      const distance = g.camera.position.distanceTo(this.position);
      if (distance > 0.12 && !g.jumpHeight) g.camera.position.lerp(this.position, Math.min(1, dt * 6));
      if (distance > 2) { g.groundY = this.ground; g.camera.position.copy(this.position); }
    }
    if (this.inputTimer >= 1 / 30) {
      this.inputTimer = 0; const keys = g.keys;
      const blocked = g.shopping || g.networkDead;
      this.send({ type: 'input', seq: ++this.sequence, forward: blocked ? 0 : axis((keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - g.moveInput.z), right: blocked ? 0 : axis((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + g.moveInput.x), sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'), aiming: g.aiming, jump: keys.has('Space'), yaw: g.yaw, pitch: g.pitch });
    }
    for (const avatar of this.avatars.values()) {
      const moving = avatar.target && avatar.group.position.distanceTo(avatar.target) > 0.03;
      if (avatar.target) avatar.group.position.lerp(avatar.target, Math.min(1, dt * 14));
      avatar.group.rotation.y = avatar.yaw; avatar.animation.play(moving ? 'run' : 'idle1'); avatar.animation.update(dt);
    }
    this.hud();
  }

  hud() {
    $('run-stage').textContent = 'USA WEST · FREE FOR ALL'; $('wave-mode').textContent = 'FFA';
    $('wave').textContent = String(this.players?.filter(player => player.connected).length || 0).padStart(2, '0'); $('wave-total').textContent = '/ 10';
    $('remaining').textContent = `MATCH ENDS IN ${time(this.endsAt - (Date.now() + this.serverOffset))}`;
    $('run-score').textContent = `${this.game.kills} FRAGS`;
  }

  combat(message) {
    const g = this.game;
    if (message.target) g.burst(new THREE.Vector3(...message.point), 0xd71919, message.headshot ? 30 : 18, true);
    else g.burst(new THREE.Vector3(...message.point), 0xd0b68a, 5);
    if (message.shooter === this.id && message.target) {
      g.hitTime = 0.3; $('hitmarker').classList.add('visible'); $('hitmarker').classList.toggle('kill', message.killed);
      $('hit-feedback').textContent = message.headshot ? 'HEADSHOT' : 'BODY HIT'; $('hit-feedback').classList.add('visible'); g.audio.hit(message.killed);
    }
    if (message.shooter !== this.id) g.audio.sample(message.weapon, 0.12);
  }

  end(message, disconnected = false) {
    const g = this.game, own = message.standings.find(player => player.id === this.id), rank = message.standings.findIndex(player => player.id === this.id) + 1;
    g.closeArmory(); g.mouseDown = false; g.keys.clear(); g.setState('won'); if (document.pointerLockElement) document.exitPointerLock();
    $('result-kicker').textContent = disconnected ? 'CONNECTION LOST' : 'USA WEST / DEATHMATCH COMPLETE';
    $('result-title').textContent = disconnected ? 'DISCONNECTED.' : rank === 1 ? 'VICTORY.' : 'MATCH COMPLETE.';
    $('result-description').textContent = disconnected ? 'Return to base and reconnect when the server is available.' : `${own?.frags || 0} frags · ${own?.deaths || 0} deaths · ${Math.round((own?.accuracy || 0) * 100)}% accuracy`;
    $('result-wave-label').textContent = 'FINAL PLACE'; $('result-wave').textContent = rank ? `#${rank}` : '—';
    $('result-kills').textContent = own?.frags || 0; $('result-time').textContent = time((this.endsAt || 0) - (this.startedAt || 0));
    $('result-score').textContent = (own?.frags || 0) * 100; $('result-headshots').textContent = own?.headshots || 0; $('result-rank').textContent = rank ? `#${rank}` : '—';
    $('result-record-note').textContent = 'SERVER MATCH RESULTS · NO CASH PRIZES'; $('best-score').textContent = '';
    $('result-kills-label').textContent = 'FRAGS'; $('result-time-label').textContent = 'MATCH TIME'; $('result-rank-label').textContent = 'MATCH RANK';
    $('result-table-label').textContent = 'MATCH STANDINGS'; $('result-breakdown-head').replaceChildren();
    $('result-breakdown-body').replaceChildren();
    const list = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 6;
    cell.textContent = message.standings.map((player, index) => `${index + 1}. ${player.name} — ${player.frags}K / ${player.deaths}D`).join(' · '); list.appendChild(cell); $('result-breakdown-body').appendChild(list);
    this.matchId = null; $('mp-join').disabled = false; $('mp-leave').disabled = true;
    $('mp-status').textContent = 'Match complete. Join the next queue to play again.';
  }

  clearAvatars() { for (const avatar of this.avatars.values()) this.game.disposeEntity(avatar); this.avatars.clear(); }
  leaveMatch() { this.send({ type: 'leave' }); this.matchId = null; this.clearAvatars(); this.game.networkSession = null; this.game.networkDead = false; }
  disconnect(update = true) {
    this.leaveMatch(); const socket = this.socket; this.socket = null; socket?.close();
    if (update) { $('mp-status').textContent = 'Not queued. Add the server address and join when ready.'; $('mp-join').disabled = false; $('mp-leave').disabled = true; $('mp-queue-count').textContent = '— / 10'; }
  }
}
