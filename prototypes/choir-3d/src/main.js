import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  buildWorld, NODE_POS, FACE_POS, RESONATOR_POS, CONSOLE_POS, SOURCE_POS, PALM_POS, START_POS,
  CHECKPOINT_POS, VOICE_COL, ACTIVE_R, COLUMNS,
} from './world.js';
import { Hero, HERO } from './hero.js';
import { Hazards, Sparks } from './hazards.js';
import { Boss, VOICE_NAMES } from './boss.js';
import { AudioEngine, BAR, BEAT, VOICE } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { clamp, lerp, damp, smooth, textSprite, TAU } from './util.js';

const MOTIF = [2, 0, 1]; // high – low – mid
const REG = ['Низький', 'Середній', 'Високий'];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const GUIDE = 'Провідник';

class Game {
  constructor() {
    this.canvas = document.getElementById('view');
    this.mobile = matchMedia('(pointer: coarse)').matches;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, this.mobile ? 1.5 : 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 420);
    this.world = buildWorld(this.scene, r, { mobile: this.mobile });
    this.audio = new AudioEngine();
    this.sparks = new Sparks(this.scene, this.world.tex.dot);
    this.hazards = new Hazards(this.scene, this.sparks);
    this.hero = new Hero(this.scene, this.world.mats);
    this.guide = this.makeGuide();
    this.boss = new Boss(this);
    this.input = new Input(this.canvas);
    this.ui = new UI();
    this.input.bindTouch(document.getElementById('touch'));
    this.barricadeOrig = this.world.barricade.parts.map((p) => ({ p: p.position.clone(), q: p.quaternion.clone() }));
    this.setupComposer();
    this.buildDebug();
    this.bindDom();
    this.T = 0; this.curBar = null; this.nextBeat = 0; this.nextStep = 0; this.lastBeatIdx = -1; this.beatPulse = 0; this.syncA = null; this.syncT = 0;
    this.camPos = V3(0, 30, 60); this.camTgt = V3(0, 6, 0); this.camBlend = 0; this.shake = 0;
    this.paused = false; this.debug = false; this.assist = false;
    this.resetAll();
    this.state = 'title';
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing()) this.setPaused(true); });
    this.resize();
    this.last = performance.now();
    this.fpsAcc = 0; this.fpsN = 0;
    requestAnimationFrame((n) => this.loop(n));
  }

  playing() { return !['title', 'end'].includes(this.state); }

  // ------------------------------------------------------------------ setup
  setupComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: this.mobile ? 0 : 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.8, 0.55, 0.95);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  makeGuide() {
    const g = new THREE.Group();
    const m = this.world.mats;
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.46, 4), m.brass); body.position.y = 0.05; body.rotation.y = Math.PI / 4; g.add(body);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.3), m.copper); base.position.y = -0.2; g.add(base);
    const pend = new THREE.Group(); pend.position.y = 0.22; g.add(pend);
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.4, 0.018), m.copper); rod.position.y = -0.2; pend.add(rod);
    const wmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.0, 1.9) });
    const wt = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), wmat); wt.position.y = -0.3; pend.add(wt);
    g.position.set(START_POS.x - 1, 2, START_POS.y + 1);
    this.scene.add(g);
    return { g, pend, wmat, talk: 0 };
  }

  buildDebug() {
    const g = new THREE.Group(); g.visible = false;
    const line = (pts, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const l = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.85 }));
      l.renderOrder = 998; g.add(l);
    };
    const circle = (x, z, r, c) => line(Array.from({ length: 64 }, (_, i) => V3(x + Math.cos((i / 64) * TAU) * r, 0.07, z + Math.sin((i / 64) * TAU) * r)), c);
    const rect = (s, c) => line([V3(s.x0, 0.07, s.z0), V3(s.x1, 0.07, s.z0), V3(s.x1, 0.07, s.z1), V3(s.x0, 0.07, s.z1)], c);
    for (const s of this.world.walk) s.t === 'c' ? circle(s.x, s.z, s.r, 0xf0b257) : rect(s, 0xf0b257);
    for (const s of this.world.obst) s.t === 'c' ? circle(s.x, s.z, s.r, 0xff5a4a) : rect(s, 0xff5a4a);
    circle(0, 0, ACTIVE_R, 0x5fd3c8);
    for (const c of COLUMNS) circle(c.x, c.y, 0.74, 0x9ff0ff);
    const labels = [
      ['Старт · міст', 0, 46], ['Барикада: 3 удари', 0, 41.2], ['Передзал', 4, 31], ['Перегородка', 0, 29.5], ['Резонатор-головоломка', -7.6, 24],
      ['Поріг: вправа', 0, 18.4], ['Checkpoint', 0, 12.6], ['Активна зона r 12 м', 0, 4], ['Ніша · резонатор', -17, 2.5], ['Ніша перепочинку', 17.2, 2.5],
      ['Голосник: бас', -6.3, -9.6], ['Голосник: середній', 0, -10.9], ['Голосник: дискант', 6.3, -9.6], ['Колона ловить промінь', COLUMNS[2].x, COLUMNS[2].y + 1.6],
      ['Долоня (фінал)', PALM_POS.x, PALM_POS.y + 1.6],
    ];
    for (const [t, x, z] of labels) { const s = textSprite(t, { size: 30, scale: 0.85 }); s.position.set(x, 2.4, z); g.add(s); }
    this.scene.add(g);
    this.debugGroup = g;
  }

  bindDom() {
    const q = (s) => document.querySelector(s);
    q('#btn-start').addEventListener('click', () => this.begin('full'));
    q('#btn-fight').addEventListener('click', () => this.begin('fight'));
    q('#btn-resume').addEventListener('click', () => this.setPaused(false));
    q('#btn-p-fight').addEventListener('click', () => { this.setPaused(false); this.begin('fight'); });
    q('#btn-p-start').addEventListener('click', () => { this.setPaused(false); this.begin('full'); });
    q('#btn-e-fight').addEventListener('click', () => this.begin('fight'));
    q('#btn-e-start').addEventListener('click', () => this.begin('full'));
    for (const id of ['opt-assist', 'p-assist']) q('#' + id).addEventListener('change', (e) => this.setAssist(e.target.checked));
    for (const id of ['opt-debug', 'p-debug']) q('#' + id).addEventListener('change', (e) => this.setDebug(e.target.checked));
    q('#p-sound').addEventListener('change', (e) => this.audio.setMuted(!e.target.checked));
    document.querySelectorAll('[data-reg]').forEach((b) => b.addEventListener('click', () => this.puzzleInput(+b.dataset.reg)));
    document.querySelectorAll('[data-pz]').forEach((b) => b.addEventListener('click', () => this.puzzleCmd(b.dataset.pz)));
    q('#btn-menu').addEventListener('click', () => { if (this.playing()) this.setPaused(!this.paused); });
    document.getElementById('touch').hidden = !this.input.touch;
    if (this.input.touch) this.setAssist(true);
    this.latOffset = 0;
    try { this.latOffset = +(localStorage.getItem('choir-lat') || 0); } catch (e) { /* storage blocked */ }
    const lat = q('#p-lat'), latv = q('#p-lat-v');
    const showLat = () => { latv.textContent = (this.latOffset > 0 ? '+' : '') + this.latOffset + ' мс'; };
    lat.value = this.latOffset; showLat();
    lat.addEventListener('input', () => { this.latOffset = +lat.value; showLat(); try { localStorage.setItem('choir-lat', this.latOffset); } catch (e) { /* storage blocked */ } });
    document.body.classList.toggle('is-touch', this.input.touch);
  }

  setAssist(v) { this.assist = v; this.hero.assist = v; for (const id of ['opt-assist', 'p-assist']) document.getElementById(id).checked = v; }
  setDebug(v) {
    this.debug = v; this.debugGroup.visible = v; this.hero.hb.visible = v;
    for (const id of ['opt-debug', 'p-debug']) document.getElementById(id).checked = v;
    document.getElementById('fps').hidden = !v;
  }
  setPaused(v) {
    if (!this.playing()) return;
    this.paused = v;
    this.ui.show('pause', v);
    if (v) this.audio.suspend(); else { this.audio.resume(); this.syncA = null; }
  }

  // ------------------------------------------------------------------ state resets
  resetAll() {
    const W = this.world;
    this.flags = { barricade: true, ante: false, consoleSeen: false, solved: false, training: 0, tParries: 0, tPulses: 0, tWaves: 0, arena: false, fight: false, finale: false, palmReady: false, palm: false, firstPulse: false, sealedHint: false };
    W.state.puzzleGateOpen = false; W.state.arenaGateOpen = false; W.state.barricade = true;
    W.puzzleGate.position.y = 0; W.arenaGate.position.y = 0;
    W.barricade.group.visible = true; W.barricade.hp = 3;
    W.barricade.parts.forEach((p, i) => { p.position.copy(this.barricadeOrig[i].p); p.quaternion.copy(this.barricadeOrig[i].q); p.userData.v = null; });
    W.checkpoint.on = false;
    this.hero.reset(START_POS.x, START_POS.y, Math.PI);
    this.boss.reset();
    this.hazards.clear();
    this.resonator = { ready: true, charge: 1 };
    this.stats = { start: 0, hits: 0, parries: 0, resonator: 0, deaths: 0, end: 0 };
    this.tweens = []; this.timers = []; this.cine = null;
    for (const h of W.hands) { h.group.position.copy(h.restP); h.group.quaternion.copy(h.restQ); h.setCurl(0.95); }
    this.puzzle = { entered: [] };
    this.ui.clearSubs();
    this.sourceGlow = 0;
  }

  begin(mode) {
    this.audio.init();
    this.syncA = null;
    this.ui.show('title', false); this.ui.show('end', false); this.ui.show('dead', false); this.ui.show('puzzle', false);
    this.ui.show('hud', true);
    this.resetAll();
    if (mode === 'full') {
      this.startCS01();
    } else {
      this.toArenaReady();
      this.hero.reset(0, 9.2, Math.PI);
      this.world.state.arenaGateOpen = false; this.world.arenaGate.position.y = 0;
      this.boss.awake = [true, true, true];
      this.camBlend = 1;
      const a = this.arenaCam(this.hero.pos); this.camPos.copy(a.p); this.camTgt.copy(a.t);
      this.startFight();
    }
  }

  toArenaReady() {
    const W = this.world, F = this.flags;
    F.barricade = false; W.state.barricade = false; W.barricade.group.visible = false;
    F.ante = true; F.consoleSeen = true; F.solved = true; F.training = 3; F.arena = true;
    W.state.puzzleGateOpen = true; W.puzzleGate.position.y = -4.6;
    W.checkpoint.on = true;
  }

  // ------------------------------------------------------------------ transport
  // audio is scheduled earlier by the device output latency so the beat is HEARD when it is SEEN
  latency() {
    const c = this.audio.ctx; if (!c) return 0;
    const auto = Math.min(0.25, (c.outputLatency || 0) + (c.baseLatency || 0));
    return Math.max(0, auto + (this.latOffset || 0) / 1000);
  }
  audioAt(t) { const n = this.audio.now; return Math.max(n, n + (t - this.T) - this.latency()); }
  // how far (s) a game-time moment is from the nearest beat
  beatError(t) { const f = ((t % BEAT) + BEAT) % BEAT; return Math.min(f, BEAT - f); }

  musicMode() {
    if (this.state === 'title') return 'title';
    if (this.boss.state === 'finale' || this.boss.state === 'done') return 'finale';
    if (this.flags.fight) return 'fight';
    return 'explore';
  }

  // 16th-note sequencer. One transport drives music and boss patterns.
  scheduleStep(st, ts) {
    if (!this.audio.ok || this.audio.ctx.state !== 'running') return;
    const A = this.audio, at = this.audioAt(ts), k = st % 16, bar = Math.floor(st / 16), mode = this.musicMode();
    if (mode === 'title') return;
    const tones = A.chordTones(bar), root = tones[3];
    const S = BEAT / 4;
    if (mode === 'explore') {
      if (k === 0) { A.padChord(bar, at, 0.7); A.bassNote(at, root + 12, BAR * 0.9, 0.55); A.kick(at, 0.35); }
      if (k % 2 === 0) A.arp(at, tones[(k / 2) % 3] + 24 + (k >= 8 ? 12 : 0), 0.55);
      if (k === 8) A.kick(at, 0.22);
      return;
    }
    if (mode === 'finale') {
      if (k === 0) { A.padChord(bar, at, 0.5); A.lead(at, tones[0] + 24, BAR * 0.8, 0.7); }
      if (k === 8) A.lead(at, tones[2] + 24, BAR * 0.4, 0.5);
      return;
    }
    const B = this.boss, P = B.phase;
    const quiet = B.muteBars > 0 || B.skip > 0 || (B.openBar >= 0 && ts >= B.openBar - 0.01 && ts < B.openBar + BAR - 0.01) || this.state === 'dead';
    if (k === 0) { A.padChord(bar, at, quiet ? 0.6 : 0.9); if (!quiet && P >= 2) A.organ(bar, at, BAR, P === 3 ? 1.2 : 1); }
    if (quiet) { if (k === 0) A.bell(at, 440 * Math.pow(2, (tones[0] + 12 - 69) / 12), 0.12, 2); if (k === 8) A.kick(at, 0.4); return; }
    // drums
    const kicks = P === 1 ? [0, 8] : P === 2 ? [0, 6, 8] : [0, 6, 8, 14];
    if (kicks.includes(k)) A.kick(at, k === 0 ? 1 : 0.85);
    if (P >= 2 && (k === 4 || k === 12)) A.snare(at, 1);
    if (P === 1 && k % 4 === 2) A.hat(at, false, 0.8);
    if (P === 2 && k % 2 === 0) A.hat(at, k % 4 === 2, 0.8);
    if (P === 3) A.hat(at, k === 14, k % 2 ? 0.55 : 1);
    // bass ostinato in 8ths
    if (k % 2 === 0) { const pat = [0, 0, 12, 0, 0, 12, 7, 12]; A.bassNote(at, root + 12 + pat[k / 2], S * 1.8, 1); }
    // arpeggio
    if (P >= 2 && k % 2 === 0) A.arp(at, tones[(k / 2) % 3] + 24 + (k % 8 >= 6 ? 12 : 0), 0.9);
    if (P === 3 && k % 2 === 1) A.arp(at, tones[(k >> 1) % 3] + 36, 0.7, true);
    // lead line in phase III
    if (P === 3 && (k === 0 || k === 6 || k === 12)) { const mel = [[74, 77, 76], [74, 72, 70], [70, 74, 79], [76, 73, 69]][bar % 4]; A.lead(at, mel[[0, 6, 12].indexOf(k)], S * 5, 0.9); }
  }

  onBar(n, tb) {
    this.ui.bar(n);
    if (this.state !== 'dead' && !this.paused) this.boss.onBar(tb);
    const F = this.flags;
    if (this.state === 'title') return;
    if (F.ante && !F.solved && n % 2 === 0 && this.state !== 'cine') this.singMotif(tb + BEAT * 0.5, false);
    if (F.training === 1) {
      const fire = tb + BAR + BEAT * 0;
      this.world.gateMask.glowMat.opacity = 0;
      this.timers.push({ at: tb + BEAT * 2, fn: () => { this.maskGlow = 1; this.audio.sing(V3(0, 4, 15.3), 50, this.audioAt(this.T), 0.5, VOICE.bass, { level: 0.7 }); } });
      this.hazards.pulse({ at: fire, origin: new THREE.Vector2(0, 15.55), harmless: true, speed: 4.2, y: 1.2 });
      this.audio.ping(this.audioAt(fire));
      this.timers.push({ at: fire, fn: () => { this.flags.tPulses++; } });
    }
    if (F.training === 2) {
      const o = new THREE.Vector2(0, 15.3);
      const sector = { c: Math.PI / 2, hw: 0.55 };
      this.hazards.telegraph({ from: tb, to: tb + BAR, origin: o, sector, mode: 1, clip: 99, speed: 3 });
      this.hazards.wave({ at: tb + BAR, origin: o, sector, speed: 5, th: 1.0, harmless: true, maxR: 7.5, clip: 99 });
      this.audio.thump(this.audioAt(tb + BAR));
      this.timers.push({ at: tb + BAR + 1.6, fn: () => { this.flags.tWaves++; if (this.flags.tWaves >= 3 && this.flags.training === 2) this.finishTraining(); } });
    }
    if (!this.resonator.ready) { /* recharge handled per frame */ }
  }

  singMotif(t0, fromPlayer) {
    MOTIF.forEach((r, k) => {
      const t = t0 + k * BEAT;
      this.audio.register(this.audioAt(t), r);
      this.audio.sing(SOURCE_POS, [45, 57, 69][r], this.audioAt(t), 0.5, VOICE.mid, { level: 0.55 });
      this.timers.push({ at: t, fn: () => { this.sourceGlow = 1; this.showSymbol(r); } });
    });
  }
  showSymbol(r) {
    const s = this.world.source.sym;
    s.material.map = this.world.tex.symbols[r]; s.material.needsUpdate = true; s.material.opacity = 1;
    this.symFade = 0.55;
  }

  // ------------------------------------------------------------------ cutscenes
  startCine(shots, events, onEnd) {
    this.cine = { shots, events: events.map((e) => ({ ...e, done: false })), t: 0, onEnd, total: shots.reduce((a, s) => a + s.d, 0) };
    this.state = 'cine';
    this.ui.letterbox(true);
    this.hero.locked = true;
  }
  cineUpdate(dt) {
    const c = this.cine;
    c.t += dt;
    for (const e of c.events) if (!e.done && c.t >= e.at) { e.done = true; e.fn(false); }
    let acc = 0, shot = c.shots[c.shots.length - 1], k = 1;
    for (const s of c.shots) { if (c.t < acc + s.d) { shot = s; k = (c.t - acc) / s.d; break; } acc += s.d; }
    const ev = (v) => (typeof v === 'function' ? v() : v);
    const e = smooth(k);
    const p = ev(shot.p0).clone().lerp(ev(shot.p1), e), t = ev(shot.t0).clone().lerp(ev(shot.t1), e);
    this.camPos.copy(p); this.camTgt.copy(t);
    if (c.t >= c.total) this.endCine(false);
  }
  endCine(skipped) {
    const c = this.cine; if (!c) return;
    for (const e of c.events) if (!e.done) { e.done = true; e.fn(true); }
    this.cine = null; this.ui.letterbox(false); this.hero.locked = false; this.hero.auto = null;
    this.state = 'play';
    c.onEnd(skipped);
  }

  startCS01() {
    this.hero.reset(START_POS.x, START_POS.y, Math.PI);
    this.guide.g.position.set(START_POS.x - 1, 2.2, START_POS.y + 0.8);
    const end = this.exploreCam(this.hero.pos);
    this.startCine([
      { d: 3.4, p0: V3(14, 34, 70), p1: V3(6, 22, 64), t0: V3(0, 14, 20), t1: V3(0, 6, 34) },
      { d: 3.6, p0: V3(6, 22, 64), p1: end.p, t0: V3(0, 6, 34), t1: end.t },
    ], [
      { at: 0.4, fn: (s) => { if (!s) this.ui.say(GUIDE, 'Сигнал триває. Джерело за мостом.'); } },
      { at: 4.6, fn: (s) => { if (!s) { this.hero.auto = { x: START_POS.x, y: START_POS.y - 0.01, face: Math.PI }; this.audio.bell(this.audioAt(this.T), 660, 0.12, 1.6); } } },
    ], (skipped) => {
      this.camPos.copy(end.p); this.camTgt.copy(end.t);
      this.ui.objective('Перейди міст до джерела сигналу');
      if (skipped) this.ui.clearSubs();
      this.ui.say(GUIDE, 'Мертві труби перекрили міст. Розбий їх — три удари поспіль.');
    });
  }

  startCS03() {
    this.flags.arena = true;
    this.hazards.clear();
    const H = this.hero;
    this.startCine([
      { d: 3.2, p0: V3(10, 5.5, 21), p1: V3(6.5, 7.5, 17), t0: V3(0, 5, -14), t1: V3(0, 6.5, -14) },
      { d: 2.4, p0: V3(2.3, 1.7, 12.6), p1: V3(1.7, 1.35, 11.6), t0: V3(0, 0.9, 9.2), t1: V3(0, 1.0, 9.2) },
      { d: 2.4, p0: V3(-1.5, 6, -3), p1: V3(-2.6, 7, -5.5), t0: V3(-6.2, 7, -17), t1: V3(-6.2, 7.2, -17) },
      { d: 2.8, p0: V3(0, 8.5, 3), p1: V3(0, 9.8, -0.5), t0: V3(0, 8.6, -15), t1: V3(0, 9.4, -15) },
      { d: 2.4, p0: V3(4.5, 5.5, 5), p1: V3(3.2, 4.6, 7), t0: V3(0, 3, 15.6), t1: V3(0, 3.4, 15.6) },
      { d: 1.8, p0: V3(3.2, 4.6, 7), p1: () => this.arenaCam(H.pos).p, t0: V3(0, 3.4, 15.6), t1: () => this.arenaCam(H.pos).t },
    ], [
      { at: 0, fn: (s) => { if (!s) H.auto = { x: 0, y: 9.2, speed: 0.55, face: Math.PI }; } },
      { at: 3.9, fn: (s) => { if (!s) { H.startSwing(3, this); this.audio.clink(this.audioAt(this.T), true); this.audio.impact(this.audioAt(this.T + 0.02)); this.sparks.burst(H.pos.x, 0.2, H.pos.y - 0.9, new THREE.Color(0.6, 2, 1.9), 26, 4); } } },
      { at: 5.9, fn: (s) => { this.boss.wake(0); if (!s) this.boss.sing3(0, [45, 50], this.T, 0.7, 1.0); } },
      { at: 8.2, fn: (s) => { this.boss.wake(1); if (!s) this.boss.sing3(1, [57], this.T, 0.6, 1.0); } },
      { at: 8.9, fn: (s) => { this.boss.wake(2); if (!s) { this.boss.sing3(2, [69, 74], this.T, 0.5, 0.7); this.ui.say('Праве обличчя', 'Побудь до кінця фрази.', 3.2); } } },
      { at: 10.9, fn: (s) => { this.raiseHand(s); } },
      { at: 11.3, fn: (s) => { this.setGate('arena', false, s); if (!s) this.audio.impact(this.audioAt(this.T + 0.9)); } },
      { at: 12.6, fn: (s) => { if (!s) this.ui.say(GUIDE, 'Несправність. Три голоси. Читай фразу до удару.'); } },
    ], (skipped) => {
      H.pos.set(0, 9.2); H.yaw = Math.PI;
      if (skipped) this.ui.clearSubs();
      this.camBlend = 1;
      const a = this.arenaCam(H.pos); this.camPos.copy(a.p); this.camTgt.copy(a.t);
      this.startFight();
    });
  }

  raiseHand(instant) {
    const h = this.world.hands[1];
    const upP = V3(8.6, 7.6, -11.6);
    const upQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.2, -0.5, 0, 'YXZ'));
    if (instant) { h.group.position.copy(h.restP); h.group.quaternion.copy(h.restQ); return; }
    this.tween(1.1, (k) => { const e = smooth(k); h.group.position.lerpVectors(h.restP, upP, e); h.group.quaternion.slerpQuaternions(h.restQ, upQ, e); h.setCurl(0.95 - e * 0.85); });
    this.timers.push({ at: this.T + 2.6, fn: () => this.tween(1.8, (k) => { const e = smooth(k); h.group.position.lerpVectors(upP, h.restP, e); h.group.quaternion.slerpQuaternions(upQ, h.restQ, e); h.setCurl(0.1 + e * 0.85); }) });
  }

  setGate(which, open, instant = false) {
    const W = this.world, g = which === 'arena' ? W.arenaGate : W.puzzleGate;
    const key = which === 'arena' ? 'arenaGateOpen' : 'puzzleGateOpen';
    const from = g.position.y, to = open ? -4.6 : 0;
    if (!open) W.state[key] = false;
    if (instant) { g.position.y = to; W.state[key] = open; return; }
    this.audio.gate(this.audioAt(this.T), open ? 1.4 : 0.5);
    this.tween(open ? 1.5 : 0.5, (k) => { g.position.y = lerp(from, to, open ? smooth(k) : k * k); if (k >= 1 && open) W.state[key] = true; });
  }

  tween(d, fn) { this.tweens.push({ t: 0, d, fn }); }

  // ------------------------------------------------------------------ fight flow
  startFight() {
    this.state = 'play';
    this.flags.fight = true;
    this.boss.startFight(this.T);
    this.stats.start = this.T;
    this.ui.banner('Три обличчя', 'Фаза I · Лівий бас');
    this.ui.objective('Заглуши Три обличчя');
    this.ui.say(GUIDE, 'Перша фраза — пробна, вона не ранить. Бий голосник, що співає.');
    this.audio.setMusicMuffle(false);
  }

  onPhase(p) {
    this.ui.banner(['', '', 'Фаза II', 'Фаза III'][p], ['', '', 'Центральний голос', 'Правий дискант · голоси чергуються'][p]);
    if (p === 2) this.ui.say(GUIDE, 'Кільце не обійти — ухиляйся крізь нього. Колони тримають лише промінь.');
    if (p === 3) this.ui.say(GUIDE, 'Дискант додає спіраль. Слухай, хто співає, — той і відкритий.');
    this.shake = 0.5;
  }
  onPauseBar() {}
  onUnmute() { this.audio.setMusicMuffle(false); }

  onBossDefeated(tb) {
    const F = this.flags;
    F.finale = true; this.stats.end = this.T;
    this.ui.banner('Тиша', 'Голоси вимкнено. Партія чекає');
    this.ui.objective('Підійди до долоні');
    this.audio.setMusicMuffle(true);
    // the big left hand lowers onto the floor, palm up
    const h = this.world.hands[0];
    const p0 = h.group.position.clone(), q0 = h.group.quaternion.clone();
    const p1 = V3(PALM_POS.x, 0.42, PALM_POS.y);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, Math.PI, 'YXZ'));
    this.tween(4.2, (k) => {
      const e = smooth(k);
      h.group.position.lerpVectors(p0, p1, e); h.group.position.y += Math.sin(e * Math.PI) * 5;
      h.group.quaternion.slerpQuaternions(q0, q1, e); h.setCurl(0.95 - e * 0.85);
      if (k >= 1) { F.palmReady = true; this.audio.impact(this.audioAt(this.T)); this.shake = 0.3; }
    });
  }

  touchPalm() {
    const F = this.flags, H = this.hero;
    F.palm = true;
    H.auto = { x: PALM_POS.x, y: PALM_POS.y + 2.3, speed: 0.4, face: Math.PI };
    this.ui.prompt('');
    this.ui.letterbox(true);
    const at = (dt, fn) => this.timers.push({ at: this.T + dt, fn });
    at(0.6, () => { this.audio.resonance(this.audioAt(this.T)); this.audio.sing(FACE_POS[1], 62, this.audioAt(this.T), 2.6, VOICE.mid, { level: 0.7 }); });
    for (let i = 0; i < 18; i++) at(0.6 + i * 0.09, () => {
      const k = i / 17;
      this.sparks.burst(lerp(PALM_POS.x, H.pos.x, k), 0.8 + Math.sin(k * Math.PI) * 1.2, lerp(PALM_POS.y, H.pos.y, k), new THREE.Color(0.5, 2.2, 2.0), 5, 1.2, 0.3);
      H.res = Math.min(100, H.res + 6);
    });
    at(1.8, () => this.ui.say('Центральне обличчя', 'Тепер ти пам’ятаєш.', 3.4));
    at(3.2, () => { this.boss.state = 'done'; });
    at(5.4, () => { this.ui.say(GUIDE, 'Завдання виконано… частково.', 3.2); this.setGate('arena', true); });
    at(9.0, () => this.showEnd());
  }

  showEnd() {
    this.ui.letterbox(false);
    this.state = 'end';
    const s = this.stats;
    const dur = Math.max(0, s.end - s.start);
    const set = (id, v) => { document.getElementById(id).textContent = v; };
    set('st-time', `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`);
    set('st-hits', s.hits); set('st-parries', s.parries); set('st-res', s.resonator); set('st-deaths', s.deaths);
    this.ui.show('hud', false);
    this.ui.show('end', true);
  }

  // ------------------------------------------------------------------ hero callbacks
  softTarget(hero) {
    let best = null, bd = 3.4;
    NODE_POS.forEach((n, i) => {
      const d = n.distanceTo(hero.pos);
      if (d < bd && this.boss.state === 'fight') { bd = d; best = n; }
    });
    if (!best && this.world.state.barricade) { const b = new THREE.Vector2(0, 39.3); if (b.distanceTo(hero.pos) < 3) best = b; }
    return best;
  }
  onSwing() { this.audio.swing(this.audioAt(this.T)); }
  flashBeat() { const b = document.getElementById('beats'); if (!b) return; b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }
  buzz(ms) { try { navigator.vibrate?.(ms); } catch (e) { /* not supported */ } }
  onStep() { this.audio.step(this.audioAt(this.T)); }
  onDodge() { this.audio.dodge(this.audioAt(this.T)); }
  onParryTry() { this.audio.bell(this.audioAt(this.T), 990, 0.05, 0.2, this.audio.foley); }

  onStrike(p, n, hero) {
    const W = this.world;
    if (W.state.barricade && p.x > -2.8 && p.x < 2.8 && p.y > 37.9 && p.y < 40.7) {
      W.barricade.hp--;
      this.audio.thunk(this.audioAt(this.T)); this.audio.hitNote(this.audioAt(this.T), this.curBar || 0, n === 3, this.beatError(hero.swingT ?? this.T) < 0.11);
      this.sparks.burst(p.x, 0.8, p.y, new THREE.Color(2.2, 1.3, 0.5), 12, 3.5);
      this.shake = 0.12;
      if (W.barricade.hp <= 0) this.breakBarricade(hero);
      return;
    }
    const onBeat = this.beatError(hero.swingT ?? this.T) < 0.11;
    for (let i = 0; i < 3; i++) {
      if (NODE_POS[i].distanceTo(p) > 1.4) continue;
      if (this.boss.state !== 'fight') { this.audio.clank(this.audioAt(this.T)); return; }
      const d = this.boss.damage(i, (n === 3 ? 0.7 : 0.35) * (onBeat ? 1.6 : 1), this.T);
      if (d > 0) {
        this.sparks.burst(NODE_POS[i].x, 1.5, NODE_POS[i].y, onBeat ? new THREE.Color(2.6, 2.0, 0.9) : VOICE_COL[i].clone().multiplyScalar(2), (n === 3 ? 26 : 14) + (onBeat ? 14 : 0), onBeat ? 6 : 4.5);
        this.audio.hitNote(this.audioAt(this.T), this.curBar || 0, n === 3, onBeat);
        hero.res = Math.min(100, hero.res + (n === 3 ? 10 : 6) + (onBeat ? 5 : 0));
        this.shake = Math.max(this.shake, n === 3 || onBeat ? 0.16 : 0.08);
        if (onBeat) { this.onBeatHits = (this.onBeatHits || 0) + 1; this.flashBeat(); this.buzz(12); if (this.onBeatHits <= 3 || this.onBeatHits % 8 === 0) this.ui.toast('У долю · ×1,6', 0.9); }
      } else {
        this.audio.clank(this.audioAt(this.T));
        this.sparks.burst(NODE_POS[i].x, 1.5, NODE_POS[i].y, new THREE.Color(0.6, 0.55, 0.5), 6, 2);
        if (!this.flags.sealedHint) { this.flags.sealedHint = true; this.ui.toast('Цей голос зараз мовчить — бий той, що світиться', 2.4); }
      }
      return;
    }
  }

  breakBarricade(hero) {
    const W = this.world;
    W.state.barricade = false; this.flags.barricade = false;
    this.audio.crash(this.audioAt(this.T));
    this.shake = 0.35;
    W.barricade.parts.forEach((m, i) => { m.userData.v = V3((i - 1) * 2.5 + (Math.random() - 0.5), 3 + Math.random() * 2, -2 - Math.random() * 3); m.userData.w = V3(Math.random() * 3, Math.random() * 3, Math.random() * 3); });
    this.timers.push({ at: this.T + 2.5, fn: () => { W.barricade.group.visible = false; } });
    this.ui.say(GUIDE, 'Прохід вільний. Сигнал — у передзалі.');
  }

  onPart(hero) {
    if (hero.res < HERO.resCost) { this.ui.toast(`Партії потрібно ${HERO.resCost} резонансу`); return; }
    hero.res -= HERO.resCost; hero.partT = 1.2;
    this.audio.resonance(this.audioAt(this.T));
    this.hazards.dissolveNear(hero.pos, 4.6);
    for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; this.sparks.burst(hero.pos.x + Math.cos(a) * 1.2, 0.6, hero.pos.y + Math.sin(a) * 1.2, new THREE.Color(0.4, 1.8, 1.7), 1, 3, 0.3); }
    let hit = false;
    NODE_POS.forEach((n, i) => {
      if (!hit && n.distanceTo(hero.pos) < 5.5 && this.boss.state === 'fight') {
        const d = this.boss.damage(i, 4, this.T);
        if (d > 0) { hit = true; this.sparks.burst(n.x, 1.6, n.y, VOICE_COL[i].clone().multiplyScalar(2.2), 30, 5); this.audio.clink(this.audioAt(this.T + 0.05), true); }
      }
    });
    this.ui.toast(hit ? 'Партія: голосник здригнувся' : 'Партія: щит 1,2 с');
  }

  reflectTarget(hero, pulse) {
    if (pulse.harmless) return { kind: 'mask', pos: V3(0, 4.0, 15.3) };
    const f = hero.forward();
    const toR = new THREE.Vector2(RESONATOR_POS.x - hero.pos.x, RESONATOR_POS.y - hero.pos.y);
    const dist = toR.length(); toR.normalize();
    if (this.resonator.ready && dist > 3.4 && f.dot(toR) > Math.cos(0.9)) return { kind: 'resonator', pos: V3(RESONATOR_POS.x, 3.3, RESONATOR_POS.y) };
    let idx = pulse.node >= 0 ? pulse.node : 0, bd = 1e9;
    NODE_POS.forEach((n, i) => { if (this.boss.isVulnerable(i, this.T)) { const d = n.distanceTo(hero.pos); if (d < bd) { bd = d; idx = i; } } });
    return { kind: 'node', idx, pos: V3(NODE_POS[idx].x, 1.6, NODE_POS[idx].y) };
  }

  handleEvents(ev) {
    const H = this.hero, F = this.flags;
    for (const e of ev) {
      switch (e.type) {
        case 'hurt': this.onHurt(e.from); break;
        case 'parry':
          this.audio.parry(this.audioAt(this.T)); this.buzz(15);
          this.sparks.burst(e.pos.x, 1.2, e.pos.y, new THREE.Color(0.6, 2.4, 2.2), 22, 5);
          if (e.harmless) { F.tParries++; this.ui.toast(`Відбито · ${Math.min(2, F.tParries)}/2`); }
          else { H.res = Math.min(100, H.res + 18); this.stats.parries++; this.ui.toast(e.h.target.kind === 'resonator' ? 'Відбито в резонатор' : 'Відбито'); }
          break;
        case 'reflectHit': {
          const tg = e.target;
          if (tg.kind === 'resonator') this.resonatorHit();
          else if (tg.kind === 'mask') { this.audio.clink(this.audioAt(this.T), true); this.sparks.burst(tg.pos.x, tg.pos.y, tg.pos.z, new THREE.Color(2, 1.2, 0.5), 16, 3); }
          else {
            const d = this.boss.damage(tg.idx, 3.0, this.T);
            this.sparks.burst(tg.pos.x, tg.pos.y, tg.pos.z, d > 0 ? VOICE_COL[tg.idx].clone().multiplyScalar(2.2) : new THREE.Color(0.7, 0.7, 0.7), d > 0 ? 28 : 8, 5);
            this.audio.clink(this.audioAt(this.T), d > 0);
          }
          break;
        }
        case 'nearMiss':
          if (e.h.harmless && F.training === 2) { this.ui.toast('Чисто'); this.finishTraining(); break; }
          if (!e.h.harmless) { H.res = Math.min(100, H.res + 5); if (!this._nmT || this.T - this._nmT > 1) { this.ui.toast('Чисте ухилення'); this._nmT = this.T; } }
          break;
        case 'touch':
          if (F.training === 1) this.ui.toast(this.input.lastDevice === 'touch' ? 'Тисни «Відбити», коли коло торкається плаща' : 'K — у мить, коли коло торкається плаща', 2.2);
          if (F.training === 2) this.ui.toast(this.input.lastDevice === 'touch' ? '«Ухилення», коли хвиля підходить' : 'Space — коли хвиля підходить', 2.2);
          break;
        case 'pulseSpawn':
          if (F.fight && !e.h.harmless && !F.firstPulse) { F.firstPulse = true; this.timers.push({ at: this.T + 0.4, fn: () => this.ui.say(GUIDE, 'Бурштинове коло можна повернути. Дивись на резонатор у західній ніші — і голос затихне.') }); }
          break;
        case 'beamFire': this.shake = Math.max(this.shake, 0.22); break;
      }
    }
  }

  onHurt(from) {
    const H = this.hero;
    H.hurt(from);
    this.stats.hits++;
    this.audio.hurt(this.audioAt(this.T));
    this.ui.hurtFlash(); this.buzz(40);
    this.shake = 0.35;
    this.sparks.burst(H.pos.x, 0.9, H.pos.y, new THREE.Color(2.4, 0.6, 0.4), 16, 4);
    if (H.hp <= 0) {
      this.state = 'dead'; this.deadT = 2.6;
      this.stats.deaths++;
      this.hazards.dissolveAll();
      this.ui.show('dead', true);
      this.audio.setMusicMuffle(true);
    }
  }

  respawn() {
    const H = this.hero, res = H.res;
    H.reset(CHECKPOINT_POS.x, CHECKPOINT_POS.y, Math.PI); H.res = res;
    this.hazards.clear();
    if (this.flags.fight) { this.boss.resetToPhase(); this.boss.skip = 1; }
    this.ui.show('dead', false);
    this.state = 'play';
    this.audio.setMusicMuffle(false);
    this.ui.say(GUIDE, 'Повертаю тебе до порогу цієї фази. Голос пам’ятає, де зупинився.');
  }

  resonatorHit() {
    this.resonator.ready = false; this.resonator.charge = 0;
    this.stats.resonator++;
    this.boss.mute(2, this.T);
    this.audio.mute(this.audioAt(this.T));
    this.audio.setMusicMuffle(true);
    this.sparks.burst(RESONATOR_POS.x, 3.3, RESONATOR_POS.y, new THREE.Color(0.6, 2.4, 2.2), 40, 6);
    this.ui.banner('Голос приглушено', 'Два такти · голосники відкриті ×2', 2.2);
    this.shake = 0.3;
  }

  finishTraining() {
    const F = this.flags;
    if (F.training >= 3) return;
    F.training = 3;
    this.world.checkpoint.on = true;
    this.audio.bell(this.audioAt(this.T), 523, 0.14, 1.4);
    this.setGate('arena', true);
    this.ui.objective('Увійди до залу');
    this.ui.say(GUIDE, 'Точку повернення запалено. Попереду зал — там три джерела.');
  }

  // ------------------------------------------------------------------ puzzle
  openPuzzle() {
    this.state = 'puzzle';
    this.puzzle.entered = [];
    this.ui.show('puzzle', true);
    this.renderSlots('Послухай мотив і повтори його регістрами.');
    this.singMotif(this.T + 0.35, true);
  }
  closePuzzle() { this.ui.show('puzzle', false); this.state = 'play'; }
  renderSlots(msg) {
    const slots = document.getElementById('p-slots');
    slots.innerHTML = [0, 1, 2].map((i) => {
      const r = this.puzzle.entered[i];
      return `<div class="slot${r !== undefined ? ' full' : ''}">${r !== undefined ? `<span class="reg r${r}"><i></i><i></i><i></i></span><em>${REG[r]}</em>` : '<em>—</em>'}</div>`;
    }).join('');
    if (msg !== undefined) document.getElementById('p-msg').textContent = msg;
  }
  puzzleInput(r) {
    if (this.state !== 'puzzle') return;
    if (this.puzzle.entered.length >= 3) this.puzzle.entered = [];
    this.puzzle.entered.push(r);
    this.audio.register(this.audioAt(this.T), r);
    this.showSymbol(r); this.sourceGlow = 0.5;
    this.renderSlots(this.puzzle.entered.length === 3 ? 'Підтверди мотив або зітри.' : '');
  }
  puzzleCmd(c) {
    if (this.state !== 'puzzle') return;
    if (c === 'listen') { this.singMotif(this.T + 0.1, true); this.renderSlots('Слухай: три ноти, три висоти.'); }
    if (c === 'back') { this.puzzle.entered.pop(); this.renderSlots(''); }
    if (c === 'close') this.closePuzzle();
    if (c === 'confirm') {
      const e = this.puzzle.entered;
      if (e.length === 3 && e.every((v, i) => v === MOTIF[i])) {
        this.closePuzzle();
        this.flags.solved = true;
        this.audio.solved(this.audioAt(this.T));
        this.setGate('puzzle', true);
        this.ui.objective('Пройди до порогу залу');
        this.ui.say(GUIDE, 'Регістри збіглися. Прохід відкрито.');
      } else {
        this.audio.wrong(this.audioAt(this.T));
        this.puzzle.entered = [];
        this.renderSlots(e.length < 3 ? 'Потрібно три регістри.' : 'Не той мотив. Послухай ще раз.');
      }
    }
  }

  // ------------------------------------------------------------------ cameras
  exploreCam(h) {
    const a = this.camera.aspect, k = a < 1.25 ? 1 + (1.25 - a) * 0.7 : 1;
    const t = V3(h.x, 0.8, h.y - 1.9);
    return { t, p: t.clone().add(V3(0, 13.2 * k, 11.4 * k)) };
  }
  arenaCam(h) {
    const a = this.camera.aspect, portrait = a < 1;
    const k = portrait ? 1 + (1.3 - a) * 0.45 : a < 1.3 ? 1 + (1.3 - a) * 0.95 : 1;
    const fx = portrait ? 0.62 : 0.3, fz = portrait ? 0.55 : 0.34;
    const t = V3(h.x * fx, portrait ? 2.2 : 4.2, -4.8 + h.y * fz);
    return { t, p: t.clone().add(V3(0, 25 * k, 31.5 * k)) };
  }
  updateCamera(dt) {
    const H = this.hero.pos;
    let p, t;
    if (this.state === 'title') {
      const a = Math.PI / 2 + Math.sin(this.T * 0.06) * 0.55;
      p = V3(Math.cos(a) * 30, 12 + Math.sin(this.T * 0.09) * 2, Math.sin(a) * 30 - 2);
      t = V3(0, 7, -9);
      this.camPos.lerp(p, 1 - Math.exp(-1.5 * dt)); this.camTgt.lerp(t, 1 - Math.exp(-1.5 * dt));
    } else if (this.state !== 'cine') {
      const inArena = H.y < 15.0 || this.flags.fight;
      this.camBlend = damp(this.camBlend, inArena ? 1 : 0, 2.0, dt);
      const e = this.exploreCam(H), a = this.arenaCam(H), b = smooth(this.camBlend);
      p = e.p.lerp(a.p, b); t = e.t.lerp(a.t, b);
      this.camPos.lerp(p, 1 - Math.exp(-6 * dt)); this.camTgt.lerp(t, 1 - Math.exp(-7 * dt));
    }
    const s = Math.max(this.shake, this.boss.shake) * 0.35;
    this.camera.position.copy(this.camPos).add(V3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0));
    this.camera.lookAt(this.camTgt);
    this.fadeOccluders(dt);
    this.audio.setListener(H.x, 1.5, H.y + 4);
  }

  // walls between the camera and the hero turn translucent (cut-away view)
  fadeOccluders(dt) {
    const F = this.world.fadeables;
    if (!this._ray) { this._ray = new THREE.Raycaster(); this._hit = new Set(); }
    const hp = V3(this.hero.pos.x, 0.9, this.hero.pos.y);
    const dir = hp.clone().sub(this.camera.position); const len = dir.length(); dir.normalize();
    this._ray.set(this.camera.position, dir); this._ray.far = len - 0.4;
    this._hit.clear();
    if (this.state !== 'title') for (const h of this._ray.intersectObjects(F, false)) this._hit.add(h.object);
    for (const m of F) {
      const target = this._hit.has(m) ? 0.16 : 1;
      m.userData.fade = damp(m.userData.fade, target, 10, Math.max(dt, 0.016));
      m.material.opacity = m.userData.fade;
      m.material.depthWrite = m.userData.fade > 0.95;
      m.castShadow = true;
    }
  }

  // ------------------------------------------------------------------ main loop
  loop(now) {
    requestAnimationFrame((n) => this.loop(n));
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.input.update();
    const I = this.input;
    if (I.hit('pause')) {
      if (this.state === 'puzzle') this.puzzleCmd('close');
      else if (this.playing()) this.setPaused(!this.paused);
    }
    if (I.hit('debug')) this.setDebug(!this.debug);
    if (I.hit('mute')) { this.audio.setMuted(!this.audio.muted); document.getElementById('p-sound').checked = !this.audio.muted; }
    if (!this.paused && !this.simLock) this.advance(dt, true);
    this.updateCamera(this.paused ? 0 : dt);
    this.composer.render();
    I.endFrame();
    if (this.debug) {
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 0.5) { document.getElementById('fps').textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.renderer.info.render.calls} draw`; this.fpsAcc = 0; this.fpsN = 0; }
    }
  }

  // one transport for music and patterns: game time follows the audio clock
  advance(dt, sync) {
    this.T += dt;
    if (sync && this.audio.ok && this.audio.ctx.state === 'running') {
      if (this.syncA === null) { this.syncA = this.audio.now; this.syncT = this.T; }
      const expected = this.syncT + (this.audio.now - this.syncA);
      if (Math.abs(expected - this.T) > 0.25) { this.syncA = this.audio.now; this.syncT = this.T; }
      else this.T += (expected - this.T) * 0.08;
    }
    const bar = Math.floor(this.T / BAR);
    if (bar !== this.curBar) { this.curBar = bar; this.onBar(bar, bar * BAR); }
    const SS = BEAT / 4, LA = 0.2 + this.latency();
    if (this.nextStep * SS < this.T - 0.5) this.nextStep = Math.ceil(this.T / SS);
    while (this.nextStep * SS < this.T + LA) { this.scheduleStep(this.nextStep, this.nextStep * SS); this.nextStep++; }
    const bi = Math.floor(this.T / BEAT);
    if (bi !== this.lastBeatIdx) { this.lastBeatIdx = bi; this.beatPulse = bi % 4 === 0 ? 1.3 : 0.8; }
    this.step(dt);
  }

  // test hook: run the simulation without rendering (used for automated play-checks)
  sim(sec, each) {
    this.simLock = true;
    const n = Math.round(sec * 60);
    for (let i = 0; i < n; i++) {
      this.input.update();
      if (each) each(this, i);
      this.advance(1 / 60, false);
      this.input.endFrame();
    }
    this.simLock = false;
    this.syncA = null;
  }

  step(dt) {
    const T = this.T, W = this.world, H = this.hero, F = this.flags, I = this.input;
    this.time = T;
    this.shake = Math.max(0, this.shake - dt);
    W.update(T, dt);
    // timers + tweens
    for (const tm of this.timers) if (!tm.done && T >= tm.at) { tm.done = true; tm.fn(); }
    this.timers = this.timers.filter((t) => !t.done);
    for (const tw of this.tweens) { tw.t += dt; tw.fn(Math.min(1, tw.t / tw.d)); }
    this.tweens = this.tweens.filter((t) => t.t < t.d);
    // barricade debris
    for (const m of W.barricade.parts) if (m.userData.v) {
      m.userData.v.y -= 14 * dt; m.position.addScaledVector(m.userData.v, dt);
      m.rotation.x += m.userData.w.x * dt; m.rotation.z += m.userData.w.z * dt;
    }

    if (this.state === 'cine') {
      if (I.hit('dodge') || I.hit('confirm') || I.hit('attack') || I.hit('tap')) this.endCine(true);
      else this.cineUpdate(dt);
      H.update(dt, I, W, this);
    } else if (this.state === 'play') {
      H.update(dt, I, W, this);
      this.triggers();
      const ev = this.hazards.update(T, dt, H, this);
      this.handleEvents(ev);
      if (I.hit('act')) this.act();
      if (this.state === 'play' && F.palm) { /* scripted ending: hero walks itself */ }
    } else if (this.state === 'puzzle') {
      H.animate(dt, T);
      if (I.hit('r1')) this.puzzleInput(0);
      if (I.hit('r2')) this.puzzleInput(1);
      if (I.hit('r3')) this.puzzleInput(2);
      if (I.hit('listen')) this.puzzleCmd('listen');
      if (I.hit('back')) this.puzzleCmd('back');
      if (I.hit('confirm')) this.puzzleCmd('confirm');
    } else if (this.state === 'dead') {
      H.animate(dt, T);
      this.hazards.update(T, dt, H, this);
      this.deadT -= dt;
      if (this.deadT <= 0) this.respawn();
    } else {
      H.animate(dt, T);
    }
    this.boss.update(T, dt);
    this.sparks.update(dt);
    this.updateProps(dt);
    this.updateHud(dt);
  }

  triggers() {
    const H = this.hero, F = this.flags;
    if (!F.ante && H.pos.y < 33.4) {
      F.ante = true;
      this.ui.objective('Знайди джерело голосу');
      this.ui.say(GUIDE, 'Голос за стіною. Обійди перегородку.');
    }
    if (F.ante && !F.consoleSeen && H.pos.distanceTo(CONSOLE_POS) < 6.5) {
      F.consoleSeen = true;
      this.ui.objective('Повтори мотив на резонаторі');
      this.ui.say(GUIDE, 'Резонатор приймає три регістри. Слухай висоту, не ноти.');
    }
    if (F.solved && F.training === 0 && H.pos.y < 20.2) {
      F.training = 1;
      this.ui.objective('Відбий бурштинове коло');
      this.ui.say(GUIDE, 'Бурштинове коло можна повернути. Відбий у мить дотику — тут воно не ранить.');
    }
    if (F.training === 1 && (F.tParries >= 2 || F.tPulses >= 6)) {
      F.training = 2;
      this.hazards.dissolveAll();
      this.ui.objective('Пройди крізь темну хвилю ухиленням');
      this.ui.say(GUIDE, 'Темну хвилю не відбити. Пройди крізь неї ухиленням.');
    }
    if (F.training === 3 && !F.arena && H.pos.y < 14.4) this.startCS03();
    if (F.finale && F.palmReady && !F.palm && H.pos.distanceTo(PALM_POS) < 3.6 && this.input.hit('act')) this.touchPalm();
  }

  canAct() {
    const H = this.hero, F = this.flags;
    if (this.state !== 'play') return false;
    return (F.ante && !F.solved && H.pos.distanceTo(CONSOLE_POS) < 2.3) || (F.finale && F.palmReady && !F.palm && H.pos.distanceTo(PALM_POS) < 3.6);
  }

  act() {
    const H = this.hero, F = this.flags;
    if (F.ante && !F.solved && H.pos.distanceTo(CONSOLE_POS) < 2.3) { this.openPuzzle(); return; }
    if (H.pos.distanceTo(RESONATOR_POS) < 2.6) this.ui.toast('Резонатор чекає відбитий імпульс', 2);
  }

  contextPrompt() {
    const H = this.hero, F = this.flags, touch = this.input.lastDevice === 'touch', pad = this.input.lastDevice === 'pad';
    const key = (k, t, p) => `<b>${touch ? t : pad ? p : k}</b>`;
    if (this.state !== 'play') return '';
    if (F.ante && !F.solved && H.pos.distanceTo(CONSOLE_POS) < 2.3) return `${key('E', 'Дія', 'RB')} Резонатор`;
    if (F.finale && F.palmReady && !F.palm && H.pos.distanceTo(PALM_POS) < 3.6) return `${key('E', 'Дія', 'RB')} Торкнутися долоні`;
    if (this.world.state.barricade && H.pos.y < 43 && H.pos.y > 39.5) return `${key('J', 'Удар', 'X')} Удар × 3`;
    if (F.training === 1) return `${key('K', 'Відбити', 'B')} Відбити коло`;
    if (F.training === 2) return `${key('Space', 'Ухилення', 'A')} Ухилитися крізь хвилю`;
    return '';
  }

  updateProps(dt) {
    const W = this.world, T = this.T;
    this.beatPulse = Math.max(0, this.beatPulse - dt * 5);
    const fightOn = this.flags.fight && !this.flags.finale;
    W.mats.arena.emissiveIntensity = (fightOn ? 0.22 : 0.06) * this.beatPulse;
    for (const n of W.nodes) n.group.scale.setScalar(1 + (fightOn ? 0.035 : 0) * this.beatPulse);
    this.hero.ringMat.color.setRGB(0.35 + this.beatPulse * 0.5, 1.6 + this.beatPulse * 0.4, 1.5 + this.beatPulse * 0.3);
    // resonator charge
    const R = this.resonator;
    if (!R.ready) { R.charge += dt / (BAR * 6); if (R.charge >= 1) { R.charge = 1; R.ready = true; if (this.flags.fight) this.ui.toast('Резонатор знову готовий'); } }
    W.resonator.ringMat.opacity = R.ready ? 0.85 + Math.sin(T * 4) * 0.15 : 0.1 + R.charge * 0.35;
    W.resonator.ring.rotation.z += dt * (R.ready ? 1.2 : 0.2);
    W.resonator.light.intensity = R.ready ? 10 : 2 + R.charge * 4;
    // checkpoint
    const cp = W.checkpoint;
    cp.light.intensity = damp(cp.light.intensity, cp.on ? 7 : 0, 3, dt);
    cp.flameMat.color.setRGB(cp.on ? 3 : 0.25, cp.on ? 1.6 : 0.22, cp.on ? 0.5 : 0.2);
    // console
    const near = this.flags.ante && !this.flags.solved;
    W.console.ringMat.opacity = near ? 0.4 + Math.sin(T * 3) * 0.25 : 0;
    // source face + symbol
    this.sourceGlow = Math.max(0, this.sourceGlow - dt * 2.2);
    W.source.glowMat.opacity = this.flags.solved ? 0.08 : 0.12 + this.sourceGlow * 0.9;
    if (this.symFade > 0) { this.symFade -= dt; W.source.sym.material.opacity = clamp(this.symFade / 0.3, 0, 1); }
    // training mask
    this.maskGlow = Math.max(0, (this.maskGlow || 0) - dt * 1.4);
    W.gateMask.glowMat.opacity = this.flags.training > 0 && this.flags.training < 3 ? 0.15 + this.maskGlow : 0.05;
    // guide (metronome) follows the hero, pendulum on the beat
    const G = this.guide, H = this.hero;
    const gp = V3(H.pos.x - 0.95, 2.05 + Math.sin(T * 1.7) * 0.08, H.pos.y + 0.7);
    if (this.state === 'title') gp.set(START_POS.x - 1, 2.2, START_POS.y + 0.8);
    G.g.position.lerp(gp, 1 - Math.exp(-3 * dt));
    G.pend.rotation.z = Math.sin((T / BEAT) * Math.PI) * 0.55;
    G.g.rotation.y = damp(G.g.rotation.y, H.yaw, 2, dt);
    G.wmat.color.setRGB(0.5, 2.0, 1.9);
  }

  updateHud(dt) {
    const U = this.ui, H = this.hero, B = this.boss, F = this.flags;
    U.update(dt);
    U.hp(H.hp, HERO.maxHp);
    U.res(H.res);
    const showBoss = F.fight && !F.finale;
    let voice = VOICE_NAMES[B.phase - 1];
    if (B.muteBars > 0) voice = 'Приглушено';
    else if (B.phase === 3) voice = [0, 1, 2].filter((i) => B.sing[i] > this.T).map((i) => VOICE_NAMES[i]).join(' + ') || VOICE_NAMES[2];
    U.boss(showBoss, B.hp, B.phase, voice, B.label);
    U.beat(Math.floor(this.T / BEAT) % 4);
    U.prompt(this.contextPrompt());
    const acts = document.getElementById('actions');
    if (acts) {
      acts.classList.toggle('res-ready', H.res >= HERO.resCost);
      acts.classList.toggle('dodge-cd', H.dodgeCd > 0);
      acts.classList.toggle('has-act', this.canAct());
      const r = Math.round(H.res);
      if (r !== this._resCss) { this._resCss = r; acts.style.setProperty('--res', r / 100); }
    }
  }
}

function boot() {
  try {
    window.__game = new Game();
  } catch (e) {
    const el = document.getElementById('boot-error');
    if (el) { el.hidden = false; el.textContent = 'Не вдалося запустити WebGL: ' + e.message; }
    console.error(e);
  }
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
