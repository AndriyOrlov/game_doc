import * as THREE from 'three';
import { BAR, BEAT, VOICE } from './audio.js';
import { NODE_POS, FACE_POS, VOICE_COL } from './world.js';
import { deg, clamp, damp } from './util.js';

export const VOICE_NAMES = ['Лівий бас', 'Центральний голос', 'Правий дискант'];
const VOICE_SYNTH = [VOICE.bass, VOICE.mid, VOICE.treble];
export const PHASE_START = [100, 70, 35];

// Phase sequences: each entry is one bar of music. A bar is telegraphed during the bar before it.
const SEQ = {
  1: ['fans', 'pulses', 'fans', 'pulsesFan'],
  2: ['rings', 'pause', 'beam', 'pulses3', 'rings', 'beam'],
  3: ['spiral', 'fansL', 'spiralPulse', 'ringsC', 'spiral', 'pulses3C'],
};
export const PATTERN_LABEL = {
  fans: 'Три віяла', pulses: 'Позначені імпульси', pulsesFan: 'Імпульс і віяло', rings: 'Кільця', pause: 'Пауза',
  beam: 'Точний промінь', pulses3: 'Три імпульси', pulses3C: 'Три імпульси', spiral: 'Спіраль', fansL: 'Віяла басу', spiralPulse: 'Спіраль з імпульсом', ringsC: 'Кільце',
};

export class Boss {
  constructor(game) {
    this.g = game;
    this.W = game.world;
    this.reset();
  }

  reset() {
    this.hp = 100; this.phase = 1; this.state = 'dormant';
    this.seq = 0; this.muteBars = 0; this.pendingPhase = false; this.pendingEnd = false;
    this.sing = [0, 0, 0]; this.glow = [0, 0, 0]; this.awake = [false, false, false];
    this.openBar = -1; this.trial = false; this.breath = 0; this.label = ''; this.skip = 0;
    this.vuln = [0, 0, 0];
    this.shake = 0;
    this.W.faces.forEach((f) => { f.shell.material.map = this.W.tex.face; f.shell.material.needsUpdate = true; });
  }

  // ------------------------------------------------------------------ helpers
  at(t) { return this.g.audioAt(t); }
  voicePos(i) { return FACE_POS[i]; }
  sing3(i, notes, t0, step, dur, opts) {
    const A = this.g.audio;
    notes.forEach((n, k) => { if (n !== null) A.sing(this.voicePos(i), n, this.at(t0 + k * step), dur, VOICE_SYNTH[i], opts); });
    this.sing[i] = Math.max(this.sing[i], t0 + notes.length * step + dur * 0.5);
  }
  angTo(o, p) { return Math.atan2(p.y - o.y, p.x - o.x); }

  wake(i) { this.awake[i] = true; }

  startFight(t0) {
    this.state = 'fight';
    this.trial = true;
    this.breath = 0;
    this.awake = [true, true, true];
    this.lastBar = null;
  }

  // ------------------------------------------------------------------ bar clock
  onBar(tb) {
    const tn = tb + BAR;
    if (this.state !== 'fight') return;
    const H = this.g.hazards;
    if (this.pendingEnd) {
      this.pendingEnd = false;
      H.dissolveAll(); this.g.audio.dissolve(this.at(tb));
      this.state = 'finale';
      this.g.onBossDefeated(tb);
      return;
    }
    if (this.pendingPhase) {
      this.pendingPhase = false;
      H.dissolveAll(); this.g.audio.dissolve(this.at(tb));
      this.phase++; this.seq = 0;
      const prev = this.phase - 2;
      if (prev >= 0) { const f = this.W.faces[prev]; f.shell.material.map = this.W.tex.faceCracked; f.shell.material.needsUpdate = true; }
      // all three voices cry out at the bar line, then one bar of breath
      [0, 1, 2].forEach((i) => this.g.audio.sing(this.voicePos(i), [45, 57, 69][i], this.at(tb), 1.6, VOICE_SYNTH[i], { glideTo: [43, 55, 67][i] }));
      this.sing = [tb + 1.6, tb + 1.6, tb + 1.6];
      this.shake = 0.6;
      this.g.onPhase(this.phase);
      this.label = 'Перехід фази';
      return;
    }
    if (this.skip > 0) { this.skip--; this.label = 'Вдих'; return; }
    if (this.muteBars > 0) {
      this.muteBars--;
      this.label = 'Голос приглушено';
      if (this.muteBars === 0) this.g.onUnmute();
      return;
    }
    const list = SEQ[this.phase];
    const name = this.trial ? 'fans' : list[this.seq % list.length];
    if (!this.trial) this.seq++;
    this.plan(name, tb, tn, this.trial);
    // no endless camping on an open voice: a short shock ring answers a hero standing at its horn
    if (!this.trial && name !== 'pause') {
      const hp = this.g.hero.pos;
      for (let i = 0; i < 3; i++) if (this.isVulnerable(i, tn) && NODE_POS[i].distanceTo(hp) < 3.4) { this.shock(i, tb, tn); break; }
    }
    this.label = this.trial ? 'Пробна фраза' : PATTERN_LABEL[name];
    this.trial = false;
  }

  plan(name, tb, tn, harmless = false) {
    const H = this.g.hazards, A = this.g.audio, hero = this.g.hero;
    const node = (i) => NODE_POS[i];
    const fans = (i, beats, jit) => {
      const o = node(i);
      const c = Math.atan2(-o.y, -o.x);
      const sector = { c, hw: deg(78) };
      const base = [[-30, 10.5], [26, 10.5]];
      beats.forEach((b, k) => {
        const j = jit[k % jit.length];
        const gaps = base.map(([a, hw]) => [c + deg(a + j[0] * (a < 0 ? 1 : 0) + j[1] * (a > 0 ? 1 : 0)), deg(hw)]);
        const fire = tn + b * BEAT;
        const telFrom = k === 0 ? tb : tn + beats[k - 1] * BEAT - 0.15;
        H.telegraph({ from: telFrom, to: fire, origin: o, sector, gaps, mode: 1, speed: 3.5 });
        H.wave({ at: fire, origin: o, sector, gaps, speed: 9, th: 1.05, harmless, voice: i });
        A.thump(this.at(fire));
      });
      this.sing3(i, [50, 50, 45].slice(0, Math.max(2, beats.length)), tb, BEAT, 0.5);
      this.sing[i] = Math.max(this.sing[i], tn + beats[beats.length - 1] * BEAT + 0.4);
    };
    const pulses = (i, beats, spreadDeg = 0, count = 1) => {
      const o = node(i);
      beats.forEach((b) => {
        const fire = tn + b * BEAT;
        for (let k = 0; k < count; k++) {
          const off = count > 1 ? deg((k - (count - 1) / 2) * spreadDeg) : 0;
          const aim = hero.pos.clone().sub(o);
          const a = Math.atan2(aim.y, aim.x) + off;
          // aimed at spawn time, the offset fixes the spread
          const h = H.pulse({ at: fire, origin: o, harmless, node: i, y: 1.6 });
          h.spreadOff = off;
        }
        A.ping(this.at(fire));
      });
      this.sing3(i, beats.map(() => [57, 62, 74][i]), tb, BEAT, 0.3);
      this.sing[i] = Math.max(this.sing[i], tn + beats[beats.length - 1] * BEAT + 0.3);
    };
    const rings = (i, beats) => {
      const o = node(i);
      H.telegraph({ from: tb, to: tn + beats[beats.length - 1] * BEAT, origin: o, mode: 2, speed: 6.5 });
      beats.forEach((b) => {
        const fire = tn + b * BEAT;
        H.wave({ at: fire, origin: o, speed: 6.5, th: 0.75, harmless, voice: i });
        A.thump(this.at(fire)); A.bell(this.at(fire), 220, 0.12, 1.2);
      });
      A.sing(this.voicePos(i), 57, this.at(tb), BAR * 0.9, VOICE_SYNTH[i], { glideTo: 62 });
      this.sing[i] = Math.max(this.sing[i], tn + beats[beats.length - 1] * BEAT + 0.4);
    };
    const beam = (i, specs) => {
      const o = node(i);
      for (const [tel, lock, fire] of specs) {
        H.beam({ telAt: tel, lockAt: lock, fireAt: fire, origin: o, hero, harmless });
        A.whine(this.at(tel), fire - tel); A.beam(this.at(fire));
        A.sing(this.voicePos(i), 55, this.at(tel), fire - tel, VOICE_SYNTH[i], { glideTo: 67, level: 0.8 });
      }
      this.sing[i] = Math.max(this.sing[i], specs[specs.length - 1][2] + 0.4);
    };
    const spiral = (i, arms, dur, rot) => {
      const o = node(i);
      const a0 = this.angTo(o, hero.pos) + Math.PI / arms;
      for (let k = 0; k < arms; k++) {
        const a = a0 + (k / arms) * Math.PI * 2;
        H.telegraph({ from: tb, to: tn, origin: o, sector: { c: a, hw: deg(4) }, mode: 1, speed: 5 });
      }
      const step = 0.17;
      for (let s = 0; s * step < dur; s++) {
        const tt = tn + s * step;
        for (let k = 0; k < arms; k++) {
          const a = a0 + (k / arms) * Math.PI * 2 + rot * (tt - tn);
          H.needle({ at: tt, origin: o, angle: a, speed: 5.2 });
        }
      }
      this.sing3(i, [69, 74, 76, 81], tb, BEAT, 0.45);
      A.shimmer(this.at(tn), 81, 0.05);
      this.sing[i] = Math.max(this.sing[i], tn + dur);
    };

    switch (name) {
      case 'fans': fans(0, [0, 1, 2], [[0, 0], [5, -5], [-4, 6]]); break;
      case 'pulses': pulses(0, [0, 2]); break;
      case 'pulsesFan': pulses(0, [0, 3]); fans(0, [2], [[3, -3]]); break;
      case 'rings': rings(1, [0, 2]); break;
      case 'pause': this.openBar = tn; this.g.onPauseBar(tn); break;
      case 'beam': beam(1, [[tb + BEAT * 2, tn - 0.5, tn], [tn + 0.6, tn + BEAT * 3 - 0.55, tn + BEAT * 3]]); break;
      case 'pulses3': pulses(1, [0, 1, 2]); break;
      case 'pulses3C': pulses(1, [0, 2], 14, 3); break;
      case 'spiral': spiral(2, 3, BAR * 0.95, 1.15); break;
      case 'fansL': fans(0, [0, 2], [[0, 0], [-5, 5]]); break;
      case 'spiralPulse': spiral(2, 2, BAR * 0.9, -1.25); pulses(1, [2]); break;
      case 'ringsC': rings(1, [1]); break;
    }
  }

  shock(i, tb, tn) {
    const H = this.g.hazards, o = NODE_POS[i], fire = tn + BEAT;
    H.telegraph({ from: tb + BEAT, to: fire, origin: o, mode: 2, speed: 3.5, maxR: 4.2 });
    H.wave({ at: fire, origin: o, speed: 6, th: 0.85, maxR: 4.4 });
    this.g.audio.bell(this.at(fire), 180, 0.2, 0.9); this.g.audio.thump(this.at(fire));
  }

  // ------------------------------------------------------------------ damage
  isVulnerable(i, t) {
    if (this.state !== 'fight') return false;
    if (this.muteBars > 0) return true;
    if (i === this.phase - 1) return true;
    return this.phase === 3 && this.sing[i] > t;
  }
  mult(i, t) {
    if (this.muteBars > 0) return 2;
    if (i === 1 && this.openBar >= 0 && t >= this.openBar && t < this.openBar + BAR) return 1.5;
    return 1;
  }
  damage(i, amount, t) {
    if (!this.isVulnerable(i, t)) return 0;
    const d = amount * this.mult(i, t);
    this.hp = Math.max(0, this.hp - d);
    this.vuln[i] = 1;
    const th = this.phase === 1 ? 70 : this.phase === 2 ? 35 : 0;
    if (this.hp <= th) {
      if (this.phase < 3) this.pendingPhase = true; else this.pendingEnd = true;
    }
    return d;
  }
  mute(bars, t) {
    this.muteBars = Math.max(this.muteBars, bars);
    this.g.hazards.dissolveAll();
    this.sing = [0, 0, 0];
    this.label = 'Голос приглушено';
  }
  resetToPhase() {
    this.hp = PHASE_START[this.phase - 1];
    this.seq = 0; this.muteBars = 0; this.pendingPhase = false; this.pendingEnd = false; this.sing = [0, 0, 0];
  }

  // ------------------------------------------------------------------ visuals
  update(t, dt) {
    this.shake = Math.max(0, this.shake - dt);
    for (let i = 0; i < 3; i++) {
      const f = this.W.faces[i], n = this.W.nodes[i];
      const singing = this.sing[i] > t;
      const muted = this.muteBars > 0;
      const off = this.state === 'done' || (this.state === 'finale' && i !== 1);
      let target = 0;
      if (this.awake[i] && !off) target = muted ? 0.08 : singing ? 1 : 0.22;
      if (this.state === 'finale' && i === 1) target = 0.35;
      this.glow[i] = damp(this.glow[i], target, singing ? 14 : 4, dt);
      const flick = singing ? 0.85 + Math.sin(t * 40 + i) * 0.15 : 1;
      f.glowMat.opacity = this.glow[i] * flick;
      f.light.intensity = this.glow[i] * 28;
      this.vuln[i] = Math.max(0, this.vuln[i] - dt * 4);
      const vul = this.isVulnerable(i, t);
      const pulse = vul ? 0.25 + 0.2 * Math.sin(t * 6) : 0;
      n.rimMat.opacity = clamp(0.1 + this.glow[i] * 0.55 + pulse + this.vuln[i] * 0.8, 0, 1);
      n.horn.material.emissive?.setRGB(0, 0, 0);
      // breathing faces, a nudge when struck
      const k = Math.sin(t * 0.8 + i * 2.1) * 0.04 + this.vuln[i] * 0.06;
      f.group.position.y = f.base.y + Math.sin(t * 0.6 + i) * 0.12 + (this.state === 'done' ? -0.6 : 0);
      f.group.quaternion.copy(f.baseQ);
      f.group.rotateX(k + (off ? 0.25 : 0));
      f.group.rotateZ(Math.sin(t * 0.5 + i) * 0.03);
    }
  }
}
