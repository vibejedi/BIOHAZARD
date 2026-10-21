import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { mediaURL, mediaJSON } from './media.js';
import { WEAPONS } from './rules.js';

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

export function installHitboxes(model, descriptions, requireHead = true) {
  let bones;
  model.traverse(object => { if (object.isSkinnedMesh && !bones) bones = object.skeleton.bones; });
  if (!bones || !descriptions?.length || (requireHead && !descriptions.some(box => box.group === 1))) throw new Error('Original monster hitboxes are missing. Prepare the game assets again.');
  return descriptions.map(description => {
    const bone = bones[description.bone];
    if (!bone) throw new Error('Zombie hitbox references a missing bone.');
    const min = new THREE.Vector3(...description.min), max = new THREE.Vector3(...description.max);
    const size = max.clone().sub(min);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    hit.name = description.group === 1 ? 'head_hitbox' : 'body_hitbox';
    hit.position.copy(min.add(max).multiplyScalar(0.5)); hit.userData.head = description.group === 1; hit.userData.hitGroup = description.group;
    bone.add(hit);
    return hit;
  });
}

export async function loadClassicAssets() {
  const status = await mediaJSON('status.json').catch(() => ({ available: false }));
  if (!status.available) return null;
  const manifest = await mediaJSON('manifest.json');
  const loader = new GLTFLoader();
  const names = ['zombie', 'headcrab', 'crate', 'player', ...Object.keys(WEAPONS)];
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
    createCrate() {
      const model = clone(templates.crate.scene), group = new THREE.Group();
      // The original intact brush crate is static, with all six textured faces.
      // Keep the interactable readable in rooms without baked ambient light.
      model.traverse(object => {
        if (!object.isMesh) return;
        object.material = object.material.clone();
        object.material.emissive.setScalar(0.04); object.material.emissiveMap = object.material.map;
      });
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
      const scale = 1.15 / Math.max(size.x, size.z);
      model.scale.setScalar(scale); model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
      group.add(model); group.userData.originalCrate = true;
      return group;
    },
    createPlayer() {
      const model = clone(templates.player.scene), group = new THREE.Group(); model.rotation.y = -Math.PI / 2; group.add(model);
      const animation = animator(model, templates.player.animations, 'idle1'); animation.update(0);
      return { group, animation, hits: installHitboxes(model, manifest.models.player.hitboxes), classic: true };
    },
    createZombie() {
      const template = templates.zombie, model = clone(template.scene), group = new THREE.Group();
      model.rotation.y = -Math.PI / 2; group.add(model);
      const animation = animator(model, template.animations, 'walk');
      const hits = installHitboxes(model, manifest.models.zombie.hitboxes);
      animation.update(0);
      return { group, hits, legs: [], arms: [], animation, classic: true };
    },
    createHeadcrab() {
      const template = templates.headcrab, model = clone(template.scene), group = new THREE.Group();
      model.rotation.y = -Math.PI / 2; group.add(model);
      const animation = animator(model, template.animations, 'run');
      const hits = installHitboxes(model, manifest.models.headcrab.hitboxes, false);
      animation.update(0);
      return { group, hits, legs: [], arms: [], animation, classic: true };
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
      let bones;
      model.traverse(object => { if (object.isSkinnedMesh && !bones) bones = object.skeleton.bones; });
      // Original unsilenced muzzle attachments follow the animated barrel.
      const attachment = manifest.models[id].attachments?.[WEAPONS[id].muzzle];
      if (!attachment || !bones?.[attachment.bone]) throw new Error(`Missing muzzle attachment for ${id}.`);
      bones[attachment.bone].add(weapon.flash, weapon.light);
      weapon.flash.position.set(...attachment.position); weapon.light.position.copy(weapon.flash.position);
      weapon.flash.scale.setScalar(WEAPONS[id].tier === 0 ? 0.14 : 0.22);
      weapon.classic = true;
      const idle = WEAPONS[id].idle;
      weapon.animation = animator(model, template.animations, idle);
      weapon.idleAnimation = idle;
      weapon.shootAnimation = WEAPONS[id].shoot;
      weapon.reloadAnimation = WEAPONS[id].reloadClip;
      weapon.animation.update(0);
    },
  };
}
