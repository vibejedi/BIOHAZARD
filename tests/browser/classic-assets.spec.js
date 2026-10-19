import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
});

test('local CS models animate, share resources safely, and decoded original audio is available', async ({ page, request }) => {
  const status = await request.get('/local-game-assets/status');
  test.skip(!(await status.json()).available, 'Local user-supplied game data has not been prepared.');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1&map=ashen');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await expect(page.locator('#asset-status')).toContainText('HALF-LIFE ZOMBIES');
  await page.locator('#deploy').click();
  const before = await page.evaluate(() => {
    const g = window.__biohazard; g.nextWaveTimer = 999;
    const first = g.spawnEnemy(), second = g.spawnEnemy();
    first.group.position.set(0, 0, 15); first.speed = 0; second.group.position.set(4, 0, 14);
    g.scene.updateMatrixWorld(true);
    const bones = []; first.animation.mixer.getRoot().traverse(o => { if (o.isBone) bones.push(o); });
    g.testBones = bones;
    return { classic: first.classic, bones: bones.length, rotation: bones.map(b => b.quaternion.toArray()) };
  });
  expect(before.classic).toBe(true); expect(before.bones).toBe(49);
  await expect.poll(() => page.evaluate(initial => {
    const g = window.__biohazard;
    return g.testBones.some((bone, i) => bone.quaternion.toArray().some((v, j) => Math.abs(v - initial[i][j]) > 0.001));
  }, before.rotation)).toBe(true);
  await page.evaluate(() => { const g = window.__biohazard; g.kill(g.enemies[0], false); g.corpses[0].time = 8; g.updateEffects(0.1); });
  expect(await page.evaluate(() => ({ survivors: window.__biohazard.enemies.length, classicWeapon: window.__biohazard.weapons.m4.classic }))).toEqual({ survivors: 1, classicWeapon: true });
  await expect.poll(() => page.evaluate(() => Object.keys(window.__biohazard.audio.samples).length)).toBe(8);
  await page.screenshot({ path: 'test-results/classic-assets.png' });
  expect(errors).toEqual([]);
});

test('the installer, native libraries, and traversal paths are not served', async ({ request }) => {
  for (const path of ['/game-assets/source/Counter-Strike.exe', '/game-assets/extracted/app/cstrike/dlls/mp.dll', '/@fs/workspace/BIOHAZARD/game-assets/source/Counter-Strike.exe']) {
    const response = await request.head(path);
    expect([403, 404]).toContain(response.status());
  }
  const traversal = await request.get('/local-game-assets/%2e%2e%2fsource%2fCounter-Strike.exe');
  expect(traversal.status()).toBe(404);
  const unknown = await request.get('/local-game-assets/sounds/not-a-sample.wav');
  expect(unknown.status()).toBe(404);
});

test('the independent game still runs when no local CS data is available', async ({ page }) => {
  await page.route('**/local-game-assets/status.json', route => route.fulfill({ json: { available: false } }));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'absent');
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  expect(await page.evaluate(() => !!window.__biohazard.classicAssets)).toBe(false);
  await page.keyboard.press('Digit2');
  await expect(page.locator('#weapon-name')).toHaveText('USP SIDEARM');
});
