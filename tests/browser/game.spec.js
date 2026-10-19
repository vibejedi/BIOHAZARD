import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  // Baseline combat scenarios use the original flat test arena. Dust2 has its
  // own collision, traversal, AI, and production-artifact integration checks.
  await page.goto('/?test=1&map=ashen');
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
  const startZ = await page.evaluate(() => window.__biohazard.camera.position.z);
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(() => window.__biohazard.camera.position.z)).toBeLessThan(startZ - 0.5);
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    const g = window.__biohazard;
    const enemy = g.spawnEnemy(); enemy.group.position.set(g.camera.position.x, 0, g.camera.position.z - 6); enemy.health = 1; enemy.speed = 0;
    g.pitch = -0.08; g.yaw = 0; g.look(0, 0); g.scene.updateMatrixWorld(true);
  });
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
  await page.evaluate(() => { const g = window.__biohazard; g.camera.position.set(-12.5, 1.7, 19.5); g.cash = 600; g.health = 20; });
  await page.keyboard.press('KeyE');
  await expect(page.locator('#health')).toHaveText('100');
  await expect(page.locator('#cash')).toHaveText('$100');
  await page.keyboard.press('KeyP');
  await expect(page.locator('#pause-screen')).toBeVisible();
  await page.locator('#resume').click();
  await expect(page.locator('#pause-screen')).toBeHidden();
  await page.evaluate(() => { const g = window.__biohazard; const enemy = g.spawnEnemy(); enemy.group.position.set(g.camera.position.x, 0, g.camera.position.z - 0.8); enemy.attackTimer = 0; g.health = 1; });
  await expect(page.locator('#result-screen')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#result-title')).toHaveText('OVERRUN.');
  await page.locator('#retry').click();
  await expect(page.locator('#health')).toHaveText('100');
  expect(errors).toEqual([]);
});

test('zombies pursue the player and the final cleared wave wins', async ({ page }) => {
  await page.locator('#deploy').click();
  await page.evaluate(() => { const g = window.__biohazard; g.nextWaveTimer = 999; const e = g.spawnEnemy(); e.group.position.set(0, 0, 4); e.pathTime = 0; });
  const initialZ = await page.evaluate(() => window.__biohazard.enemies[0].group.position.z);
  await expect.poll(() => page.evaluate(() => window.__biohazard.enemies[0].group.position.z), { timeout: 10000 }).toBeGreaterThan(initialZ + 0.5);
  await page.evaluate(() => { const g = window.__biohazard; g.clearEntities(); g.wave = 5; g.spawnRemaining = 0; g.nextWaveTimer = null; });
  await expect(page.locator('#result-title')).toHaveText('YARD SECURED.');
  await page.locator('#result-quit').click();
  await expect(page.locator('#menu')).toBeVisible();
});

test('mobile layout and touch actions remain usable', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('bh-quality', 'low'));
  await page.goto('/?test=1&map=ashen'); await page.waitForFunction(() => !!window.__biohazard);
  await expect(page.locator('#deploy')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.locator('#deploy').tap();
  await expect(page.locator('#joystick')).toBeVisible();
  await page.evaluate(() => { window.__biohazard.nextWaveTimer = 999; });
  await page.locator('#touch-fire').tap();
  await expect(page.locator('#ammo')).toHaveText('29');
  await page.locator('#touch-switch').tap();
  await expect(page.locator('#weapon-name')).toHaveText('USP SIDEARM');
  await page.locator('#pause').tap();
  await expect(page.locator('#pause-screen')).toBeVisible();
  await context.close();
});
