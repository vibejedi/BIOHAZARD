import test from 'node:test';
import assert from 'node:assert/strict';
import { circleBlocked, findPath, reloadAmmo, waveSize, WEAPONS } from '../src/rules.js';

test('reload transfers only available rounds and preserves the total', () => {
  for (const definition of Object.values(WEAPONS)) {
    for (const reserve of [0, 3, 150]) {
      const initial = definition.capacity - 7;
      const result = reloadAmmo(initial, reserve, definition.capacity);
      assert.equal(result.ammo + result.reserve, initial + reserve);
      assert.ok(result.ammo <= definition.capacity);
      assert.ok(result.reserve >= 0);
    }
  }
});

test('collision respects player radius, cover corners, and world boundaries', () => {
  const obstacles = [{ x: 0, z: 0, w: 2, d: 2 }];
  assert.equal(circleBlocked(1.2, 0, 0.4, obstacles), true);
  assert.equal(circleBlocked(1.5, 0, 0.4, obstacles), false);
  assert.equal(circleBlocked(1.25, 1.25, 0.4, obstacles), true);
  assert.equal(circleBlocked(1.4, 1.4, 0.4, obstacles), false);
  assert.equal(circleBlocked(29, 0, 0.4, []), true);
});

test('zombie navigation routes around solid cover without crossing it', () => {
  const obstacles = [{ x: 0, z: 0, w: 4, d: 8 }];
  const path = findPath({ x: -8, z: 0 }, { x: 8, z: 0 }, obstacles);
  assert.ok(path.length > 8);
  assert.ok(path.every(p => !circleBlocked(p.x, p.z, 0.48, obstacles)));
  assert.ok(path.some(p => Math.abs(p.z) > 4));
  assert.ok(Math.hypot(path.at(-1).x - 8, path.at(-1).z) <= 2);
});

test('unreachable targets return no path', () => {
  const obstacles = [{ x: 0, z: 0, w: 58, d: 2 }];
  assert.deepEqual(findPath({ x: 0, z: -6 }, { x: 0, z: 6 }, obstacles), []);
});

test('five waves escalate from six to fourteen enemies', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(waveSize), [6, 8, 10, 12, 14]);
});
