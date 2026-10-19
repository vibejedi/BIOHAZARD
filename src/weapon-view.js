import * as THREE from 'three';

export function effectTexture(kind) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (kind === 'flash') {
    const gradient = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(0.16, '#fff9d5');
    gradient.addColorStop(0.38, '#ffb838e6'); gradient.addColorStop(1, '#ff720000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const angle = i * Math.PI / 8, radius = i % 2 ? 11 : 57;
      const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = '#fff1c9'; ctx.fill();
  } else {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 58);
    gradient.addColorStop(0, '#d51919'); gradient.addColorStop(0.4, '#a00808dc'); gradient.addColorStop(1, '#70000000');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWeapon() {
  const group = new THREE.Group();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: effectTexture('flash'), color: 0xffffff, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  flash.scale.set(0.38, 0.38, 1); flash.visible = false; flash.renderOrder = 100;
  const light = new THREE.PointLight(0xffb154, 0, 3);
  group.add(flash, light);
  return { group, flash, light, flashRemaining: 0 };
}
