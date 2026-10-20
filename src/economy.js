import { WEAPONS } from './rules.js';

export const TIER_NAMES = ['PISTOLS', 'SMGs', 'RIFLES', 'HEAVY'];
export const STARTING_CASH = 600;
export const WAVE_CASH = 300;
export const MEDKIT_PRICE = 350;

export function unlockWave(id, waves = 15) {
  if (!Object.hasOwn(WEAPONS, id)) return Infinity;
  const tier = WEAPONS[id]?.tier;
  return tier === 0 ? 1 : Math.max(2, Math.floor(waves * [0, 0.2, 0.4, 0.8][tier]) + 1);
}

export function startingInventory() {
  return {
    cash: STARTING_CASH, ownedWeapons: ['usp'], weaponId: 'usp', primary: 'usp', sidearm: 'usp',
    ammunition: Object.fromEntries(Object.entries(WEAPONS).map(([id, weapon]) => [id, { ammo: id === 'usp' ? weapon.capacity : 0, reserve: id === 'usp' ? 36 : 0 }])),
  };
}

export function equipOwned(state, id) {
  if (!Object.hasOwn(WEAPONS, id) || !state.ownedWeapons.includes(id)) return false;
  if (WEAPONS[id].tier === 0) {
    state.sidearm = id;
    if (WEAPONS[state.primary].tier === 0) state.primary = id;
  } else state.primary = id;
  state.weaponId = id;
  return true;
}

// Caller enforces proximity to the supply station; both campaign and server use
// these same price, ownership, unlock, and ammunition rules.
export function purchase(state, action, id, wave, waves = 15) {
  const weapon = typeof id === 'string' && Object.hasOwn(WEAPONS, id) ? WEAPONS[id] : null;
  if (action === 'medkit') {
    if (state.health >= state.maxHealth) return { ok: false, message: 'HEALTH ALREADY FULL' };
    if (state.cash < MEDKIT_PRICE) return { ok: false, message: 'NOT ENOUGH FIELD CASH' };
    state.cash -= MEDKIT_PRICE; state.health = state.maxHealth;
    return { ok: true, message: 'HEALTH RESTORED' };
  }
  if (!weapon) return { ok: false, message: 'UNKNOWN WEAPON' };
  if (action === 'equip') return { ok: equipOwned(state, id), message: 'WEAPON EQUIPPED' };
  if (action === 'ammo') {
    if (!state.ownedWeapons.includes(id)) return { ok: false, message: 'BUY THE WEAPON FIRST' };
    const ammo = state.ammunition[id];
    if (ammo.ammo === weapon.capacity && ammo.reserve === weapon.reserve) return { ok: false, message: 'AMMUNITION ALREADY FULL' };
    if (state.cash < weapon.ammoPrice) return { ok: false, message: 'NOT ENOUGH FIELD CASH' };
    state.cash -= weapon.ammoPrice; state.ammunition[id] = { ammo: weapon.capacity, reserve: weapon.reserve };
    return { ok: true, message: `${weapon.short} AMMUNITION REFILLED` };
  }
  if (action !== 'weapon') return { ok: false, message: 'UNKNOWN PURCHASE' };
  if (state.ownedWeapons.includes(id)) return { ok: false, message: 'WEAPON ALREADY OWNED' };
  if (Math.max(1, wave) < unlockWave(id, waves)) return { ok: false, message: `UNLOCKS AT WAVE ${unlockWave(id, waves)}` };
  if (state.cash < weapon.price) return { ok: false, message: 'NOT ENOUGH FIELD CASH' };
  state.cash -= weapon.price; state.ownedWeapons.push(id);
  state.ammunition[id] = { ammo: weapon.capacity, reserve: weapon.capacity * 2 };
  equipOwned(state, id);
  return { ok: true, message: `${weapon.name} PURCHASED` };
}
