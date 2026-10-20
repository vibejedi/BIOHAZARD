import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installHitboxes } from '../src/classic-assets.js';
import { ZOMBIE_HEALTH, WEAPONS, shotDamage, enemyKind } from '../src/rules.js';

test('body shots take 3–4 hits, and headshots kill in one', () => {
  for (const id of Object.keys(WEAPONS)) {
    const bodyShots = Math.ceil(ZOMBIE_HEALTH / shotDamage(id, false));
    assert.ok(bodyShots >= 3 && bodyShots <= 4, id);
    assert.ok(shotDamage(id, true) >= ZOMBIE_HEALTH, id);
  }
});

test('head hitboxes follow animated bones and can be raycast independently of the body', () => {
  const model = new THREE.Group(), torso = new THREE.Bone(), head = new THREE.Bone();
  model.add(torso); torso.add(head); torso.position.y = 1; head.position.y = 0.75;
  const mesh = new THREE.SkinnedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton([torso, head])); model.add(mesh);
  const hits = installHitboxes(model, [
    { bone: 0, group: 2, min: [-0.3, -0.4, -0.2], max: [0.3, 0.4, 0.2] },
    { bone: 1, group: 1, min: [-0.22, -0.22, -0.22], max: [0.22, 0.22, 0.22] },
  ]);
  model.updateMatrixWorld(true);
  const original = hits[1].getWorldPosition(new THREE.Vector3());
  head.position.x = 0.45; head.rotation.z = 0.3; model.updateMatrixWorld(true);
  const animated = hits[1].getWorldPosition(new THREE.Vector3());
  assert.ok(animated.distanceTo(original) > 0.4);
  const ray = new THREE.Raycaster(animated.clone().add(new THREE.Vector3(0, 0, 4)), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObjects(hits, false)[0];
  assert.equal(hit.object.userData.head, true);
  for (const box of hits) { box.geometry.dispose(); box.material.dispose(); }
  mesh.geometry.dispose(); mesh.material.dispose(); mesh.skeleton.dispose();
});

test('waves introduce headcrabs and runners in a repeatable mix', () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, i) => enemyKind(1, i)), Array(10).fill('zombie'));
  const second = Array.from({ length: 10 }, (_, i) => enemyKind(2, i));
  assert.ok(second.includes('headcrab')); assert.ok(!second.includes('runner'));
  const later = Array.from({ length: 20 }, (_, i) => enemyKind(3, i));
  assert.deepEqual(new Set(later), new Set(['zombie', 'runner', 'headcrab']));
});
