export const DIFFICULTIES = {
  recruit: { label: 'Recruit', health: 130, enemyHealth: 0.75, damage: 8, speed: 0.85 },
  operator: { label: 'Operator', health: 100, enemyHealth: 1, damage: 12, speed: 1 },
  veteran: { label: 'Veteran', health: 85, enemyHealth: 1.3, damage: 17, speed: 1.15 },
};

export const WEAPONS = {
  usp: { name: 'USP SIDEARM', short: 'USP', tier: 0, price: 0, ammoPrice: 150, caliber: '.45 ACP', capacity: 12, reserve: 72, damage: 27, interval: 0.28, reload: 1.5, recoil: 0.023, automatic: false, idle: 'idle_unsil', shoot: 'shoot1_unsil', reloadClip: 'reload_unsil', muzzle: 2 },
  deagle: { name: 'DESERT EAGLE', short: 'DEAGLE', tier: 0, price: 650, ammoPrice: 170, caliber: '.50 AE', capacity: 7, reserve: 35, damage: 40, interval: 0.3, reload: 1.9, recoil: 0.045, automatic: false, idle: 'idle1', shoot: 'shoot1', reloadClip: 'reload', muzzle: 0 },
  mp5: { name: 'MP5 NAVY', short: 'MP5', tier: 1, price: 1500, ammoPrice: 200, caliber: '9 × 19 MM', capacity: 30, reserve: 90, damage: 26, interval: 0.085, reload: 2.2, recoil: 0.014, automatic: true, idle: 'idle1', shoot: 'shoot1', reloadClip: 'reload', muzzle: 0 },
  p90: { name: 'P90', short: 'P90', tier: 1, price: 2350, ammoPrice: 250, caliber: '5.7 × 28 MM', capacity: 50, reserve: 150, damage: 27, interval: 0.07, reload: 2.8, recoil: 0.017, automatic: true, idle: 'idle', shoot: 'shoot1', reloadClip: 'reload', muzzle: 0 },
  m4: { name: 'M4 CARBINE', short: 'M4', tier: 2, price: 3300, ammoPrice: 300, caliber: '5.56 × 45 MM', capacity: 30, reserve: 90, damage: 29, interval: 0.105, reload: 2.1, recoil: 0.017, automatic: true, idle: 'idle_unsil', shoot: 'shoot1_unsil', reloadClip: 'reload_unsil', muzzle: 2 },
  ak: { name: 'AK RIFLE', short: 'AK', tier: 2, price: 3100, ammoPrice: 300, caliber: '7.62 × 39 MM', capacity: 30, reserve: 90, damage: 35, interval: 0.145, reload: 2.5, recoil: 0.027, automatic: true, idle: 'idle1', shoot: 'shoot1', reloadClip: 'reload', muzzle: 0 },
  m249: { name: 'M249 HEAVY', short: 'M249', tier: 3, price: 5750, ammoPrice: 550, caliber: '5.56 × 45 MM', capacity: 100, reserve: 200, damage: 42, interval: 0.075, reload: 4.2, recoil: 0.035, automatic: true, idle: 'idle1', shoot: 'shoot1', reloadClip: 'reload', muzzle: 0 },
};

export const ZOMBIE_HEALTH = 100;
export const shotDamage = (weapon, headshot) => WEAPONS[weapon].damage * (headshot ? 4 : 1);

export function enemyKind(wave, index) {
  if (wave >= 2 && index % 5 === 4) return 'headcrab';
  if (wave >= 3 && index % 4 === 2) return 'runner';
  return 'zombie';
}

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
