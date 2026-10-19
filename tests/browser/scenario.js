// Find a real, unobstructed target position on the shipped Dust2 navigation map.
export function placeTarget({ part = 'body', phase = 0.3, clip = 'walk', maxDistance = 7, checkLow = false } = {}) {
  const g = window.__biohazard, camera = g.camera.position;
  g.clearEntities(); g.nextWaveTimer = 999;
  const enemy = g.spawnEnemy('zombie'); enemy.speed = 0;
  enemy.animation.play(clip);
  const candidates = g.world.navigation.nodes.filter(p => Math.hypot(p[0] - camera.x, p[2] - camera.z) > 1.7 && Math.hypot(p[0] - camera.x, p[2] - camera.z) < maxDistance && Math.abs(p[1] - g.groundY) < 0.6);
  for (const point of candidates) {
    enemy.group.position.set(...point); enemy.groundY = point[1];
    enemy.group.rotation.y = Math.atan2(camera.x - point[0], camera.z - point[2]);
    enemy.animation.update(phase);
    g.scene.updateMatrixWorld(true);
    const hitbox = part === 'head' ? enemy.hits.find(hit => hit.userData.head) : enemy.hits.find(hit => hit.userData.hitGroup === 2);
    const aim = hitbox.getWorldPosition(camera.clone());
    g.raycaster.ray.origin.copy(camera); g.raycaster.ray.direction.copy(aim).sub(camera).normalize(); g.raycaster.far = 90;
    const hit = g.raycaster.intersectObjects([...g.world.walls, ...enemy.hits], false)[0];
    if (hit?.object.userData.enemy !== enemy || Boolean(hit.object.userData.head) !== (part === 'head')) continue;
    if (checkLow) {
      const low = enemy.group.position.clone(); low.y += 0.45;
      g.raycaster.ray.origin.copy(low); g.raycaster.ray.direction.copy(camera).sub(low).normalize(); g.raycaster.far = low.distanceTo(camera);
      if (g.raycaster.intersectObjects(g.world.walls, false).length) continue;
    }
    const dx = aim.x - camera.x, dy = aim.y - camera.y, dz = aim.z - camera.z;
    g.recoil = 0; g.yaw = Math.atan2(-dx, -dz); g.pitch = Math.atan2(dy, Math.hypot(dx, dz)); g.look(0, 0);
    g.testTarget = enemy;
    return { position: point, head: part === 'head', health: enemy.health };
  }
  throw new Error(`No unobstructed ${part} target found on ${g.world.id} at ${camera.toArray()} (${candidates.length} candidate points)`);
}

export function aimTarget(part = 'body') {
  const g = window.__biohazard, enemy = g.testTarget, camera = g.camera.position;
  g.scene.updateMatrixWorld(true);
  const hitbox = part === 'head' ? enemy.hits.find(hit => hit.userData.head) : enemy.hits.find(hit => hit.userData.hitGroup === 2);
  const aim = hitbox.getWorldPosition(camera.clone());
  const dx = aim.x - camera.x, dy = aim.y - camera.y, dz = aim.z - camera.z;
  g.recoil = 0; g.yaw = Math.atan2(-dx, -dz); g.pitch = Math.atan2(dy, Math.hypot(dx, dz)); g.look(0, 0);
}
