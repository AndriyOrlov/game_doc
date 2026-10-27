// Хор порожніх машин · вебпрототип 0.8 · симуляція L01 «Поріг тиші»
// Чиста логіка без DOM: одиниці — метри та секунди, вісь y дивиться на південь (вниз екрана).
// Джерело: L01_GAMEPLAY v0.8, L01_BLOCKOUT.json, L01_GATES, ENEMIES, PZ-01, PZ-09, METRICS.

export const VERSION = '0.8.0';
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const angleTo = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Метрики (METRICS.md, стартові гіпотези)
export const M = {
  speed: 4,            // CH-05
  radius: 0.28,        // CH-02
  dodgeDist: 2, dodgeTime: 0.3, dodgeInv: 0.24, dodgeCD: 0.7, // CB-02..04
  reDist: 2.6, reTime: 0.16, reInv: 0.16, reCD: 3,
  parryWin: 0.22, parryCD: 0.55, // CB-05 (допоміжне вікно)
  reach: 1.3,          // CB-01
  hurtGuard: 1,        // CB-10
  hpMax: 5, repairs: 2, repairTime: 0.9, repairHeal: 2,
  shot: 4,             // CB-07
};

// Майданчики й мости. Топологія та розміри — з L01_BLOCKOUT; розташування розвернуте під камеру 3/4.
export const SHAPES = [
  { id: 'P0', type: 'rect', x1: -5, x2: 5, y1: -4, y2: 4, z: 0, name: 'Прибуття' },
  { id: 'B01', type: 'rect', bridge: true, x1: 4.5, x2: 16.5, y1: -1.5, y2: 1.5, z: 0 },
  { id: 'P1', type: 'rect', x1: 16, x2: 30, y1: -6, y2: 6, z: 0, name: 'Відгук' },
  { id: 'B12', type: 'rect', bridge: true, x1: 29.5, x2: 41.5, y1: -1.5, y2: 1.5, z: 0, gate: 'G01' },
  { id: 'P2', type: 'rect', x1: 41, x2: 53, y1: -6, y2: 6, z: 0, name: 'Один Тактовик' },
  { id: 'S23', type: 'rect', bridge: true, stairs: true, x1: 45.5, x2: 48.5, y1: -18.5, y2: -5.5, z: 0, zTop: 3, gate: 'G02' },
  { id: 'P3', type: 'rect', x1: 42, x2: 52, y1: -26, y2: -18, z: 3, name: 'Сходовий майданчик' },
  { id: 'B34', type: 'rect', bridge: true, x1: 31.5, x2: 42.5, y1: -23.5, y2: -20.5, z: 3 },
  { id: 'P4', type: 'rect', x1: 18, x2: 32, y1: -28, y2: -16, z: 3, name: 'Резерв' },
  { id: 'B45', type: 'rect', bridge: true, x1: 7.5, x2: 18.5, y1: -23.5, y2: -20.5, z: 3, gate: 'G04' },
  { id: 'P5', type: 'rect', x1: -2, x2: 8, y1: -27, y2: -17, z: 3, name: 'Сервісна пауза' },
  { id: 'B56', type: 'rect', bridge: true, x1: 1, x2: 5, y1: -37.5, y2: -26.5, z: 3 },
  { id: 'P6', type: 'rect', x1: -7, x2: 13, y1: -55, y2: -37, z: 3, name: 'Відповідь у парі' },
  { id: 'B67', type: 'rect', bridge: true, x1: 1, x2: 5, y1: -61.6, y2: -54.5, z: 3, gate: 'G05' },
  { id: 'P7', type: 'circle', x: 3, y: -73, r: 12, z: 3, name: 'Три обличчя' },
  { id: 'B78', type: 'rect', bridge: true, x1: 14.4, x2: 25.5, y1: -74.5, y2: -71.5, z: 3, gate: 'G06' },
  { id: 'P8', type: 'rect', x1: 25, x2: 37, y1: -77, y2: -69, z: 3, name: 'Післямова' },
];
export const SHAPE = Object.fromEntries(SHAPES.map(s => [s.id, s]));

// Ворота L01_GATES. G03 належить PZ-08, якої в цій збірці немає.
export const GATES = {
  G01: { x: 30.6, y: 0, axis: 'x', w: 3, z: 0, sign: 'PZ-01' },
  G02: { x: 47, y: -6.4, axis: 'y', w: 3, z: 0, sign: 'Тактовик' },
  G04: { x: 17.4, y: -22, axis: 'x', w: 3, z: 3, sign: 'PZ-09' },
  G05: { x: 3, y: -55.6, axis: 'y', w: 4, z: 3, sign: 'Хвилі P6' },
  G06: { x: 15.6, y: -73, axis: 'x', w: 3, z: 3, sign: 'Бос', doors: true },
};

export const ARENA = SHAPE.P7;
const maskPoint = dx => ({ x: ARENA.x + dx, y: ARENA.y - Math.sqrt(ARENA.r ** 2 - dx * dx) - 0.55 });
export const MASKS = [maskPoint(-5), maskPoint(0), maskPoint(5)];
export const MASK_NAMES = ['Бас', 'Середній голос', 'Дискант'];

// PZ-01: труби A/B/C, тестовий вузол і сервісний важіль
export const PZ01 = {
  emitter: { x: 21, y: 1.6 },
  ports: { A: { x: 18, y: -6.4, role: 'глуха мембрана' }, B: { x: 23.5, y: 6.4, role: 'тестовий дзвін' }, C: { x: 28.4, y: -6.4, role: 'підйомник' } },
  lever: { x: 29, y: 3.6 },
  hints: ['Подивись, що рухається біля підйомника.', 'Відгук іде третьою трубою, C.', 'Поверни імпульс у C та натисни важіль.'],
};
// PZ-09: команда, резерв і живлення; маятник перекриває вихід
export const PZ09 = {
  levers: { reserve: { x: 21.5, y: -27.4, label: 'Резерв' }, command: { x: 25, y: -27.4, label: 'Команда' }, power: { x: 28.5, y: -27.4, label: 'Живлення' } },
  pendulum: { x: 18.6, y: -22 },
  hints: ['Маятник і живлення мають різні лінії.', 'Спочатку резерв.', 'Резерв ON, команда OFF, живлення ON.'],
};
export const STATION = { x: 3, y: -25.6 };
export const PALM = { x: 3, y: -72 };

const inRect = (s, p, m = 0) => p.x >= s.x1 + m && p.x <= s.x2 - m && p.y >= s.y1 + m && p.y <= s.y2 - m;
const inShape = (s, p, m = 0) => s.type === 'circle' ? Math.hypot(p.x - s.x, p.y - s.y) <= s.r - m : inRect(s, p, m);

export class Game {
  constructor(seed = 7) { this.seed = seed; this.reset(); }

  reset() {
    this.rand = rng(this.seed);
    this.time = 0;
    this.mode = 'play';
    this.events = [];
    this.player = { x: 0, y: 1, hp: M.hpMax, repairs: M.repairs, face: 0, inv: 0, hurtCD: 0, dash: 0, dashDir: 0, dashSpeed: 0, dodgeCD: 0, reCD: 0, parryWin: 0, parryCD: 0, atkCD: 0, atkAnim: 0, combo: 0, lastAtk: -9, repairT: 0, moving: 0, walk: 0 };
    this.flags = { re: false, introSeen: false, voiceTaken: false };
    this.gates = { G01: 'locked', G02: 'locked', G04: 'locked', G05: 'locked', G06: 'locked' };
    this.gateT = { G01: 0, G02: 0, G04: 0, G05: 0, G06: 0 }; // 0 закрито … 1 відкрито
    this.checkpoint = { x: 0, y: 1 };
    this.pz01 = { fed: { A: 0, B: 0, C: 0 }, charged: false, done: false, hint: 0, emitT: 1.4, testLive: false };
    this.pz09 = { reserve: false, command: true, power: true, lock: false, done: false, hint: 0 };
    this.windows = [1, 1, 1, 1, 1, 1];
    this.enc = {
      P2: { state: 'idle', token: null, ready: 0, waves: [[{ type: 'tact', x: 48.5, y: -2.5 }]], wave: 0, gap: 0, gate: 'G02' },
      P6: { state: 'idle', token: null, ready: 0, waves: [[{ type: 'horn', x: 3, y: -53.4 }], [{ type: 'horn', x: -3.5, y: -53.2 }, { type: 'tact', x: 9, y: -52.6 }]], wave: 0, gap: 0, gate: 'G05' },
    };
    this.enemies = [];
    this.projectiles = [];
    this.rings = [];
    this.beams = [];
    this.effects = [];
    this.boss = this.freshBoss();
    this.stats = { hits: 0, returned: 0, deaths: 0, start: 0 };
    this.uid = 1;
  }

  freshBoss() { return { state: 'dormant', hp: 36, max: 36, phase: 0, active: 0, t: 0, nextAt: 0, pending: null, step: 0, ring: 0, palm: 0 }; }
  emit(type, data = {}) { this.events.push({ type, ...data }); }

  // ——— Простір ———
  // 'closing' ще прохідний: зайнятий поріг скасовує закриття (L01_GATES)
  gateOpen(id) { return this.gates[id] === 'open' || this.gates[id] === 'closing'; }
  walkable(p, m = M.radius) {
    for (const s of SHAPES) {
      if (s.gate && !this.gateOpen(s.gate)) continue;
      if (inShape(s, p, m)) return true;
    }
    return false;
  }
  shapeAt(p) {
    let best = null;
    for (const s of SHAPES) if (inShape(s, p, 0)) { if (!best || (best.bridge && !s.bridge)) best = s; }
    return best;
  }
  zAt(p) {
    const s = this.shapeAt(p);
    if (!s) return 0;
    if (s.stairs) return clamp((s.y2 - p.y) / (s.y2 - s.y1), 0, 1) * (s.zTop - s.z) + s.z;
    return s.z;
  }
  zoneOf(p) { const s = this.shapeAt(p); return s ? s.id : null; }
  inZone(id, p = this.player, m = 0.6) { return inShape(SHAPE[id], p, m); }

  // ——— Дії гравця ———
  moveDirFrom(input) { const l = Math.hypot(input.x || 0, input.y || 0); return l > 0.2 ? Math.atan2(input.y, input.x) : this.player.face; }
  canAct() { return this.mode === 'play'; }

  attack() {
    const p = this.player;
    if (!this.canAct() || p.atkCD > 0 || p.dash > 0) return false;
    this.cancelRepair();
    p.combo = this.time - p.lastAtk < 0.75 ? (p.combo + 1) % 3 : 0;
    p.lastAtk = this.time; p.atkCD = 0.3; p.atkAnim = 0.26;
    const dmg = p.combo === 2 ? 2 : 1;
    // м’яка фіксація найближчої цілі
    const targets = this.meleeTargets();
    let near = null, nd = 2.6;
    for (const t of targets) { const d = dist(p, t) - t.r; if (d < nd) { nd = d; near = t; } }
    if (near) p.face = angleTo(p, near);
    this.emit('swing', { combo: p.combo });
    let hit = false;
    for (const t of targets) {
      const d = dist(p, t) - t.r;
      if (d > M.reach || Math.abs(angDiff(p.face, angleTo(p, t))) > 78 * DEG) continue;
      hit = true;
      if (t.kind === 'enemy') this.hitEnemy(t.ref, dmg, 'melee');
      else if (t.kind === 'mask') this.hitMask(t.idx, dmg, 'melee');
    }
    if (hit) this.effects.push({ kind: 'strike', x: p.x + Math.cos(p.face) * 1, y: p.y + Math.sin(p.face) * 1, life: 0.2, max: 0.2 });
    return hit;
  }
  meleeTargets() {
    const list = this.enemies.filter(e => e.state !== 'spawn' && e.hp > 0).map(e => ({ kind: 'enemy', ref: e, x: e.x, y: e.y, r: e.r }));
    if (this.boss.state === 'fight' || this.boss.state === 'trans') MASKS.forEach((m, idx) => list.push({ kind: 'mask', idx, x: m.x, y: m.y, r: 0.6 }));
    return list;
  }

  dodge(input = { x: 0, y: 0 }) {
    const p = this.player;
    if (!this.canAct() || p.dodgeCD > 0 || p.dash > 0) return false;
    this.cancelRepair();
    p.dashDir = this.moveDirFrom(input); p.face = p.dashDir;
    p.dash = M.dodgeTime; p.dashSpeed = M.dodgeDist / M.dodgeTime; p.inv = Math.max(p.inv, M.dodgeInv); p.dodgeCD = M.dodgeCD; p.dashKind = 'dodge';
    this.emit('dodge');
    return true;
  }
  // Ре · «Крок відлуння»: окрема коротка корекція позиції, не скидає звичайне ухилення
  re(input = { x: 0, y: 0 }) {
    const p = this.player;
    if (!this.canAct()) return false;
    if (!this.flags.re) { this.emit('re-locked'); return false; }
    if (p.reCD > 0 || (p.dash > 0 && p.dashKind === 're')) return false;
    this.cancelRepair();
    p.dashDir = this.moveDirFrom(input); p.face = p.dashDir;
    p.dash = M.reTime; p.dashSpeed = M.reDist / M.reTime; p.inv = Math.max(p.inv, M.reInv); p.reCD = M.reCD; p.dashKind = 're';
    this.effects.push({ kind: 'echo', x: p.x, y: p.y, life: 0.5, max: 0.5 });
    this.emit('re');
    return true;
  }
  // До · «Повернення»: базове відбиття; позначений імпульс іде до видимого джерела
  parry() {
    const p = this.player;
    if (!this.canAct() || p.parryCD > 0) return false;
    p.parryWin = M.parryWin; p.parryCD = M.parryCD;
    this.emit('parry');
    return true;
  }
  repair() {
    const p = this.player;
    if (!this.canAct() || p.repairT > 0) return false;
    if (p.repairs <= 0 || p.hp >= M.hpMax) { this.emit('repair-no', { reason: p.repairs <= 0 ? 'empty' : 'full' }); return false; }
    p.repairT = M.repairTime;
    this.emit('repair-start');
    return true;
  }
  cancelRepair() { if (this.player.repairT > 0) { this.player.repairT = 0; this.emit('repair-cancel'); } }

  interactables() {
    const list = [];
    if (!this.pz01.done) list.push({ id: 'lever01', x: PZ01.lever.x, y: PZ01.lever.y, label: 'Сервісний важіль' });
    for (const [key, l] of Object.entries(PZ09.levers)) if (!this.pz09.done) list.push({ id: 'pz09:' + key, x: l.x, y: l.y, label: `${l.label}: ${this.pz09[key] ? 'ON' : 'OFF'} → ${this.pz09[key] ? 'OFF' : 'ON'}` });
    list.push({ id: 'station', x: STATION.x, y: STATION.y, label: this.flags.re ? 'Ремонт і збереження' : 'Сервісна станція' });
    if (this.boss.state === 'dead' && this.boss.palm >= 1 && !this.flags.voiceTaken) list.push({ id: 'palm', x: PALM.x, y: PALM.y, label: 'Взяти голос', r: 2.6 });
    return list;
  }
  nearestInteractable() {
    let best = null, bd = 9;
    for (const it of this.interactables()) { const d = dist(this.player, it); if (d < (it.r || 1.7) && d < bd) { bd = d; best = it; } }
    return best;
  }
  interact() {
    if (!this.canAct()) return false;
    const it = this.nearestInteractable();
    if (!it) return false;
    this.cancelRepair();
    if (it.id === 'lever01') this.pullLever01();
    else if (it.id.startsWith('pz09:')) this.togglePz09(it.id.slice(5));
    else if (it.id === 'station') this.useStation();
    else if (it.id === 'palm') this.takeVoice();
    return true;
  }

  // ——— PZ-01 ———
  pullLever01() {
    const z = this.pz01;
    if (z.done) return;
    if (!z.charged) { this.emit('lever-neutral'); return; }
    z.done = true; this.openGate('G01'); this.checkpoint = { x: 23, y: 2.5 };
    this.emit('pz-solved', { id: 'PZ-01' });
  }
  feedPort(key) {
    const z = this.pz01;
    z.fed[key]++;
    this.emit('port', { key });
    if (key === 'C' && !z.charged) { z.charged = true; this.emit('lift-ready'); }
  }

  // ——— PZ-09 ———
  togglePz09(key) {
    const z = this.pz09;
    if (z.done) return;
    z[key] = !z[key];
    if (key === 'command' && z[key]) z.lock = false;
    if (key === 'command' && !z[key] && !z.reserve) { z.lock = true; this.emit('fixator'); }
    this.emit('lever', { key, on: z[key] });
    if (z.reserve && !z.command && z.power && !z.lock) {
      z.done = true; this.openGate('G04'); this.emit('pz-solved', { id: 'PZ-09' });
    }
  }
  homeLineLive() { const z = this.pz09; return z.power && (z.command || z.reserve); }
  pendulumMoving() { const z = this.pz09; return z.power && z.command; }

  useStation() {
    const p = this.player;
    p.hp = M.hpMax; p.repairs = M.repairs;
    this.checkpoint = { x: 3, y: -21.5 };
    if (!this.flags.re) { this.flags.re = true; this.emit('re-unlocked'); }
    this.emit('station');
  }

  takeVoice() {
    this.flags.voiceTaken = true;
    this.windows[3] = 0;
    this.openGate('G06');
    this.effects.push({ kind: 'voice', x: PALM.x, y: PALM.y, life: 1.6, max: 1.6 });
    this.emit('voice');
  }

  openGate(id) { if (this.gates[id] !== 'open') { this.gates[id] = 'open'; this.emit('gate', { id, open: true }); } }

  hint() {
    if (this.inZone('P1', this.player, -1) && !this.pz01.done) { const z = this.pz01; z.hint = Math.min(3, z.hint + 1); return PZ01.hints[z.hint - 1]; }
    if (this.inZone('P4', this.player, -1) && !this.pz09.done) { const z = this.pz09; z.hint = Math.min(3, z.hint + 1); return PZ09.hints[z.hint - 1]; }
    return null;
  }

  // ——— Шкода ———
  hurt(source = null) {
    const p = this.player;
    if (this.mode !== 'play' || p.inv > 0 || p.hurtCD > 0) return false;
    p.hp -= 1; p.hurtCD = M.hurtGuard; this.stats.hits++;
    this.cancelRepair();
    this.emit('hurt', { hp: p.hp });
    if (p.hp <= 0) { this.mode = 'dead'; this.stats.deaths++; this.clearHazards(); this.emit('dead', { boss: this.boss.state !== 'dormant' && this.boss.state !== 'dead' }); }
    return true;
  }
  clearHazards(fx = false) {
    if (fx) for (const pr of this.projectiles) this.effects.push({ kind: 'fizz', x: pr.x, y: pr.y, life: 0.4, max: 0.4 });
    this.projectiles = []; this.rings = []; this.beams = [];
  }

  respawn() {
    if (this.mode !== 'dead') return;
    const p = this.player;
    Object.assign(p, { hp: M.hpMax, repairs: M.repairs, inv: 0.6, hurtCD: 0, dash: 0, repairT: 0, parryWin: 0, atkCD: 0 });
    this.clearHazards();
    if (this.boss.state !== 'dormant' && this.boss.state !== 'dead') {
      // Повтор лише босфайту: вхід P7 готовий і відкритий, P6 лишається завершеною
      this.flags.introSeen = true;
      this.boss = this.freshBoss();
      this.gates.G05 = 'open'; this.gateT.G05 = 1;
      p.x = 3; p.y = -57.5; p.face = -Math.PI / 2;
    } else {
      for (const enc of Object.values(this.enc)) if (enc.state === 'active') { enc.state = 'idle'; enc.wave = 0; enc.token = null; }
      this.enemies = [];
      p.x = this.checkpoint.x; p.y = this.checkpoint.y;
    }
    this.mode = 'play';
    this.emit('respawn');
  }

  // ——— Вороги ———
  spawnWave(encId) {
    const enc = this.enc[encId];
    for (const s of enc.waves[enc.wave]) {
      const e = { id: this.uid++, enc: encId, type: s.type, x: s.x, y: s.y, r: s.type === 'tact' ? 0.65 : 0.8, hp: 4, max: 4, state: 'spawn', t: 0.9, angle: angleTo(s, this.player), lock: 0, cool: 0.4, flash: 0, mark: 0 };
      this.enemies.push(e);
    }
    this.emit('wave', { enc: encId, wave: enc.wave });
  }
  takeToken(enc, e) { if ((enc.token === null || enc.token === e.id) && this.time >= enc.ready) { enc.token = e.id; return true; } return false; }
  freeToken(enc, e) { if (enc.token === e.id) { enc.token = null; enc.ready = this.time + 0.6; } }

  hitEnemy(e, dmg, how) {
    if (e.hp <= 0) return;
    if (e.type === 'tact' && how === 'melee') {
      const behind = Math.abs(angDiff(e.angle, angleTo(e, this.player))) > 110 * DEG;
      if (e.state !== 'recover' && !behind) { e.flash = 0.15; this.emit('guard', { x: e.x, y: e.y }); return; }
    }
    e.hp -= dmg; e.flash = 0.18;
    this.emit('enemy-hit', { type: e.type, how });
    if (e.hp <= 0) {
      this.freeToken(this.enc[e.enc], e);
      this.effects.push({ kind: 'break', x: e.x, y: e.y, life: 0.8, max: 0.8 });
      this.emit('enemy-down', { type: e.type });
    }
  }

  updateEnemy(e, dt) {
    const p = this.player, enc = this.enc[e.enc];
    e.flash = Math.max(0, e.flash - dt);
    const toP = angleTo(e, p), d = dist(e, p);
    if (e.state === 'spawn') { e.t -= dt; e.angle = toP; if (e.t <= 0) { e.state = e.type === 'tact' ? 'chase' : 'idle'; e.t = 1.1; } return; }
    if (e.type === 'tact') {
      if (e.state === 'chase') {
        e.angle += clamp(angDiff(toP, e.angle), -4 * dt, 4 * dt);
        e.cool -= dt;
        if (d > 2.2) {
          const nx = e.x + Math.cos(toP) * 2.2 * dt, ny = e.y + Math.sin(toP) * 2.2 * dt;
          const zone = SHAPE[e.enc];
          if (inShape(zone, { x: nx, y: ny }, 0.9)) { e.x = nx; e.y = ny; }
        }
        if (d < 3 && e.cool <= 0 && this.takeToken(enc, e)) { e.state = 'windup'; e.t = 1; e.lock = toP; e.angle = toP; e.clicks = 0; this.emit('tact-windup', { x: e.x }); }
      } else if (e.state === 'windup') {
        e.t -= dt;
        if (e.clicks === 0 && e.t < 0.62) { e.clicks = 1; this.emit('tact-click', { x: e.x }); }
        if (e.clicks === 1 && e.t < 0.28) { e.clicks = 2; this.emit('tact-click', { x: e.x }); }
        if (e.t <= 0) {
          e.state = 'strike'; e.t = 0.18;
          if (d <= 2.9 + M.radius && Math.abs(angDiff(e.lock, toP)) <= 50 * DEG) this.hurt(e);
          this.emit('tact-strike', { x: e.x });
        }
      } else if (e.state === 'strike') {
        e.t -= dt; if (e.t <= 0) { e.state = 'recover'; e.t = 1.5; this.freeToken(enc, e); }
      } else if (e.state === 'recover') {
        e.t -= dt; if (e.t <= 0) { e.state = 'chase'; e.cool = 0.5; }
      }
    } else { // Рупор: стаціонарна голова на поворотному кільці
      if (e.state === 'idle') {
        e.angle += clamp(angDiff(toP, e.angle), -1.4 * dt, 1.4 * dt);
        e.t -= dt;
        if (e.t <= 0 && this.takeToken(enc, e)) { e.state = 'tele'; e.t = 1; e.lock = e.angle + clamp(angDiff(toP, e.angle), -0.5, 0.5); e.angle = e.lock; e.mark = Math.floor(this.rand() * 5); this.emit('horn-tele', { x: e.x }); }
      } else if (e.state === 'tele') {
        e.t -= dt;
        if (e.t <= 0) {
          for (let i = 0; i < 5; i++) {
            const a = e.lock + (i - 2) * 13 * DEG;
            this.projectiles.push({ x: e.x + Math.cos(a) * 0.9, y: e.y + Math.sin(a) * 0.9, vx: Math.cos(a) * M.shot, vy: Math.sin(a) * M.shot, r: 0.24, marked: i === e.mark, origin: { kind: 'enemy', ref: e }, age: 0 });
          }
          e.state = 'idle'; e.t = 2; this.freeToken(enc, e);
          this.emit('horn-fire', { x: e.x });
        }
      }
    }
  }

  updateEncounters(dt) {
    for (const [id, enc] of Object.entries(this.enc)) {
      if (enc.state === 'idle' && this.inZone(id, this.player, 1.2) && this.gateOpenFor(id)) { enc.state = 'active'; enc.wave = 0; this.spawnWave(id); this.emit('encounter', { id }); }
      if (enc.state !== 'active') continue;
      const alive = this.enemies.some(e => e.enc === id && e.hp > 0);
      if (alive) continue;
      if (enc.wave + 1 < enc.waves.length) {
        enc.gap += dt;
        if (enc.gap > 2) { enc.gap = 0; enc.wave++; this.spawnWave(id); }
      } else {
        enc.state = 'done'; enc.token = null;
        this.openGate(enc.gate);
        this.emit('encounter-done', { id });
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
  }
  gateOpenFor(id) { return id === 'P2' ? this.gateOpen('G01') : this.gateOpen('G04'); }

  // ——— Бос «Три обличчя» ———
  bossSource(idx) { return MASKS[idx]; }
  bossSequence() {
    const b = this.boss;
    if (b.phase === 1) return [{ kind: 'fan', mask: 0 }];
    if (b.phase === 2) return [{ kind: 'ring', mask: 1 }, { kind: 'beam', mask: 1 }, { kind: 'orb', mask: 1 }];
    return [{ kind: 'fan', mask: 0 }, { kind: 'ring', mask: 1 }, { kind: 'beam', mask: 2 }, { kind: 'orb', mask: 2 }, { kind: 'fan', mask: 0 }, { kind: 'beam', mask: 2 }];
  }
  updateBoss(dt) {
    const b = this.boss, p = this.player;
    b.ring += dt * (b.state === 'dead' ? 0.02 : 0.25);
    if (b.state === 'dormant') {
      const inside = inShape(ARENA, p, 0) && !inShape(SHAPE.B67, p, 0);
      if (this.gates.G05 === 'open' && inside && dist(p, { x: 3, y: -61 }) > 3) { this.gates.G05 = 'closing'; this.gateCloseT = 0.9; this.emit('gate-closing', { id: 'G05' }); }
      if (this.gates.G05 === 'closing') {
        if (inShape(SHAPE.B67, p, -0.3)) { this.gates.G05 = 'open'; this.emit('gate', { id: 'G05', open: true }); return; }
        this.gateCloseT -= dt;
        if (this.gateCloseT <= 0) {
          this.gates.G05 = 'fight';
          b.state = 'intro'; b.t = this.flags.introSeen ? 0.8 : 5.2; b.introStep = 0;
          this.emit('boss-intro', { skip: this.flags.introSeen });
        }
      }
      return;
    }
    if (b.state === 'intro') {
      b.t -= dt;
      const marks = [4.2, 2.8, 1.4];
      while (!this.flags.introSeen && b.introStep < 3 && b.t < marks[b.introStep]) { this.emit('mask-wake', { idx: b.introStep }); b.introStep++; }
      if (b.t <= 0) { this.flags.introSeen = true; b.state = 'fight'; b.phase = 1; b.active = 0; b.nextAt = this.time + 0.8; this.emit('phase', { phase: 1 }); }
      return;
    }
    if (b.state === 'trans') { b.t -= dt; if (b.t <= 0) { b.state = 'fight'; b.nextAt = this.time + 0.7; } return; }
    if (b.state === 'dead') { b.palm = Math.min(1, b.palm + dt / 2.4); return; }
    // fight
    if (b.pending) {
      b.pending.t -= dt;
      if (b.pending.t <= 0) { this.launch(b.pending); b.pending = null; }
    } else if (this.time >= b.nextAt) {
      const seq = this.bossSequence();
      const step = seq[b.step % seq.length]; b.step++;
      const src = this.bossSource(step.mask);
      const tele = { fan: 1, ring: 1, beam: 1.1, orb: 0.8 }[step.kind];
      const interval = b.phase === 1 ? 3 : b.phase === 2 ? 2.7 : 2.3;
      b.active = step.mask;
      b.pending = { ...step, t: tele, total: tele, x: src.x, y: src.y, angle: angleTo(src, p), gap: angleTo(src, p) + (this.rand() < 0.5 ? -1 : 1) * (0.25 + this.rand() * 0.35), offset: b.step % 2 ? 0.5 : 0, mark: 3 + Math.floor(this.rand() * 3) };
      b.nextAt = this.time + interval;
      this.emit('boss-tele', { kind: step.kind, mask: step.mask });
    }
  }
  launch(a) {
    const origin = { kind: 'mask', idx: a.mask };
    if (a.kind === 'fan') {
      const n = 9, spread = 120 * DEG;
      for (let i = 0; i < n; i++) {
        const step = spread / (n - 1), shift = a.offset ? step / 4 : -step / 4;
        const ang = a.angle - spread / 2 + i * step + shift;
        this.projectiles.push({ x: a.x, y: a.y, vx: Math.cos(ang) * 4.5, vy: Math.sin(ang) * 4.5, r: 0.26, marked: i === a.mark, origin, age: 0 });
      }
    } else if (a.kind === 'orb') {
      this.projectiles.push({ x: a.x, y: a.y, vx: Math.cos(a.angle) * 3.6, vy: Math.sin(a.angle) * 3.6, r: 0.36, marked: true, origin, age: 0, big: true });
    } else if (a.kind === 'ring') {
      this.rings.push({ x: a.x, y: a.y, R: 0.6, speed: 5, gap: a.gap, gapHalf: 0.2, hit: false });
    } else if (a.kind === 'beam') {
      this.beams.push({ x: a.x, y: a.y, angle: a.angle, width: 1.2, t: 0.3, hit: false });
    }
    this.emit('boss-attack', { kind: a.kind, mask: a.mask });
  }
  hitMask(idx, dmg, how) {
    const b = this.boss;
    if (b.state !== 'fight') { this.emit('mask-deflect', { idx }); return; }
    if (idx !== b.active) { this.emit('mask-deflect', { idx }); return; }
    b.hp = Math.max(0, b.hp - dmg); b.flash = 0.2;
    this.emit('mask-hit', { idx, how });
    const phase = b.hp > 24 ? 1 : b.hp > 12 ? 2 : 3;
    if (b.hp <= 0) {
      b.state = 'dead'; b.pending = null; this.clearHazards(true);
      this.windows[3] = 0.55; // житлове вікно тьмяніє, згасає після взяття голосу
      this.emit('victory');
    } else if (phase !== b.phase) {
      b.phase = phase; b.state = 'trans'; b.t = 1.6; b.pending = null; b.step = 0; b.active = phase === 2 ? 1 : 0;
      this.clearHazards(true);
      this.emit('phase', { phase });
    }
  }

  // ——— Снаряди ———
  returnTargets(pr) {
    const p = this.player, list = [];
    if (pr.origin) {
      if (pr.origin.kind === 'enemy' && pr.origin.ref.hp > 0) list.push({ kind: 'enemy', ref: pr.origin.ref });
      if (pr.origin.kind === 'mask') list.push({ kind: 'mask', idx: pr.origin.idx });
      if (pr.origin.kind === 'emitter') list.push({ kind: 'emitter' });
    }
    if (pr.origin?.kind === 'emitter') for (const k of Object.keys(PZ01.ports)) list.push({ kind: 'port', key: k });
    for (const e of this.enemies) if (e.hp > 0 && e.state !== 'spawn' && !list.some(t => t.ref === e)) list.push({ kind: 'enemy', ref: e });
    if (this.boss.state === 'fight') MASKS.forEach((m, idx) => { if (!list.some(t => t.kind === 'mask' && t.idx === idx)) list.push({ kind: 'mask', idx }); });
    return list;
  }
  targetPos(t) {
    if (t.kind === 'enemy') return t.ref;
    if (t.kind === 'mask') return MASKS[t.idx];
    if (t.kind === 'port') return PZ01.ports[t.key];
    return PZ01.emitter;
  }
  redirect(pr) {
    const p = this.player, cands = this.returnTargets(pr);
    let best = null, bestA = 40 * DEG;
    for (const t of cands) { const a = Math.abs(angDiff(p.face, angleTo(p, this.targetPos(t)))); if (a < bestA) { bestA = a; best = t; } }
    if (!best) best = cands[0] || { kind: 'emitter' };
    pr.friendly = true; pr.target = best; pr.speed = 10; pr.age = 0;
    this.stats.returned++;
    this.effects.push({ kind: 'parry', x: p.x, y: p.y, life: 0.3, max: 0.3 });
    this.emit('do-return', { target: best.kind, key: best.key });
  }
  resolveFriendly(pr) {
    const t = pr.target;
    if (t.kind === 'port') this.feedPort(t.key);
    else if (t.kind === 'emitter') this.emit('emitter-back');
    else if (t.kind === 'enemy') this.hitEnemy(t.ref, 2, 'do');
    else if (t.kind === 'mask') this.hitMask(t.idx, 4, 'do');
    this.effects.push({ kind: 'land', x: pr.x, y: pr.y, life: 0.4, max: 0.4 });
  }
  updateProjectiles(dt) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.age += dt;
      if (pr.friendly) {
        const tp = this.targetPos(pr.target), a = angleTo(pr, tp);
        pr.vx = Math.cos(a) * pr.speed; pr.vy = Math.sin(a) * pr.speed;
        pr.x += pr.vx * dt; pr.y += pr.vy * dt;
        if (dist(pr, tp) < 0.7 || pr.age > 3) { pr.dead = true; this.resolveFriendly(pr); }
        continue;
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt;
      const d = dist(pr, p);
      if (pr.marked && p.parryWin > 0 && d < pr.r + M.radius + 0.55) { this.redirect(pr); continue; }
      if (d < pr.r + M.radius) {
        pr.dead = true;
        if (pr.harmless) { this.effects.push({ kind: 'fizz', x: pr.x, y: pr.y, life: 0.4, max: 0.4 }); this.emit('test-fizz'); }
        else this.hurt(pr);
      }
      if (pr.age > 9) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter(pr => !pr.dead);
    if (this.pz01.testLive && !this.projectiles.some(pr => pr.harmless)) this.pz01.testLive = false;
  }
  updateRingsBeams(dt) {
    const p = this.player;
    for (const r of this.rings) {
      r.R += r.speed * dt;
      const d = dist(r, p);
      if (!r.hit && Math.abs(d - r.R) < 0.32 + M.radius && Math.abs(angDiff(angleTo(r, p), r.gap)) > r.gapHalf) { if (this.hurt(r)) r.hit = true; }
    }
    this.rings = this.rings.filter(r => r.R < 30);
    for (const bm of this.beams) {
      bm.t -= dt;
      const dx = p.x - bm.x, dy = p.y - bm.y;
      const along = dx * Math.cos(bm.angle) + dy * Math.sin(bm.angle);
      const across = Math.abs(-dx * Math.sin(bm.angle) + dy * Math.cos(bm.angle));
      if (!bm.hit && along > 0 && across < bm.width / 2 + M.radius) { if (this.hurt(bm)) bm.hit = true; }
    }
    this.beams = this.beams.filter(b => b.t > 0);
  }

  updatePz01(dt) {
    const z = this.pz01;
    if (z.done || !this.inZone('P1', this.player, 0.4) || this.mode !== 'play') return;
    z.emitT -= dt;
    if (z.emitT <= 0 && !z.testLive) {
      const a = angleTo(PZ01.emitter, this.player);
      this.projectiles.push({ x: PZ01.emitter.x + Math.cos(a) * 0.6, y: PZ01.emitter.y + Math.sin(a) * 0.6, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, r: 0.24, marked: true, harmless: true, origin: { kind: 'emitter' }, age: 0 });
      z.testLive = true; z.emitT = 2.4;
      this.emit('test-pulse');
    }
  }

  // ——— Крок симуляції ———
  step(dt, input = { x: 0, y: 0 }) {
    dt = clamp(dt, 0, 0.05);
    if (this.mode !== 'play') { this.effects = this.effects.filter(e => (e.life -= dt) > 0); return; }
    this.time += dt;
    const p = this.player;
    for (const k of ['inv', 'hurtCD', 'dodgeCD', 'reCD', 'parryWin', 'parryCD', 'atkCD', 'atkAnim']) p[k] = Math.max(0, p[k] - dt);
    for (const id of Object.keys(this.gateT)) {
      const target = this.gates[id] === 'open' ? 1 : 0;
      this.gateT[id] = clamp(this.gateT[id] + (target ? dt / 0.9 : -dt / 0.9), 0, 1);
    }
    // рух
    let vx = 0, vy = 0;
    const len = Math.hypot(input.x || 0, input.y || 0);
    if (p.dash > 0) {
      p.dash = Math.max(0, p.dash - dt);
      vx = Math.cos(p.dashDir) * p.dashSpeed; vy = Math.sin(p.dashDir) * p.dashSpeed;
    } else if (len > 0.08) {
      const k = Math.min(1, len) / len;
      const slow = p.atkAnim > 0.08 ? 0.35 : 1;
      vx = input.x * k * M.speed * slow; vy = input.y * k * M.speed * slow;
      if (p.atkAnim <= 0.08) p.face = Math.atan2(input.y, input.x);
      if (p.repairT > 0 && len > 0.25) this.cancelRepair();
    }
    if (p.repairT > 0) {
      vx = vy = 0;
      p.repairT -= dt;
      if (p.repairT <= 0) { p.repairT = 0; p.hp = Math.min(M.hpMax, p.hp + M.repairHeal); p.repairs--; this.emit('repaired', { hp: p.hp }); }
    }
    const nx = { x: p.x + vx * dt, y: p.y };
    if (this.walkable(nx)) p.x = nx.x; else if (vx) this.edgeBump();
    const ny = { x: p.x, y: p.y + vy * dt };
    if (this.walkable(ny)) p.y = ny.y; else if (vy) this.edgeBump();
    p.moving = Math.hypot(vx, vy);
    p.walk += p.moving * dt;

    this.updatePz01(dt);
    this.updateEncounters(dt);
    for (const e of this.enemies) if (this.mode === 'play') this.updateEnemy(e, dt);
    this.updateBoss(dt);
    if (this.mode === 'play') { this.updateProjectiles(dt); this.updateRingsBeams(dt); }
    this.effects = this.effects.filter(e => (e.life -= dt) > 0);
    if (this.flags.voiceTaken && this.inZone('P8', p, 1) && this.mode === 'play') { this.mode = 'end'; this.emit('end'); }
  }
  edgeBump() { if (this.time - (this.lastBump || -9) > 0.6) { this.lastBump = this.time; this.emit('edge'); } }

  // ——— Текст цілі для HUD ———
  objective() {
    const z1 = this.pz01, z9 = this.pz09, b = this.boss;
    if (this.mode === 'end') return 'Демо завершено';
    if (!z1.done) return z1.charged ? 'Натисни сервісний важіль' : this.inZone('P1', this.player, -2) ? 'Поверни позначений імпульс у трубу підйомника' : 'Дійди до відгуку труб';
    if (this.enc.P2.state !== 'done') return 'Зупини Тактовика';
    if (!z9.done) return z9.lock ? 'Фіксатор: поверни команду, підключи резерв' : 'Зупини маятник, зберігши житлову лінію';
    if (!this.flags.re) return 'Сервісна станція: ремонт і ре';
    if (this.enc.P6.state !== 'done') return this.enc.P6.state === 'active' ? 'Відповідай Рупору й Тактовику' : 'Передзал: прийми бій';
    if (b.state !== 'dead') return b.state === 'dormant' ? 'Увійди до Трьох облич' : 'Почуй, хто звучить, і відповідай';
    if (!this.flags.voiceTaken) return 'Підійди до долоні';
    return 'Вийди на післямову';
  }
}
