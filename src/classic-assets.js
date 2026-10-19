import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mediaURL, mediaJSON } from './media.js';

export function animator(scene, clips, idle) {
  const mixer = new THREE.AnimationMixer(scene), actions = new Map(clips.map(clip => [clip.name, mixer.clipAction(clip)]));
  let active = null, remaining = 0;
  const play = (name, duration = 0, restart = false, returnToIdle = true) => {
    const action = actions.get(name);
    if (!action || (active === action && !restart)) return;
    // Restarting the same firing action must retain its full contribution.
    // Fading it back in leaves no other pose underneath during automatic fire,
    // so Three.js blends the arms toward the skeleton's bind pose every shot.
    if (active === action) {
      action.reset().setEffectiveWeight(1).play();
    } else {
      active?.fadeOut(0.08);
      action.reset().setEffectiveWeight(1).play();
      if (active) action.fadeIn(0.08);
    }
    action.setLoop(duration ? THREE.LoopOnce : THREE.LoopRepeat, duration ? 1 : Infinity);
    action.clampWhenFinished = Boolean(duration);
    action.timeScale = duration ? action.getClip().duration / duration : 1;
    active = action; remaining = returnToIdle ? duration : 0;
  };
  play(idle);
  return { mixer, play, update(dt) { mixer.update(dt); if (remaining > 0) { remaining -= dt; if (remaining <= 0) play(idle); } }, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(scene); } };
}

export async function loadClassicAssets() {
  const status = await mediaJSON('status.json').catch(() => ({ available: false }));
  if (!status.available) return null;
  const manifest = await mediaJSON('manifest.json');
  const loader = new GLTFLoader();
  const names = ['zombie', 'm4', 'ak', 'usp'];
  const loaded = await Promise.all(names.map(name => loader.loadAsync(mediaURL(`${name}.glb`))));
  const templates = Object.fromEntries(names.map((name, index) => [name, loaded[index]]));
  for (const template of loaded) template.scene.traverse(object => {
    if (object.isMesh) {
      object.userData.sharedAsset = true; object.castShadow = true; object.frustumCulled = false;
      if (!object.geometry.attributes.normal) object.geometry.computeVertexNormals();
      object.material.roughness = 0.85;
    }
  });
  return {
    manifest,
    createZombie() {
      const template = templates.zombie, model = clone(template.scene), group = new THREE.Group();
      model.rotation.y = -Math.PI / 2; group.add(model);
      const animation = animator(model, template.animations, 'walk');
      const hidden = new THREE.MeshBasicMaterial({ visible: false });
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.35, 0.5), hidden); torso.position.set(0, 0.85, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.47, 0.48), hidden); head.position.set(0, 1.78, 0.12); head.userData.head = true;
      group.add(torso, head);
      return { group, hits: [torso, head], legs: [], arms: [], animation, classic: true };
    },
    installWeapon(weapon, id) {
      const template = templates[id], model = clone(template.scene);
      // Studio viewmodels face +X; the browser camera faces -Z. Mirror the
      // original left-hand viewmodel at the container to select right-hand view.
      model.rotation.y = Math.PI / 2;
      const mirror = new THREE.Group(); mirror.scale.x = -1; mirror.add(model);
      const keep = new Set([weapon.flash, weapon.light]);
      for (const child of [...weapon.group.children]) {
        if (keep.has(child)) continue;
        weapon.group.remove(child); child.geometry?.dispose(); child.material?.dispose();
      }
      weapon.group.add(mirror); weapon.group.scale.setScalar(1);
      weapon.flash.position.set(0.16, -0.05, -0.95); weapon.light.position.copy(weapon.flash.position);
      weapon.classic = true;
      const idle = id === 'ak' ? 'idle1' : 'idle_unsil';
      weapon.animation = animator(model, template.animations, idle);
      weapon.idleAnimation = idle;
      weapon.shootAnimation = id === 'ak' ? 'shoot1' : 'shoot1_unsil';
      weapon.reloadAnimation = id === 'ak' ? 'reload' : 'reload_unsil';
    },
  };
}
