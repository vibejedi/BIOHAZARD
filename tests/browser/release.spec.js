import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { placeTarget } from './scenario.js';

let server, address, html;
test.beforeAll(async () => {
  html = await readFile(new URL('../../releases/BIOHAZARD.html', import.meta.url));
  server = createServer((req, res) => {
    if (req.url?.startsWith('/BIOHAZARD.html')) { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    if (req.url?.startsWith('/hosted/')) {
      const root = fileURLToPath(new URL('../../dist/', import.meta.url));
      const name = decodeURIComponent(new URL(req.url, 'http://test.local').pathname.slice('/hosted/'.length));
      const path = resolve(root, name);
      if (!path.startsWith(root.replace(/\/$/, '') + sep)) { res.statusCode = 403; return res.end(); }
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.wav': 'audio/wav', '.woff': 'font/woff', '.woff2': 'font/woff2' };
      res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
      return readFile(path).then(buffer => res.end(buffer)).catch(() => { res.statusCode = 404; res.end(); });
    }
    res.statusCode = 404; res.end('No asset server is available');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  address = `http://127.0.0.1:${server.address().port}/BIOHAZARD.html`;
});

test('the hosted production folder runs under a subdirectory on a plain static server', async ({ page }) => {
  const errors = [], failures = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 300)));
  page.on('response', response => { if (response.status() >= 400) failures.push(response.url()); });
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto(address.replace('/BIOHAZARD.html', '/hosted/index.html?test=1'));
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  expect(await page.evaluate(() => ({ map: window.__biohazard.world.id, embedded: Boolean(globalThis.__BIOHAZARD_MEDIA__) }))).toEqual({ map: 'dust2', embedded: false });
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.keyboard.press('Digit2');
  await expect(page.locator('#weapon-name')).toHaveText('USP SIDEARM');
  expect(failures).toEqual([]); expect(errors).toEqual([]);
});
test.afterAll(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

test('standalone Dust2 game loads with no asset server and supports movement, combat, AI, and restart', async ({ page }) => {
  const errors = [], network = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 300)));
  page.on('request', req => { if (req.url().startsWith('http')) network.push(req.url()); });
  await page.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); } catch { /* Storage can be unavailable. */ } });
  await page.goto(`${address}?test=1`);
  await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  expect(await page.evaluate(() => window.__biohazard.world.id)).toBe('dust2');
  expect(network).toEqual([`${address}?test=1`]);
  await page.context().setOffline(true);
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  const start = await page.evaluate(() => window.__biohazard.camera.position.toArray());
  await page.keyboard.down('KeyW');
  await expect.poll(() => page.evaluate(initial => {
    const p = window.__biohazard.camera.position; return Math.hypot(p.x - initial[0], p.z - initial[2]);
  }, start)).toBeGreaterThan(0.4);
  await page.keyboard.up('KeyW');
  expect(await page.evaluate(() => { const g = window.__biohazard; return g.world.collision.canStand(g.camera.position.x, g.groundY + 0.04, g.camera.position.z); })).toBe(true);
  const target = await page.evaluate(placeTarget, { part: 'head' });
  expect(target).not.toBeNull();
  await page.screenshot({ path: 'test-results/dust2-browser-game.png' });
  await page.mouse.down(); await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.__biohazard.kills)).toBe(1);
  await expect(page.locator('#ammo')).toHaveText('29');
  await page.keyboard.press('KeyR');
  await expect(page.locator('#ammo')).toHaveText('30', { timeout: 15000 });
  await page.evaluate(() => { const g = window.__biohazard; g.spawnEnemy(); });
  const origin = await page.evaluate(() => window.__biohazard.enemies[0].group.position.toArray());
  await expect.poll(() => page.evaluate(initial => {
    const e = window.__biohazard.enemies[0]; return Math.hypot(e.group.position.x - initial[0], e.group.position.z - initial[2]);
  }, origin), { timeout: 15000 }).toBeGreaterThan(0.3);
  expect(await page.evaluate(() => { const g = window.__biohazard, e = g.enemies[0]; return g.world.collision.canStand(e.group.position.x, e.groundY + 0.04, e.group.position.z); })).toBe(true);
  await page.evaluate(() => { const g = window.__biohazard, e = g.enemies[0]; e.group.position.set(g.camera.position.x, g.groundY, g.camera.position.z); e.groundY = g.groundY; e.attackTimer = 0; g.health = 1; });
  await expect(page.locator('#result-title')).toHaveText('OVERRUN.');
  await page.locator('#retry').click();
  await expect(page.locator('#health')).toHaveText('100');
  expect(await page.evaluate(() => window.__biohazard.world.id)).toBe('dust2');
  expect(errors).toEqual([]);
  expect(network).toEqual([`${address}?test=1`]);
});

test('the single HTML also initializes and plays with an opaque origin and networking disabled', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, offline: true });
  const page = await context.newPage(), errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message.slice(0, 300)));
  page.on('request', req => { if (req.url().startsWith('http')) requests.push(req.url()); });
  await page.setContent(html.toString(), { waitUntil: 'load', timeout: 60000 });
  await expect(page.locator('#asset-status')).toContainText('HALF-LIFE ZOMBIES', { timeout: 30000 });
  await expect(page.locator('#map-select')).toHaveValue('dust2');
  await page.locator('#deploy').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.down(); await page.mouse.up();
  await expect(page.locator('#ammo')).toHaveText('29');
  expect(requests).toEqual([]); expect(errors).toEqual([]);
  await context.close();
});
