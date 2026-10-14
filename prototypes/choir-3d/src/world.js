import * as THREE from 'three';
import { canvasTex, speckle, rng, TAU, deg, phiToCyl } from './util.js';

// ---------------------------------------------------------------------------
// Level layout (metres). North = -z. Arena centre = origin.
//   Bridge (start)      z 34..48   narrow, over the abyss, barricade of dead pipes at z≈39
//   Antechamber         z 20..34   central partition, puzzle resonator (west), source face (north wall)
//   Threshold corridor  z 15.6..20 training: safe parry + dodge, checkpoint lantern
//   Acoustic hall       r 15.5     active zone r 12, 4 columns r 8.5, rest niches W/E, boss on the north rim
// ---------------------------------------------------------------------------
export const ARENA_R = 15.5;
export const ACTIVE_R = 12;
export const COLUMN_R = 8.5;
export const COLUMNS = [45, 135, 225, 315].map((d) => {
  const p = deg(d);
  return new THREE.Vector2(Math.cos(p) * COLUMN_R, -Math.sin(p) * COLUMN_R);
});
export const NODE_POS = [
  new THREE.Vector2(-6.3, -11.6),
  new THREE.Vector2(0, -13.1),
  new THREE.Vector2(6.3, -11.6),
];
export const FACE_POS = [
  new THREE.Vector3(-6.2, 7.0, -17.0),
  new THREE.Vector3(0, 10.2, -14.9),
  new THREE.Vector3(6.2, 8.4, -16.8),
];
export const FACE_R = [2.3, 2.0, 1.7];
export const RESONATOR_POS = new THREE.Vector2(-17.0, 0);
export const CONSOLE_POS = new THREE.Vector2(-7.6, 22.4);
export const SOURCE_POS = new THREE.Vector3(0, 4.6, 20.45);
export const PALM_POS = new THREE.Vector2(-0.6, -6.4);
export const START_POS = new THREE.Vector2(0, 45.5);
export const CHECKPOINT_POS = new THREE.Vector2(0, 11.5);

const VOICE_COL = [new THREE.Color(1.0, 0.45, 0.22), new THREE.Color(1.0, 0.86, 0.66), new THREE.Color(0.45, 0.95, 0.9)];
export { VOICE_COL };

// ---------------------------------------------------------------------------
function makeTextures() {
  const R = rng(7);
  const tex = {};

  tex.arena = canvasTex(2048, 2048, (g, W) => {
    const C = W / 2, S = C / ARENA_R; // px per metre
    g.fillStyle = '#26231f'; g.fillRect(0, 0, W, W);
    const rings = [0, 1.6, 3.2, 4.8, 6.4, 8.0, 9.6, 11.2, 12.4, 13.9, 15.6];
    const pal = ['#2c2823', '#28241f', '#312c26', '#24211c', '#2e2a25', '#2a2520'];
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i] * S, r1 = rings[i + 1] * S, rm = (rings[i] + rings[i + 1]) / 2;
      const n = Math.max(1, Math.round((TAU * rm) / (i > 7 ? 1.3 : 1.7)));
      const off = R() * TAU;
      for (let k = 0; k < n; k++) {
        const a0 = off + (k / n) * TAU, a1 = off + ((k + 1) / n) * TAU;
        g.beginPath(); g.arc(C, C, r1, a0, a1); g.arc(C, C, r0, a1, a0, true); g.closePath();
        g.fillStyle = pal[(R() * pal.length) | 0]; g.fill();
        g.strokeStyle = '#13110e'; g.lineWidth = 3.2; g.stroke();
      }
    }
    // light wear in the lit centre
    const gr = g.createRadialGradient(C, C * 0.92, 0, C, C, 11 * S);
    gr.addColorStop(0, 'rgba(120,104,84,0.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
    // copper medallion inlay
    g.strokeStyle = 'rgba(150,98,56,0.85)';
    for (const r of [0.55, 1.15, 2.35, 3.05]) { g.lineWidth = r < 1 ? 5 : 4; g.beginPath(); g.arc(C, C, r * S, 0, TAU); g.stroke(); }
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * TAU; g.lineWidth = 3;
      g.beginPath(); g.moveTo(C + Math.cos(a) * 1.25 * S, C + Math.sin(a) * 1.25 * S);
      g.lineTo(C + Math.cos(a) * (k % 2 ? 2.2 : 2.9) * S, C + Math.sin(a) * (k % 2 ? 2.2 : 2.9) * S); g.stroke();
    }
    // the stave: five copper lines marking the edge of the active zone (r 12)
    g.strokeStyle = 'rgba(160,108,62,0.75)'; g.lineWidth = 2.4;
    for (let l = 0; l < 5; l++) { g.beginPath(); g.arc(C, C, (11.62 + l * 0.15) * S, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(168,114,66,0.9)';
    for (let k = 0; k < 140; k++) {
      const a = R() * TAU, r = (11.62 + ((R() * 5) | 0) * 0.15) * S;
      g.save(); g.translate(C + Math.cos(a) * r, C + Math.sin(a) * r); g.rotate(a + 0.5);
      g.beginPath(); g.ellipse(0, 0, 6, 4, 0, 0, TAU); g.fill(); g.restore();
    }
    speckle(g, W, W, 9000, ['#000', '#3a342d', '#181512'], 0.6, 2.6, 0.35, R);
    // edge grime
    const g2 = g.createRadialGradient(C, C, 11.5 * S, C, C, 15.6 * S);
    g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = g2; g.fillRect(0, 0, W, W);
  });

  tex.tile = canvasTex(512, 512, (g, W) => {
    g.fillStyle = '#25221e'; g.fillRect(0, 0, W, W);
    const n = 4, s = W / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const o = (j % 2) * s * 0.5;
      g.fillStyle = ['#2b2722', '#27231e', '#302b25', '#221f1b'][(R() * 4) | 0];
      g.fillRect((i * s + o) % W, j * s, s, s);
      g.strokeStyle = '#12100d'; g.lineWidth = 4; g.strokeRect((i * s + o) % W, j * s, s, s);
      if (o) { g.fillRect(i * s + o - W, j * s, s, s); g.strokeRect(i * s + o - W, j * s, s, s); }
    }
    speckle(g, W, W, 2500, ['#000', '#3b352e'], 0.5, 2, 0.35, R);
  }, { repeat: [1, 1] });

  tex.stone = canvasTex(512, 512, (g, W) => {
    g.fillStyle = '#2a2723'; g.fillRect(0, 0, W, W);
    const rows = 8, h = W / rows;
    for (let j = 0; j < rows; j++) {
      let x = (j % 2) * -40;
      while (x < W) {
        const w = 70 + R() * 90;
        g.fillStyle = ['#2f2b26', '#2a2622', '#34302a', '#26231f'][(R() * 4) | 0];
        g.fillRect(x, j * h, w, h);
        g.strokeStyle = '#141210'; g.lineWidth = 3; g.strokeRect(x, j * h, w, h);
        x += w;
      }
    }
    speckle(g, W, W, 3000, ['#000', '#433c33'], 0.5, 2, 0.3, R);
    const gr = g.createLinearGradient(0, 0, 0, W);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  }, { repeat: [1, 1] });

  const face = (cracked) => (g, W, H) => {
    const cx = W * 0.25, cy = H * 0.5;
    g.fillStyle = cracked ? '#b8ad9c' : '#d9cfbe'; g.fillRect(0, 0, W, H);
    const gr = g.createRadialGradient(cx, cy, 10, cx, cy, W * 0.2);
    gr.addColorStop(0, 'rgba(255,250,240,0.25)'); gr.addColorStop(1, 'rgba(60,45,30,0.45)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // glaze crackle
    g.strokeStyle = 'rgba(80,66,52,0.25)'; g.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      let x = R() * W, y = R() * H; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 30; y += (R() - 0.5) * 30; g.lineTo(x, y); }
      g.stroke();
    }
    // brow ridge + nose
    g.strokeStyle = 'rgba(120,100,80,0.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx - 34, cy - 30); g.quadraticCurveTo(cx, cy - 40, cx + 34, cy - 30); g.stroke();
    g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx, cy + 6); g.stroke();
    // eyes: dark almond slits
    g.fillStyle = '#16110e';
    for (const s of [-1, 1]) {
      g.beginPath(); g.ellipse(cx + s * 17, cy - 15, 11, 5, s * -0.25, 0, TAU); g.fill();
    }
    // mouth
    g.beginPath(); g.ellipse(cx, cy + 26, 16, 3.2, 0, 0, TAU); g.fill();
    if (cracked) {
      g.strokeStyle = '#2a1f18'; g.lineWidth = 2.5;
      for (let i = 0; i < 7; i++) {
        let x = cx + (R() - 0.5) * 50, y = cy + (R() - 0.5) * 60; g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 26; y += (R() - 0.5) * 26; g.lineTo(x, y); }
        g.stroke();
      }
    }
  };
  tex.face = canvasTex(512, 256, face(false));
  tex.faceCracked = canvasTex(512, 256, face(true));

  tex.shaft = canvasTex(64, 256, (g, W, H) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.9)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const gx = g.createLinearGradient(0, 0, W, 0);
    gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, W, H);
  }, { srgb: false });

  tex.dot = canvasTex(64, 64, (g, W) => {
    const gr = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  }, { srgb: false });

  tex.symbols = [1, 2, 3].map((n) => canvasTex(128, 128, (g, W) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, W, W);
    g.fillStyle = '#bdf3ee';
    for (let i = 0; i < n; i++) g.fillRect(24, 40 + i * 22 - (n - 1) * 11, 80, 12);
  }));
  return tex;
}

function makeEnv(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x07090b);
  const add = (w, h, col, x, y, z, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  add(20, 20, new THREE.Color(1.6, 1.1, 0.7), 0, 18, 0, Math.PI / 2);
  add(30, 6, new THREE.Color(0.18, 0.42, 0.44), -16, 3, 0, 0, Math.PI / 2);
  add(30, 6, new THREE.Color(0.55, 0.3, 0.15), 16, 2, 0, 0, -Math.PI / 2);
  add(40, 40, new THREE.Color(0.06, 0.045, 0.035), 0, -6, 0, -Math.PI / 2);
  const env = pm.fromScene(s, 0.04).texture;
  pm.dispose();
  return env;
}

function makeMaterials(tex) {
  const m = {};
  m.arena = new THREE.MeshStandardMaterial({ map: tex.arena, bumpMap: tex.arena, bumpScale: 0.6, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.25, emissive: new THREE.Color(1.0, 0.62, 0.3), emissiveMap: tex.arena, emissiveIntensity: 0 });
  m.tile = (rx, ry) => {
    const t = tex.tile.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.5, roughness: 0.85, envMapIntensity: 0.25 });
  };
  m.stone = (rx = 1, ry = 1) => {
    const t = tex.stone.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
    return new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 0.4, roughness: 0.9, envMapIntensity: 0.2 });
  };
  m.stoneDark = new THREE.MeshStandardMaterial({ color: 0x1d1b18, roughness: 0.95, envMapIntensity: 0.2 });
  m.copper = new THREE.MeshStandardMaterial({ color: 0x8a5532, metalness: 0.86, roughness: 0.36, envMapIntensity: 0.9 });
  m.copperInst = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.86, roughness: 0.38, envMapIntensity: 0.9 });
  m.brass = new THREE.MeshStandardMaterial({ color: 0x8f6a34, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.0 });
  m.bronzeDark = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, metalness: 0.75, roughness: 0.5, envMapIntensity: 0.7 });
  m.iron = new THREE.MeshStandardMaterial({ color: 0x1f1d1b, metalness: 0.7, roughness: 0.55, envMapIntensity: 0.6 });
  m.ceramic = new THREE.MeshStandardMaterial({ map: tex.face, roughness: 0.45, metalness: 0.0, envMapIntensity: 0.5 });
  m.ceramicPlain = new THREE.MeshStandardMaterial({ color: 0xcfc4b2, roughness: 0.5, envMapIntensity: 0.5 });
  m.chain = new THREE.MeshStandardMaterial({ color: 0x15130f, metalness: 0.6, roughness: 0.6 });
  return m;
}

// geometry helpers -----------------------------------------------------------
function arcWall(r, h, phi0, phi1, mat, y0 = 0) {
  const geo = new THREE.CylinderGeometry(r, r, h, Math.max(6, Math.round((phi1 - phi0) * 18)), 1, true, phiToCyl(phi0), phi1 - phi0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y0 + h / 2;
  return mesh;
}
function ringSlab(rIn, rOut, y, phi0, phi1, mat) {
  const geo = new THREE.RingGeometry(rIn, rOut, Math.max(8, Math.round((phi1 - phi0) * 18)), 1, phi0, phi1 - phi0);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  return mesh;
}
function torusArc(r, tube, phi0, phi1, mat, y) {
  const geo = new THREE.TorusGeometry(r, tube, 6, Math.max(8, Math.round((phi1 - phi0) * 20)), phi1 - phi0);
  geo.rotateZ(phi0); geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  return mesh;
}
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
export function cylBetween(a, b, r, mat, seg = 10) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg, 1, true), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}

function pipeField(list, mat, { collars = true } = {}) {
  // list: {x,z,r,h,y0,c}
  const grp = new THREE.Group();
  const geo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true);
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const cg = new THREE.CylinderGeometry(1.14, 1.14, 1, 14, 1, false);
  const nc = collars ? list.length * 2 : 0;
  const ic = collars ? new THREE.InstancedMesh(cg, mat, nc) : null;
  const mg = new THREE.PlaneGeometry(1, 1);
  const mouths = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.DoubleSide }), list.length);
  const o = new THREE.Object3D(), col = new THREE.Color();
  list.forEach((p, i) => {
    o.position.set(p.x, p.y0 + p.h / 2, p.z); o.rotation.set(0, 0, 0); o.scale.set(p.r, p.h, p.r); o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
    col.set(p.c || 0x8a5532); im.setColorAt(i, col);
    if (collars) {
      for (let k = 0; k < 2; k++) {
        const y = k === 0 ? p.y0 + 0.4 : p.y0 + p.h * (0.35 + ((i * 37) % 30) / 100);
        o.position.set(p.x, y, p.z); o.scale.set(p.r, 0.22, p.r); o.updateMatrix();
        ic.setMatrixAt(i * 2 + k, o.matrix); ic.setColorAt(i * 2 + k, col);
      }
    }
    // organ pipe mouth facing the hall centre (or p.face target)
    const tx = p.fx ?? 0, tz = p.fz ?? 0;
    const dir = new THREE.Vector2(tx - p.x, tz - p.z).normalize();
    o.position.set(p.x + dir.x * p.r * 1.01, p.y0 + Math.min(p.h * 0.18, 2.4) + p.r * 1.2, p.z + dir.y * p.r * 1.01);
    o.rotation.set(0, Math.atan2(dir.x, dir.y), 0);
    o.scale.set(p.r * 1.0, p.r * 1.1, 1); o.updateMatrix();
    mouths.setMatrixAt(i, o.matrix);
  });
  im.castShadow = false; im.receiveShadow = true;
  grp.add(im, mouths); if (ic) grp.add(ic);
  return grp;
}

export function makeHand(mats, s = 1) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), mats.ceramicPlain);
  palm.scale.set(1.05 * s, 0.32 * s, 1.2 * s); palm.castShadow = true; g.add(palm);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2), mats.copper);
  back.scale.set(0.85 * s, 0.22 * s, 0.95 * s); back.position.y = 0.12 * s; g.add(back);
  const fingers = [];
  const fx = [-0.66, -0.22, 0.22, 0.64];
  const lens = [0.58, 0.72, 0.68, 0.5];
  const knuckle = new THREE.SphereGeometry(0.2 * s, 12, 8);
  for (let i = 0; i < 4; i++) {
    let parent = new THREE.Group();
    parent.position.set(fx[i] * s, 0, 1.0 * s); parent.rotation.y = (fx[i]) * 0.12; g.add(parent);
    const segs = [];
    for (let k = 0; k < 3; k++) {
      const L = lens[i] * s * (k === 2 ? 0.8 : 1);
      const seg = new THREE.Mesh(new THREE.CapsuleGeometry(0.17 * s * (1 - k * 0.12), L * 0.7, 4, 10), mats.ceramicPlain);
      seg.rotation.x = Math.PI / 2; seg.position.z = L * 0.5; seg.castShadow = true; parent.add(seg);
      const kn = new THREE.Mesh(knuckle, mats.copper); kn.scale.setScalar(1 - k * 0.15); parent.add(kn);
      segs.push(parent);
      const next = new THREE.Group(); next.position.set(0, 0, L * 1.02); parent.add(next);
      parent = next;
    }
    fingers.push(segs);
  }
  const thumb = new THREE.Group(); thumb.position.set(-0.95 * s, 0, 0.25 * s); thumb.rotation.y = -0.8; g.add(thumb);
  const t1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.19 * s, 0.5 * s, 4, 10), mats.ceramicPlain); t1.rotation.x = Math.PI / 2; t1.position.z = 0.36 * s; t1.castShadow = true; thumb.add(t1);
  const t2p = new THREE.Group(); t2p.position.set(0, 0, 0.74 * s); thumb.add(t2p);
  const t2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.4 * s, 4, 10), mats.ceramicPlain); t2.rotation.x = Math.PI / 2; t2.position.z = 0.3 * s; t2p.add(t2);
  t2p.add(new THREE.Mesh(knuckle, mats.copper));
  const setCurl = (c) => {
    for (const segs of fingers) segs.forEach((p, k) => { p.rotation.x = c * (k === 0 ? 0.75 : 0.95); });
    t2p.rotation.x = c * 0.6; thumb.rotation.x = c * 0.3;
  };
  setCurl(0.4);
  return { group: g, setCurl };
}

export function makeFace(mats, R, color) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mats.ceramic.clone());
  shell.scale.set(R, R * 1.3, R * 0.75);
  shell.castShadow = true;
  g.add(shell);
  const glowMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.44, R * 0.09), glowMat);
  mouth.position.set(0, -R * 0.33, R * 0.73);
  const eyes = [-1, 1].map((sx) => {
    const e = new THREE.Mesh(new THREE.PlaneGeometry(R * 0.2, R * 0.08), glowMat);
    e.position.set(sx * R * 0.21, R * 0.2, R * 0.69); e.rotation.z = sx * -0.25; return e;
  });
  g.add(mouth, ...eyes);
  // copper collar behind the face
  const collar = new THREE.Mesh(new THREE.TorusGeometry(R * 1.02, R * 0.08, 8, 40), mats.copper);
  collar.scale.set(1, 1.28, 1); collar.position.z = -R * 0.15;
  g.add(collar);
  return { group: g, shell, glowMat };
}

// ---------------------------------------------------------------------------
export function buildWorld(scene, renderer, opts = {}) {
  const mobile = !!opts.mobile;
  const tex = makeTextures();
  const env = makeEnv(renderer);
  scene.environment = env;
  const mats = makeMaterials(tex);
  const W = { scene, tex, mats, root: new THREE.Group(), anim: [] };
  scene.add(W.root);
  W.fadeables = [];
  const fade = (m) => { m.material = m.material.clone(); m.material.transparent = true; m.userData.fade = 1; W.fadeables.push(m); return m; };
  const add = (o, shadow = false, recv = true) => {
    o.traverse?.((c) => { if (c.isMesh) { if (shadow) c.castShadow = true; if (recv) c.receiveShadow = true; } });
    W.root.add(o); return o;
  };
  scene.fog = new THREE.FogExp2(0x0a0c0d, 0.0155);
  scene.background = new THREE.Color(0x0a0c0d);

  // ----------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x3d4c52, 0x1a120c, 0.55);
  scene.add(hemi);
  const key = new THREE.SpotLight(0xffe2bd, 3.4, 0, 0.43, 0.6, 0);
  key.position.set(0, 44, 9); key.target.position.set(0, 0, -2.5);
  key.castShadow = true;
  key.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
  key.shadow.camera.near = 20; key.shadow.camera.far = 80;
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);
  W.key = key;
  const rim = new THREE.DirectionalLight(0x6fb7b0, 0.55);
  rim.position.set(-20, 16, -26); scene.add(rim);
  const warm = new THREE.DirectionalLight(0xc0743c, 0.25);
  warm.position.set(22, 8, 10); scene.add(warm);

  const approach = new THREE.SpotLight(0xffd6a6, 3.2, 0, 0.62, 0.65, 0);
  approach.position.set(3, 30, 40); approach.target.position.set(0, 0, 29);
  approach.castShadow = true;
  approach.shadow.mapSize.set(1024, 1024);
  approach.shadow.camera.near = 10; approach.shadow.camera.far = 60;
  approach.shadow.bias = -0.0004; approach.shadow.normalBias = 0.03;
  scene.add(approach, approach.target);

  // ----------------------------------------------------------------- arena floor + wall
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.2, 128), mats.arena);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  add(floor);
  // underside skirt (so the floor reads as a slab from the bridge)
  const stoneWall = mats.stone(10, 1);
  const arcs = [[9.5, 55], [125, 170.5], [189.5, 262.4], [277.6, 350.5]].map(([a, b]) => [deg(a), deg(b)]);
  for (const [a, b] of arcs) {
    add(arcWall(15.6, 3.2, a, b, stoneWall), true);
    add(arcWall(16.4, 3.2, a, b, stoneWall));
    add(ringSlab(15.6, 16.4, 3.2, a, b, mats.stoneDark));
    add(torusArc(15.62, 0.07, a, b, mats.copper, 2.55));
    add(torusArc(15.62, 0.05, a, b, mats.copper, 0.35));
  }
  // flanking pillars at every wall opening
  for (const p of [0, 90, 180, 270].flatMap((c) => [c - (c === 90 ? 35 : c === 270 ? 7.6 : 9.5), c + (c === 90 ? 35 : c === 270 ? 7.6 : 9.5)])) {
    const ph = deg(p), x = Math.cos(ph) * 16, z = -Math.sin(ph) * 16;
    const pil = box(1.1, 4.4, 1.1, mats.stone(1, 1), x, 2.2, z); pil.rotation.y = -ph; add(pil, true);
    add(box(1.3, 0.3, 1.3, mats.copper, x, 4.5, z));
  }

  // ----------------------------------------------------------------- rest niches (W/E)
  W.niches = [];
  for (const sx of [-1, 1]) {
    const g = new THREE.Group();
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.0), mats.tile(1.5, 2.5));
    fl.rotation.x = -Math.PI / 2; fl.position.set(sx * 17.2, 0.01, 0); fl.receiveShadow = true; g.add(fl);
    g.add(box(0.5, 4, 6.4, mats.stone(1.5, 1), sx * 19.1, 2, 0));
    g.add(box(3.6, 4, 0.5, mats.stone(1.5, 1), sx * 17.2, 2, -3.15));
    g.add(box(3.6, 4, 0.5, mats.stone(1.5, 1), sx * 17.2, 2, 3.15));
    g.add(box(4.0, 0.4, 6.8, mats.stoneDark, sx * 17.2, 4.2, 0));
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.22, 8, 28, Math.PI), mats.copper);
    arch.rotation.y = Math.PI / 2; arch.position.set(sx * 15.7, 1.5, 0); g.add(arch);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.7, 0.6) });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), lampMat);
    lamp.position.set(sx * 18.4, 3.0, sx > 0 ? -1.8 : 1.8); g.add(lamp);
    const pl = new THREE.PointLight(0xffa04a, 14, 11, 2); pl.position.copy(lamp.position); g.add(pl);
    if (sx > 0) { // bench in the east niche
      g.add(box(0.8, 0.45, 3.2, mats.stoneDark, 18.3, 0.22, 0.4));
      const f = makeFace(mats, 0.45, VOICE_COL[1]); f.group.position.set(18.75, 2.2, 0.4); f.group.rotation.y = -Math.PI / 2; g.add(f.group);
    }
    add(g, true);
    W.niches.push({ x: sx * 17.2, z: 0 });
  }

  // resonator (west niche)
  {
    const g = new THREE.Group();
    g.position.set(RESONATOR_POS.x, 0, RESONATOR_POS.y);
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.5, 20), mats.stoneDark));
    for (const s of [-1, 1]) g.add(box(0.2, 2.8, 0.2, mats.brass, 0, 1.9, s * 0.42));
    g.add(box(0.2, 0.25, 1.05, mats.brass, 0, 0.6, 0));
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, TAU, Math.PI / 2, Math.PI / 2), mats.ceramicPlain);
    bowl.position.y = 3.35; bowl.material = mats.ceramicPlain; g.add(bowl);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.2, 2.0), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 8, 40), ringMat);
    ring.position.y = 1.7; ring.rotation.x = Math.PI / 2; g.add(ring);
    const light = new THREE.PointLight(0x7fe0d8, 10, 8, 2); light.position.y = 2.2; g.add(light);
    add(g, true);
    W.resonator = { group: g, ring, ringMat, light };
  }

  // ----------------------------------------------------------------- columns
  W.columnMeshes = [];
  for (const c of COLUMNS) {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.y);
    g.add(box(1.9, 0.6, 1.9, mats.stoneDark, 0, 0.3, 0));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.74, 8.4, 16), mats.stone(1, 2));
    shaft.position.y = 4.8; g.add(shaft);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.7, 0.6, 18), mats.stoneDark); cap.position.y = 9.25; g.add(cap);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10, 0, TAU, 0, Math.PI / 2), mats.ceramicPlain); bowl.position.y = 9.55; g.add(bowl);
    const ember = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.55) })); ember.position.y = 9.8; g.add(ember);
    for (const y of [1.0, 4.2, 7.6]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.28, 18), mats.copper); b.position.y = y; g.add(b);
    }
    const f = makeFace(mats, 0.42, VOICE_COL[1]);
    const dir = Math.atan2(-c.x, -c.y);
    f.group.position.set(Math.sin(dir) * 0.7, 5.8, Math.cos(dir) * 0.7); f.group.rotation.y = dir;
    g.add(f.group);
    add(g, true);
    W.columnMeshes.push(g);
  }

  // ----------------------------------------------------------------- tiers / balconies with ceramic faces
  const tiers = [
    { y: 9.5, rIn: 17.6, rOut: 21, faceR: 17.85, step: 7.5 },
    { y: 18.5, rIn: 20.0, rOut: 24, faceR: 20.25, step: 7 },
    { y: 29, rIn: 23.0, rOut: 27, faceR: 23.25, step: 6.5 },
  ];
  const facePos = [];
  // the south sector of the upper tiers stays open: that is where the camera hangs
  const southGap = (a) => { const m = ((a % 360) + 360) % 360; return m > 236 && m < 304; };
  for (const t of tiers) {
    const spans = [[123, 236], [304, 417]];
    for (const [s0, s1] of spans) {
      const a0 = deg(s0), a1 = deg(s1);
      add(ringSlab(t.rIn, t.rOut, t.y, a0, a1, mats.stoneDark), false, true);
      add(arcWall(t.rIn, 0.7, a0, a1, mats.stone(Math.round((s1 - s0) / 16), 0.4), t.y - 0.7));
      add(torusArc(t.rIn - 0.05, 0.06, a0, a1, mats.copper, t.y + 0.95));
      add(torusArc(t.rIn - 0.05, 0.05, a0, a1, mats.copper, t.y + 0.5));
    }
    // brackets
    const br = [];
    for (let a = 90 + 36; a < 90 + 324; a += 9) if (!southGap(a)) br.push(a);
    const bi = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.8, 1.4), mats.stoneDark, br.length);
    const o = new THREE.Object3D();
    br.forEach((a, i) => {
      const p = deg(a); o.position.set(Math.cos(p) * (t.rIn + 0.6), t.y - 1.4, -Math.sin(p) * (t.rIn + 0.6));
      o.rotation.set(0, p, 0); o.updateMatrix(); bi.setMatrixAt(i, o.matrix);
    });
    add(bi);
    for (let a = 90 + 38; a <= 90 + 322; a += t.step) if (!southGap(a)) facePos.push({ p: deg(a), r: t.faceR, y: t.y + 0.25, s: 0.35 + (t.y > 20 ? 0.12 : 0) });
  }
  {
    const fm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 20, 14), mats.ceramic, facePos.length);
    const o = new THREE.Object3D();
    facePos.forEach((f, i) => {
      o.position.set(Math.cos(f.p) * f.r, f.y, -Math.sin(f.p) * f.r);
      o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0);
      o.lookAt(0, f.y - 2, 0);
      o.scale.set(f.s, f.s * 1.3, f.s * 0.7);
      o.updateMatrix(); fm.setMatrixAt(i, o.matrix);
    });
    add(fm);
  }

  // ----------------------------------------------------------------- organ pipe ranks (the hall)
  {
    const pipes = [];
    const ranks = [
      { r: 16.9, y0: 0, hmin: 8, hmax: 15, rmin: 0.2, rmax: 0.36, step: 2.3 },
      { r: 21.6, y0: 9.5, hmin: 9, hmax: 19, rmin: 0.28, rmax: 0.5, step: 3.0 },
      { r: 24.6, y0: 18.5, hmin: 11, hmax: 24, rmin: 0.34, rmax: 0.62, step: 3.4 },
      { r: 28.0, y0: 22, hmin: 24, hmax: 46, rmin: 0.5, rmax: 0.9, step: 4.2 },
    ];
    const R = rng(11);
    const cols = [0x8a5532, 0x7b4a2c, 0x8f6a34, 0x6a4a2c, 0x9a6038];
    for (const k of ranks) {
      for (let a = 90 + 34; a < 90 + 326; a += k.step * (0.8 + R() * 0.4)) {
        const p = deg(a);
        const m = ((a % 360) + 360) % 360;
        if (k.r < 18 && (Math.abs(m - 180) < 13 || m < 13 || m > 347 || Math.abs(m - 270) < 11)) continue; // niches + gate
        if (k.r > 18 && m > 232 && m < 308) continue; // keep the camera's side open
        if (k.r < 18 && m > 246 && m < 294) continue;
        const wave = 0.5 + 0.5 * Math.sin(p * 5 + k.r);
        pipes.push({
          x: Math.cos(p) * (k.r + R() * 0.6), z: -Math.sin(p) * (k.r + R() * 0.6),
          r: k.rmin + (k.rmax - k.rmin) * R(), h: k.hmin + (k.hmax - k.hmin) * (0.35 * R() + 0.65 * wave),
          y0: k.y0, c: cols[(R() * cols.length) | 0],
        });
      }
    }
    add(pipeField(pipes, mats.copperInst));
  }

  // ----------------------------------------------------------------- boss alcove: dais, organ façade, shroud body
  {
    const dais = box(26, 0.7, 14, mats.stoneDark, 0, -0.05, -23.5); add(dais);
    for (const sx of [-1, 1]) add(box(1.4, 16, 16, mats.stone(4, 4), sx * 13.2, 8, -23.5), true);
    const pipes = [];
    const R = rng(23);
    for (let i = -14; i <= 14; i++) {
      const x = i * 0.72, f = 1 - Math.abs(i) / 15;
      pipes.push({ x, z: -27.5 - Math.abs(i) * 0.12, r: 0.25 + f * 0.35, h: 14 + f * 22 + R() * 3, y0: 0.3, c: 0x8f6a34, fx: x, fz: 0 });
      if (i % 2 === 0) pipes.push({ x: x + 0.36, z: -29.6, r: 0.22 + f * 0.25, h: 10 + f * 16, y0: 0.3, c: 0x7b4a2c, fx: x, fz: 0 });
    }
    add(pipeField(pipes, mats.copperInst));
    const prof = [[7.6, 0.3], [7.9, 2], [7.1, 4.6], [8.6, 7.4], [8.9, 9.6], [7.4, 12.6], [4.8, 15], [1.8, 16.6], [0.01, 17.1]].map(([r, y]) => new THREE.Vector2(r, y));
    const shroud = new THREE.Mesh(new THREE.LatheGeometry(prof, 40, -Math.PI / 2 - 0.15, Math.PI + 0.3), mats.bronzeDark);
    shroud.position.set(0, 0, -23.5);
    add(shroud, true);
    for (const [y, r] of [[2.2, 7.9], [4.6, 7.15], [7.4, 8.65], [12.6, 7.45]]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(r + 0.05, 0.12, 6, 40, Math.PI + 0.3), mats.copper);
      t.rotation.x = -Math.PI / 2; t.rotation.z = -0.15; t.position.set(0, y, -23.5); add(t);
    }
    // ribs
    for (let k = -4; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2 - 0.1);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.25, 15, 0.35), mats.copper);
      rib.position.set(Math.sin(a) * 8.4, 8, -23.5 + Math.cos(a) * 8.4); rib.rotation.y = a; add(rib);
    }
  }

  // faces + nodes + connecting pipes
  W.faces = []; W.nodes = [];
  {
    const trumpet = new THREE.LatheGeometry([[0.001, 0], [0.62, 0], [0.66, 0.18], [0.36, 0.5], [0.3, 0.9], [0.42, 1.2], [0.82, 1.52], [0.94, 1.6], [0.88, 1.66], [0.6, 1.5]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    for (let i = 0; i < 3; i++) {
      const f = makeFace(mats, FACE_R[i], VOICE_COL[i]);
      f.group.position.copy(FACE_POS[i]);
      f.group.lookAt(NODE_POS[i].x * 0.4, 0, 6);
      add(f.group, true);
      const light = new THREE.PointLight(VOICE_COL[i].getHex(), 0, 26, 2);
      light.position.copy(FACE_POS[i]).add(new THREE.Vector3(0, -2.6, 4.2));
      scene.add(light);
      const node = new THREE.Group();
      node.position.set(NODE_POS[i].x, 0, NODE_POS[i].y);
      const horn = new THREE.Mesh(trumpet, mats.copper); horn.castShadow = true; node.add(horn);
      const rimMat = new THREE.MeshBasicMaterial({ color: VOICE_COL[i].clone().multiplyScalar(2.4), transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false });
      const rimRing = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 8, 36), rimMat); rimRing.rotation.x = Math.PI / 2; rimRing.position.y = 1.64; node.add(rimRing);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 28), rimMat); disc.rotation.x = -Math.PI / 2; disc.position.y = 1.5; node.add(disc);
      const halo = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 40), rimMat); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.03; node.add(halo);
      add(node, true);
      const top = new THREE.Vector3(NODE_POS[i].x, 1.55, NODE_POS[i].y - 0.65);
      const chin = FACE_POS[i].clone().add(new THREE.Vector3(0, -FACE_R[i] * 1.15, -0.2));
      const mid = top.clone().lerp(chin, 0.5).add(new THREE.Vector3(0, -1.5, -1.2));
      add(cylBetween(top, mid, 0.18, mats.copper)); add(cylBetween(mid, chin, 0.18, mats.copper));
      W.faces.push({ ...f, light, base: f.group.position.clone(), baseQ: f.group.quaternion.clone() });
      W.nodes.push({ group: node, rimMat, horn });
    }
  }

  // hands
  W.hands = [];
  for (const sx of [-1, 1]) {
    const h = makeHand(mats, 1.2);
    const ph = deg(sx < 0 ? 132.4 : 47.6);
    h.group.position.set(Math.cos(ph) * 16.05, 3.62, -Math.sin(ph) * 16.05);
    h.group.rotation.y = Math.atan2(-h.group.position.x, -h.group.position.z);
    h.setCurl(0.95);
    add(h.group, true);
    W.hands.push({ ...h, restP: h.group.position.clone(), restQ: h.group.quaternion.clone() });
  }

  // ----------------------------------------------------------------- south gate, corridor, checkpoint
  const makeBars = (w, h) => {
    const g = new THREE.Group();
    const n = Math.round(w / 0.36);
    for (let i = 0; i <= n; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 8), mats.iron);
      b.position.set(-w / 2 + (i / n) * w, h / 2, 0); b.castShadow = true; g.add(b);
    }
    for (const y of [0.6, h * 0.55, h - 0.2]) g.add(box(w + 0.1, 0.12, 0.14, mats.copper, 0, y, 0));
    return g;
  };
  // arena gate (z 15.6)
  W.arenaGate = makeBars(4.1, 4.2); W.arenaGate.position.set(0, 0, 15.75); add(W.arenaGate);
  add(fade(box(0.8, 5.4, 1.2, mats.stone(1, 2), -2.5, 2.7, 15.8)), true);
  add(fade(box(0.8, 5.4, 1.2, mats.stone(1, 2), 2.5, 2.7, 15.8)), true);
  add(fade(box(5.8, 0.9, 1.3, mats.stoneDark, 0, 5.6, 15.8)), true);
  add(box(5.9, 0.12, 1.4, mats.copper, 0, 5.1, 15.8));
  // corridor
  const corrFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.8), mats.tile(2, 2.2));
  corrFloor.rotation.x = -Math.PI / 2; corrFloor.position.set(0, 0.005, 17.9); corrFloor.receiveShadow = true; add(corrFloor);
  for (const sx of [-1, 1]) add(fade(box(0.5, 5, 4.6, mats.stone(2, 2), sx * 2.35, 2.5, 17.9)), true);
  // checkpoint lantern
  {
    const g = new THREE.Group(); g.position.set(1.85, 0, 17.9);
    g.add(box(0.2, 1.7, 0.2, mats.iron, 0, 0.85, 0));
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.45, 8, 1, true), mats.copper); cage.position.y = 1.95; g.add(cage);
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.22, 0.2) });
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), flameMat); flame.position.y = 1.95; g.add(flame);
    const pl = new THREE.PointLight(0xffb060, 0, 9, 2); pl.position.y = 2.1; g.add(pl);
    add(g, true);
    W.checkpoint = { group: g, flameMat, light: pl, on: false };
  }
  // the small mask above the arena gate (training emitter)
  {
    const f = makeFace(mats, 0.4, VOICE_COL[0]);
    f.group.position.set(0, 4.55, 15.25); f.group.rotation.y = 0;
    add(f.group);
    W.gateMask = f;
  }

  // ----------------------------------------------------------------- antechamber
  {
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(20, 14.2), mats.tile(8, 6));
    fl.rotation.x = -Math.PI / 2; fl.position.set(0, 0.004, 27.1); fl.receiveShadow = true; add(fl);
    const wallM = mats.stone(3, 1.4);
    add(fade(box(7.7, 6.6, 0.5, wallM, -6.0, 3.3, 20.0)), true);
    add(fade(box(7.7, 6.6, 0.5, wallM, 6.0, 3.3, 20.0)), true);
    add(fade(box(4.4, 2.0, 0.5, wallM, 0, 5.6, 20.0)), true);
    add(fade(box(7.4, 6.6, 0.5, wallM, -6.1, 3.3, 34.1)), true);
    add(fade(box(7.4, 6.6, 0.5, wallM, 6.1, 3.3, 34.1)), true);
    add(fade(box(0.5, 6.6, 14.6, mats.stone(4, 1.4), -10.0, 3.3, 27.1)), true);
    add(fade(box(0.5, 6.6, 14.6, mats.stone(4, 1.4), 10.0, 3.3, 27.1)), true);
    // central partition with copper grille on top
    add(fade(box(11, 3.4, 1.4, mats.stone(3, 1), 0, 1.7, 27.7)), true);
    add(box(11.2, 0.18, 1.6, mats.copper, 0, 3.45, 27.7));
    for (let i = 0; i < 22; i++) add(box(0.06, 1.5, 0.06, mats.copper, -5.25 + i * 0.5, 4.2, 27.7));
    add(box(11.2, 0.12, 0.12, mats.copper, 0, 4.95, 27.7));
    // wall pipes (small façade on the north wall)
    const pipes = [];
    for (let i = 0; i < 26; i++) {
      const x = -9.4 + i * 0.75; if (Math.abs(x) < 2.6) continue;
      pipes.push({ x, z: 20.55, r: 0.13 + (i % 3) * 0.03, h: 3.5 + Math.abs(Math.sin(i * 1.7)) * 2.6, y0: 0, c: 0x7b4a2c, fx: x, fz: 30 });
    }
    for (let i = 0; i < 14; i++) {
      const z = 21 + i * 0.9;
      pipes.push({ x: -9.55, z, r: 0.14, h: 3 + Math.abs(Math.sin(i * 2.1)) * 3, y0: 0, c: 0x8a5532, fx: 0, fz: z });
      pipes.push({ x: 9.55, z, r: 0.14, h: 3 + Math.abs(Math.cos(i * 1.3)) * 3, y0: 0, c: 0x8a5532, fx: 0, fz: z });
    }
    add(pipeField(pipes, mats.copperInst, { collars: false }));
    // wall lamps
    for (const [x, z] of [[-9.5, 31], [9.5, 23.5]]) {
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.6) }));
      lm.position.set(x * 0.98, 3.2, z); add(lm);
      const pl = new THREE.PointLight(0xffa04a, 12, 10, 2); pl.position.set(x * 0.92, 3.2, z); scene.add(pl);
    }
    // puzzle gate (z 20)
    W.puzzleGate = makeBars(4.1, 4.4); W.puzzleGate.position.set(0, 0, 20.0); add(W.puzzleGate);
    // source face above the gate
    const f = makeFace(mats, 0.8, VOICE_COL[2]);
    f.group.position.copy(SOURCE_POS); add(f.group);
    const sym = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.symbols[0], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sym.position.set(0, 6.25, 20.6); sym.scale.set(1.1, 1.1, 1); add(sym);
    W.source = { ...f, sym };
    // puzzle console
    const g = new THREE.Group(); g.position.set(CONSOLE_POS.x, 0, CONSOLE_POS.y);
    g.add(box(1.4, 0.7, 1.0, mats.stoneDark, 0, 0.35, 0));
    const lens = [2.0, 1.45, 0.95];
    const tubes = [];
    lens.forEach((L, i) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, L, 12), mats.brass);
      t.position.set(-0.4 + i * 0.4, 0.7 + L / 2, 0); g.add(t);
      for (let k = 0; k <= i; k++) {
        const b = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), mats.copper);
        b.rotation.x = Math.PI / 2; b.position.set(-0.4 + i * 0.4, 0.95 + k * 0.12, 0); g.add(b);
      }
      tubes.push(t);
    });
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.8, 1.7), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.15, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
    add(g, true);
    W.console = { group: g, tubes, ringMat };
  }

  // ----------------------------------------------------------------- bridge
  {
    const slab = box(4.8, 0.8, 15.2, mats.stoneDark, 0, -0.4, 41.2); slab.receiveShadow = true; add(slab);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 15.0), mats.tile(2, 6));
    top.rotation.x = -Math.PI / 2; top.position.set(0, 0.003, 41.2); top.receiveShadow = true; add(top);
    const plat = box(8, 0.8, 4, mats.stoneDark, 0, -0.4, 48.6); add(plat);
    const ptop = new THREE.Mesh(new THREE.PlaneGeometry(7.8, 3.8), mats.tile(3, 1.5));
    ptop.rotation.x = -Math.PI / 2; ptop.position.set(0, 0.004, 48.6); ptop.receiveShadow = true; add(ptop);
    // arches underneath
    for (const z of [36.5, 41.5, 46.5]) {
      const a = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.35, 6, 18, Math.PI), mats.stoneDark);
      a.rotation.set(Math.PI, Math.PI / 2, 0); a.position.set(0, -0.6, z); add(a);
      add(box(1.2, 14, 1.2, mats.stoneDark, 0, -8, z));
    }
    // railing posts, some missing
    for (let z = 34.6; z < 48; z += 1.6) {
      for (const sx of [-1, 1]) {
        if ((Math.round(z * 7) + sx * 3) % 5 === 0) continue;
        add(box(0.16, 1.1, 0.16, mats.iron, sx * 2.3, 0.55, z), true);
      }
    }
    add(cylBetween(new THREE.Vector3(-2.3, 1.05, 34.6), new THREE.Vector3(-2.3, 1.05, 40.8), 0.04, mats.copper));
    add(cylBetween(new THREE.Vector3(2.3, 1.05, 37.8), new THREE.Vector3(2.3, 0.6, 46.8), 0.04, mats.copper));
    // lanterns on the railing
    for (const [x, z] of [[-2.3, 44.2], [2.3, 37.4]]) {
      add(box(0.12, 1.6, 0.12, mats.iron, x, 0.8, z));
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.6, 0.55) }));
      lm.position.set(x, 1.7, z); add(lm);
      const pl = new THREE.PointLight(0xffa04a, 9, 9, 2); pl.position.set(x * 0.85, 1.9, z); scene.add(pl);
    }
    // dead pipes lying around
    const deadMat = mats.bronzeDark;
    add(cylBetween(new THREE.Vector3(3.2, -0.3, 43), new THREE.Vector3(7.5, -4.5, 38.5), 0.55, deadMat, 16), true);
    add(cylBetween(new THREE.Vector3(-2.9, 0.2, 47.5), new THREE.Vector3(-8.5, -2.5, 52), 0.42, deadMat, 16), true);
    add(cylBetween(new THREE.Vector3(-3.6, 0.3, 49.5), new THREE.Vector3(3.6, 0.25, 50.2), 0.35, deadMat, 16), true);
    // barricade of fallen pipes (breakable)
    const bar = new THREE.Group();
    const parts = [];
    [[-2.6, 0.42, 38.7, 2.8, 0.75, 39.6, 0.4], [-2.8, 0.85, 39.6, 2.5, 0.4, 38.9, 0.34], [-1.2, 1.25, 39.0, 2.0, 1.15, 39.5, 0.26]].forEach(([x1, y1, z1, x2, y2, z2, r]) => {
      const m = cylBetween(new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2), r, mats.copper, 14);
      m.castShadow = true; bar.add(m); parts.push(m);
    });
    add(bar, true);
    W.barricade = { group: bar, parts, hp: 3, broken: false };
    // distant giant pipes flanking the bridge (parallax layer)
    const R = rng(5);
    const pipes = [];
    for (let i = 0; i < 46; i++) {
      const sx = i % 2 ? 1 : -1;
      pipes.push({ x: sx * (9.5 + R() * 16), z: 37 + R() * 42, r: 0.6 + R() * 1.1, h: 40 + R() * 40, y0: -32, c: [0x6a4a2c, 0x7b4a2c, 0x5a3a24][(R() * 3) | 0], fx: 0, fz: 40 });
    }
    add(pipeField(pipes, mats.copperInst));
  }

  // ----------------------------------------------------------------- chandeliers (mid-air layer)
  W.chandeliers = [];
  for (const [x, y, z, s] of [[-11, 16.5, 7, 1], [10.5, 20.5, -1.5, 1.2], [2, 31, -12, 1.6], [-5, 9.5, 30.5, 0.6]]) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.12, 8, 40), mats.copper); ring.rotation.x = Math.PI / 2; g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.08, 8, 30), mats.brass); ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.6; g.add(ring2);
    const bulb = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.6) });
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * TAU;
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.55, 12, 1, true), mats.ceramicPlain);
      bell.position.set(Math.cos(a) * 2.4, -0.45, Math.sin(a) * 2.4); g.add(bell);
      if (k % 2 === 0) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulb); b.position.set(Math.cos(a) * 2.4, -0.75, Math.sin(a) * 2.4); g.add(b); }
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU;
      g.add(cylBetween(new THREE.Vector3(Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4), new THREE.Vector3(0, 4, 0), 0.03, mats.chain, 5));
    }
    g.add(cylBetween(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, 60, 0), 0.05, mats.chain, 5));
    if (W.chandeliers.length < 2) { const pl = new THREE.PointLight(0xffa860, 16 * s, 18 * s, 2); pl.position.y = -0.8; g.add(pl); }
    add(g);
    W.chandeliers.push({ g, base: g.position.clone(), ph: Math.random() * 10 });
  }
  // foreground chains framing the camera (closest layer)
  {
    const R = rng(3);
    for (let i = 0; i < 9; i++) {
      const sx = i % 2 ? 1 : -1;
      const x = sx * (8 + R() * 8), z = 19 + R() * 9, yb = 13 + R() * 9;
      add(cylBetween(new THREE.Vector3(x, yb, z), new THREE.Vector3(x, 70, z), 0.05, mats.chain, 5));
      const w = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 10), mats.bronzeDark); w.position.set(x, yb - 0.4, z); w.rotation.x = Math.PI; add(w);
    }
  }

  // ----------------------------------------------------------------- light shafts + dust
  {
    const shaftMat = new THREE.MeshBasicMaterial({ map: tex.shaft, color: new THREE.Color(1.0, 0.85, 0.62), transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    for (const [x, z, r, tilt] of [[-3, -1, 4.2, 0.08], [6, 4, 3.2, -0.06], [-9, -20, 4, 0.04], [0, 28, 3.6, 0.05]]) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r, 56, 24, 1, true), shaftMat);
      m.position.set(x + tilt * 28, 28, z); m.rotation.z = tilt; add(m, false, false);
    }
  }
  {
    const n = mobile ? 700 : 1500;
    const pos = new Float32Array(n * 3);
    const R = rng(9);
    for (let i = 0; i < n; i++) {
      const inAnte = i % 4 === 0;
      if (inAnte) { pos[i * 3] = (R() - 0.5) * 20; pos[i * 3 + 1] = R() * 7; pos[i * 3 + 2] = 20 + R() * 28; }
      else { const a = R() * TAU, r = Math.sqrt(R()) * 22; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = R() * 24; pos[i * 3 + 2] = Math.sin(a) * r; }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ map: tex.dot, color: new THREE.Color(1.0, 0.82, 0.6), size: 0.11, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    add(pts, false, false);
    W.dust = pts;
  }

  // ----------------------------------------------------------------- collision model
  W.walk = [
    { t: 'c', x: 0, z: 0, r: 14.85 },
    { t: 'r', x0: -18.6, x1: -14.0, z0: -2.6, z1: 2.6 },
    { t: 'r', x0: 14.0, x1: 18.6, z0: -2.6, z1: 2.6 },
    { t: 'r', x0: -1.8, x1: 1.8, z0: 14.0, z1: 20.8 },
    { t: 'r', x0: -9.45, x1: 9.45, z0: 20.55, z1: 33.6 },
    { t: 'r', x0: -1.9, x1: 1.9, z0: 33.0, z1: 46.6 },
    { t: 'r', x0: -3.6, x1: 3.6, z0: 46.6, z1: 50.2 },
  ];
  W.state = { puzzleGateOpen: false, arenaGateOpen: false, barricade: true };
  W.obst = [
    ...COLUMNS.map((c) => ({ t: 'c', x: c.x, z: c.y, r: 1.05 })),
    ...NODE_POS.map((n) => ({ t: 'c', x: n.x, z: n.y, r: 1.25 })),
    { t: 'c', x: RESONATOR_POS.x, z: RESONATOR_POS.y, r: 1.15 },
    { t: 'c', x: CONSOLE_POS.x, z: CONSOLE_POS.y, r: 1.0 },
    { t: 'r', x0: -5.8, x1: 5.8, z0: 26.7, z1: 28.7 },
    { t: 'r', x0: -2.2, x1: 2.2, z0: 19.6, z1: 20.7, on: () => !W.state.puzzleGateOpen },
    { t: 'r', x0: -2.2, x1: 2.2, z0: 15.3, z1: 16.3, on: () => !W.state.arenaGateOpen },
    { t: 'r', x0: -2.4, x1: 2.4, z0: 38.5, z1: 40.0, on: () => W.state.barricade },
  ];

  const inShape = (s, x, z) => s.t === 'c' ? (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r : x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  W.walkable = (x, z) => {
    if (!W.walk.some((s) => inShape(s, x, z))) return false;
    for (const o of W.obst) { if (o.on && !o.on()) continue; if (inShape(o, x, z)) return false; }
    return true;
  };
  // move with sliding; circles push out
  W.move = (p, dx, dz) => {
    let nx = p.x + dx, nz = p.y + dz;
    for (const o of W.obst) {
      if (o.t !== 'c' || (o.on && !o.on())) continue;
      const ox = nx - o.x, oz = nz - o.z, d2 = ox * ox + oz * oz;
      if (d2 < o.r * o.r && d2 > 1e-6) { const d = Math.sqrt(d2); nx = o.x + (ox / d) * o.r; nz = o.z + (oz / d) * o.r; }
    }
    if (W.walkable(nx, nz)) { p.set(nx, nz); return; }
    if (W.walkable(p.x + dx, p.y)) { p.x += dx; return; }
    if (W.walkable(p.x, p.y + dz)) { p.y += dz; return; }
    // slide along the arena circle wall
    const r = Math.hypot(nx, nz);
    if (r > 14.85 && nz < 14 && W.walkable((nx / r) * 14.84, (nz / r) * 14.84)) p.set((nx / r) * 14.84, (nz / r) * 14.84);
  };

  // ----------------------------------------------------------------- per-frame ambient animation
  W.update = (t, dt) => {
    for (const c of W.chandeliers) {
      c.g.rotation.y = t * 0.05 + c.ph;
      c.g.position.x = c.base.x + Math.sin(t * 0.3 + c.ph) * 0.25;
      c.g.rotation.z = Math.sin(t * 0.4 + c.ph) * 0.02;
    }
    const p = W.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i += 1) {
      let y = p.array[i * 3 + 1] + dt * (0.08 + (i % 7) * 0.02);
      if (y > 24) y = 0;
      p.array[i * 3 + 1] = y;
      p.array[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.05;
    }
    p.needsUpdate = true;
  };
  return W;
}
