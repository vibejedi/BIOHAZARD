import { test, expect } from '@playwright/test';
import { placeTarget } from './scenario.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#map-select').selectOption('hl-campaign');
  await expect(page.locator('.mission-title h2')).toHaveText('BLACK MESA LOCKDOWN');
  await page.locator('#deploy').click();
});

test('nine waves move through three Half-Life maps, preserve the run, and record a campaign finish', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  const result = await page.evaluate(() => {
    const g = window.__biohazard; g.renderer.setAnimationLoop(null);
    g.ammunition.m4.ammo = 17;
    const stages = [], checkpoints = [];
    g.nextWaveTimer = 0; g.updateWaves(0);
    while (g.state === 'playing') {
      const wave = g.wave, map = g.world.id;
      if (!stages.includes(map)) {
        stages.push(map);
        if (!g.world.collision.canStand(g.camera.position.x, g.groundY + 0.04, g.camera.position.z)) throw new Error('Invalid chapter spawn');
      }
      while (g.spawnRemaining > 0) {
        g.spawnTimer = 0; g.updateWaves(0);
        for (const enemy of [...g.enemies]) g.kill(enemy, true);
      }
      g.updateWaves(0);
      checkpoints.push({ wave, map, kills: g.kills, ammo: g.ammunition.m4.ammo, score: g.score });
      if (g.state !== 'playing') break;
      g.nextWaveTimer = 0; g.updateWaves(0);
    }
    return { stages, checkpoints, state: g.state, splits: g.waveSplits, kills: g.kills, headshots: g.headshots };
  });
  expect(result.stages).toEqual(['c1a0', 'c1a1', 'c1a2']);
  expect(result.kills).toBe(126); expect(result.state).toBe('won'); expect(result.splits).toHaveLength(9);
  expect(result.checkpoints.map(checkpoint => checkpoint.ammo)).toEqual(Array(9).fill(17));
  expect(result.checkpoints[2].kills).toBe(24); expect(result.checkpoints[5].kills).toBe(66);
  expect(result.checkpoints[8].score).toBe(result.headshots * 250 + (126 - result.headshots) * 100);
  await expect(page.locator('#result-title')).toHaveText('CAMPAIGN CLEARED.');
  await expect(page.locator('#result-rank')).toHaveText('#1');
  await page.screenshot({ path: 'test-results/campaign-result.png' });
  await page.locator('#result-quit').click();
  await page.locator('#records-open').click();
  await expect(page.locator('#records-course')).toHaveText('BLACK MESA LOCKDOWN');
  await expect(page.locator('#records-body tr')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('each Half-Life chapter supports actual animated headshots and wall collision', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(() => { window.__biohazard.renderer.setAnimationLoop(null); });
  for (const map of ['c1a0', 'c1a1', 'c1a2']) {
    await page.evaluate(map => { const g = window.__biohazard; g.selectMap(map); g.placePlayer(); g.weapons.m4.animation.update(0.1); }, map);
    await page.evaluate(placeTarget, { part: 'head' });
    const result = await page.evaluate(() => {
      const g = window.__biohazard; g.shootTimer = 0; g.shoot();
      const original = g.camera.position.clone();
      g.groundY = g.world.move(g.camera.position, 0.1, 0, g.groundY);
      const valid = g.world.collision.canStand(g.camera.position.x, g.groundY + 0.04, g.camera.position.z);
      g.camera.position.copy(original);
      g.renderer.autoClear = true; g.renderer.render(g.scene, g.camera); g.renderer.autoClear = false; g.renderer.clearDepth(); g.renderer.render(g.weaponScene, g.weaponCamera);
      return { dead: g.testTarget.dead, headshots: g.headshots, valid, score: g.score };
    });
    expect(result.dead, map).toBe(true); expect(result.valid, map).toBe(true);
    await page.screenshot({ path: `test-results/campaign-${map}.png` });
  }
  expect(errors).toEqual([]);
});
