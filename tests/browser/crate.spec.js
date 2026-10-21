import { test, expect } from '@playwright/test';

test('the original Dust II crate has six solid faces, renders above the floor on every map, and opens the shop', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-sound', 'false'); });
  await page.goto('/?test=1'); await page.waitForFunction(() => window.__biohazard?.assetsStatus === 'ready');
  await page.locator('#mode-campaign').click();
  await page.locator('#deploy').click();
  const results = await page.evaluate(() => {
    const g = window.__biohazard; g.renderer.setAnimationLoop(null); g.nextWaveTimer = 999;
    const results = [];
    for (const id of ['dust2', 'c1a0', 'c1a1', 'c1a2', 'c1a3', 'c1a4']) {
      g.selectMap(id); g.placePlayer();
      const crate = g.world.crate, meshes = []; let bounds;
      crate.traverse(mesh => { if (!mesh.isMesh) return; meshes.push(mesh); const box = mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld); if (!bounds) bounds = box; else bounds.union(box); });
      const center = bounds.getCenter(g.camera.position.clone()), size = bounds.getSize(g.camera.position.clone());
      const candidates = g.world.navigation.nodes.filter(p => Math.abs(p[1] - g.world.supplies.y) < 0.1 && Math.hypot(p[0] - center.x, p[2] - center.z) > 2.2 && Math.hypot(p[0] - center.x, p[2] - center.z) < 3.2);
      let found = false;
      for (const point of candidates) {
        g.camera.position.set(point[0], point[1] + g.eyeHeight, point[2]);
        g.raycaster.ray.origin.copy(g.camera.position); g.raycaster.ray.direction.copy(center).sub(g.camera.position).normalize(); g.raycaster.far = 10;
        const unobstructed = [-0.4, 0.4].every(x => [-0.4, 0.4].every(z => [0.25, 0.95].every(y => {
          const target = center.clone().set(center.x + x, g.world.supplies.y + y, center.z + z);
          g.raycaster.ray.direction.copy(target).sub(g.camera.position).normalize();
          return meshes.includes(g.raycaster.intersectObjects(g.world.walls, false)[0]?.object);
        })));
        if (unobstructed) { g.groundY = point[1]; found = true; break; }
      }
      if (!found) throw new Error(`No visible crate approach on ${id}`);
      g.camera.lookAt(center); g.setFlashlight(true); g.scene.updateMatrixWorld(true);
      const renderer = g.renderer, gl = renderer.getContext(), width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      const pixels = () => { renderer.autoClear = true; renderer.render(g.scene, g.camera); const data = new Uint8Array(width * height * 4); gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
      crate.visible = false; const without = pixels(); crate.visible = true; const withCrate = pixels();
      let visiblePixels = 0;
      for (let i = 0; i < without.length; i += 4) if (Math.abs(without[i]-withCrate[i]) + Math.abs(without[i+1]-withCrate[i+1]) + Math.abs(without[i+2]-withCrate[i+2]) > 25) visiblePixels++;
      g.resupply(); const shopping = g.shopping; g.closeArmory();
      results.push({ id, size: size.toArray(), floor: bounds.min.y - g.world.supplies.y, vertices: meshes.reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0), materials: meshes.map(mesh => mesh.material.name), visiblePixels, shopping, camera: g.camera.position.toArray() });
    }
    return { source: g.classicAssets.manifest.models.crate.source, faces: g.classicAssets.manifest.models.crate.faces, maps: results };
  });
  expect(results.source).toMatch(/^de_dust2\.bsp#model\d+$/); expect(results.faces).toBe(6);
  for (const result of results.maps) {
    for (const dimension of result.size) expect(dimension, result.id).toBeCloseTo(1.15, 4);
    expect(result.floor, result.id).toBeCloseTo(0, 4); expect(result.vertices, result.id).toBe(36);
    expect(result.materials.every(name => name.startsWith('MltryCrte')), result.id).toBe(true);
    expect(result.visiblePixels, result.id).toBeGreaterThan(1000); expect(result.shopping, result.id).toBe(true);
  }
  await page.screenshot({ path: 'test-results/original-dust2-crate.png' });
});
