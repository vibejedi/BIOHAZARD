import { test, expect } from '@playwright/test';

test('the original crate sells progressively unlocked weapons and refills only the held gun', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#mode-campaign').click();
  await expect(page.locator('#map-select')).toHaveValue('hl-campaign');
  await page.locator('#deploy').click();
  expect(await page.evaluate(() => {
    const g = window.__biohazard; g.renderer.setAnimationLoop(null); g.nextWaveTimer = 999;
    return { owned: g.ownedWeapons, ammo: g.ammunition.usp, cash: g.cash, original: g.world.crate.userData.originalCrate };
  })).toEqual({ owned: ['usp'], ammo: { ammo: 12, reserve: 36 }, cash: 600, original: true });
  // Proximity is checked even when a purchase is called directly.
  expect(await page.evaluate(() => { const g = window.__biohazard; g.camera.position.x += 100; return g.buy('weapon', 'deagle'); })).toBe(false);
  await page.evaluate(() => {
    const g = window.__biohazard; g.groundY = g.world.supplies.y; g.camera.position.copy(g.world.supplies); g.camera.position.y += g.eyeHeight;
    g.cash = 15000; g.wave = 1; g.resupply();
  });
  await expect(page.locator('#armory-dialog')).toBeVisible();
  await expect(page.locator('[data-id="mp5"]')).toBeDisabled();
  await page.locator('[data-id="deagle"]').click();
  await expect(page.locator('#weapon-name')).toHaveText('DESERT EAGLE');
  for (const [wave, id, locked] of [[4, 'mp5', 'm4'], [7, 'm4', 'm249'], [13, 'm249', null]]) {
    await page.evaluate(wave => { const g = window.__biohazard; g.wave = wave; g.renderArmory(); }, wave);
    if (locked) await expect(page.locator(`[data-id="${locked}"]`)).toBeDisabled();
    await page.locator(`[data-id="${id}"]`).click();
    expect(await page.evaluate(() => window.__biohazard.weaponId)).toBe(id);
  }
  await page.evaluate(() => { const g = window.__biohazard; g.ammunition.m249 = { ammo: 0, reserve: 0 }; g.ammunition.usp = { ammo: 2, reserve: 3 }; g.renderArmory(); });
  const cash = await page.evaluate(() => window.__biohazard.cash);
  await page.locator('#buy-ammo').click();
  expect(await page.evaluate(() => ({ cash: window.__biohazard.cash, heavy: window.__biohazard.ammunition.m249, pistol: window.__biohazard.ammunition.usp }))).toEqual({ cash: cash - 550, heavy: { ammo: 100, reserve: 200 }, pistol: { ammo: 2, reserve: 3 } });
  await page.screenshot({ path: 'test-results/original-crate-armory.png' });
  await page.getByRole('button', { name: 'Close supply crate' }).click();
  await expect(page.locator('#armory-dialog')).toBeHidden(); expect(errors).toEqual([]);
});
