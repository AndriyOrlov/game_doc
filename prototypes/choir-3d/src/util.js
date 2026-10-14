import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const deg = (d) => d * Math.PI / 180;

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

export function canvasTex(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

// speckle noise over a canvas
export function speckle(g, w, h, n, colors, rmin, rmax, alpha, r = Math.random) {
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = colors[(r() * colors.length) | 0];
    const s = rmin + r() * (rmax - rmin);
    g.beginPath();
    g.arc(r() * w, r() * h, s, 0, TAU);
    g.fill();
  }
  g.globalAlpha = 1;
}

export function textSprite(text, { size = 34, color = '#e9e1d3', bg = 'rgba(10,12,13,0.72)', scale = 1 } = {}) {
  const pad = 14;
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `600 ${size}px "Alegreya Sans", "Segoe UI", sans-serif`;
  const w = Math.ceil(g.measureText(text).width) + pad * 2;
  c.width = w; c.height = size + pad * 2;
  g.font = `600 ${size}px "Alegreya Sans", "Segoe UI", sans-serif`;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(240,178,87,0.7)'; g.lineWidth = 2; g.strokeRect(1, 1, c.width - 2, c.height - 2);
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, pad, c.height / 2 + 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true });
  const s = new THREE.Sprite(m);
  s.scale.set((c.width / c.height) * 0.9 * scale, 0.9 * scale, 1);
  s.renderOrder = 999;
  return s;
}

// Convert world-angle φ (x = cosφ, z = -sinφ) into CylinderGeometry/Lathe theta
export const phiToCyl = (phi) => phi + Math.PI / 2;
