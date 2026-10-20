import { waveSize } from './rules.js';

export function scoreWave({ wave, headshots, shots, hits, damageTaken, combatMs }) {
  const accuracy = shots > 0 ? Math.min(1, hits / shots) : 0;
  const targetMs = 15000 + waveSize(wave) * 800;
  const breakdown = {
    headshots: headshots * 100,
    speed: Math.round(1000 * targetMs / (targetMs + Math.max(1, combatMs))),
    survival: Math.max(0, Math.round(1000 - damageTaken * 10)),
    accuracy: Math.round(accuracy * 1000),
  };
  return { accuracy, points: Object.values(breakdown).reduce((sum, value) => sum + value, 0), breakdown };
}
