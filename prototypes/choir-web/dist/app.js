// Хор порожніх машин · вебпрототип 0.8 · рендер, ввід, звук
// Симуляція — game.js. Тут лише подання: піднята фіксована камера 3/4 над платформами L01.
import { Game, M, SHAPES, SHAPE, GATES, ARENA, MASKS, MASK_NAMES, PZ01, PZ09, STATION, PALM, dist, angleTo, clamp } from './game.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const game = new Game();

// ——— Палітра v0.8: мінеральна кераміка, блакитна відстань, графіт, теплий функціональний акцент ———
const C = {
  skyTop: '#b9c6cd', skyMid: '#d3dbde', skyLow: '#e4e6e2',
  farMass: '#c4ced3', midMass: '#adbac1', nearMass: '#97a5ad',
  top: '#e9e5dc', topLine: 'rgba(80,88,92,.16)', face: '#c9c5bc', faceDark: '#a8a8a3', rail: '#d7d2c8', railDark: '#8f938f',
  graphite: '#2b3236', graphiteSoft: '#4a5358', ceramic: '#efebe3', ceramicShade: '#cfc9bd',
  teal: '#4fc8bd', tealSoft: 'rgba(79,200,189,.35)', amber: '#eba24a', amberHot: '#ffd28a', copper: '#b8834f', danger: '#c4573f',
};
const K = 0.62;   // перспективне скорочення площини
const ZF = 0.9;   // висота в екранних метрах
const YAW = -0.32; // невеликий поворот камери: видно південну й західну грані, ворота не стоять ребром
const CY = Math.cos(YAW), SY = Math.sin(YAW);
const rotX = (dx, dy) => dx * CY - dy * SY;
const rotY = (dx, dy) => dx * SY + dy * CY;
const depth = p => rotY(p.x, p.y);

let W = 0, H = 0, DPR = 1, s = 40;
const cam = { x: 0, y: 1, z: 0, s: 40 };
let started = false, paused = false, muted = false, last = 0, shake = 0, hurtFlash = 0;
const keys = new Set();
const stick = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
let isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);
resize();

// ——— Проєкція ———
function P(x, y, z = 0) {
  const dx = x - cam.x, dy = y - cam.y;
  return { x: W / 2 + rotX(dx, dy) * cam.s, y: H * 0.54 + (rotY(dx, dy) * K - (z - cam.z) * ZF) * cam.s };
}
// екранний напрямок світового кута (для поз і силуетів)
const screenDir = a => ({ x: rotX(Math.cos(a), Math.sin(a)), y: rotY(Math.cos(a), Math.sin(a)) * K });
const zAt = p => game.zAt(p);
function floorPoly(pts, z) { ctx.beginPath(); pts.forEach((pt, i) => { const q = P(pt.x, pt.y, z); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }); ctx.closePath(); }
function floorEllipse(x, y, r, z) { const c = P(x, y, z); ctx.beginPath(); ctx.ellipse(c.x, c.y, Math.max(0.1, r * cam.s), Math.max(0.1, r * cam.s * K), 0, 0, Math.PI * 2); }
function floorArc(x, y, r, z, a0, a1) { ctx.beginPath(); const n = Math.max(6, Math.ceil(Math.abs(a1 - a0) * 18)); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const q = P(x + Math.cos(a) * r, y + Math.sin(a) * r, z); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); } }
function sector(x, y, z, r, a, half) { const c = P(x, y, z); ctx.beginPath(); ctx.moveTo(c.x, c.y); const n = 20; for (let i = 0; i <= n; i++) { const t = a - half + 2 * half * i / n; const q = P(x + Math.cos(t) * r, y + Math.sin(t) * r, z); ctx.lineTo(q.x, q.y); } ctx.closePath(); }
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// Детерміновані фонові маси
function seeded(n) { let x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
const FAR = Array.from({ length: 22 }, (_, i) => ({ x: (i - 11) * 9 + seeded(i) * 6, w: 3 + seeded(i + 40) * 6, top: seeded(i + 80), cap: seeded(i + 9) > 0.55 }));
const MID = Array.from({ length: 16 }, (_, i) => ({ x: (i - 8) * 14 + seeded(i + 200) * 8, w: 5 + seeded(i + 240) * 7, top: seeded(i + 280), arch: seeded(i + 300) > 0.6 }));
const WINDOWS = [{ x: -32, y: .30 }, { x: -29.5, y: .36 }, { x: 46, y: .28 }, { x: 49, y: .33 }, { x: 52, y: .27 }, { x: 70, y: .40 }];

// ——— Фон: зал без видимого краю ———
function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.skyTop); g.addColorStop(0.45, C.skyMid); g.addColorStop(1, C.skyLow);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const u = cam.s / 40;
  // три далекі маски — орієнтир усього рівня
  {
    const f = 0.06, cx = W / 2 + (3 - cam.x) * cam.s * f, cy = H * 0.2 + (-cam.y) * cam.s * 0.025 + cam.z * cam.s * 0.05;
    const sz = Math.min(W, H) * 0.16;
    ctx.save(); ctx.globalAlpha = 0.33;
    ctx.fillStyle = '#a9b6bd';
    ctx.fillRect(cx - sz * 2.3, cy - sz * 1.6, sz * 4.6, sz * 6);
    [-1, 0, 1].forEach(k => { const mx = cx + k * sz * 1.25, my = cy + (k ? sz * 0.15 : 0), r = k ? sz * 0.48 : sz * 0.6; drawMaskShape(mx, my, r, '#d4dadb', '#9aa7ae', 0, 0, true); });
    ctx.restore();
  }
  // дальні пілони
  for (const m of FAR) {
    const x = W / 2 + (m.x - cam.x * 0.18) * u * 6, w = m.w * u * 6;
    if (x + w < -40 || x - w > W + 40) continue;
    const top = H * (0.02 + m.top * 0.22) + cam.z * u * 3;
    const gg = ctx.createLinearGradient(0, top, 0, H); gg.addColorStop(0, rgba(C.farMass, 0.85)); gg.addColorStop(1, rgba(C.skyLow, 0.2));
    ctx.fillStyle = gg; ctx.fillRect(x - w / 2, top, w, H - top);
    if (m.cap) { ctx.fillStyle = rgba('#b3bfc5', 0.7); ctx.fillRect(x - w * 0.7, top + w * 0.6, w * 1.4, w * 0.18); }
  }
  // житлові вікна — далекий покажчик, що згасає після боса
  WINDOWS.forEach((wnd, i) => {
    const x = W / 2 + (wnd.x - cam.x * 0.18) * u * 6, y = H * wnd.y + cam.z * u * 3;
    const lit = game.windows[i];
    ctx.fillStyle = rgba('#a9b5bb', 0.9); ctx.fillRect(x - 7 * u, y - 10 * u, 14 * u, 20 * u);
    if (lit > 0.02) {
      ctx.save(); ctx.globalAlpha = lit; ctx.shadowColor = C.amber; ctx.shadowBlur = 14 * u;
      ctx.fillStyle = C.amberHot; ctx.fillRect(x - 3 * u, y - 5 * u, 6 * u, 9 * u); ctx.restore();
    }
  });
  // середні маси з арками
  for (const m of MID) {
    const x = W / 2 + (m.x - cam.x * 0.4) * u * 3.4 , w = m.w * u * 3.4;
    if (x + w < -60 || x - w > W + 60) continue;
    const top = H * (0.08 + m.top * 0.3) - (cam.y * 0.4) * u * 0.6 % 1 + cam.z * u * 6;
    const gg = ctx.createLinearGradient(0, top, 0, H); gg.addColorStop(0, rgba(C.midMass, 0.75)); gg.addColorStop(0.7, rgba(C.skyMid, 0.25)); gg.addColorStop(1, rgba(C.skyLow, 0));
    ctx.fillStyle = gg; ctx.fillRect(x - w / 2, top, w, H - top);
    if (m.arch) { ctx.fillStyle = rgba(C.skyMid, 0.55); const aw = w * 0.5, ay = top + w * 1.3; ctx.beginPath(); ctx.moveTo(x - aw / 2, H); ctx.lineTo(x - aw / 2, ay); ctx.arc(x, ay, aw / 2, Math.PI, 0); ctx.lineTo(x + aw / 2, H); ctx.fill(); }
  }
  // рідкісні промені світла
  if (!reduced) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + i * 0.33) + Math.sin(t * 0.05 + i) * 20 - cam.x * u * 0.6 % (W * 0.33);
      const gg = ctx.createLinearGradient(x, 0, x + W * 0.18, H); gg.addColorStop(0, 'rgba(255,250,235,.16)'); gg.addColorStop(1, 'rgba(255,250,235,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + W * 0.06, 0); ctx.lineTo(x + W * 0.3, H); ctx.lineTo(x + W * 0.16, H); ctx.fill();
    }
    ctx.restore();
  }
}

// ——— Платформи з кітбашу: плита, міст, сходи, кругла арена ———
function slabDepth(sh) {
  if (sh.type === 'circle') return rotY(sh.x, sh.y) + sh.r;
  const d = Math.max(rotY(sh.x1, sh.y1), rotY(sh.x2, sh.y1), rotY(sh.x1, sh.y2), rotY(sh.x2, sh.y2));
  return d - (sh.bridge && !sh.stairs ? 2 : 0) + (sh.stairs ? 0.5 : 0);
}
function drawPillars() {
  for (const sh of SHAPES) {
    if (sh.bridge) continue;
    const z = sh.z;
    const cx = sh.type === 'circle' ? sh.x : (sh.x1 + sh.x2) / 2;
    const cy = sh.type === 'circle' ? sh.y : (sh.y1 + sh.y2) / 2;
    const w = (sh.type === 'circle' ? sh.r * 0.55 : Math.min(sh.x2 - sh.x1, sh.y2 - sh.y1) * 0.36) * cam.s;
    const a = P(cx, cy + (sh.type === 'circle' ? sh.r * 0.3 : (sh.y2 - sh.y1) * 0.2), z - 1.2);
    const g = ctx.createLinearGradient(0, a.y, 0, a.y + H * 0.7);
    g.addColorStop(0, '#b6b5ae'); g.addColorStop(0.5, rgba('#aab4b8', 0.6)); g.addColorStop(1, rgba(C.skyLow, 0));
    ctx.fillStyle = g; ctx.fillRect(a.x - w / 2, a.y, w, H);
    ctx.fillStyle = 'rgba(40,50,56,.12)'; ctx.fillRect(a.x + w * 0.2, a.y, w * 0.3, H);
  }
}
function drawSlab(sh) {
  const z = sh.z, th = sh.bridge ? 0.7 : 1.2;
  if (sh.gate && !game.gateOpen(sh.gate) && game.gateT[sh.gate] < 0.02) ctx.globalAlpha = 1;
  if (sh.type === 'circle') {
    const c = P(sh.x, sh.y, z), rx = sh.r * cam.s, ry = sh.r * cam.s * K, d = th * ZF * cam.s;
    const g = ctx.createLinearGradient(0, c.y, 0, c.y + ry + d);
    g.addColorStop(0, C.face); g.addColorStop(1, C.faceDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(c.x, c.y + d, rx, ry, 0, 0, Math.PI); ctx.lineTo(c.x - rx, c.y); ctx.ellipse(c.x, c.y, rx, ry, 0, Math.PI, 0, true); ctx.fill();
    // радіальні панелі під кітбаш (шви тихі, не схожі на телеграф)
    ctx.fillStyle = C.top; floorEllipse(sh.x, sh.y, sh.r, z); ctx.fill();
    ctx.strokeStyle = C.topLine; ctx.lineWidth = 1;
    [sh.r * 0.33, sh.r * 0.66].forEach(r => { floorEllipse(sh.x, sh.y, r, z); ctx.stroke(); });
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; const p0 = P(sh.x + Math.cos(a) * sh.r * 0.33, sh.y + Math.sin(a) * sh.r * 0.33, z), p1 = P(sh.x + Math.cos(a) * sh.r, sh.y + Math.sin(a) * sh.r, z); ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); }
    // бортик по колу, крім входу з півдня
    ctx.strokeStyle = C.railDark; ctx.lineWidth = Math.max(2, cam.s * 0.12);
    floorArc(sh.x, sh.y, sh.r - 0.05, z, Math.PI / 2 + 0.2, Math.PI * 2.5 - 0.2); ctx.stroke();
    ctx.strokeStyle = C.rail; ctx.lineWidth = Math.max(1, cam.s * 0.06);
    floorArc(sh.x, sh.y, sh.r - 0.05, z, Math.PI / 2 + 0.2, Math.PI * 2.5 - 0.2); ctx.stroke();
    return;
  }
  const { x1, x2, y1, y2 } = sh;
  const zTop = sh.stairs ? sh.zTop : z;
  // видимі бічні грані: південь і захід
  const sides = [
    { a: { x: x1, y: y2 }, b: { x: x2, y: y2 }, n: { x: 0, y: 1 }, tone: 0 },
    { a: { x: x1, y: y1 }, b: { x: x1, y: y2 }, n: { x: -1, y: 0 }, tone: 1 },
    { a: { x: x2, y: y1 }, b: { x: x2, y: y2 }, n: { x: 1, y: 0 }, tone: 1 },
    { a: { x: x1, y: y1 }, b: { x: x2, y: y1 }, n: { x: 0, y: -1 }, tone: 0 },
  ];
  for (const sd of sides) {
    if (rotY(sd.n.x, sd.n.y) <= 0.02) continue;
    const za = sh.stairs ? (sd.n.y > 0 ? z : null) : z;
    if (za === null) continue;
    const a = P(sd.a.x, sd.a.y, z), b = P(sd.b.x, sd.b.y, z), a2 = P(sd.a.x, sd.a.y, z - th), b2 = P(sd.b.x, sd.b.y, z - th);
    const g = ctx.createLinearGradient(0, Math.min(a.y, b.y), 0, Math.max(a2.y, b2.y));
    g.addColorStop(0, sd.tone ? '#bdb9b0' : C.face); g.addColorStop(1, sd.tone ? '#9c9d99' : C.faceDark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
    const m1 = P(sd.a.x, sd.a.y, z - th * 0.55), m2 = P(sd.b.x, sd.b.y, z - th * 0.55);
    ctx.strokeStyle = 'rgba(43,50,54,.2)'; ctx.lineWidth = Math.max(1, th * cam.s * 0.1); ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
  }
  if (sh.stairs) {
    // сходи P2 → P3: настил із підйомом, сходинки поперек
    const n = 14;
    for (let i = 0; i < n; i++) {
      const ya = y2 - (y2 - y1) * i / n, yb = y2 - (y2 - y1) * (i + 1) / n;
      const za = z + (zTop - z) * i / n, zb = z + (zTop - z) * (i + 1) / n;
      const a = P(x1, ya, za), b = P(x2, ya, za), c = P(x2, yb, zb), e = P(x1, yb, zb);
      ctx.fillStyle = i % 2 ? '#e2ddd3' : C.top;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x, b.y - (zb - za) * ZF * cam.s); ctx.lineTo(c.x, c.y); ctx.lineTo(e.x, e.y); ctx.lineTo(a.x, a.y - (zb - za) * ZF * cam.s); ctx.closePath(); ctx.fill();
    }
    // бічні бортики
    ctx.strokeStyle = C.railDark; ctx.lineWidth = Math.max(2, cam.s * 0.1);
    for (const x of [x1, x2]) { const a = P(x, y2, z), b = P(x, y1, zTop); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    return;
  }
  // верх
  floorPoly([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], z);
  ctx.fillStyle = C.top; ctx.fill();
  // плити 2×2 / 4×4 — тихі шви
  ctx.strokeStyle = C.topLine; ctx.lineWidth = 1; ctx.beginPath();
  const step = sh.bridge ? 4 : 4;
  for (let x = Math.ceil(x1 / step) * step; x < x2; x += step) { const a = P(x, y1, z), b = P(x, y2, z); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  if (!sh.bridge) for (let y = Math.ceil(y1 / step) * step; y < y2; y += step) { const a = P(x1, y, z), b = P(x2, y, z); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
  // широка локальна патина
  if (!sh.bridge) { const c = P((x1 + x2) / 2, (y1 + y2) / 2, z); const rg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, (x2 - x1) * cam.s * 0.6); rg.addColorStop(0, 'rgba(255,255,250,.35)'); rg.addColorStop(1, 'rgba(160,160,150,.08)'); ctx.fillStyle = rg; floorPoly([{ x: x1, y: y1 }, { x: x2, y: y1 }, { x: x2, y: y2 }, { x: x1, y: y2 }], z); ctx.fill(); }
  // однаковий бортик на всіх небезпечних краях
  drawRails(sh);
}
function drawRails(sh) {
  const { x1, x2, y1, y2, z } = sh, lw = Math.max(2, cam.s * 0.1), h = 0.35;
  const edges = sh.bridge
    ? (x2 - x1 > y2 - y1 ? [[x1, y1, x2, y1], [x1, y2, x2, y2]] : [[x1, y1, x1, y2], [x2, y1, x2, y2]])
    : [[x1, y1, x2, y1], [x2, y1, x2, y2], [x1, y2, x2, y2], [x1, y1, x1, y2]];
  for (const [ax, ay, bx, by] of edges) {
    // розриви там, де з’єднується міст
    const segs = cutOpenings(sh, ax, ay, bx, by);
    for (const [sx, sy, ex, ey] of segs) {
      const a = P(sx, sy, z), b = P(ex, ey, z), ah = P(sx, sy, z + h), bh = P(ex, ey, z + h);
      ctx.fillStyle = C.rail; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(bh.x, bh.y); ctx.lineTo(ah.x, ah.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.railDark; ctx.lineWidth = lw * 0.5; ctx.beginPath(); ctx.moveTo(ah.x, ah.y); ctx.lineTo(bh.x, bh.y); ctx.stroke();
    }
  }
}
function cutOpenings(sh, ax, ay, bx, by) {
  const cuts = [];
  for (const o of SHAPES) {
    if (o === sh || !(o.bridge || sh.bridge)) continue;
    if (o.type !== 'rect') { if (sh.bridge) continue; }
    if (o.type === 'circle') continue;
    if (ay === by) { // горизонтальний край
      if (o.y1 - 0.01 <= ay && o.y2 + 0.01 >= ay && o.x2 > Math.min(ax, bx) && o.x1 < Math.max(ax, bx)) cuts.push([Math.max(o.x1, Math.min(ax, bx)), Math.min(o.x2, Math.max(ax, bx))]);
    } else {
      if (o.x1 - 0.01 <= ax && o.x2 + 0.01 >= ax && o.y2 > Math.min(ay, by) && o.y1 < Math.max(ay, by)) cuts.push([Math.max(o.y1, Math.min(ay, by)), Math.min(o.y2, Math.max(ay, by))]);
    }
  }
  const horiz = ay === by, lo = horiz ? Math.min(ax, bx) : Math.min(ay, by), hi = horiz ? Math.max(ax, bx) : Math.max(ay, by);
  cuts.sort((a, b) => a[0] - b[0]);
  const out = []; let cur = lo;
  for (const [c0, c1] of cuts) { if (c0 > cur) out.push([cur, c0]); cur = Math.max(cur, c1); }
  if (cur < hi) out.push([cur, hi]);
  return out.filter(([a, b]) => b - a > 0.05).map(([a, b]) => horiz ? [a, ay, b, by] : [ax, a, bx, b]);
}

// ——— Ворота L01: рама, телескопічні стрижні, двері G06 ———
function drawGate(id) {
  const g = GATES[id], t = game.gateT[id], z = g.z;
  const half = g.w / 2 + 0.35, H2 = 3.1;
  const along = g.axis === 'x';
  const pA = along ? { x: g.x, y: g.y - half } : { x: g.x - half, y: g.y };
  const pB = along ? { x: g.x, y: g.y + half } : { x: g.x + half, y: g.y };
  const a0 = P(pA.x, pA.y, z), a1 = P(pA.x, pA.y, z + H2), b0 = P(pB.x, pB.y, z), b1 = P(pB.x, pB.y, z + H2);
  const lw = Math.max(3, cam.s * 0.22);
  ctx.lineCap = 'butt';
  if (g.doors) {
    // дві стулки на бічних шарнірах, розкриваються в бік післямови (+x)
    const th = t * Math.PI / 2 * 0.95, ux = pB.x - pA.x, uy = pB.y - pA.y, ul = Math.hypot(ux, uy);
    const nxv = along ? 1 : 0, nyv = along ? 0 : -1;
    for (const [hinge, sgn] of [[pA, 1], [pB, -1]]) {
      const len = half;
      const dx = ux / ul * sgn, dy = uy / ul * sgn;
      const tip = { x: hinge.x + (dx * Math.cos(th) + nxv * Math.sin(th)) * len, y: hinge.y + (dy * Math.cos(th) + nyv * Math.sin(th)) * len };
      const h0 = P(hinge.x, hinge.y, z), h1 = P(hinge.x, hinge.y, z + H2 * 0.92), t0 = P(tip.x, tip.y, z), t1 = P(tip.x, tip.y, z + H2 * 0.92);
      ctx.fillStyle = C.ceramicShade; ctx.strokeStyle = C.graphite; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(h0.x, h0.y); ctx.lineTo(t0.x, t0.y); ctx.lineTo(t1.x, t1.y); ctx.lineTo(h1.x, h1.y); ctx.closePath(); ctx.fill(); ctx.stroke();
      const m0 = P((hinge.x + tip.x) / 2, (hinge.y + tip.y) / 2, z + H2 * 0.5);
      ctx.strokeStyle = C.copper; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(m0.x, m0.y, cam.s * 0.25, 0, Math.PI * 2); ctx.stroke();
    }
  } else {
    // стрижні: втягуються у верхній приймач
    const n = Math.round(g.w / 0.42);
    for (let i = 1; i < n; i++) {
      const f = i / n, px = pA.x + (pB.x - pA.x) * f, py = pA.y + (pB.y - pA.y) * f;
      const bottom = z + t * (H2 - 0.35);
      if (bottom >= z + H2 - 0.36) continue;
      const q0 = P(px, py, bottom), q1 = P(px, py, z + H2 - 0.2);
      ctx.strokeStyle = C.graphiteSoft; ctx.lineWidth = Math.max(1.5, cam.s * 0.07);
      ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
      ctx.fillStyle = C.ceramicShade; ctx.beginPath(); ctx.arc(q0.x, q0.y, Math.max(1.5, cam.s * 0.05), 0, Math.PI * 2); ctx.fill();
    }
  }
  // рама
  ctx.strokeStyle = C.graphite; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(a0.x, a0.y); ctx.lineTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.lineTo(b0.x, b0.y); ctx.stroke();
  ctx.strokeStyle = C.ceramicShade; ctx.lineWidth = lw * 0.35;
  ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(b1.x, b1.y); ctx.stroke();
  // вставка стану в стійці: ромб = закрито, коло = відкрито
  const st = P(pA.x, pA.y, z + 1.5), open = game.gates[id] === 'open';
  ctx.fillStyle = open ? C.teal : C.amber; ctx.save(); ctx.translate(st.x, st.y);
  if (open) { ctx.beginPath(); ctx.arc(0, 0, cam.s * 0.13, 0, Math.PI * 2); ctx.fill(); } else { ctx.rotate(Math.PI / 4); ctx.fillRect(-cam.s * 0.11, -cam.s * 0.11, cam.s * 0.22, cam.s * 0.22); }
  ctx.restore();
}

// ——— Маска: спільна форма для фону та боса ———
function drawMaskShape(x, y, r, fill, line, glow, tilt = 0, flat = false) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath(); ctx.moveTo(0, -r * 1.25);
  ctx.bezierCurveTo(r * 0.95, -r * 1.2, r * 0.95, r * 0.35, r * 0.55, r * 0.95);
  ctx.quadraticCurveTo(0, r * 1.35, -r * 0.55, r * 0.95);
  ctx.bezierCurveTo(-r * 0.95, r * 0.35, -r * 0.95, -r * 1.2, 0, -r * 1.25);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (!flat) { const gg = ctx.createLinearGradient(-r, 0, r, 0); gg.addColorStop(0, 'rgba(255,255,255,.25)'); gg.addColorStop(0.6, 'rgba(0,0,0,0)'); gg.addColorStop(1, 'rgba(60,60,55,.25)'); ctx.fillStyle = gg; ctx.fill(); }
  ctx.strokeStyle = line; ctx.lineWidth = Math.max(1, r * 0.04); ctx.stroke();
  // закриті очі
  ctx.lineWidth = Math.max(1, r * 0.05); ctx.strokeStyle = line;
  for (const k of [-1, 1]) { ctx.beginPath(); ctx.arc(k * r * 0.34, -r * 0.18, r * 0.2, 0.2, Math.PI - 0.2); ctx.stroke(); }
  // вертикальна лінія чола й ніс
  ctx.beginPath(); ctx.moveTo(0, -r * 1.2); ctx.lineTo(0, -r * 0.62); ctx.moveTo(0, -r * 0.1); ctx.lineTo(0, r * 0.25); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, -r * 0.72, r * 0.09, 0, Math.PI * 2); ctx.stroke();
  // рот-випромінювач
  if (!flat) {
    ctx.beginPath(); ctx.arc(0, r * 0.58, r * 0.2, 0, Math.PI * 2); ctx.fillStyle = C.graphite; ctx.fill();
    ctx.lineWidth = r * 0.07; ctx.strokeStyle = C.copper; ctx.stroke();
    if (glow > 0) { ctx.shadowColor = C.amber; ctx.shadowBlur = r * 0.9 * glow; ctx.beginPath(); ctx.arc(0, r * 0.58, r * 0.13 * (0.6 + glow * 0.5), 0, Math.PI * 2); ctx.fillStyle = rgba('#ffcf7d', 0.5 + glow * 0.5); ctx.fill(); ctx.shadowBlur = 0; }
  } else { ctx.beginPath(); ctx.moveTo(-r * 0.15, r * 0.6); ctx.lineTo(r * 0.15, r * 0.6); ctx.stroke(); }
  ctx.restore();
}

// ——— Бос «Три обличчя»: нерухома траверса, три жорсткі маски, одне кільце ———
function drawBoss(t) {
  const b = game.boss, z = ARENA.z;
  const base = P(ARENA.x, MASKS[1].y - 0.8, z);
  const u = cam.s;
  // траверса й опори
  ctx.fillStyle = C.graphite;
  const tl = P(ARENA.x - 7.6, MASKS[1].y - 0.9, z + 4.3), tr = P(ARENA.x + 7.6, MASKS[1].y - 0.9, z + 4.3);
  ctx.lineWidth = u * 0.6; ctx.strokeStyle = C.graphite; ctx.beginPath(); ctx.moveTo(tl.x, tl.y); ctx.lineTo(tr.x, tr.y); ctx.stroke();
  for (const dx of [-6.6, -2.5, 2.5, 6.6]) { const a = P(ARENA.x + dx, MASKS[1].y - 0.9, z), c = P(ARENA.x + dx, MASKS[1].y - 0.9, z + 4.3); ctx.fillRect(a.x - u * 0.28, c.y, u * 0.56, a.y - c.y); }
  // постамент
  const pl = P(ARENA.x - 8.2, MASKS[1].y - 0.3, z), pr = P(ARENA.x + 8.2, MASKS[1].y - 0.3, z), plt = P(ARENA.x - 8.2, MASKS[1].y - 0.3, z + 0.6), prt = P(ARENA.x + 8.2, MASKS[1].y - 0.3, z + 0.6);
  ctx.fillStyle = '#3a4246'; ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pr.x, pr.y); ctx.lineTo(prt.x, prt.y); ctx.lineTo(plt.x, plt.y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = C.copper; ctx.lineWidth = Math.max(1, u * 0.06); ctx.beginPath(); ctx.moveTo(plt.x, plt.y); ctx.lineTo(prt.x, prt.y); ctx.stroke();
  // кільце з одним обертанням (декор, не колізія)
  const rc = P(ARENA.x, MASKS[1].y - 1, z + 2.7), R = u * 3.15;
  ctx.save(); ctx.translate(rc.x, rc.y);
  ctx.strokeStyle = b.state === 'dead' ? '#8d8576' : C.copper; ctx.lineWidth = u * 0.16; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = u * 0.05; ctx.strokeStyle = 'rgba(255,220,160,.55)'; ctx.beginPath(); ctx.arc(0, 0, R - u * 0.18, 0, Math.PI * 2); ctx.stroke();
  ctx.rotate(b.ring);
  for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.fillStyle = C.graphite; ctx.fillRect(R - u * 0.14, -u * 0.1, u * 0.34, u * 0.2); }
  ctx.restore();
  // три маски
  MASKS.forEach((m, i) => {
    const mp = maskScreen(i);
    const r = u * (i === 1 ? 1.32 : 1.1);
    let glow = 0, tilt = (i - 1) * 0.06;
    const fight = b.state === 'fight' || b.state === 'trans';
    if (b.state === 'intro') glow = (b.introStep > i || game.flags.introSeen) ? 0.6 : 0;
    if (fight && b.active === i) {
      glow = 0.7;
      if (b.pending && b.pending.mask === i) { const k = 1 - b.pending.t / b.pending.total; glow = 0.7 + k * 0.8; }
      tilt += clamp(((game.player.x - m.x) / 30), -0.12, 0.12);
    }
    const dead = b.state === 'dead';
    const fill = dead ? '#cfcac0' : (fight && b.active !== i ? '#d9d4ca' : C.ceramic);
    if (b.flash > 0 && b.active === i) { ctx.save(); ctx.globalAlpha = 0.6; }
    drawMaskShape(mp.x, mp.y, r, fill, '#6d655a', dead ? 0 : glow, tilt);
    if (b.flash > 0 && b.active === i) ctx.restore();
    // клеймо партії: 1/2/3 риски — форма дублює звук
    ctx.fillStyle = (fight && b.active === i) ? C.amber : '#7c8085';
    for (let k = 0; k <= i; k++) ctx.fillRect(mp.x - (i * 5 * u / 40) + k * 10 * u / 40 - u * 0.04, mp.y + r * 1.45, u * 0.08, u * 0.32);
  });
  if (b.flash > 0) b.flash = Math.max(0, b.flash - 1 / 60);
}
function maskScreen(i) { const m = MASKS[i]; return P(m.x, m.y - 0.6, ARENA.z + (i === 1 ? 2.9 : 2.5)); }
function drawPalm(k, t) {
  const c = P(PALM.x, PALM.y, ARENA.z + 0.05), u = cam.s, e = 1 - Math.pow(1 - k, 3);
  ctx.save(); ctx.translate(c.x, c.y);
  ctx.fillStyle = 'rgba(40,50,56,.18)'; ctx.beginPath(); ctx.ellipse(0, 0, u * 2.4 * e, u * 1.2 * e, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -u * 0.25 * e); ctx.scale(e, e);
  ctx.fillStyle = C.ceramic; ctx.strokeStyle = '#8b8376'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, u * 1.5, u * 0.85, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) { const x = -u * 1.05 + i * u * 0.7; ctx.beginPath(); ctx.roundRect(x - u * 0.24, -u * 2.1, u * 0.48, u * 1.5, u * 0.24); ctx.fill(); ctx.stroke(); }
  ctx.beginPath(); ctx.roundRect(u * 1.3, -u * 0.6, u * 1.1, u * 0.44, u * 0.22); ctx.fill(); ctx.stroke();
  if (!game.flags.voiceTaken) { const p = 0.5 + Math.sin(t * 3) * 0.5; ctx.shadowColor = C.teal; ctx.shadowBlur = u * 0.8; ctx.fillStyle = rgba('#9df0e6', 0.6 + p * 0.4); ctx.beginPath(); ctx.arc(0, -u * 0.1, u * 0.28, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

// ——— Героїня: спрощений B — світла кераміка, графітові суглоби, коса, рвана накидка, камертон ———
function drawHeroine(p, t) {
  const z = zAt(p), f = P(p.x, p.y, z), u = cam.s, h = 1.7 * u * ZF;
  const sd = screenDir(p.face), fx = sd.x, fy = sd.y / K;
  const dir = Math.abs(fx) > 0.2 ? Math.sign(fx) : (p.lastDir || 1); p.lastDir = dir;
  const back = fy < -0.45; // обличчям від камери
  const walk = p.moving > 0.5 ? Math.sin(p.walk * 3.1) : 0;
  const blink = (p.hurtCD > 0 && Math.floor(t * 18) % 2 === 0);
  // тінь
  ctx.fillStyle = 'rgba(30,40,46,.28)'; ctx.beginPath(); ctx.ellipse(f.x, f.y, u * 0.42, u * 0.42 * K, 0, 0, Math.PI * 2); ctx.fill();
  // слід ухилення / ре
  if (p.dash > 0) {
    ctx.save(); ctx.globalAlpha = 0.5;
    for (let i = 1; i <= 3; i++) { const q = P(p.x - Math.cos(p.dashDir) * i * 0.45, p.y - Math.sin(p.dashDir) * i * 0.45, z); ctx.fillStyle = rgba(p.dashKind === 're' ? '#9ae8e0' : C.teal, 0.35 - i * 0.08); ctx.beginPath(); ctx.ellipse(q.x, q.y - h * 0.5, u * 0.2, h * 0.42, 0, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  if (blink) ctx.globalAlpha = 0.45;
  ctx.save(); ctx.translate(f.x, f.y); ctx.scale(dir, 1);
  const lean = p.dash > 0 ? 0.25 : p.atkAnim > 0 ? 0.12 : 0;
  ctx.rotate(lean * 0.4);
  const hip = -h * 0.5, sh = -h * 0.8, head = -h * 0.92;
  // накидка ззаду (рвана)
  const flutter = Math.sin(t * 6 + p.walk) * u * 0.08 + (p.moving > 0.5 ? u * 0.18 : 0);
  ctx.fillStyle = '#1f2326';
  ctx.beginPath(); ctx.moveTo(-u * 0.08, sh + u * 0.02); ctx.lineTo(u * 0.12, sh);
  ctx.lineTo(-u * 0.05 - flutter * 0.5, hip + u * 0.2);
  for (let i = 0; i < 5; i++) ctx.lineTo(-u * 0.12 - flutter - i * u * 0.09, hip + u * (i % 2 ? 0.1 : 0.32));
  ctx.lineTo(-u * 0.25 - flutter * 0.6, sh + u * 0.15); ctx.closePath(); ctx.fill();
  // ноги
  const leg = (sx, ph) => {
    const k = walk * ph;
    const knee = { x: sx + k * u * 0.12, y: hip + h * 0.25 }, foot = { x: sx + k * u * 0.2, y: 0 };
    ctx.lineCap = 'round';
    for (const [col, extra] of [[C.graphite, u * 0.05], [C.ceramic, 0]]) {
      ctx.strokeStyle = col; ctx.lineWidth = u * 0.15 + extra; ctx.beginPath(); ctx.moveTo(sx, hip); ctx.lineTo(knee.x, knee.y); ctx.stroke();
      ctx.lineWidth = u * 0.12 + extra; ctx.beginPath(); ctx.moveTo(knee.x, knee.y); ctx.lineTo(foot.x, foot.y - u * 0.06); ctx.stroke();
    }
    ctx.fillStyle = C.graphite; ctx.beginPath(); ctx.arc(knee.x, knee.y, u * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(foot.x - u * 0.06, foot.y - u * 0.1, u * 0.16, u * 0.1);
  };
  leg(-u * 0.07, -1); leg(u * 0.07, 1);
  // таз і корпус
  ctx.fillStyle = C.graphite; ctx.beginPath(); ctx.ellipse(0, hip - u * 0.02, u * 0.16, u * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-u * 0.13, hip); ctx.lineTo(-u * 0.18, sh + u * 0.05); ctx.lineTo(u * 0.18, sh + u * 0.05); ctx.lineTo(u * 0.12, hip); ctx.closePath(); ctx.fill();
  if (!back) { ctx.fillStyle = C.ceramic; ctx.beginPath(); ctx.ellipse(u * 0.02, sh + u * 0.14, u * 0.14, u * 0.1, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = C.teal; ctx.beginPath(); ctx.arc(u * 0.02, sh + u * 0.05, u * 0.025, 0, Math.PI * 2); ctx.fill(); }
  // задня рука
  ctx.strokeStyle = '#3a4246'; ctx.lineWidth = u * 0.09; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-u * 0.15, sh + u * 0.06); ctx.lineTo(-u * 0.2 - walk * u * 0.05, hip + u * 0.05); ctx.stroke();
  // голова, коса
  ctx.fillStyle = '#25292c'; ctx.beginPath(); ctx.ellipse(-u * 0.03, head, u * 0.12, u * 0.13, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#25292c'; ctx.lineWidth = u * 0.06; ctx.beginPath(); ctx.moveTo(-u * 0.1, head + u * 0.04); ctx.quadraticCurveTo(-u * 0.2 - flutter * 0.3, sh + u * 0.1, -u * 0.16 - flutter * 0.4, hip - u * 0.08); ctx.stroke();
  if (!back) {
    ctx.fillStyle = C.ceramic; ctx.beginPath(); ctx.ellipse(u * 0.03, head + u * 0.02, u * 0.08, u * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    // квітка замість лівого ока
    ctx.fillStyle = '#c96b62'; ctx.beginPath(); ctx.arc(u * 0.07, head - u * 0.005, u * 0.028, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3a4246'; ctx.fillRect(-u * 0.03, head + u * 0.1, u * 0.06, u * 0.06);
  // рука з камертоном
  const swing = p.atkAnim > 0 ? (1 - p.atkAnim / 0.26) : 0;
  const armA = p.atkAnim > 0 ? -1.4 + swing * 2.3 : -0.2 + walk * 0.1;
  const hand = { x: u * 0.16 + Math.cos(armA) * u * 0.34, y: sh + u * 0.06 + Math.sin(armA) * u * 0.34 + u * 0.18 };
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.13; ctx.beginPath(); ctx.moveTo(u * 0.15, sh + u * 0.06); ctx.lineTo(hand.x, hand.y); ctx.stroke();
  ctx.strokeStyle = C.ceramic; ctx.lineWidth = u * 0.08; ctx.stroke();
  const fa = p.atkAnim > 0 ? armA - 0.4 : -1.15;
  const fork = { x: hand.x + Math.cos(fa) * u * 0.72, y: hand.y + Math.sin(fa) * u * 0.72 };
  ctx.strokeStyle = '#7e868a'; ctx.lineWidth = Math.max(1.5, u * 0.035); ctx.beginPath(); ctx.moveTo(hand.x - Math.cos(fa) * u * 0.12, hand.y - Math.sin(fa) * u * 0.12); ctx.lineTo(fork.x, fork.y); ctx.stroke();
  const nx = -Math.sin(fa) * u * 0.07, ny = Math.cos(fa) * u * 0.07;
  ctx.beginPath(); ctx.moveTo(fork.x + nx, fork.y + ny); ctx.lineTo(fork.x + nx + Math.cos(fa) * u * 0.2, fork.y + ny + Math.sin(fa) * u * 0.2); ctx.moveTo(fork.x - nx, fork.y - ny); ctx.lineTo(fork.x - nx + Math.cos(fa) * u * 0.2, fork.y - ny + Math.sin(fa) * u * 0.2); ctx.moveTo(fork.x + nx, fork.y + ny); ctx.lineTo(fork.x - nx, fork.y - ny); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
  // дуга удару на підлозі — збігається з reach і кутом
  if (p.atkAnim > 0.08) { ctx.strokeStyle = rgba('#ffffff', 0.85 * p.atkAnim / 0.26); ctx.lineWidth = Math.max(2, u * 0.08); floorArc(p.x, p.y, M.reach + 0.3, z, p.face - 1.2, p.face + 1.2); ctx.stroke(); }
  // вікно відбиття до
  if (p.parryWin > 0) { ctx.strokeStyle = rgba('#7ff0e4', 0.4 + p.parryWin * 2.5); ctx.lineWidth = Math.max(2, u * 0.09); floorArc(p.x, p.y, 0.95, z, p.face - 0.9, p.face + 0.9); ctx.stroke(); const c = P(p.x, p.y, z + 1); ctx.beginPath(); ctx.arc(c.x, c.y, u * 0.5, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke(); }
}

// ——— Тактовик: низький двоногий механізм із маятниковим інструментом ———
function drawTact(e, t) {
  const z = zAt(e), f = P(e.x, e.y, z), u = cam.s, h = 1.5 * u * ZF;
  // сектор удару на підлозі: попередження → удар → пауза
  if (e.state === 'windup') {
    const k = 1 - e.t / 1;
    ctx.fillStyle = rgba(C.amber, 0.12 + k * 0.3); sector(e.x, e.y, z, 2.9 + M.radius, e.lock, 50 * Math.PI / 180); ctx.fill();
    ctx.strokeStyle = rgba('#b5641e', 0.85); ctx.lineWidth = Math.max(1.5, u * 0.05); ctx.setLineDash([u * 0.25, u * 0.15]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = rgba(C.amber, 0.45); sector(e.x, e.y, z, (2.9 + M.radius) * k, e.lock, 50 * Math.PI / 180); ctx.fill();
  } else if (e.state === 'strike') {
    ctx.fillStyle = rgba('#fff1d0', 0.85); sector(e.x, e.y, z, 2.9 + M.radius, e.lock, 50 * Math.PI / 180); ctx.fill();
  } else if (e.state === 'recover') {
    ctx.strokeStyle = rgba(C.teal, 0.55 + Math.sin(t * 10) * 0.2); ctx.lineWidth = Math.max(1.5, u * 0.05); floorEllipse(e.x, e.y, 0.95, z); ctx.stroke();
  }
  const spawnK = e.state === 'spawn' ? 1 - e.t / 0.9 : 1;
  ctx.save(); ctx.globalAlpha = spawnK;
  ctx.fillStyle = 'rgba(30,40,46,.3)'; ctx.beginPath(); ctx.ellipse(f.x, f.y, u * 0.7, u * 0.7 * K, 0, 0, Math.PI * 2); ctx.fill();
  const dir = screenDir(e.angle).x >= 0 ? 1 : -1;
  ctx.translate(f.x, f.y); ctx.scale(dir, 1);
  const bob = e.state === 'chase' ? Math.sin(t * 9 + e.id) * u * 0.04 : 0;
  // ноги
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.17; ctx.lineCap = 'round';
  for (const sx of [-0.25, 0.25]) { ctx.beginPath(); ctx.moveTo(sx * u, -h * 0.42); ctx.lineTo(sx * u * 1.4, -h * 0.18); ctx.lineTo(sx * u * 1.1, -u * 0.05); ctx.stroke(); }
  ctx.fillStyle = C.ceramic; for (const sx of [-0.3, 0.3]) ctx.fillRect(sx * u * 1.1 - u * 0.15, -u * 0.12, u * 0.3, u * 0.12);
  // корпус
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : C.ceramic; ctx.strokeStyle = '#6d6a62'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.62 + bob, u * 0.5, u * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.copper; ctx.beginPath(); ctx.arc(u * 0.12, -h * 0.62 + bob, u * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.graphite; ctx.beginPath(); ctx.arc(u * 0.12, -h * 0.62 + bob, u * 0.07, 0, Math.PI * 2); ctx.fill();
  // голова
  ctx.fillStyle = C.ceramicShade; ctx.beginPath(); ctx.ellipse(u * 0.18, -h * 0.92 + bob, u * 0.2, u * 0.16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.graphite; ctx.fillRect(u * 0.22, -h * 0.94 + bob, u * 0.12, u * 0.04);
  // інструмент-маятник: піднятий у підготовці, опущений у паузі
  let armA = 0.6;
  if (e.state === 'windup') armA = -1.9 + (1 - e.t) * 0.2 + (e.clicks ? Math.sin(t * 40) * 0.05 : 0);
  else if (e.state === 'strike') armA = 0.9;
  else if (e.state === 'recover') armA = 1.25;
  else armA = 0.5 + Math.sin(t * 2 + e.id) * 0.15;
  const sh = { x: u * 0.35, y: -h * 0.72 + bob };
  const end = { x: sh.x + Math.cos(armA) * u * 1.05, y: sh.y + Math.sin(armA) * u * 1.05 };
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.12; ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(end.x, end.y); ctx.stroke();
  ctx.fillStyle = e.state === 'windup' ? C.amber : C.copper; ctx.beginPath(); ctx.arc(end.x, end.y, u * 0.22, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.graphite; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  hpPips(e, f, h + u * 0.3);
}

// ——— Рупор: стаціонарна керамічна голова на поворотному кільці ———
function drawHorn(e, t) {
  const z = zAt(e), f = P(e.x, e.y, z), u = cam.s, h = 1.7 * u * ZF;
  if (e.state === 'tele') {
    const k = 1 - e.t;
    for (let i = 0; i < 5; i++) {
      const a = e.lock + (i - 2) * 13 * Math.PI / 180, marked = i === e.mark;
      const p0 = P(e.x + Math.cos(a) * 0.9, e.y + Math.sin(a) * 0.9, z), p1 = P(e.x + Math.cos(a) * (2 + k * 6), e.y + Math.sin(a) * (2 + k * 6), z);
      ctx.strokeStyle = marked ? rgba('#ffcf7d', 0.9) : rgba('#6f4a25', 0.45 + k * 0.3); ctx.lineWidth = Math.max(1.5, u * (marked ? 0.07 : 0.05));
      if (marked) ctx.setLineDash([u * 0.18, u * 0.12]);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
      if (marked) diamond(p1.x, p1.y, u * 0.2, null, '#ffcf7d');
    }
  }
  const spawnK = e.state === 'spawn' ? 1 - e.t / 0.9 : 1;
  ctx.save(); ctx.globalAlpha = spawnK;
  // кільце в підлозі
  ctx.fillStyle = C.graphite; floorEllipse(e.x, e.y, 0.85, z); ctx.fill();
  ctx.strokeStyle = C.copper; ctx.lineWidth = Math.max(1.5, u * 0.06); floorEllipse(e.x, e.y, 0.7, z); ctx.stroke();
  // стійка
  ctx.fillStyle = C.ceramicShade; ctx.fillRect(f.x - u * 0.12, f.y - h * 0.6, u * 0.24, h * 0.6);
  // голова-рупор, повернута до цілі
  const sdv = screenDir(e.angle), ca = sdv.x, sa = sdv.y / K;
  const head = { x: f.x, y: f.y - h * 0.68 };
  const bell = { x: head.x + ca * u * 0.9, y: head.y + sa * u * 0.9 * K };
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : C.ceramic; ctx.strokeStyle = '#6d6a62'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(head.x, head.y, u * 0.32, u * 0.28, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  const nx = -sa, ny = ca * K, open = e.state === 'tele' ? 1 + (1 - e.t) * 0.35 : 1;
  ctx.fillStyle = C.copper;
  ctx.beginPath(); ctx.moveTo(head.x + nx * u * 0.12, head.y + ny * u * 0.12); ctx.lineTo(bell.x + nx * u * 0.42 * open, bell.y + ny * u * 0.42 * open); ctx.lineTo(bell.x - nx * u * 0.42 * open, bell.y - ny * u * 0.42 * open); ctx.lineTo(head.x - nx * u * 0.12, head.y - ny * u * 0.12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = e.state === 'tele' ? C.amberHot : C.graphite;
  ctx.beginPath(); ctx.ellipse(bell.x, bell.y, u * 0.12 * open, u * 0.42 * open, Math.atan2(ny, nx), 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  hpPips(e, f, h + u * 0.35);
}
function hpPips(e, f, h) {
  if (e.hp >= e.max || e.hp <= 0) return;
  const u = cam.s, w = u * 0.22;
  for (let i = 0; i < e.max; i++) { ctx.fillStyle = i < e.hp ? C.graphite : 'rgba(43,50,54,.2)'; ctx.fillRect(f.x - e.max * w / 2 + i * w + 1, f.y - h, w - 2, Math.max(2, u * 0.07)); }
}
function diamond(x, y, r, fill, stroke) { ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }

// ——— PZ-01: труби A/B/C, тестовий вузол, покажчик підйомника, важіль ———
function drawPz01(t) {
  const z = 0, u = cam.s, s1 = game.pz01;
  // три труби йдуть за край у порожнечу
  for (const [key, port] of Object.entries(PZ01.ports)) {
    const north = port.y < 0, len = 6;
    const a = P(port.x, port.y, z + 0.6), b = P(port.x, port.y + (north ? -len : len), z - 2.5);
    ctx.strokeStyle = '#9aa1a1'; ctx.lineWidth = u * 0.42; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = u * 0.08; ctx.beginPath(); ctx.moveTo(a.x - u * 0.08, a.y); ctx.lineTo(b.x - u * 0.08, b.y); ctx.stroke();
  }
  // верхня коротка петля: тільки C веде до підйомника
  const lift = P(31.4, -7.6, 1.4), cPort = PZ01.ports.C;
  { const lb = P(31.4, -7.6, -3), lt = P(31.4, -7.6, 0.6); const gg = ctx.createLinearGradient(0, lt.y, 0, lb.y); gg.addColorStop(0, '#9aa1a1'); gg.addColorStop(1, rgba(C.skyLow, 0)); ctx.fillStyle = gg; ctx.fillRect(lt.x - u * 0.3, lt.y, u * 0.6, lb.y - lt.y); }
  const cp = P(cPort.x, cPort.y - 0.5, 1.2);
  ctx.strokeStyle = s1.charged ? C.teal : '#9aa1a1'; ctx.lineWidth = u * 0.16; ctx.beginPath(); ctx.moveTo(cp.x, cp.y); ctx.quadraticCurveTo(cp.x + u * 0.2, lift.y - u * 0.5, lift.x, lift.y); ctx.stroke();
  // підйомник із механічним покажчиком
  ctx.fillStyle = C.graphite; ctx.fillRect(lift.x - u * 0.7, lift.y - u * 1.2, u * 1.4, u * 1.6);
  ctx.fillStyle = C.ceramic; ctx.beginPath(); ctx.arc(lift.x, lift.y - u * 0.4, u * 0.5, 0, Math.PI * 2); ctx.fill();
  const needle = s1.charged ? -Math.PI * 0.15 : -Math.PI * 0.85 + Math.sin(t * 2) * 0.03;
  ctx.strokeStyle = s1.charged ? '#127a72' : C.graphite; ctx.lineWidth = Math.max(2, u * 0.07); ctx.beginPath(); ctx.moveTo(lift.x, lift.y - u * 0.4); ctx.lineTo(lift.x + Math.cos(needle) * u * 0.42, lift.y - u * 0.4 + Math.sin(needle) * u * 0.42); ctx.stroke();
  // порти: літера, риски, роль
  for (const [key, port] of Object.entries(PZ01.ports)) {
    const base = P(port.x, port.y, z), top = P(port.x, port.y, z + 1.3);
    ctx.fillStyle = C.ceramic; ctx.strokeStyle = '#7c776d'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(base.x - u * 0.45, top.y, u * 0.9, base.y - top.y, u * 0.08); ctx.fill(); ctx.stroke();
    const fed = s1.fed[key] > 0, ring = P(port.x, port.y, z + 0.85);
    ctx.fillStyle = C.graphite; ctx.beginPath(); ctx.arc(ring.x, ring.y, u * 0.27, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = key === 'C' && s1.charged ? C.teal : C.copper; ctx.lineWidth = u * 0.07; ctx.stroke();
    if (fed && key === 'B') { const k = (t * 2) % 1; ctx.strokeStyle = rgba(C.amber, 1 - k); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(ring.x, ring.y, u * (0.3 + k * 0.6), 0, Math.PI * 2); ctx.stroke(); }
    label(key, top.x, top.y - u * 0.25, u * 0.36, C.graphite, true);
    for (let i = 0; i < ' ABC'.indexOf(key); i++) ctx.fillRect(top.x - u * 0.2 + i * u * 0.16, top.y + u * 0.08, u * 0.08, u * 0.16);
  }
  // тестовий вузол (безпечні імпульси)
  const em = PZ01.emitter, eb = P(em.x, em.y, z), et = P(em.x, em.y, z + 1.6);
  ctx.fillStyle = C.ceramic; ctx.strokeStyle = '#7c776d'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(eb.x - u * 0.35, et.y, u * 0.7, eb.y - et.y, u * 0.06); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.1; ctx.beginPath(); ctx.moveTo(et.x, et.y + u * 0.25); ctx.lineTo(et.x, eb.y - u * 0.25); ctx.stroke();
  const pulse = s1.done ? 0 : (game.inZone('P1', game.player, 0.4) ? clamp(1 - s1.emitT / 1.4, 0, 1) : 0.15);
  ctx.fillStyle = s1.done ? '#9aa1a1' : rgba('#8fe8de', 0.5 + pulse * 0.5); ctx.beginPath(); ctx.arc(et.x, (et.y + eb.y) / 2, u * 0.16 * (1 + pulse * 0.4), 0, Math.PI * 2); ctx.fill();
  // сервісний важіль
  drawLever(PZ01.lever, s1.done, s1.charged && !s1.done, 'ВАЖІЛЬ', t);
}
function drawLever(pos, on, ready, text, t, z = zAt(pos)) {
  const u = cam.s, b = P(pos.x, pos.y, z), top = P(pos.x, pos.y, z + 1.1);
  ctx.fillStyle = C.ceramic; ctx.strokeStyle = '#7c776d'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(b.x - u * 0.38, top.y, u * 0.76, b.y - top.y, u * 0.06); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.graphite; ctx.fillRect(b.x - u * 0.06, top.y + u * 0.12, u * 0.12, u * 0.6);
  const a = on ? -Math.PI / 2 - 0.6 : -Math.PI / 2 + 0.6, pivot = { x: b.x, y: top.y + u * 0.5 };
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.08; ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(pivot.x + Math.cos(a) * u * 0.7, pivot.y + Math.sin(a) * u * 0.7); ctx.stroke();
  ctx.fillStyle = ready ? (Math.sin(t * 6) > 0 ? C.amberHot : C.amber) : on ? C.teal : C.copper;
  ctx.beginPath(); ctx.arc(pivot.x + Math.cos(a) * u * 0.7, pivot.y + Math.sin(a) * u * 0.7, u * 0.13, 0, Math.PI * 2); ctx.fill();
  if (text) label(text, b.x, top.y - u * 0.22, Math.max(9, u * 0.22), '#4b555a');
}
function label(text, x, y, size, color, display = false) {
  ctx.font = `${display ? '' : '600 '}${Math.round(size)}px ${display ? 'Forum, Georgia, serif' : '"IBM Plex Sans Condensed", "Arial Narrow", sans-serif'}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(239,235,227,.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
}

// ——— PZ-09: резерв, команда, живлення; маятник на виході, житловий покажчик ———
function drawPz09(t) {
  const z = 3, u = cam.s, s9 = game.pz09;
  const lamp = { x: 31, y: -26.6 };
  // лінії від важелів
  const line = (from, to, live, col) => { const a = P(from.x, from.y + 0.4, z), b = P(to.x, to.y, z); ctx.strokeStyle = live ? col : 'rgba(90,96,100,.4)'; ctx.lineWidth = Math.max(2, u * 0.08); ctx.setLineDash(live ? [] : [u * 0.2, u * 0.15]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); };
  const L = PZ09.levers, pend = PZ09.pendulum;
  line(L.command, { x: pend.x + 1.6, y: pend.y - 1.2 }, s9.power && s9.command, C.amber);
  line(L.reserve, lamp, s9.power && s9.reserve, C.teal);
  line(L.power, { x: L.power.x + 2, y: L.power.y + 0.2 }, s9.power, C.copper);
  // маятник за огорожею — тестовий робочий механізм, перекриває вихід
  const top = P(pend.x, pend.y, z + 4.2);
  ctx.fillStyle = C.graphite; const l = P(pend.x, pend.y - 2.2, z), r = P(pend.x, pend.y + 2.2, z), lt = P(pend.x, pend.y - 2.2, z + 4.2), rt = P(pend.x, pend.y + 2.2, z + 4.2);
  ctx.strokeStyle = C.graphite; ctx.lineWidth = u * 0.18; ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(lt.x, lt.y); ctx.lineTo(rt.x, rt.y); ctx.lineTo(r.x, r.y); ctx.stroke();
  const sw = game.pendulumMoving() ? Math.sin(t * 2.6) * 0.75 : 0;
  const len = u * 3.3, bob = { x: top.x + Math.sin(sw) * len * 0.35, y: top.y + Math.cos(sw) * len };
  ctx.lineWidth = u * 0.07; ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bob.x, bob.y); ctx.stroke();
  ctx.fillStyle = game.pendulumMoving() ? C.copper : '#8f8679'; ctx.beginPath(); ctx.ellipse(bob.x, bob.y, u * 0.45, u * 0.55, sw * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = C.graphite; ctx.lineWidth = 1.5; ctx.stroke();
  // житловий покажчик: лампа на стійці
  const lb = P(lamp.x, lamp.y, z), lt2 = P(lamp.x, lamp.y, z + 1.8), live = game.homeLineLive();
  ctx.fillStyle = C.ceramicShade; ctx.fillRect(lb.x - u * 0.1, lt2.y, u * 0.2, lb.y - lt2.y);
  ctx.save(); if (live) { ctx.shadowColor = C.amber; ctx.shadowBlur = u * 0.8; }
  ctx.fillStyle = live ? C.amberHot : '#6f6a62'; ctx.beginPath(); ctx.roundRect(lt2.x - u * 0.25, lt2.y - u * 0.4, u * 0.5, u * 0.45, u * 0.06); ctx.fill(); ctx.restore();
  label('ЖИТЛО', lt2.x, lt2.y - u * 0.65, Math.max(9, u * 0.2), '#4b555a');
  // важелі
  for (const [k, lv] of Object.entries(L)) drawLever(lv, s9[k], false, `${lv.label.toUpperCase()} ${s9[k] ? 'ON' : 'OFF'}`, t, z);
  if (s9.lock) { const c = P(L.command.x, L.command.y, z + 2.1); diamond(c.x, c.y, u * 0.22, C.danger); label('ФІКСАТОР', c.x, c.y - u * 0.45, Math.max(9, u * 0.2), C.danger); }
}

// ——— Сервісна станція P5: ремонт, ре, збереження ———
function drawStation(t) {
  const u = cam.s, b = P(STATION.x, STATION.y, 3), tp = P(STATION.x, STATION.y, 3 + 2.1);
  ctx.fillStyle = C.ceramic; ctx.strokeStyle = '#7c776d'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(b.x - u * 0.8, tp.y, u * 1.6, b.y - tp.y, u * 0.12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = C.graphite; ctx.fillRect(b.x - u * 0.55, tp.y + u * 0.25, u * 1.1, u * 0.7);
  const glow = 0.5 + Math.sin(t * 2) * 0.2;
  ctx.fillStyle = rgba('#8fe8de', game.flags.re ? 0.35 : glow); ctx.fillRect(b.x - u * 0.45, tp.y + u * 0.35, u * 0.9, u * 0.5);
  // дві спокійні мітки для навчання ре
  if (!game.flags.re) for (const dx of [-2.2, 2.2]) { ctx.strokeStyle = rgba(C.teal, 0.6); ctx.lineWidth = 1.5; floorEllipse(STATION.x + dx, STATION.y + 3, 0.45, 3); ctx.stroke(); }
}

// ——— Снаряди, кільця, промені, ефекти ———
function drawHazards(t) {
  const u = cam.s, b = game.boss;
  // підготовка атак боса
  if (b.pending) {
    const a = b.pending, k = 1 - a.t / a.total, z = ARENA.z;
    const src = { x: a.x, y: a.y };
    if (a.kind === 'fan') {
      for (let i = 0; i < 9; i++) {
        const stp = 120 * Math.PI / 180 / 8, sh = a.offset ? stp / 4 : -stp / 4, ang = a.angle - 60 * Math.PI / 180 + i * stp + sh, marked = i === a.mark;
        const p0 = P(src.x, src.y, z), p1 = P(src.x + Math.cos(ang) * (3 + k * 14), src.y + Math.sin(ang) * (3 + k * 14), z);
        ctx.strokeStyle = marked ? rgba('#ffcf7d', 0.9) : rgba('#7a4f24', 0.25 + k * 0.4); ctx.lineWidth = Math.max(1.5, u * 0.05);
        if (marked) ctx.setLineDash([u * 0.2, u * 0.12]);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke(); ctx.setLineDash([]);
        if (marked) diamond(p1.x, p1.y, u * 0.22, null, '#ffcf7d');
      }
    } else if (a.kind === 'ring') {
      ctx.strokeStyle = rgba(C.amber, 0.4 + k * 0.5); ctx.lineWidth = Math.max(2, u * 0.12);
      floorArc(src.x, src.y, 0.6 + k * 1.6, z, a.gap + 0.2, a.gap + Math.PI * 2 - 0.2); ctx.stroke();
      // прохід у кільці: світлий клин
      const g0 = P(src.x, src.y, z), g1 = P(src.x + Math.cos(a.gap) * 18, src.y + Math.sin(a.gap) * 18, z);
      ctx.strokeStyle = rgba(C.teal, 0.35 + k * 0.4); ctx.lineWidth = Math.max(2, u * 0.08); ctx.setLineDash([u * 0.3, u * 0.25]);
      ctx.beginPath(); ctx.moveTo(g0.x, g0.y); ctx.lineTo(g1.x, g1.y); ctx.stroke(); ctx.setLineDash([]);
    } else if (a.kind === 'beam') {
      const p0 = P(src.x, src.y, z), p1 = P(src.x + Math.cos(a.angle) * 30, src.y + Math.sin(a.angle) * 30, z);
      ctx.strokeStyle = rgba(C.amber, 0.25 + k * 0.5); ctx.lineWidth = Math.max(1, u * 1.2 * (0.15 + k * 0.85) * 0.6);
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      ctx.strokeStyle = rgba('#7a4f24', 0.8); ctx.lineWidth = 1.2; ctx.setLineDash([u * 0.25, u * 0.2]); ctx.stroke(); ctx.setLineDash([]);
    } else if (a.kind === 'orb') {
      const mp = maskScreen(a.mask);
      ctx.strokeStyle = rgba('#ffcf7d', k); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mp.x, mp.y + u * 0.55, u * (1.2 - k * 0.8), 0, Math.PI * 2); ctx.stroke();
    }
  }
  // кільця: тонкий видимий край, прохід лишається відкритим
  for (const r of game.rings) {
    ctx.save(); floorEllipse(ARENA.x, ARENA.y, ARENA.r, ARENA.z); ctx.clip();
    ctx.strokeStyle = rgba('#8a5420', 0.5); ctx.lineWidth = Math.max(3, u * 0.5);
    floorArc(r.x, r.y, r.R, ARENA.z, r.gap + r.gapHalf, r.gap + Math.PI * 2 - r.gapHalf); ctx.stroke();
    ctx.strokeStyle = C.amberHot; ctx.lineWidth = Math.max(2, u * 0.16); ctx.stroke();
    ctx.restore();
  }
  for (const bm of game.beams) {
    const p0 = P(bm.x, bm.y, ARENA.z), p1 = P(bm.x + Math.cos(bm.angle) * 30, bm.y + Math.sin(bm.angle) * 30, ARENA.z);
    ctx.save(); floorEllipse(ARENA.x, ARENA.y, ARENA.r + 0.5, ARENA.z); ctx.clip();
    ctx.strokeStyle = rgba('#ffe2a8', 0.9); ctx.lineWidth = u * bm.width * 0.75; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = u * 0.2; ctx.stroke(); ctx.restore();
  }
  // снаряди
  for (const pr of game.projectiles) {
    const z = zAt(pr) + 0.9, c = P(pr.x, pr.y, z), sh = P(pr.x, pr.y, zAt(pr)), r = Math.max(3, pr.r * u);
    ctx.fillStyle = 'rgba(30,40,46,.18)'; ctx.beginPath(); ctx.ellipse(sh.x, sh.y, r, r * K, 0, 0, Math.PI * 2); ctx.fill();
    if (pr.friendly) {
      ctx.save(); ctx.shadowColor = C.teal; ctx.shadowBlur = r * 2; ctx.fillStyle = '#c9fbf5'; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      const tail = P(pr.x - pr.vx * 0.06, pr.y - pr.vy * 0.06, z); ctx.strokeStyle = rgba(C.teal, 0.7); ctx.lineWidth = r; ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      continue;
    }
    if (pr.harmless) { ctx.fillStyle = '#dff8f4'; ctx.strokeStyle = '#3aa79c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); diamond(c.x, c.y, r * 1.6, null, '#3aa79c'); continue; }
    if (pr.marked) {
      ctx.save(); ctx.shadowColor = C.amber; ctx.shadowBlur = r * 1.5; ctx.fillStyle = C.amberHot; ctx.beginPath(); ctx.arc(c.x, c.y, r * (pr.big ? 1.1 : 0.9), 0, Math.PI * 2); ctx.fill(); ctx.restore();
      diamond(c.x, c.y, r * 1.75, null, '#8a5420');
    } else {
      // звичайний імпульс: темне ядро, бурштиновий край — без ромба, не відбивається
      ctx.fillStyle = '#3a2a1c'; ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.amber; ctx.lineWidth = Math.max(1.5, r * 0.35); ctx.stroke();
    }
  }
}
function drawEffects() {
  const u = cam.s;
  for (const e of game.effects) {
    const k = 1 - e.life / e.max, z = zAt(e), c = P(e.x, e.y, z + 0.6);
    ctx.save(); ctx.globalAlpha = 1 - k;
    if (e.kind === 'strike') { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; for (let i = 0; i < 5; i++) { const a = i * 1.26 + k; ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * u * 0.15, c.y + Math.sin(a) * u * 0.15); ctx.lineTo(c.x + Math.cos(a) * u * (0.3 + k * 0.5), c.y + Math.sin(a) * u * (0.3 + k * 0.5)); ctx.stroke(); } }
    else if (e.kind === 'parry') { ctx.strokeStyle = '#9df0e6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(c.x, c.y, u * (0.4 + k * 1.2), 0, Math.PI * 2); ctx.stroke(); }
    else if (e.kind === 'echo') { ctx.strokeStyle = C.teal; ctx.lineWidth = 2; floorEllipse(e.x, e.y, 0.3 + k * 1.6, z); ctx.stroke(); }
    else if (e.kind === 'break') { ctx.fillStyle = C.ceramicShade; for (let i = 0; i < 9; i++) { const a = i * 0.7, d = u * k * (0.8 + (i % 3) * 0.4); ctx.fillRect(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * 0.6 + k * k * u, u * 0.14, u * 0.1); } }
    else if (e.kind === 'fizz' || e.kind === 'land') { ctx.strokeStyle = e.kind === 'land' ? C.teal : '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(c.x, c.y, u * (0.2 + k * 0.6), 0, Math.PI * 2); ctx.stroke(); }
    else if (e.kind === 'voice') { const pl = P(PALM.x, PALM.y, ARENA.z + 0.4), hp = P(game.player.x, game.player.y, zAt(game.player) + 1); ctx.strokeStyle = C.teal; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.quadraticCurveTo((pl.x + hp.x) / 2, Math.min(pl.y, hp.y) - u * 2, hp.x, hp.y); ctx.stroke(); }
    ctx.restore();
  }
}
// повітря: повільний пил у світлі
const DUST = Array.from({ length: 46 }, (_, i) => ({ x: seeded(i + 500), y: seeded(i + 600), s: 0.5 + seeded(i + 700) * 1.6, v: 0.004 + seeded(i + 800) * 0.01 }));
function drawDust(t) {
  if (reduced) return;
  ctx.fillStyle = 'rgba(255,253,245,.55)';
  for (const d of DUST) { const x = ((d.x * W + Math.sin(t * 0.3 + d.y * 9) * 20 - cam.x * cam.s * 0.15) % W + W) % W, y = ((d.y - t * d.v) % 1 + 1) % 1 * H; ctx.fillRect(x, y, d.s, d.s); }
}

// ——— Кадр ———
function render(t) {
  ctx.save();
  if (shake > 0 && !reduced) ctx.translate((Math.random() - 0.5) * shake * 8, (Math.random() - 0.5) * shake * 5);
  drawBackground(t);
  drawPillars();
  const ordered = SHAPES.slice().sort((a, b) => slabDepth(a) - slabDepth(b));
  // бос за ареною: малюємо перед платформою P7
  for (const sh of ordered) {
    if (sh.id === 'P7') { const bb = P(ARENA.x, ARENA.y - ARENA.r - 1, ARENA.z); if (bb.y > -200) drawBoss(t); }
    drawSlab(sh);
  }
  // декали на підлозі під акторами
  drawStation(t);
  // сцена з глибиною: актори й корпуси за y
  const items = [];
  items.push({ y: depth({ x: 23, y: -5 }), d: () => drawPz01(t) });
  items.push({ y: depth({ x: 25, y: -27 }), d: () => drawPz09(t) });
  for (const id of Object.keys(GATES)) items.push({ y: depth({ x: GATES[id].x, y: GATES[id].y + (GATES[id].axis === 'x' ? GATES[id].w / 2 + 0.4 : 0) }), d: () => drawGate(id) });
  for (const e of game.enemies) items.push({ y: depth(e), d: () => e.type === 'tact' ? drawTact(e, t) : drawHorn(e, t) });
  items.push({ y: depth(game.player), d: () => drawHeroine(game.player, t) });
  if (game.boss.state === 'dead' && game.boss.palm > 0) items.push({ y: depth(PALM) - 0.5, d: () => drawPalm(game.boss.palm, t) });
  items.sort((a, b) => a.y - b.y);
  for (const it of items) it.d();
  drawHazards(t);
  drawEffects();
  drawDust(t);
  ctx.restore();
}

// ——— Камера: піднята фіксована 3/4; на арені — увесь майданчик одним кадром ———
function updateCamera(dt) {
  const p = game.player, b = game.boss;
  const portrait = H > W * 1.05, small = Math.min(W, H) < 560;
  const explore = Math.min(W / (portrait ? 13 : 24), H / 14);
  const arenaFit = Math.min(W / 28, H / (ARENA.r * 2 * K + (small ? 10.5 : 12)));
  const inArena = ['intro', 'fight', 'trans'].includes(b.state) || (b.state === 'dead' && game.inZone('P7', p, -1));
  let tx = p.x, ty = p.y, tz = zAt(p), ts = clamp(explore, 14, 64);
  // на бойових і задачних майданчиках кадр тягнеться до центру ділянки, щоб обидва джерела були видні
  const sh = game.shapeAt(p);
  if (sh && !sh.bridge && sh.type === 'rect') {
    const cx = (sh.x1 + sh.x2) / 2, cy = (sh.y1 + sh.y2) / 2, w = sh.x2 - sh.x1 + 5, hh = (sh.y2 - sh.y1) * K + 6;
    const fit = Math.min(W / w, H / hh);
    const pull = sh.id === 'P6' || sh.id === 'P2' ? 0.6 : 0.4;
    tx = p.x + (cx - p.x) * pull; ty = p.y + (cy - p.y) * pull;
    ts = clamp(Math.max(Math.min(explore, fit), explore * 0.72), 14, 64);
  }
  if (inArena) { tx = ARENA.x; ty = ARENA.y - (small ? 4.2 : 3.4); tz = ARENA.z; ts = clamp(arenaFit, 10, 56); }
  if (!started) { tx = 6; ty = -3; tz = 0; ts = clamp(explore * 0.8, 14, 52); }
  const k = 1 - Math.exp(-dt * (inArena ? 2.2 : 5));
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k; cam.s += (ts - cam.s) * (1 - Math.exp(-dt * 2.5));
}

// ——— Звук: синтез, зал із довгим хвостом на окремій шині ———
let ac = null, master = null, dry = null, verb = null;
function initAudio() {
  try {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
      dry = ac.createGain(); dry.gain.value = 0.8; dry.connect(master);
      const conv = ac.createConvolver(), len = Math.floor(ac.sampleRate * 2.8), ir = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 600 ? i / 600 : 1); }
      conv.buffer = ir; verb = ac.createGain(); verb.gain.value = 0.34; conv.connect(verb); verb.connect(master);
      dry.conv = conv;
    }
    if (ac.state !== 'running') ac.resume().catch(() => {});
  } catch { ac = null; }
}
function tone(freq, dur = 0.3, vol = 0.2, type = 'sine', delay = 0, pan = 0, wet = 0.5) {
  if (!ac || muted || paused || ac.state !== 'running') return;
  const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = g;
  if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
  o.connect(g); node.connect(dry);
  if (wet > 0) { const w = ac.createGain(); w.gain.value = wet; node.connect(w); w.connect(dry.conv); }
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(dur = 0.15, vol = 0.15, pan = 0, freq = 900) {
  if (!ac || muted || paused || ac.state !== 'running') return;
  const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2; g.gain.value = vol;
  src.connect(f); f.connect(g);
  let node = g; if (ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); node = p; }
  node.connect(dry); const w = ac.createGain(); w.gain.value = 0.4; node.connect(w); w.connect(dry.conv);
  src.start();
}
const panOf = x => clamp((x - cam.x) / 14, -1, 1);
const NOTE = { do: 261.63, re: 293.66, mi: 329.63, fa: 349.23, sol: 392, la: 440, si: 493.88 };
const VOICE_FREQ = [98, 196, 392]; // бас, середній, дискант

// ——— Підписи ———
let captionUntil = 0, captionQueue = [];
function say(html, sec = 4, urgent = false) {
  if (urgent) { captionQueue = []; showCaption(html, sec); return; }
  if (performance.now() / 1000 < captionUntil) { captionQueue.push([html, sec]); return; }
  showCaption(html, sec);
}
function showCaption(html, sec) { $('caption').innerHTML = html; captionUntil = performance.now() / 1000 + sec; }
function tickCaption() {
  const now = performance.now() / 1000;
  if (now >= captionUntil) { if (captionQueue.length) showCaption(...captionQueue.shift()); else if ($('caption').innerHTML) $('caption').innerHTML = ''; }
}

// ——— Події симуляції → звук, підписи, HUD ———
let lastObjective = '', hpHitT = 0;
function handleEvents() {
  for (const e of game.events.splice(0)) {
    switch (e.type) {
      case 'swing': tone(523.25 + e.combo * 60, 0.09, 0.08, 'triangle', 0, 0, 0.2); break;
      case 'guard': noise(0.08, 0.18, panOf(e.x), 2400); if (!hint.guard) { hint.guard = 1; say('Тактовик тримає <b>фронт</b>. Вийди із сектора, удар у <b>паузі</b> або зі спини.', 5); } break;
      case 'enemy-hit': noise(0.07, 0.16, 0, 1600); tone(e.how === 'do' ? NOTE.do * 2 : 180, 0.12, 0.08, 'square', 0, 0, 0.3); break;
      case 'enemy-down': noise(0.4, 0.22, 0, 500); tone(110, 0.6, 0.12, 'triangle'); shake = 0.3; break;
      case 'dodge': noise(0.12, 0.08, 0, 3000); break;
      case 're': tone(NOTE.re, 0.35, 0.12, 'sine', 0, 0, 0.8); tone(NOTE.re * 2, 0.25, 0.05, 'sine', 0.06); break;
      case 're-locked': say('Ре відкриється на сервісній станції.', 2.5); break;
      case 'parry': tone(NOTE.do * 2, 0.08, 0.05, 'sine', 0, 0, 0.3); break;
      case 'do-return': tone(NOTE.do, 0.5, 0.2, 'sine', 0, 0, 0.9); tone(NOTE.do * 2, 0.4, 0.1, 'triangle', 0.02); if (e.target === 'port') say(`До → порт <b>${e.key}</b>`, 1.6, true); break;
      case 'repair-start': tone(220, 0.9, 0.06, 'sine'); break;
      case 'repair-cancel': tone(160, 0.12, 0.06, 'triangle'); break;
      case 'repair-no': say(e.reason === 'empty' ? 'Ремонтних зарядів немає. Станція поверне їх.' : 'Корпус цілий.', 2); break;
      case 'repaired': tone(330, 0.3, 0.1); tone(440, 0.4, 0.1, 'sine', 0.1); break;
      case 'lever-neutral': noise(0.1, 0.15, 0, 700); say('Важіль не тримає. Покажчик підйомника стоїть.', 3); break;
      case 'pz-solved': tone(196, 1.2, 0.12, 'sine'); tone(293.66, 1.2, 0.08, 'sine', 0.15); tone(392, 1.4, 0.07, 'sine', 0.3); say(e.id === 'PZ-01' ? 'Провідник: «Шлюз нижньої галереї відкрито.»' : 'Провідник: «Маятник стоїть. Приймач живиться.»', 4); break;
      case 'port': if (e.key === 'A') { noise(0.25, 0.12, 0, 220); say('A: глуха мембрана. Відгуку немає.', 3); } else if (e.key === 'B') { tone(880, 1.4, 0.12, 'sine', 0, 0, 1); say('B: тестовий дзвін. Підйомник не рухається.', 3); } break;
      case 'lift-ready': tone(130.81, 0.8, 0.15, 'triangle'); say('C: покажчик підйомника <b>піднявся</b>. Тепер важіль.', 4); break;
      case 'fixator': noise(0.2, 0.2, 0, 400); say('Команду вимкнено без резерву — <b>фіксатор</b>. Мешканці в безпеці; поверни команду або дай резерв.', 5.5, true); break;
      case 'lever': noise(0.1, 0.14, 0, 900); tone(e.on ? 330 : 247, 0.2, 0.06, 'square'); break;
      case 're-unlocked': tone(NOTE.re, 1, 0.15, 'sine', 0, 0, 1); tone(NOTE.la, 1.2, 0.07, 'sine', 0.2); say('Нова нота: <b>ре</b> — крок відлуння. <b>L / Shift</b>. Здоров’я й заряди відновлено, збережено.', 6, true); break;
      case 'station': if (game.flags.re) say('Станція: ремонт і збереження.', 2.2); break;
      case 'voice': tone(NOTE.do, 3, 0.12); tone(NOTE.sol, 3, 0.07, 'sine', 0.25); tone(NOTE.mi * 2, 3, 0.05, 'sine', 0.5); say('Центральне обличчя: «Тепер ти пам’ятаєш.»', 5, true); say('Далеко згасає одне житлове вікно.', 4); break;
      case 'gate': noise(0.6, 0.12, 0, 260); tone(73.4, 0.8, 0.12, 'triangle'); break;
      case 'gate-closing': noise(0.8, 0.12, 0, 200); break;
      case 'hurt': hurtFlash = 1; shake = 0.6; hpHitT = 0.4; tone(58, 0.35, 0.25, 'sawtooth', 0, 0, 0.2); noise(0.15, 0.2, 0, 400); break;
      case 'dead': setTimeout(() => showDeath(e.boss), 650); tone(49, 1.6, 0.2, 'sine'); break;
      case 'respawn': say(game.boss.state === 'dormant' && game.flags.introSeen ? 'Повтор лише бою. Задачі, ре і здоров’я збережено.' : 'Повернення до останньої точки.', 3, true); break;
      case 'encounter': if (e.id === 'P2') say('Тактовик: <b>підняв інструмент</b> — сектор на підлозі. Обійди збоку.', 5, true); else say('Рупор: віяло імпульсів. Позначений <b>ромбом</b> можна повернути <b>до</b> (K).', 5.5, true); break;
      case 'wave': if (e.enc === 'P6' && e.wave === 1) say('Пара: сигнали <b>чергуються</b>. Один відповідальний за раз.', 4, true); break;
      case 'encounter-done': say(e.id === 'P2' ? 'Тактовик зупинений. Сходи відкрито.' : 'Передзал тихий. Брама Трьох облич відкрита.', 3.5, true); tone(261.63, 0.9, 0.08); break;
      case 'tact-windup': noise(0.15, 0.08, panOf(e.x), 1200); break;
      case 'tact-click': tone(1500, 0.04, 0.12, 'square', 0, panOf(e.x), 0.2); break;
      case 'tact-strike': noise(0.25, 0.3, panOf(e.x), 300); tone(70, 0.3, 0.2, 'sine', 0, panOf(e.x)); shake = Math.max(shake, 0.25); break;
      case 'horn-tele': tone(147, 1, 0.08, 'sawtooth', 0, panOf(e.x), 0.6); break;
      case 'horn-fire': tone(196, 0.3, 0.12, 'triangle', 0, panOf(e.x), 0.6); break;
      case 'test-pulse': tone(NOTE.do * 2, 0.25, 0.05, 'sine', 0, 0, 0.6); break;
      case 'test-fizz': if (!hint.fizz) { hint.fizz = 1; say('Тестовий імпульс безпечний. Натисни <b>K</b> у момент контакту, дивлячись на трубу.', 5); } break;
      case 'emitter-back': say('Імпульс повернувся у вузол. Подивись на трубу перед відбиттям.', 3); break;
      case 'boss-intro': if (!e.skip) { say('Решітка G05 опускається. Бокові відлуння стихають.', 3, true); } break;
      case 'mask-wake': tone(VOICE_FREQ[e.idx], 1.4, 0.14, 'triangle', 0, (e.idx - 1) * 0.7, 1); if (e.idx === 2) say('Дискант: «Побудь до кінця фрази.»', 4); break;
      case 'phase': tone([0, 98, 196, 261.63][e.phase], 1.4, 0.12, 'sine', 0, 0, 1); say(['', 'Ⅰ · <b>Бас</b>: віяло з проходами. Позначений імпульс — назад через <b>до</b>.', 'Ⅱ · <b>Середній голос</b>: кільце з проходом і промінь. Читай клин.', 'Ⅲ · Голоси <b>чергуються</b>. Звучить одна маска за раз.'][e.phase], 5, true); break;
      case 'boss-tele': tone(VOICE_FREQ[e.mask] * ({ fan: 1, ring: 1.5, beam: 2, orb: 1.25 }[e.kind]), 0.9, 0.12, 'triangle', 0, (e.mask - 1) * 0.7, 0.8); break;
      case 'boss-attack': noise(0.3, 0.16, (e.mask - 1) * 0.7, e.kind === 'ring' ? 220 : 600); break;
      case 'mask-hit': tone(e.how === 'do' ? NOTE.do * 2 : 330, 0.4, 0.14, 'sine', 0, 0, 0.9); noise(0.1, 0.2, 0, 1800); game.boss.flash = 0.2; break;
      case 'mask-deflect': noise(0.05, 0.1, 0, 3200); if (!hint.mask) { hint.mask = 1; say('Ця маска мовчить. Шкоду приймає лише та, що <b>звучить</b>.', 4); } break;
      case 'victory': tone(196, 3, 0.1); tone(261.63, 3, 0.08, 'sine', 0.3); say('Атаки стихли. Велика рука лягає долонею догори.', 5, true); break;
      case 'end': setTimeout(showEnd, 900); break;
      case 'edge': noise(0.06, 0.06, 0, 2000); break;
    }
  }
}
const hint = {};

// ——— HUD ———
function updateHud() {
  const p = game.player, b = game.boss;
  const hp = $('hp');
  if (hp.childElementCount !== M.hpMax) hp.innerHTML = '<i></i>'.repeat(M.hpMax);
  [...hp.children].forEach((el, i) => { el.classList.toggle('off', i >= p.hp); el.classList.toggle('hit', hpHitT > 0 && i === p.hp); });
  hp.setAttribute('aria-label', `Міцність ${p.hp} з ${M.hpMax}`);
  $('repairs').textContent = p.repairs;
  const showBoss = ['intro', 'fight', 'trans'].includes(b.state);
  $('boss').hidden = !showBoss;
  if (showBoss) {
    $('boss-fill').style.width = (b.hp / b.max * 100) + '%';
    [...document.querySelectorAll('.boss-dots i')].forEach((d, i) => { d.className = i + 1 < b.phase ? 'done' : i + 1 === b.phase ? 'on' : ''; });
    $('boss-voice').textContent = b.state === 'intro' ? 'прокидаються' : `звучить: ${MASK_NAMES[b.active]}`;
  }
  const obj = game.objective();
  if (obj !== lastObjective) { $('objective-text').textContent = obj; lastObjective = obj; const el = $('objective'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  const nDo = $('note-do'), nRe = $('note-re');
  nDo.querySelector('.cd').style.height = (p.parryCD / M.parryCD * 100) + '%';
  nDo.classList.toggle('active', p.parryWin > 0);
  nRe.classList.toggle('locked', !game.flags.re);
  nRe.querySelector('.cd').style.height = game.flags.re ? (p.reCD / M.reCD * 100) + '%' : '0%';
  nRe.classList.toggle('active', p.dash > 0 && p.dashKind === 're');
  $('t-re').disabled = !game.flags.re;
  const it = game.mode === 'play' ? game.nearestInteractable() : null;
  $('prompt').hidden = !it; if (it) $('prompt-text').textContent = it.label;
  $('t-interact').hidden = !it;
  const rr = $('repair-ring'); rr.hidden = !(p.repairT > 0);
  if (p.repairT > 0) rr.querySelector('i').style.setProperty('--p', ((1 - p.repairT / M.repairTime) * 100) + '%');
  $('vignette').style.opacity = String(Math.max(hurtFlash * 0.9, p.hp === 1 ? 0.35 : 0));
}

// ——— Панелі ———
function panel(kicker, title, text, actions, stats = null) {
  $('panel-kicker').textContent = kicker; $('panel-title').textContent = title; $('panel-text').innerHTML = text;
  $('panel-stats').innerHTML = stats ? stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('') : '';
  const box = $('panel-actions'); box.replaceChildren();
  actions.forEach(([name, fn, main], i) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = name; if (main || i === 0) b.className = 'main'; b.onclick = fn; box.append(b); });
  $('panel').hidden = false; box.querySelector('button')?.focus();
  keys.clear(); stick.x = stick.y = 0;
}
const hidePanel = () => { $('panel').hidden = true; };
function showDeath(boss) {
  panel('Сигнал перервався', boss ? 'Ще одна фраза' : 'Ще раз', boss ? 'Повернешся біля входу до арени. Головоломки, бої передзалу й <b>ре</b> збережено; здоров’я та ремонт повні.' : 'Повернешся до останньої точки. Вирішені задачі й відкриті ворота лишаються.', [['Продовжити', () => { hidePanel(); game.respawn(); handleEvents(); }]]);
}
function showEnd() {
  const st = game.stats, secs = Math.round(game.time), mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
  try { localStorage.setItem('choir-l01-last', JSON.stringify({ time: secs, hits: st.hits, returned: st.returned, deaths: st.deaths })); } catch {}
  say('Провідник: «Завдання виконано… частково.»', 6, true);
  panel('Кінець L01 · Поріг тиші', 'Тепер тихіше', 'Сигнал припинено. Голос у камертоні. Одне житлове вікно далеко за залом більше не світиться.', [['Пройти ще раз', restart], ['Залишитись тут', () => { hidePanel(); game.mode = 'play'; }]], [[`${mm}:${ss}`, 'час'], [st.returned, 'повернень до'], [st.hits, 'влучань'], [st.deaths, 'повторів']]);
}
function setPause(v) {
  if (!started || game.mode !== 'play' && v) return;
  paused = v; keys.clear(); stick.x = stick.y = 0;
  if (v) { ac?.suspend?.().catch(() => {}); panel('Пауза', 'Зал чекає', 'WASD — рух · J / клік — удар · Space — ухилення · K — до · L / Shift — ре · R — ремонт · E — дія · H — підказка', [['Продовжити', () => setPause(false)], ['Почати рівень заново', restart]]); }
  else { hidePanel(); initAudio(); }
}
function restart() {
  hidePanel(); paused = false; game.reset(); lastObjective = '';
  captionQueue = []; captionUntil = 0;
  say('Провідник: «Сигнал триває. Джерело за мостом.»', 5);
  say('Три маски вдалині — орієнтир. Дійди до труб.', 4);
  initAudio();
}

// ——— Ввід ———
function inputVec() {
  let x = stick.x, y = stick.y;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
  // екранний напрямок → світовий (камера повернута на YAW)
  return { x: x * CY + y * SY, y: -x * SY + y * CY };
}
function act(name) {
  if (!started || paused || !$('panel').hidden) return;
  initAudio();
  if (name === 'dodge') game.dodge(inputVec());
  else if (name === 're') game.re(inputVec());
  else if (name === 'hint') { const h = game.hint(); say(h ? `Підказка: ${h}` : 'Тут задачі немає. Ціль — праворуч угорі.', 4, true); }
  else game[name]();
  handleEvents();
}
const KEYMAP = { KeyJ: 'attack', Space: 'dodge', KeyK: 'parry', KeyL: 're', ShiftLeft: 're', ShiftRight: 're', KeyR: 'repair', KeyE: 'interact', KeyH: 'hint' };
addEventListener('keydown', e => {
  if (e.code === 'Escape') { if (started && game.mode === 'play') setPause(!paused); return; }
  if (!started) { if (e.code === 'Enter') $('start').click(); return; }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && $('panel').hidden) e.preventDefault();
  keys.add(e.code);
  if (KEYMAP[e.code] && !e.repeat) act(KEYMAP[e.code]);
});
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) act('attack'); });
addEventListener('blur', () => { keys.clear(); stick.x = stick.y = 0; if (started && game.mode === 'play') setPause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started && game.mode === 'play') setPause(true); });

// плаваючий стік і кнопки
function enableTouch() { if (document.body.classList.contains('touch')) return; isTouch = true; document.body.classList.add('touch'); if (started) $('touch').hidden = false; }
addEventListener('touchstart', enableTouch, { passive: true, once: true });
const zone = $('stick-zone'), stickEl = $('stick'), knob = $('knob');
zone.addEventListener('pointerdown', e => {
  stick.id = e.pointerId; zone.setPointerCapture(e.pointerId);
  const r = zone.getBoundingClientRect(); stick.ox = e.clientX; stick.oy = e.clientY;
  stickEl.style.left = (e.clientX - r.left) + 'px'; stickEl.style.top = (e.clientY - r.top) + 'px'; stickEl.classList.add('on');
});
zone.addEventListener('pointermove', e => {
  if (e.pointerId !== stick.id) return;
  const dx = e.clientX - stick.ox, dy = e.clientY - stick.oy, max = 46, l = Math.hypot(dx, dy), k = l > max ? max / l : 1;
  stick.x = dx * k / max; stick.y = dy * k / max; knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
});
const releaseStick = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; stickEl.classList.remove('on'); };
['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => zone.addEventListener(n, releaseStick));
document.querySelectorAll('[data-act]').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); b.classList.add('press'); act(b.dataset.act); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => b.addEventListener(n, () => b.classList.remove('press')));
});
let holdAttack = false;
document.querySelector('[data-act="attack"]').addEventListener('pointerdown', () => holdAttack = true);
addEventListener('pointerup', () => holdAttack = false);

$('start').onclick = () => {
  started = true; $('title').hidden = true; $('hud').hidden = false;
  if (isTouch) { document.body.classList.add('touch'); $('touch').hidden = false; }
  restart();
};
$('pause-btn').onclick = () => setPause(!paused);
$('hint-btn').onclick = () => act('hint');
$('sound-btn').onclick = () => { muted = !muted; initAudio(); if (master) master.gain.value = muted ? 0 : 0.5; $('sound-btn').textContent = muted ? 'Без звуку' : 'Звук'; };

// ——— Цикл ———
let beat = -1;
function frame(ts) {
  const now = ts / 1000, dt = last ? Math.min(now - last, 0.05) : 0; last = now;
  if (started && !paused && $('panel').hidden) {
    game.step(dt, inputVec());
    if ((holdAttack || keys.has('KeyJ')) && game.player.atkCD <= 0) game.attack();
    handleEvents();
    // 96 BPM: транспорт звучить лише у бою — доля 0,625 с
    const b = game.boss;
    if (b.state === 'fight' || b.state === 'trans') {
      const n = Math.floor(game.time / 0.625);
      if (n !== beat) { beat = n; tone(n % 4 === 0 ? 65.41 : 98, 0.4, n % 4 === 0 ? 0.1 : 0.05, 'sine', 0, 0, 0.3); if (b.phase >= 2 && n % 2 === 0) tone(196, 0.3, 0.03, 'triangle', 0, 0, 0.5); }
    }
  } else if (!started) game.effects = game.effects.filter(e => (e.life -= dt) > 0);
  hurtFlash = Math.max(0, hurtFlash - dt * 2.5); shake = Math.max(0, shake - dt * 3); hpHitT = Math.max(0, hpHitT - dt);
  updateCamera(dt || 0.016);
  render(now);
  if (started) { updateHud(); tickCaption(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// для автоматичних перевірок у браузері
window.__choir = { game, act, cam };
