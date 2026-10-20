import { randomUUID } from 'node:crypto';
import { MapCollision } from '../src/bsp-navigation.js';
import { WEAPONS, shotDamage, reloadAmmo } from '../src/rules.js';
import { startingInventory, equipOwned, purchase } from '../src/economy.js';
import { supplyPosition } from '../src/supplies.js';
import { rayBox, worldHit, shotDirection } from './physics.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export const validAngle = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e6;

export class Match {
  constructor(sessions, data, now, duration = 300000) {
    this.id = randomUUID(); this.data = data; this.collision = new MapCollision(data);
    this.startedAt = now; this.endsAt = now + duration; this.lastTick = now; this.lastSnapshot = 0;
    this.supplies = supplyPosition(data); this.players = new Map();
    for (const session of sessions) {
      const player = { ...startingInventory(), id: session.id, name: session.name, session, position: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, health: 100, maxHealth: 100, stamina: 100, jump: 0, jumpVelocity: 0, frags: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, respawnAt: 0, nextShot: 0, reloadAt: 0, input: {}, inputAt: 0, inputSeq: -1 };
      this.players.set(player.id, player); session.matchId = this.id; session.queued = false; this.respawn(player, now, true);
    }
    for (const player of this.players.values()) player.session.send({ type: 'matched', matchId: this.id, map: 'dust2', startedAt: now, endsAt: this.endsAt, serverNow: now, capacity: 10 });
    this.snapshot(now);
  }

  broadcast(message) { for (const player of this.players.values()) if (player.session.connected) player.session.send(message); }

  respawn(player, now, initial = false) {
    const others = [...this.players.values()].filter(other => other !== player && other.health > 0 && other.session.connected);
    const spawns = this.data.spawns.length ? this.data.spawns : [this.data.playerSpawn];
    let point = spawns[(this.players.size + player.deaths * 7) % spawns.length], score = -Infinity;
    for (const spawn of spawns) {
      const distance = others.length ? Math.min(...others.map(other => Math.hypot(other.position.x - spawn[0], other.position.z - spawn[2]))) : 0;
      if (distance > score) { score = distance; point = spawn; }
    }
    if (!initial) { const cash = player.cash; Object.assign(player, startingInventory()); player.cash = cash; }
    player.position = { x: point[0], y: point[1], z: point[2] };
    player.health = 100; player.stamina = 100; player.jump = 0; player.jumpVelocity = 0; player.respawnAt = 0; player.reloadAt = 0; player.nextShot = now;
    player.input = {}; player.inputAt = 0;
  }

  handle(session, message, now) {
    const player = this.players.get(session.id); if (!player || now >= this.endsAt) return;
    if (message.type === 'input') {
      if (!Number.isSafeInteger(message.seq) || message.seq <= player.inputSeq || !validAngle(message.yaw) || !validAngle(message.pitch)) return;
      if (![message.forward, message.right].every(value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1)) return;
      player.inputSeq = message.seq; player.inputAt = now;
      player.yaw = message.yaw % (Math.PI * 2); player.pitch = clamp(message.pitch, -1.35, 1.35);
      if (message.jump === true && !player.input.jump && player.jump === 0) player.jumpVelocity = 5.2;
      player.input = { forward: message.forward, right: message.right, sprint: message.sprint === true, aiming: message.aiming === true, jump: message.jump === true };
      return;
    }
    if (player.health <= 0) return;
    if (message.type === 'fire') {
      if (validAngle(message.yaw) && validAngle(message.pitch)) { player.yaw = message.yaw; player.pitch = clamp(message.pitch, -1.35, 1.35); }
      this.fire(player, now);
    } else if (message.type === 'reload') {
      const ammo = player.ammunition[player.weaponId], weapon = WEAPONS[player.weaponId];
      if (!player.reloadAt && ammo.ammo < weapon.capacity && ammo.reserve > 0) player.reloadAt = now + weapon.reload * 1000;
    } else if (message.type === 'equip') {
      if (equipOwned(player, message.id)) player.reloadAt = 0;
    } else if (message.type === 'buy') {
      const distance = Math.hypot(player.position.x - this.supplies[0], player.position.z - this.supplies[2]);
      if (distance > 3.5 || Math.abs(player.position.y - this.supplies[1]) > 1.5) { session.send({ type: 'purchase', ok: false, message: 'PURCHASES REQUIRE THE SUPPLY CRATE' }); return; }
      const progress = Math.min(15, 1 + Math.floor((now - this.startedAt) / (this.endsAt - this.startedAt) * 15));
      const result = purchase(player, message.action, message.id, progress, 15);
      if (result.ok) player.reloadAt = 0;
      session.send({ type: 'purchase', ...result }); this.snapshot(now);
    }
  }

  fire(player, now) {
    const weapon = WEAPONS[player.weaponId], ammo = player.ammunition[player.weaponId];
    if (player.reloadAt || now < player.nextShot || ammo.ammo <= 0) return;
    ammo.ammo--; player.shots++; player.nextShot = now + weapon.interval * 1000;
    const origin = [player.position.x, player.position.y + player.jump + 2, player.position.z], direction = shotDirection(player.yaw, player.pitch);
    let maximum = worldHit(this.data, origin, direction), target = null, headshot = false;
    // The original supply prop also blocks bullets in the client scene.
    const [sx, sy, sz] = this.supplies;
    const crate = rayBox(origin, direction, [sx - 0.575, sy, sz - 0.575], [sx + 0.575, sy + 1.2, sz + 0.575], maximum);
    if (crate !== null) maximum = Math.min(maximum, crate);
    for (const other of this.players.values()) {
      if (other === player || other.health <= 0 || !other.session.connected) continue;
      const { x, y, z } = other.position, floor = y + other.jump;
      for (const head of [false, true]) {
        const low = head ? [x - 0.24, floor + 1.5, z - 0.24] : [x - 0.38, floor + 0.08, z - 0.3];
        const high = head ? [x + 0.24, floor + 2.04, z + 0.24] : [x + 0.38, floor + 1.5, z + 0.3];
        const distance = rayBox(origin, direction, low, high, maximum);
        if (distance !== null && distance < maximum) { maximum = distance; target = other; headshot = head; }
      }
    }
    const point = origin.map((value, index) => value + direction[index] * maximum);
    let killed = false;
    if (target) {
      target.health = Math.max(0, target.health - shotDamage(player.weaponId, headshot)); player.hits++;
      if (!target.health) {
        killed = true; target.deaths++; target.respawnAt = now + 3000; target.input = {};
        player.frags++; player.cash += headshot ? 450 : 300; if (headshot) player.headshots++;
      }
    }
    this.broadcast({ type: 'combat', shooter: player.id, target: target?.id || null, point, headshot, killed, weapon: player.weaponId });
    this.snapshot(now);
  }

  tick(now) {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000)); this.lastTick = now;
    for (const player of this.players.values()) {
      if (!player.session.connected) continue;
      if (player.health <= 0) { if (player.respawnAt && now >= player.respawnAt) this.respawn(player, now); continue; }
      if (player.reloadAt && now >= player.reloadAt) { Object.assign(player.ammunition[player.weaponId], reloadAmmo(player.ammunition[player.weaponId].ammo, player.ammunition[player.weaponId].reserve, WEAPONS[player.weaponId].capacity)); player.reloadAt = 0; }
      const input = now - player.inputAt < 250 ? player.input : {};
      const moving = Math.hypot(input.forward || 0, input.right || 0) > 0.01;
      const sprint = moving && input.sprint && !input.aiming && player.stamina > 1;
      player.stamina = clamp(player.stamina + (sprint ? -27 : 20) * dt, 0, 100);
      const length = Math.max(1, Math.hypot(input.forward || 0, input.right || 0)), speed = input.aiming ? 2.2 : sprint ? 6 : 3.6;
      const right = (input.right || 0) / length * speed * dt, forward = (input.forward || 0) / length * speed * dt;
      player.position.y = this.collision.move(player.position, right * Math.cos(player.yaw) - forward * Math.sin(player.yaw), -forward * Math.cos(player.yaw) - right * Math.sin(player.yaw), player.position.y);
      if (player.jump > 0 || player.jumpVelocity > 0) {
        player.jumpVelocity -= 14 * dt; const next = Math.max(0, player.jump + player.jumpVelocity * dt);
        if (this.collision.canStand(player.position.x, player.position.y + next + 0.04, player.position.z)) player.jump = next;
        else player.jumpVelocity = Math.min(0, player.jumpVelocity);
        if (!player.jump) player.jumpVelocity = 0;
      }
    }
    if (now - this.lastSnapshot >= 66) this.snapshot(now);
  }

  snapshot(now) {
    this.lastSnapshot = now;
    const players = [...this.players.values()].map(player => ({ id: player.id, name: player.name, ...player.position, jump: player.jump, yaw: player.yaw, pitch: player.pitch, health: player.health, frags: player.frags, deaths: player.deaths, headshots: player.headshots, connected: player.session.connected, weapon: player.weaponId }));
    for (const player of this.players.values()) if (player.session.connected) player.session.send({ type: 'snapshot', matchId: this.id, serverNow: now, endsAt: this.endsAt, players, self: { cash: player.cash, ownedWeapons: player.ownedWeapons, primary: player.primary, sidearm: player.sidearm, weaponId: player.weaponId, ammunition: player.ammunition, stamina: player.stamina, reloadAt: player.reloadAt, respawnAt: player.respawnAt, shots: player.shots, hits: player.hits } });
  }

  finish(now) {
    const standings = [...this.players.values()].map(player => ({ id: player.id, name: player.name, frags: player.frags, deaths: player.deaths, headshots: player.headshots, accuracy: player.shots ? player.hits / player.shots : 0 })).sort((a, b) => b.frags - a.frags || a.deaths - b.deaths || b.headshots - a.headshots);
    this.broadcast({ type: 'finished', matchId: this.id, standings, serverNow: now });
    for (const player of this.players.values()) player.session.matchId = null;
  }
}
