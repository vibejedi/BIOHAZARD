export const DIFFICULTIES = {
  recruit: { label: 'Recruit', health: 130, enemyHealth: 0.75, damage: 8, speed: 0.85 },
  operator: { label: 'Operator', health: 100, enemyHealth: 1, damage: 12, speed: 1 },
  veteran: { label: 'Veteran', health: 85, enemyHealth: 1.3, damage: 17, speed: 1.15 },
};

export const WEAPONS = {
  m4: { name: 'M4 CARBINE', short: 'M4', caliber: '5.56 × 45 MM', capacity: 30, reserve: 180, damage: 29, interval: 0.105, reload: 2.1, recoil: 0.017, automatic: true },
  ak: { name: 'AK RIFLE', short: 'AK', caliber: '7.62 × 39 MM', capacity: 30, reserve: 150, damage: 40, interval: 0.145, reload: 2.5, recoil: 0.027, automatic: true },
  usp: { name: 'USP SIDEARM', short: 'USP', caliber: '.45 ACP', capacity: 12, reserve: 96, damage: 35, interval: 0.28, reload: 1.5, recoil: 0.023, automatic: false },
};

export const WORLD_SIZE = 29;

export function waveSize(wave) { return 4 + wave * 2; }
export function reloadAmmo(ammo, reserve, capacity) {
  const amount = Math.min(capacity - ammo, reserve);
  return { ammo: ammo + amount, reserve: reserve - amount };
}

export function circleBlocked(x, z, radius, obstacles) {
  if (Math.abs(x) > WORLD_SIZE - radius || Math.abs(z) > WORLD_SIZE - radius) return true;
  return obstacles.some(o => {
    const nearestX = Math.max(o.x - o.w / 2, Math.min(x, o.x + o.w / 2));
    const nearestZ = Math.max(o.z - o.d / 2, Math.min(z, o.z + o.d / 2));
    return (x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2;
  });
}

// A small navigation grid keeps zombies from getting stuck behind courtyard cover.
export function findPath(start, target, obstacles) {
  const step = 1.5, half = 18;
  const cell = (x, z) => [Math.max(-half, Math.min(half, Math.round(x / step))), Math.max(-half, Math.min(half, Math.round(z / step)))];
  const [sx, sz] = cell(start.x, start.z), [tx, tz] = cell(target.x, target.z);
  const key = (x, z) => `${x},${z}`;
  const open = [{ x: sx, z: sz, g: 0, f: 0 }], parents = new Map(), costs = new Map([[key(sx, sz), 0]]), closed = new Set();
  let final = null;
  for (let n = 0; open.length && n < 1500; n++) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift(), k = key(cur.x, cur.z);
    if (closed.has(k)) continue;
    closed.add(k);
    if (Math.abs(cur.x - tx) + Math.abs(cur.z - tz) <= 1) { final = cur; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cur.x + dx, z = cur.z + dz, nextKey = key(x, z), g = cur.g + 1;
      if (Math.abs(x) > half || Math.abs(z) > half || closed.has(nextKey) || circleBlocked(x * step, z * step, 0.48, obstacles)) continue;
      if (g >= (costs.get(nextKey) ?? Infinity)) continue;
      costs.set(nextKey, g); parents.set(nextKey, k);
      open.push({ x, z, g, f: g + Math.abs(x - tx) + Math.abs(z - tz) });
    }
  }
  if (!final) return [];
  const path = [];
  let k = key(final.x, final.z);
  while (k !== key(sx, sz) && parents.has(k)) {
    const [x, z] = k.split(',').map(Number);
    path.unshift({ x: x * step, z: z * step });
    k = parents.get(k);
  }
  return path;
}
