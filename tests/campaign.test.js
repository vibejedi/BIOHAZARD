import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COURSES, courseWaves, courseKills, stageEndWave } from '../src/campaign.js';
import { MapCollision, NavigationGraph } from '../src/bsp-navigation.js';

test('the Half-Life campaign has five original story maps and three waves per chapter', () => {
  assert.deepEqual(COURSES['hl-campaign'].stages.map(stage => stage.map), ['c1a0', 'c1a1', 'c1a2', 'c1a3', 'c1a4']);
  assert.equal(courseWaves('dust2'), 5); assert.equal(courseKills('dust2'), 50);
  assert.equal(courseWaves('hl-campaign'), 15); assert.equal(courseKills('hl-campaign'), 300);
  assert.deepEqual([0, 1, 2, 3, 4].map(index => stageEndWave('hl-campaign', index)), [3, 6, 9, 12, 15]);
});

for (const { map } of COURSES['hl-campaign'].stages) {
  const path = new URL(`../game-assets/ready/${map}.json`, import.meta.url);
  test(`${map}: player spawn and zombie routes use the connected, collidable map`, { skip: !fs.existsSync(path) }, () => {
    const data = JSON.parse(fs.readFileSync(path, 'utf8')), collision = new MapCollision(data), graph = new NavigationGraph(data);
    const player = { x: data.playerSpawn[0], y: data.playerSpawn[1], z: data.playerSpawn[2] };
    assert.ok(collision.canStand(player.x, player.y + 0.04, player.z));
    const spawns = graph.nearbySpawns(player); assert.ok(spawns.length > 0, 'A wave needs reachable spawn lanes');
    for (const point of spawns.filter((_, i) => i % 61 === 0)) {
      const position = { x: point[0], y: point[1], z: point[2] }, route = graph.path(position, player);
      assert.ok(route.length > 2);
      let floor = position.y;
      for (const node of route) {
        for (let step = 0; step < 25 && Math.hypot(position.x - node.x, position.z - node.z) > 0.05; step++) {
          const dx = node.x - position.x, dz = node.z - position.z, length = Math.hypot(dx, dz);
          floor = collision.move(position, dx / length * Math.min(length, 0.15), dz / length * Math.min(length, 0.15), floor);
          assert.ok(collision.canStand(position.x, floor + 0.04, position.z));
        }
        assert.ok(Math.hypot(position.x - node.x, position.z - node.z) < 0.15, `Blocked route at ${JSON.stringify(node)}`);
      }
    }
  });
}
