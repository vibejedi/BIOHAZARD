import { test, expect } from '@playwright/test';
import { placeTarget } from './scenario.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#mode-campaign').click();
  await page.locator('#map-select').selectOption('dust2');
  await page.locator('#deploy').click();
});

test('the flashlight lights the dark map and toggles with the keyboard', async ({ page }) => {
  await page.evaluate(() => { const g = window.__biohazard; g.renderer.setAnimationLoop(null); g.nextWaveTimer = 999; });
  const result = await page.evaluate(() => {
    const g = window.__biohazard, renderer = g.renderer, gl = renderer.getContext();
    // Illuminate nearby floor geometry, rather than the open 30m+ corridor at
    // the Dust2 spawn; surfaces outside the torch's reach should stay dark.
    g.pitch = -0.35; g.look(0, 0);
    const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
    const pixels = () => {
      g.scene.updateMatrixWorld(true); renderer.autoClear = true; renderer.render(g.scene, g.camera);
      const data = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); return data;
    };
    g.setFlashlight(false); const dark = pixels(); g.setFlashlight(true); const lit = pixels();
    let illuminatedPixels = 0, darkBrightness = 0, litBrightness = 0;
    for (let y = Math.floor(height * 0.25); y < height * 0.75; y++) {
      for (let x = Math.floor(width * 0.25); x < width * 0.75; x++) {
        const i = (y * width + x) * 4;
        const d = dark[i] + dark[i + 1] + dark[i + 2], l = lit[i] + lit[i + 1] + lit[i + 2];
        darkBrightness += d; litBrightness += l;
        if (l > d + 30) illuminatedPixels++;
      }
    }
    return { illuminatedPixels, darkBrightness, litBrightness, litMaterials: g.world.walls.every(mesh => mesh.material.isMeshStandardMaterial) };
  });
  expect(result.litMaterials).toBe(true);
  expect(result.illuminatedPixels, JSON.stringify(result)).toBeGreaterThan(300);
  expect(result.litBrightness, JSON.stringify(result)).toBeGreaterThan(result.darkBrightness * 1.15);
  await page.keyboard.press('KeyF');
  await expect(page.locator('#flashlight-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.keyboard.press('KeyF');
  await expect(page.locator('#flashlight-toggle')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'test-results/flashlight-dust2.png' });
});

test('original headcrabs have animated hitboxes, leap, deal damage, and can be killed', async ({ page }) => {
  await page.evaluate(placeTarget, { part: 'body', maxDistance: 4.3, checkLow: true });
  const before = await page.evaluate(() => {
    const g = window.__biohazard, p = g.testTarget.group.position.clone(); const ground = g.testTarget.groundY;
    g.clearEntities(); g.nextWaveTimer = 999;
    const enemy = g.spawnEnemy('headcrab'); enemy.group.position.copy(p); enemy.groundY = ground; enemy.attackTimer = 0; enemy.speed = 0;
    g.testCrab = enemy;
    return { health: g.health, hits: enemy.hits.length, maximumHealth: enemy.health, validBones: enemy.hits.every(hit => hit.parent.isBone) };
  });
  expect(before.hits).toBeGreaterThan(1); expect(before.validBones).toBe(true); expect(before.maximumHealth).toBe(50);
  await expect.poll(() => page.evaluate(() => window.__biohazard.testCrab.leapTime)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__biohazard.health), { timeout: 10000 }).toBeLessThan(before.health);
  await page.evaluate(() => { const g = window.__biohazard; g.kill(g.testCrab, false); });
  expect(await page.evaluate(() => window.__biohazard.testCrab.dead)).toBe(true);
  await expect(page.locator('#killfeed')).toContainText('HEADCRAB');
  await page.screenshot({ path: 'test-results/headcrab.png' });
});
