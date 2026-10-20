import test from 'node:test';
import assert from 'node:assert/strict';
import { startingInventory, purchase, equipOwned, unlockWave } from '../src/economy.js';
import { scoreWave } from '../src/scoring.js';

test('campaign inventory starts with a USP and finite ammo, and locked weapons cannot be purchased', () => {
  const state = { ...startingInventory(), health: 60, maxHealth: 100 };
  assert.deepEqual(state.ownedWeapons, ['usp']); assert.equal(state.cash, 600);
  assert.deepEqual(state.ammunition.usp, { ammo: 12, reserve: 36 }); assert.deepEqual(state.ammunition.m4, { ammo: 0, reserve: 0 });
  state.cash = 20000;
  for (const [id, wave] of [['mp5', 4], ['m4', 7], ['m249', 13]]) {
    assert.equal(unlockWave(id), wave);
    const cash = state.cash; assert.equal(purchase(state, 'weapon', id, wave - 1).ok, false); assert.equal(state.cash, cash);
    assert.equal(purchase(state, 'weapon', id, wave).ok, true); assert.ok(state.cash < cash); assert.ok(state.ownedWeapons.includes(id));
  }
});

test('refilling and equipping never create free bullets or replenish another weapon', () => {
  const state = startingInventory(); state.cash = 20000;
  purchase(state, 'weapon', 'mp5', 4); state.ammunition.usp.ammo = 0; state.ammunition.mp5.ammo = 3;
  const before = structuredClone(state.ammunition); equipOwned(state, 'usp'); equipOwned(state, 'mp5');
  assert.deepEqual(state.ammunition, before);
  const cash = state.cash; assert.equal(purchase(state, 'ammo', 'usp', 4).ok, true);
  assert.equal(state.cash, cash - 150); assert.equal(state.ammunition.mp5.ammo, 3);
  const after = state.cash; assert.equal(purchase(state, 'ammo', 'usp', 4).ok, false); assert.equal(state.cash, after);
  for (const id of ['__proto__', 'constructor', {}, null]) assert.equal(purchase(state, 'weapon', id, 15).ok, false);
});

test('headshots, faster clears, damage received and accuracy each affect the wave score', () => {
  const base = { wave: 2, headshots: 4, shots: 10, hits: 8, damageTaken: 0, combatMs: 30000 };
  const score = scoreWave(base).points;
  assert.ok(scoreWave({ ...base, headshots: 5 }).points > score);
  assert.ok(scoreWave({ ...base, combatMs: 40000 }).points < score);
  assert.ok(scoreWave({ ...base, damageTaken: 20 }).points < score);
  assert.ok(scoreWave({ ...base, shots: 16 }).points < score);
});
