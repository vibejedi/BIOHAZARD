import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
});

test('local CS models animate, share resources safely, and decoded original audio is available', async ({ page, request }) => {
  const status = await request.get('/local-game-assets/status');
  test.skip(!(await status.json()).available, 'Local user-supplied game data has not been prepared.');
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#mode-campaign').click();
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
  await expect.poll(() => page.evaluate(() => Object.keys(window.__biohazard.audio.samples).length)).toBe(14);
  await page.screenshot({ path: 'test-results/classic-assets.png' });
  expect(errors).toEqual([]);
});

test('repeated shots keep the imported M4, AK, and USP arms fully animated', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#mode-campaign').click();
  await page.locator('#deploy').click();
  const results = await page.evaluate(() => {
    const g = window.__biohazard; g.nextWaveTimer = 999; g.clearEntities();
    const results = [];
    for (const id of ['m4', 'ak', 'usp']) {
      if (!g.ownedWeapons.includes(id)) g.ownedWeapons.push(id); g.ammunition[id].ammo = id === 'usp' ? 12 : 30;
      g.switchWeapon(id);
      const view = g.weapons[id], animation = view.animation;
      animation.update(0.2);
      let minimumWeight = Infinity, finiteBones = true;
      const bones = [];
      animation.mixer.getRoot().traverse(object => { if (object.isBone) bones.push(object); });
      for (let shot = 0; shot < 8; shot++) {
        g.shootTimer = 0; g.shoot();
        for (let frame = 0; frame < 7; frame++) {
          animation.update(0.015);
          // Inspect the mixer here to detect accidental blending with the bind
          // pose; rendering and ammunition checks alone miss the arm snap.
          const weight = animation.mixer._actions.filter(action => action.isScheduled()).reduce((sum, action) => sum + action.getEffectiveWeight(), 0);
          minimumWeight = Math.min(minimumWeight, weight);
          finiteBones &&= bones.every(bone => [...bone.position.toArray(), ...bone.quaternion.toArray()].every(Number.isFinite));
        }
      }
      animation.update(0.4); animation.update(0.1);
      results.push({ id, minimumWeight, finiteBones, bones: bones.length, ammo: g.ammunition[id].ammo });
    }
    g.switchWeapon('m4'); g.state = 'paused';
    return results;
  });
  for (const result of results) {
    expect(result.minimumWeight, `${result.id} loses its arm pose during repeated shots`).toBeGreaterThanOrEqual(0.999);
    expect(result.finiteBones).toBe(true);
    expect(result.bones).toBeGreaterThan(0);
    expect(result.ammo).toBe(result.id === 'usp' ? 4 : 22);
  }
  await page.screenshot({ path: 'test-results/weapon-animation-fixed.png' });
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

test('missing CS data blocks play and never falls back to a non-CS map', async ({ page }) => {
  await page.route('**/local-game-assets/status.json', route => route.fulfill({ json: { available: false } }));
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'absent');
  await expect(page.locator('#deploy')).toBeDisabled();
  await expect(page.locator('#asset-status')).toContainText('COUNTER-STRIKE ASSETS MISSING');
  expect(await page.evaluate(() => !!window.__biohazard.classicAssets)).toBe(false);
  expect(await page.evaluate(() => Object.keys(window.__biohazard.worlds))).toEqual([]);
  await expect(page.locator('#map-select option')).toHaveCount(2);
  await expect(page.locator('body')).not.toContainText('ASHEN');
});
