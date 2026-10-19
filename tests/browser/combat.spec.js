import { test, expect } from '@playwright/test';
import { placeTarget, aimTarget } from './scenario.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#deploy').click();
});

test('original animated head hitboxes give one-shot kills; body shots take three or four hits', async ({ page }) => {
  await page.evaluate(() => { const g = window.__biohazard; g.renderer.setAnimationLoop(null); g.nextWaveTimer = 999; });
  for (const id of ['m4', 'ak', 'usp']) {
    await page.evaluate(id => { const g = window.__biohazard; g.switchWeapon(id); g.ammunition[id].ammo = 30; g.score = 0; g.kills = 0; g.headshots = 0; }, id);
    for (const clip of ['walk', 'attack1']) {
      await page.evaluate(placeTarget, { part: 'head', clip, phase: 0.65 });
      const result = await page.evaluate(() => {
        const g = window.__biohazard; g.shootTimer = 0; g.shoot();
        return { dead: g.testTarget.dead, health: g.testTarget.health, headshots: g.headshots, score: g.score, blood: g.effects.some(effect => effect.kind === 'blood') };
      });
      expect(result.dead, `${id}: ${clip} headshot`).toBe(true);
      expect(result.blood).toBe(true);
      await expect(page.locator('#hit-feedback')).toContainText('HEADSHOT');
    }
    expect(await page.evaluate(() => window.__biohazard.headshots)).toBe(2);
    expect(await page.evaluate(() => window.__biohazard.score)).toBe(550);
    await page.evaluate(placeTarget, { part: 'body' });
    const expectedShots = id === 'ak' ? 3 : 4;
    for (let shot = 1; shot <= expectedShots; shot++) {
      await page.evaluate(aimTarget, 'body');
      const dead = await page.evaluate(() => { const g = window.__biohazard; g.shootTimer = 0; g.shoot(); return g.testTarget.dead; });
      expect(dead, `${id}: body shot ${shot}`).toBe(shot === expectedShots);
    }
    expect(await page.evaluate(() => window.__biohazard.headshots)).toBe(2);
    await expect(page.locator('#hit-feedback')).toContainText('BODY HIT');
  }
});

test('muzzle flashes and blood render visible pixels, and flashes survive a slow frame', async ({ page }) => {
  await page.evaluate(() => { const g = window.__biohazard; g.renderer.setAnimationLoop(null); g.nextWaveTimer = 999; });
  for (const id of ['m4', 'ak', 'usp']) {
    await page.evaluate(id => { const g = window.__biohazard; g.switchWeapon(id); g.ammunition[id].ammo = 30; }, id);
    await page.evaluate(placeTarget, { part: 'body' });
    const result = await page.evaluate(() => {
      const g = window.__biohazard, view = g.weapons[g.weaponId], renderer = g.renderer;
      g.shootTimer = 0; g.shoot(); g.updatePlayer(0.05);
      const survivesSlowFrame = view.flash.visible;
      g.updateEffects(0.05); g.scene.updateMatrixWorld(true); g.weaponScene.updateMatrixWorld(true);
      const gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = scene => { renderer.autoClear = true; renderer.render(scene, scene === g.scene ? g.camera : g.weaponCamera); const data = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
      view.light.intensity = 0; view.flash.visible = false;
      const noFlash = pixels(g.weaponScene); view.flash.visible = true;
      const withFlash = pixels(g.weaponScene);
      let flashPixels = 0;
      for (let i = 0; i < noFlash.length; i += 4) if (withFlash[i] - noFlash[i] > 45 && withFlash[i + 1] - noFlash[i + 1] > 25) flashPixels++;
      const blood = g.effects.filter(effect => effect.kind === 'blood');
      blood.forEach(effect => { effect.object.visible = false; }); const noBlood = pixels(g.scene);
      blood.forEach(effect => { effect.object.visible = true; }); const withBlood = pixels(g.scene);
      let bloodPixels = 0;
      for (let i = 0; i < noBlood.length; i += 4) if (withBlood[i] - noBlood[i] > 15 && withBlood[i] > withBlood[i + 1] * 1.4) bloodPixels++;
      return { flashPixels, bloodPixels, survivesSlowFrame };
    });
    expect(result.survivesSlowFrame, id).toBe(true);
    expect(result.flashPixels, `${id}: visible muzzle flash`).toBeGreaterThan(30);
    expect(result.bloodPixels, `${id}: visible blood`).toBeGreaterThan(5);
  }
  await page.screenshot({ path: 'test-results/combat-effects.png' });
});

test('only original maps are available and the time trial keeps counting during pause', async ({ page }) => {
  await expect(page.locator('#map-select option[value="ashen"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__biohazard.world.id)).toBe('dust2');
  await page.evaluate(() => { window.__biohazard.nextWaveTimer = 999; });
  await page.keyboard.press('KeyP');
  const before = await page.evaluate(() => window.__biohazard.elapsed);
  await expect.poll(() => page.evaluate(initial => window.__biohazard.elapsed - initial, before)).toBeGreaterThan(0.25);
  await expect(page.locator('#pause-screen')).toContainText('timer keeps going');
});
