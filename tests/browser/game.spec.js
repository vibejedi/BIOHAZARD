import { test, expect } from '@playwright/test';
import { placeTarget } from './scenario.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.state === 'home');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus !== 'loading');
  await page.evaluate(() => document.fonts.ready);
});

test('loadout, manual, settings, and desktop layout work', async ({ page }) => {
  await page.getByRole('button', { name: /FIELD MANUAL/ }).click();
  await expect(page.locator('#manual-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close field manual' }).click();
  await page.locator('[data-weapon="ak"]').click();
  await expect(page.locator('[data-weapon="ak"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.locator('#sensitivity').fill('1.6');
  await expect(page.locator('#sensitivity-value')).toHaveText('1.6');
  await page.getByRole('button', { name: 'Close settings' }).click();
  for (const [width, height] of [[1280, 720], [1440, 1000]]) {
    await page.setViewportSize({ width, height });
    const deploy = await page.locator('#deploy').boundingBox(), footer = await page.locator('.site-footer').boundingBox(), header = await page.locator('.site-header').boundingBox(), menu = await page.locator('#menu').boundingBox();
    expect(deploy.y + deploy.height).toBeLessThan(footer.y);
    expect(menu.y).toBeGreaterThan(header.y + header.height);
  }
});

test('movement, real raycast combat, reload, resupply, pause, and defeat', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.evaluate(() => { window.__biohazard.nextWaveTimer = 999; });
  const start = await page.evaluate(() => window.__biohazard.camera.position.toArray());
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(p => { const c = window.__biohazard.camera.position; return Math.hypot(c.x - p[0], c.z - p[2]); }, start)).toBeGreaterThan(0.5);
  await page.keyboard.up('KeyW');
  await page.evaluate(placeTarget, { part: 'head' });
  // Pointer lock interprets a coordinate change as looking; fire in place.
  await page.mouse.down();
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__biohazard.kills)).toBe(1);
  await expect(page.locator('#ammo')).toHaveText('29');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#reload-indicator')).toBeVisible();
  await expect(page.locator('#ammo')).toHaveText('30', { timeout: 15000 });
  await expect(page.locator('#reserve')).toHaveText('179');
  await page.keyboard.press('Digit2');
  await expect(page.locator('#weapon-name')).toHaveText('USP SIDEARM');
  await page.evaluate(() => { const g = window.__biohazard; g.groundY = g.world.supplies.y; g.camera.position.copy(g.world.supplies); g.camera.position.y += g.eyeHeight; g.cash = 600; g.health = 20; });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#health')).toHaveText('100');
  await expect(page.locator('#cash')).toHaveText('100 CR');
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.locator('#resume').click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  await page.evaluate(() => { const g = window.__biohazard; const enemy = g.spawnEnemy(); enemy.group.position.set(g.camera.position.x, g.groundY, g.camera.position.z); enemy.groundY = g.groundY; enemy.attackTimer = 0; g.health = 1; });
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#result-title')).toHaveText('OVERRUN.');
  await page.locator('#retry').click();
  await expect(page.locator('#health')).toHaveText('100');
  expect(errors).toEqual([]);
});

test('zombies pursue the player and the final cleared wave wins', async ({ page }) => {
  await page.locator('#deploy').click();
  await page.evaluate(() => { const g = window.__biohazard; g.nextWaveTimer = 999; g.spawnEnemy(); });
  const initial = await page.evaluate(() => window.__biohazard.enemies[0].group.position.toArray());
  await expect.poll(() => page.evaluate(p => { const c = window.__biohazard.enemies[0].group.position; return Math.hypot(c.x - p[0], c.z - p[2]); }, initial), { timeout: 15000 }).toBeGreaterThan(0.3);
  await page.evaluate(() => { const g = window.__biohazard; g.clearEntities(); g.wave = 5; g.spawnRemaining = 0; g.nextWaveTimer = null; });
  await expect(page.locator('#result-title')).toHaveText('SECTOR SECURED.');
  await page.locator('#result-quit').click();
  await expect(page.locator('#menu')).toBeVisible();
});

test('mobile layout and touch actions remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('bh-quality', 'low'));
  await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await expect(page.locator('#deploy')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#deploy').tap();
  await expect(page.locator('#joystick')).toBeVisible();
  await page.evaluate(() => { window.__biohazard.nextWaveTimer = 999; });
  await page.locator('#touch-fire').tap();
  await expect(page.locator('#ammo')).toHaveText('29');
  await page.locator('#touch-switch').tap();
  await expect(page.locator('#weapon-name')).toHaveText('USP SIDEARM');
  await page.locator('#flashlight-toggle').tap();
  await expect(page.locator('#flashlight-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#pause').tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await context.close();
});
