import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { WebSocket } from 'ws';
import { Matchmaker } from '../server/queue.js';
import { createMatchServer } from '../server/index.js';
import { worldHit, shotDirection } from '../server/physics.js';

const data = JSON.parse(fs.readFileSync(new URL('../game-assets/ready/dust2.json', import.meta.url), 'utf8'));
function fixture(count) {
  let now = 1000; const manager = new Matchmaker(data, { now: () => now });
  const sessions = Array.from({ length: count }, (_, i) => { const messages = []; const session = manager.connect(message => messages.push(message)); session.messages = messages; manager.join(session, `P${i}`); return session; });
  return { manager, sessions, advance(time) { now = time; manager.tick(); }, get now() { return now; } };
}

test('queues batch at five-minute boundaries into isolated rooms of at most ten players', () => {
  const f = fixture(21); f.advance(299999); assert.equal(f.manager.matches.size, 0);
  f.advance(300000); assert.equal(f.manager.matches.size, 2); assert.equal(f.manager.queue.length, 1);
  assert.deepEqual([...f.manager.matches.values()].map(room => room.players.size), [10, 10]);
  assert.notEqual(f.sessions[0].matchId, f.sessions[10].matchId);
  const room = f.manager.matches.get(f.sessions[0].matchId), target = [...f.manager.matches.values()][1].players.values().next().value;
  const original = target.health;
  room.handle(f.sessions[0], { type: 'damage', target: target.id, amount: 10000 }, f.now);
  assert.equal(target.health, original);
  const foreignId = f.sessions[10].matchId;
  f.manager.handle(f.sessions[0], { type: 'input', seq: 1, forward: 0, right: 0, yaw: 0, pitch: 0, matchId: foreignId, x: 100000 });
  assert.equal(f.sessions[0].matchId, room.id);
  assert.ok(f.sessions[0].messages.filter(message => message.type === 'snapshot').every(message => !message.players.some(player => player.id === target.id)));
});

test('server rejects teleports, invalid inputs, free purchases, and fire-rate/ammunition cheating', () => {
  const f = fixture(2); f.advance(300000);
  const match = [...f.manager.matches.values()][0], player = match.players.get(f.sessions[0].id);
  const before = { ...player.position };
  f.manager.handle(f.sessions[0], { type: 'input', seq: 1, forward: 10000, right: 0, yaw: 0, pitch: 0, x: 10000 }); f.advance(300033);
  assert.deepEqual(player.position, before);
  f.manager.handle(f.sessions[0], { type: 'buy', action: 'weapon', id: 'm249' }); assert.deepEqual(player.ownedWeapons, ['usp']);
  match.fire(player, f.now); const shots = player.shots, ammo = player.ammunition.usp.ammo;
  for (let i = 0; i < 100; i++) match.fire(player, f.now);
  assert.equal(player.shots, shots); assert.equal(player.ammunition.usp.ammo, ammo);
  player.ammunition.usp.ammo = 0; f.advance(301000); match.fire(player, f.now); assert.equal(player.ammunition.usp.ammo, 0);
});

test('server headshots use authoritative positions and BSP walls, followed by a pistol respawn', () => {
  const f = fixture(2); f.advance(300000); const match = [...f.manager.matches.values()][0];
  const [first, second] = [...match.players.values()], start = data.playerSpawn;
  first.position = { x: start[0], y: start[1], z: start[2] };
  const point = data.nodes.find(p => Math.hypot(p[0] - start[0], p[2] - start[2]) > 2 && Math.hypot(p[0] - start[0], p[2] - start[2]) < 5 && Math.abs(p[1] - start[1]) < 0.1 && worldHit(data, [start[0], start[1] + 2, start[2]], shotDirection(Math.atan2(start[0] - p[0], start[2] - p[2]), Math.atan2(-0.23, Math.hypot(p[0] - start[0], p[2] - start[2]))), 8) > Math.hypot(p[0] - start[0], p[2] - start[2]));
  assert.ok(point);
  second.position = { x: point[0], y: point[1], z: point[2] };
  first.yaw = Math.atan2(start[0] - point[0], start[2] - point[2]); first.pitch = Math.atan2(-0.23, Math.hypot(point[0] - start[0], point[2] - start[2]));
  match.fire(first, f.now);
  assert.equal(second.health, 0); assert.equal(first.frags, 1); assert.equal(first.headshots, 1);
  f.advance(303001); assert.equal(second.health, 100); assert.equal(second.weaponId, 'usp'); assert.equal(second.deaths, 1);
});

test('actual websocket clients can queue, match and disconnect, with a healthy HTTP endpoint', async () => {
  let now = 1000; const app = createMatchServer({ data, now: () => now, manual: true, origins: ['http://test.local'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const address = `http://127.0.0.1:${app.server.address().port}`;
  const clients = [];
  try {
    const health = await (await fetch(`${address}/healthz`)).json(); assert.equal(health.capacity, 10); assert.equal(health.queueIntervalMs, 300000);
    for (let i = 0; i < 2; i++) {
      const messages = [], socket = new WebSocket(`${address.replace('http:', 'ws:')}/ws`, { origin: 'http://test.local' });
      socket.on('message', buffer => messages.push(JSON.parse(buffer))); clients.push({ socket, messages });
      await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
      socket.send(JSON.stringify({ type: 'join', name: `Socket${i}` }));
    }
    await new Promise(resolve => setTimeout(resolve, 40)); assert.equal(app.manager.queue.length, 2);
    now = 300000; app.manager.tick(); await new Promise(resolve => setTimeout(resolve, 40));
    assert.ok(clients.every(client => client.messages.some(message => message.type === 'matched')));
    clients[0].socket.send(JSON.stringify({ type: 'leave' })); await new Promise(resolve => setTimeout(resolve, 30));
    clients[0].socket.send(JSON.stringify({ type: 'join', name: 'Again' })); await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(app.manager.queue.length, 1);
  } finally { for (const { socket } of clients) socket.terminate(); await app.close(); }
});

test('server bullets stop at original BSP walls and movement follows collision with bounded speed', () => {
  const f = fixture(2); f.advance(300000); const match = [...f.manager.matches.values()][0], [first, second] = [...match.players.values()], start = data.playerSpawn;
  first.position = { x: start[0], y: start[1], z: start[2] };
  const wallTarget = data.nodes.find(p => {
    const distance = Math.hypot(p[0] - start[0], p[2] - start[2]);
    return distance > 4 && distance < 25 && Math.abs(p[1] - start[1]) < 0.1 && worldHit(data, [start[0], start[1] + 2, start[2]], shotDirection(Math.atan2(start[0] - p[0], start[2] - p[2]), 0), 30) < distance - 0.5;
  });
  assert.ok(wallTarget); second.position = { x: wallTarget[0], y: wallTarget[1], z: wallTarget[2] };
  first.yaw = Math.atan2(start[0] - wallTarget[0], start[2] - wallTarget[2]); first.pitch = 0;
  match.fire(first, f.now); assert.equal(second.health, 100); assert.equal(first.hits, 0);
  first.position = { x: start[0], y: start[1], z: start[2] };
  let total = 0;
  for (let i = 1; i <= 90; i++) {
    const previous = { ...first.position };
    f.manager.handle(f.sessions[0], { type: 'input', seq: i, forward: 1, right: 1, yaw: data.playerYaw, pitch: 0, sprint: true });
    f.advance(300000 + i * 33);
    const distance = Math.hypot(first.position.x - previous.x, first.position.z - previous.z); total += distance;
    assert.ok(distance <= 6 * 0.033 + 0.0001, 'Diagonal input cannot bypass the speed limit');
    assert.ok(match.collision.canStand(first.position.x, first.position.y + 0.04, first.position.z));
  }
  assert.ok(total > 0.5);
});

test('aiming overrides sprint and uses the same movement speed as browser prediction', () => {
  const f = fixture(2); f.advance(300000); const match = [...f.manager.matches.values()][0], player = match.players.get(f.sessions[0].id), start = data.playerSpawn;
  player.position = { x: start[0], y: start[1], z: start[2] };
  f.manager.handle(f.sessions[0], { type: 'input', seq: 1, forward: 1, right: 0, yaw: data.playerYaw, pitch: 0, sprint: true, aiming: true });
  f.advance(300033);
  assert.ok(Math.abs(Math.hypot(player.position.x - start[0], player.position.z - start[2]) - 2.2 * 0.033) < 0.0001);
  assert.equal(player.stamina, 100);
  const previous = { ...player.position };
  f.manager.handle(f.sessions[0], { type: 'input', seq: 2, forward: 1, right: 0, yaw: data.playerYaw, pitch: 0, sprint: true, aiming: false });
  f.advance(300066);
  assert.ok(Math.abs(Math.hypot(player.position.x - previous.x, player.position.z - previous.z) - 6 * 0.033) < 0.0001);
  assert.ok(player.stamina < 100);
});
