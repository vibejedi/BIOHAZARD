import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreWave } from '../src/scoring.js';
import { formatRunTime, recordRun, readRuns } from '../src/runs.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
}
function run(elapsedMs, headshots = 10, difficulty = 'operator') {
  const splits = Array.from({ length: 5 }, (_, index) => {
    const metrics = { wave: index + 1, elapsedMs: Math.round(elapsedMs * (index + 1) / 5), headshots: headshots / 5, shots: 20, hits: 20, damageTaken: 0, combatMs: 10000 };
    return { ...metrics, ...scoreWave(metrics) };
  });
  return { map: 'dust2', difficulty, elapsedMs, score: splits.reduce((sum, s) => sum + s.points, 0), headshots, kills: 50, splits };
}

test('completed runs rank by score, then fastest time, and separate difficulties', () => {
  const data = storage();
  recordRun(run(180000), data); recordRun(run(170000), data);
  assert.equal(recordRun(run(200000, 15), data).rank, 1);
  assert.equal(recordRun(run(150000, 10, 'recruit'), data).rank, 1);
  assert.deepEqual(readRuns(data).filter(x => x.difficulty === 'operator').map(x => [x.elapsedMs, x.score]), [[200000, run(200000, 15).score], [170000, run(170000).score], [180000, run(180000).score]]);
});

test('partial runs, invalid clocks, incomplete waves, and corrupt storage cannot become records', () => {
  const data = storage();
  for (const input of [{ ...run(1000), kills: 49 }, { ...run(1000), elapsedMs: NaN }, { ...run(1000), splits: [] }, { ...run(1000), headshots: 51 }, { ...run(1000), score: 999999 }]) {
    assert.equal(recordRun(input, data).saved, false);
  }
  data.setItem('bh-campaign-runs-v2', '{broken'); assert.deepEqual(readRuns(data), []);
  const blocked = { getItem() { throw new Error('Storage blocked'); }, setItem() { throw new Error('Storage blocked'); } };
  assert.deepEqual(readRuns(blocked), []); assert.equal(recordRun(run(1000), blocked).saved, false);
});

test('run clock preserves centiseconds and safely formats minute boundaries', () => {
  assert.equal(formatRunTime(0), '0:00.00');
  assert.equal(formatRunTime(59999), '0:59.99');
  assert.equal(formatRunTime(61023), '1:01.02');
});
