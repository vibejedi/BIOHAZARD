import { COURSES, courseKills, courseWaves } from './campaign.js';
export const RUN_RULES = 'original-maps-headshots-v1';
const STORAGE_KEY = 'bh-speed-runs-v1';

export function formatRunTime(ms) {
  const centiseconds = Math.floor(Math.max(0, ms) / 10);
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, '0')}.${String(centiseconds % 100).padStart(2, '0')}`;
}

export function compareRuns(a, b) {
  return a.elapsedMs - b.elapsedMs || b.score - a.score || b.headshots - a.headshots;
}

function validRun(run) {
  return run && run.rules === RUN_RULES && Object.hasOwn(COURSES, run.map) && ['recruit', 'operator', 'veteran'].includes(run.difficulty)
    && Number.isSafeInteger(run.elapsedMs) && run.elapsedMs > 0
    && Number.isSafeInteger(run.score) && run.score >= 0
    && Number.isSafeInteger(run.headshots) && run.headshots >= 0 && run.headshots <= run.kills
    && run.kills === courseKills(run.map) && Array.isArray(run.splits) && run.splits.length === courseWaves(run.map)
    && run.splits.every((split, index) => split.wave === index + 1 && Number.isSafeInteger(split.elapsedMs) && split.elapsedMs > 0 && split.elapsedMs <= run.elapsedMs && (!index || split.elapsedMs >= run.splits[index - 1].elapsedMs));
}

export function readRuns(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const runs = JSON.parse(target?.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(runs) ? runs.filter(validRun).sort(compareRuns) : [];
  } catch { return []; }
}

export function recordRun(input, storage) {
  const run = { ...input, rules: RUN_RULES };
  if (!validRun(run)) return { rank: null, saved: false };
  let target;
  try { target = storage ?? globalThis.localStorage; } catch { return { rank: null, saved: false }; }
  const runs = [...readRuns(target), run].sort(compareRuns);
  const category = runs.filter(other => other.map === run.map && other.difficulty === run.difficulty);
  const rank = category.indexOf(run) + 1;
  try {
    // Keep comparable practice records separately for each difficulty.
    const retained = Object.keys(COURSES).flatMap(map => ['recruit', 'operator', 'veteran'].flatMap(difficulty => runs.filter(other => other.map === map && other.difficulty === difficulty).slice(0, 10)));
    target.setItem(STORAGE_KEY, JSON.stringify(retained));
    return { rank, saved: true };
  } catch { return { rank: null, saved: false }; }
}
