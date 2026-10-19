import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animator } from '../src/classic-assets.js';

function viewmodel() {
  const model = new THREE.Group(), arm = new THREE.Bone();
  arm.name = 'arm'; model.add(arm);
  const clip = (name, x) => new THREE.AnimationClip(name, 0.25, [
    new THREE.VectorKeyframeTrack('arm.position', [0, 0.25], [x, 0, 0, x, 0, 0]),
  ]);
  return { arm, animation: animator(model, [clip('idle', 10), clip('shoot', 12), clip('reload', 14)], 'idle') };
}

test('automatic fire keeps the arms in the animated pose when the shooting clip restarts', () => {
  const { arm, animation } = viewmodel();
  animation.update(0.1);
  animation.play('shoot', 0.25, true);
  animation.update(0.105);
  assert.equal(arm.position.x, 12);
  for (let shot = 0; shot < 20; shot++) {
    animation.play('shoot', 0.25, true);
    for (let frame = 0; frame < 7; frame++) {
      animation.update(0.015);
      assert.ok(Math.abs(arm.position.x - 12) < 0.0001, `shot ${shot}, frame ${frame}: arm snapped to ${arm.position.x}`);
    }
  }
  animation.update(0.3); animation.update(0.1);
  assert.equal(arm.position.x, 10, 'the shooting pose returns to idle');
  animation.dispose();
});

test('single shots and interrupted reloads blend between poses without exposing the bind pose', () => {
  const { arm, animation } = viewmodel();
  animation.update(0.1);
  for (const [name, duration] of [['shoot', 0.25], ['reload', 1.5], ['idle', 0], ['shoot', 0.25]]) {
    animation.play(name, duration, true);
    for (let frame = 0; frame < 10; frame++) {
      animation.update(0.01);
      assert.ok(arm.position.x >= 10 - 0.0001 && arm.position.x <= 14 + 0.0001, `${name}: invalid arm position ${arm.position.x}`);
    }
  }
  animation.dispose();
});
