import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createMatchServer } from '../../server/index.js';
import { worldHit, shotDirection } from '../../server/physics.js';

let app, endpoint, offset = 0;
test.beforeAll(async () => {
  const data = JSON.parse(readFileSync(new URL('../../game-assets/ready/dust2.json', import.meta.url)));
  app = createMatchServer({ data, now: () => Date.now() + offset, origins: ['http://127.0.0.1:5173'] });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve)); endpoint = `ws://127.0.0.1:${app.server.address().port}/ws`;
});
test.afterAll(async () => { await app?.close(); });

test('two browsers queue into an actual PvP room, render original players, shoot and respawn', async ({ browser }) => {
  test.setTimeout(120000);
  const contexts = [], pages = [], errors = [];
  try {
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext(); contexts.push(context); const page = await context.newPage(); pages.push(page);
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', message => { if (message.text().includes('could not be applied')) errors.push(message.text()); });
      await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
      await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
      await expect(page.locator('#mode-multiplayer')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#map-select')).toBeHidden();
      await expect(page.locator('#deploy')).toHaveText('JOIN DEATHMATCH');
      expect(await page.evaluate(() => window.__biohazard.world.id)).toBe('dust2');
      await page.locator('#deploy').click(); await page.locator('#mp-name').fill(`Browser ${i}`);
      await page.locator('#mp-endpoint').fill(endpoint); await page.locator('#mp-join').click();
    }
    await expect(pages[0].locator('#mp-queue-count')).toContainText('2 QUEUED');
    offset = app.manager.nextStartAt - Date.now(); app.manager.tick();
    for (const page of pages) {
      await expect(page.locator('#hud')).toBeVisible(); await expect(page.locator('#wave-mode')).toHaveText('FFA');
      await page.waitForFunction(() => window.__biohazard.networkSession?.avatars.size === 1);
      expect(await page.evaluate(() => [...window.__biohazard.networkSession.avatars.values()][0].classic)).toBe(true);
    }
    const match = [...app.manager.matches.values()][0], [first, second] = [...match.players.values()], d = app.manager.data, start = d.playerSpawn;
    first.position = { x: start[0], y: start[1], z: start[2] };
    const point = d.nodes.find(p => {
      const distance = Math.hypot(p[0] - start[0], p[2] - start[2]);
      return distance > 2 && distance < 5 && Math.abs(p[1] - start[1]) < 0.1 && worldHit(d, [start[0], start[1] + 2, start[2]], shotDirection(Math.atan2(start[0] - p[0], start[2] - p[2]), Math.atan2(-0.23, distance)), 8) > distance;
    });
    expect(point).toBeTruthy(); second.position = { x: point[0], y: point[1], z: point[2] }; match.snapshot(Date.now() + offset);
    await pages[0].evaluate(({ start, point }) => {
      const g = window.__biohazard; g.camera.position.set(start[0], start[1] + 2, start[2]); g.groundY = start[1];
      g.yaw = Math.atan2(start[0] - point[0], start[2] - point[2]); g.pitch = Math.atan2(-0.23, Math.hypot(point[0] - start[0], point[2] - start[2])); g.look(0, 0); g.shootTimer = 0; g.shoot();
    }, { start, point });
    await expect.poll(() => first.frags).toBe(1); expect(second.health).toBe(0); expect(first.headshots).toBe(1);
    await expect(pages[0].locator('#hit-feedback')).toHaveText('HEADSHOT');
    await expect.poll(() => pages[1].evaluate(() => window.__biohazard.networkDead)).toBe(true);
    await pages[0].evaluate(() => { const g = window.__biohazard; g.reload(); });
    await expect.poll(() => first.reloadAt).toBeGreaterThan(0);
    await expect.poll(() => pages[0].evaluate(() => window.__biohazard.reloadTime)).toBeGreaterThan(0);
    expect(await pages[0].evaluate(() => { const g = window.__biohazard, gun = g.weapons.usp.group; return g.reloadDuration === 1.5 && [...gun.position.toArray(), ...gun.rotation.toArray().slice(0, 3)].every(Number.isFinite); })).toBe(true);
    await expect.poll(() => first.ammunition.usp.ammo, { timeout: 10000 }).toBe(12); expect(first.ammunition.usp.reserve).toBe(35);
    await expect.poll(() => second.health, { timeout: 10000 }).toBe(100);
    await expect.poll(() => pages[1].evaluate(() => window.__biohazard.networkDead)).toBe(false);
    await expect(pages[1].locator('#weapon-name')).toHaveText('USP SIDEARM');
    offset = match.endsAt - Date.now(); app.manager.tick();
    await expect(pages[0].locator('#result-title')).toHaveText('VICTORY.');
    await expect(pages[1].locator('#result-title')).toHaveText('MATCH COMPLETE.');
    await pages[0].screenshot({ path: 'test-results/multiplayer-results.png' }); expect(errors).toEqual([]);
  } finally { for (const context of contexts) await context.close(); }
});
