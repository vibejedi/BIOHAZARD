import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MapCollision, NavigationGraph, insidePolygon } from '../src/bsp-navigation.js';

test('floor polygon test includes edges and rejects points outside the convex surface', () => {
  const vertices = [[0, 2, 0], [4, 2, 0], [4, 2, 4], [0, 2, 4]];
  assert.equal(insidePolygon(2, 2, vertices), true);
  assert.equal(insidePolygon(0, 2, vertices), true);
  assert.equal(insidePolygon(5, 2, vertices), false);
});

const path = new URL('../game-assets/ready/dust2.json', import.meta.url);
test('Dust2 spawn, navigation, and connected wave-entry locations are usable', { skip: !fs.existsSync(path) }, () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const collision = new MapCollision(data), graph = new NavigationGraph(data);
  const player = { x: data.playerSpawn[0], y: data.playerSpawn[1], z: data.playerSpawn[2] };
  assert.ok(collision.canStand(player.x, player.y + 0.04, player.z));
  assert.ok(Math.abs(collision.ground(player.x, player.z, player.y) - player.y) < 0.1);
  const spawns = graph.nearbySpawns(player);
  assert.ok(spawns.length > 20);
  for (const point of spawns.filter((_, i) => i % 17 === 0)) {
    const start = { x: point[0], y: point[1], z: point[2] };
    const route = graph.path(start, player);
    assert.ok(route.length > 2);
    assert.ok(route.every(p => collision.canStand(p.x, p.y + 0.04, p.z)));
    assert.ok(Math.hypot(route.at(-1).x - player.x, route.at(-1).z - player.z) < 1);
  }
});

test('Dust2 movement can follow a real route while remaining outside solid geometry', { skip: !fs.existsSync(path) }, () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const collision = new MapCollision(data), graph = new NavigationGraph(data);
  const start = { x: data.playerSpawn[0], y: data.playerSpawn[1], z: data.playerSpawn[2] };
  const spawns = graph.nearbySpawns(start);
  const target = spawns[Math.floor(spawns.length / 2)];
  const route = graph.path(start, { x: target[0], y: target[1], z: target[2] });
  const pos = { ...start }; let foot = start.y;
  for (const point of route) {
    for (let i = 0; i < 25 && Math.hypot(pos.x - point.x, pos.z - point.z) > 0.05; i++) {
      const dx = point.x - pos.x, dz = point.z - pos.z, length = Math.max(0.001, Math.hypot(dx, dz));
      foot = collision.move(pos, dx / length * Math.min(length, 0.15), dz / length * Math.min(length, 0.15), foot);
      assert.ok(collision.canStand(pos.x, foot + 0.04, pos.z));
    }
    assert.ok(Math.hypot(pos.x - point.x, pos.z - point.z) < 0.15, `Route was blocked at ${JSON.stringify(point)}`);
  }
  assert.ok(Math.hypot(pos.x - target[0], pos.z - target[2]) < 1);
});

const bspPath = new URL('../game-assets/extracted/app/cstrike/maps/de_dust2.bsp', import.meta.url);
test('both original teams’ spawn areas connect to the playable navigation graph', { skip: !fs.existsSync(path) || !fs.existsSync(bspPath) }, () => {
  const data = JSON.parse(fs.readFileSync(path, 'utf8')), graph = new NavigationGraph(data);
  const raw = fs.readFileSync(bspPath), offset = raw.readInt32LE(4), length = raw.readInt32LE(8);
  const entities = [...raw.subarray(offset, offset + length).toString('latin1').matchAll(/\{([^}]*)\}/g)].map(match => Object.fromEntries([...match[1].matchAll(/"([^"\n]+)"\s*"([^"\n]*)"/g)].map(pair => [pair[1], pair[2]])));
  const spawns = entities.filter(entity => ['info_player_start', 'info_player_deathmatch'].includes(entity.classname));
  assert.equal(spawns.length, 40);
  let terrorist = null;
  for (const entity of spawns) {
    const [x, y, z] = entity.origin.split(' ').map(Number), point = { x: x / 32, y: (z - 36) / 32, z: -y / 32 };
    const index = graph.nearest(point); assert.ok(index >= 0);
    const node = data.nodes[index];
    assert.ok(Math.hypot(node[0] - point.x, node[1] - point.y, node[2] - point.z) < 1.3, `Disconnected original spawn: ${entity.origin}`);
    if (entity.classname === 'info_player_deathmatch') terrorist = { x: node[0], y: node[1], z: node[2] };
  }
  const start = { x: data.playerSpawn[0], y: data.playerSpawn[1], z: data.playerSpawn[2] };
  const route = graph.path(start, terrorist);
  assert.ok(route.length > 50, 'The CT-to-T route must traverse the map');
  assert.ok(Math.hypot(route.at(-1).x - terrorist.x, route.at(-1).z - terrorist.z) < 1);
});
