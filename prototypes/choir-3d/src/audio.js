// Web Audio engine: one transport (96 BPM, 4/4), separate buses, generated hall reverb,
// formant "voices" placed in 3D, short dry combat cues.
export const BPM = 96;
export const BEAT = 60 / BPM;      // 0.625 s
export const BAR = BEAT * 4;       // 2.5 s

const N = (m) => 440 * Math.pow(2, (m - 69) / 12); // midi -> Hz

// Dm – B♭ – Gm – A
const PROG = [
  [50, 53, 57, 38],
  [46, 50, 53, 34],
  [43, 46, 50, 31],
  [45, 49, 52, 33],
];

export const VOICE = {
  bass:   { formants: [[400, 1], [750, 0.55], [2400, 0.18]], type: 'sawtooth', gain: 0.5 },
  mid:    { formants: [[700, 1], [1100, 0.6], [2600, 0.22]], type: 'sawtooth', gain: 0.38 },
  treble: { formants: [[800, 1], [1150, 0.5], [2900, 0.3]], type: 'sawtooth', gain: 0.26 },
};

export class AudioEngine {
  constructor() { this.ctx = null; this.ok = false; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.ok = true;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(4.2);
    this.revReturn = ctx.createGain();
    this.revReturn.gain.value = 0.5;
    this.reverb.connect(this.revReturn); this.revReturn.connect(this.master);

    const bus = (g, send) => {
      const n = ctx.createGain(); n.gain.value = g; n.connect(this.master);
      const s = ctx.createGain(); s.gain.value = send; n.connect(s); s.connect(this.reverb);
      return n;
    };
    this.music = bus(0.62, 0.4);
    this.drums = bus(0.8, 0.22);
    this.musicLP = ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 7000;
    this.musicLP.connect(this.music);
    this.voices = bus(0.62, 0.75);
    this.cues = bus(0.7, 0.1);
    this.foley = bus(0.45, 0.25);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.now, 0.05);
  }
  setMusicMuffle(on) {
    if (this.musicLP) this.musicLP.frequency.setTargetAtTime(on ? 520 : 7000, this.now, 0.3);
    if (this.drums) this.drums.gain.setTargetAtTime(on ? 0.15 : 0.8, this.now, 0.2);
  }

  makeIR(sec) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / rate;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (t < 0.01 ? t / 0.01 : 1);
      }
      // early reflections off the hall walls
      for (const [tt, a] of [[0.031, 0.7], [0.047, 0.5], [0.071, 0.45], [0.112, 0.3], [0.163, 0.22]]) {
        const k = Math.floor((tt + ch * 0.004) * rate);
        if (k < len) d[k] += a * (ch ? -1 : 1);
      }
    }
    return buf;
  }

  setListener(x, y, z) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.now;
      L.positionX.setTargetAtTime(x, t, 0.05); L.positionY.setTargetAtTime(y, t, 0.05); L.positionZ.setTargetAtTime(z, t, 0.05);
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(x, y, z); L.setOrientation(0, 0, -1, 0, 1, 0);
    }
  }

  panner(pos) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = 7; p.rolloffFactor = 0.8; p.maxDistance = 80;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    return p;
  }

  env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  // ---------------- music ----------------
  padChord(bar, t, level = 0.5) {
    if (!this.ok) return;
    const ctx = this.ctx, notes = PROG[bar % 4], dur = BAR;
    for (let i = 0; i < notes.length; i++) {
      const f = N(notes[i]);
      const g = ctx.createGain();
      const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2.003;
      const g2 = ctx.createGain(); g2.gain.value = 0.28;
      o1.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.musicLP);
      const lv = level * (i === 3 ? 0.13 : 0.075);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(lv, t + 0.45);
      g.gain.setValueAtTime(lv, t + dur - 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.8); o2.stop(t + dur + 0.8);
    }
  }

  heartbeat(t, level = 0.5) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(82, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.28);
    o.connect(g); g.connect(this.music);
    this.env(g, t, 0.006, level, 0.02, 0.32);
    o.start(t); o.stop(t + 0.45);
  }

  tick(t, accent = false, level = 0.05) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), hp = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.value = accent ? 2200 : 1700;
    hp.type = 'highpass'; hp.frequency.value = 1200;
    o.connect(hp); hp.connect(g); g.connect(this.music);
    this.env(g, t, 0.002, accent ? level * 1.6 : level, 0.005, 0.04);
    o.start(t); o.stop(t + 0.08);
  }

  shimmer(t, midi, level = 0.06) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = N(midi);
    o.connect(g); g.connect(this.music);
    this.env(g, t, 0.01, level, 0.05, 0.9);
    o.start(t); o.stop(t + 1.1);
  }

  // ---------------- arrangement layer ----------------
  chordTones(bar) { return PROG[bar % 4]; }

  kick(t, level = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    o.connect(g); g.connect(this.drums);
    this.env(g, t, 0.002, 0.95 * level, 0.03, 0.32);
    o.start(t); o.stop(t + 0.45);
    this.noiseBurst(t, 0.03, 'highpass', 3000, 0.7, 0.18 * level, this.drums);
  }
  snare(t, level = 1) {
    this.noiseBurst(t, 0.22, 'bandpass', 1900, 0.9, 0.55 * level, this.drums);
    this.noiseBurst(t, 0.08, 'highpass', 5000, 0.7, 0.25 * level, this.drums);
    this.tone(t, 196, 0.08, 0.22 * level, 'triangle', this.drums);
  }
  hat(t, open = false, level = 1) {
    this.noiseBurst(t, open ? 0.22 : 0.05, 'highpass', 7500, 0.8, (open ? 0.16 : 0.11) * level, this.drums);
  }
  bassNote(t, midi, dur, level = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, f = N(midi);
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = f; o2.type = 'square'; o2.frequency.value = f / 2;
    lp.type = 'lowpass'; lp.Q.value = 5; lp.frequency.setValueAtTime(1500, t); lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    const g2 = ctx.createGain(); g2.gain.value = 0.5;
    o.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(this.musicLP);
    this.env(g, t, 0.005, 0.32 * level, dur * 0.4, dur * 0.6);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
  organ(bar, t, dur, level = 1) {
    if (!this.ok) return;
    const ctx = this.ctx;
    for (const m of PROG[bar % 4].slice(0, 3)) {
      for (const [mul, det, a] of [[1, -6, 0.5], [1, 6, 0.5], [2, 0, 0.35], [4, 3, 0.12]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = mul === 1 ? 'sawtooth' : 'square'; o.frequency.value = N(m + 12) * mul; o.detune.value = det;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        o.connect(lp); lp.connect(g); g.connect(this.musicLP);
        const lv = 0.022 * a * level;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(lv, t + 0.08);
        g.gain.setValueAtTime(lv, t + dur - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
        o.start(t); o.stop(t + dur + 0.3);
      }
    }
  }
  arp(t, midi, level = 1, bright = false) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = bright ? 'square' : 'triangle'; o.frequency.value = N(midi);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright ? 5200 : 3200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    o.connect(lp); lp.connect(g); g.connect(this.musicLP);
    this.env(g, t, 0.003, (bright ? 0.07 : 0.1) * level, 0.02, 0.28);
    o.start(t); o.stop(t + 0.4);
  }
  lead(t, midi, dur, level = 1) {
    if (!this.ok) return;
    this.bell(t, N(midi), 0.11 * level, dur + 0.6, this.musicLP);
    this.tone(t, N(midi), dur, 0.05 * level, 'sine', this.musicLP);
  }
  hitNote(t, bar, strong, onBeat) {
    const tones = PROG[bar % 4];
    const m = tones[strong ? 0 : 2] + (onBeat ? 36 : 24);
    this.bell(t, N(m), onBeat ? 0.26 : 0.12, onBeat ? 1.1 : 0.4);
    if (onBeat) this.bell(t, N(m + 7), 0.1, 0.9);
  }

  // ---------------- voices ----------------
  sing(pos, midi, t, dur, voice = VOICE.mid, { glideTo = null, level = 1 } = {}) {
    if (!this.ok) return;
    const ctx = this.ctx, f = N(midi);
    const o = ctx.createOscillator(); o.type = voice.type; o.frequency.setValueAtTime(f, t);
    if (glideTo !== null) o.frequency.exponentialRampToValueAtTime(N(glideTo), t + dur);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.1;
    const lg = ctx.createGain(); lg.gain.value = f * 0.007; lfo.connect(lg); lg.connect(o.frequency);
    const sum = ctx.createGain();
    for (const [ff, gg] of voice.formants) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 6;
      const fg = ctx.createGain(); fg.gain.value = gg * 2.6;
      o.connect(bp); bp.connect(fg); fg.connect(sum);
    }
    const g = ctx.createGain();
    sum.connect(g);
    const pan = this.panner(pos);
    g.connect(pan); pan.connect(this.voices);
    const peak = voice.gain * level;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + Math.min(0.14, dur * 0.3));
    g.gain.setValueAtTime(peak, t + Math.max(0.15, dur - 0.12));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.35);
    o.start(t); lfo.start(t); o.stop(t + dur + 0.45); lfo.stop(t + dur + 0.45);
  }

  // ---------------- cues ----------------
  noiseBurst(t, dur, type, freq, q, level, dest = this.cues, sweepTo = null) {
    if (!this.ok) return;
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    s.connect(f); f.connect(g); g.connect(dest);
    this.env(g, t, 0.004, level, dur * 0.3, dur * 0.7);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  bell(t, f, level = 0.2, decay = 0.6, dest = this.cues) {
    if (!this.ok) return;
    const ctx = this.ctx;
    for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.18]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f * m;
      o.connect(g); g.connect(dest);
      this.env(g, t, 0.003, level * a, 0.0, decay / m);
      o.start(t); o.stop(t + decay + 0.1);
    }
  }

  tone(t, f, dur, level = 0.2, type = 'sine', dest = this.cues) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f;
    o.connect(g); g.connect(dest);
    this.env(g, t, 0.01, level, dur * 0.6, dur * 0.4 + 0.2);
    o.start(t); o.stop(t + dur + 0.3);
  }

  register(t, idx) { // puzzle registers: low / mid / high (octaves of A)
    const f = [110, 220, 440][idx];
    this.tone(t, f, 0.9, 0.22, 'triangle');
    this.tone(t, f * 2, 0.9, 0.05, 'sine');
  }

  ping(t) { this.bell(t, 1320, 0.16, 0.45); }
  thump(t) { this.noiseBurst(t, 0.32, 'lowpass', 220, 1, 0.55); this.tone(t, 52, 0.25, 0.4); }
  whine(t, dur) {
    if (!this.ok) return;
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(1500, t + dur);
    o.connect(g); g.connect(this.cues);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    o.start(t); o.stop(t + dur + 0.1);
  }
  beam(t) {
    this.noiseBurst(t, 0.5, 'bandpass', 900, 2, 0.5);
    this.tone(t, 220, 0.45, 0.14, 'sawtooth');
    this.tone(t, 330, 0.45, 0.08, 'sawtooth');
  }
  parry(t) { this.bell(t, 1320, 0.22, 0.8); this.bell(t + 0.025, 1660, 0.17, 0.8); this.bell(t + 0.05, 1980, 0.14, 0.9); }
  hurt(t) { this.noiseBurst(t, 0.22, 'bandpass', 600, 1.2, 0.6); this.tone(t, 92, 0.22, 0.35, 'square'); }
  swing(t) { this.noiseBurst(t, 0.12, 'highpass', 2500, 0.7, 0.18, this.foley, 6000); }
  clink(t, strong = false) { this.bell(t, 2100, strong ? 0.2 : 0.13, 0.35); this.bell(t, 3150, 0.06, 0.25); }
  clank(t) { this.noiseBurst(t, 0.12, 'bandpass', 1500, 3, 0.2); this.bell(t, 640, 0.1, 0.2); }
  thunk(t) { this.noiseBurst(t, 0.2, 'lowpass', 500, 1, 0.5, this.foley); this.tone(t, 120, 0.15, 0.25, 'triangle', this.foley); }
  crash(t) { this.noiseBurst(t, 0.9, 'lowpass', 1400, 0.8, 0.6, this.foley, 200); this.bell(t, 410, 0.12, 0.9, this.foley); }
  gate(t, dur = 1.4) { this.noiseBurst(t, dur, 'lowpass', 160, 1, 0.55, this.foley); this.bell(t + dur, 520, 0.14, 0.6, this.foley); this.noiseBurst(t + dur, 0.2, 'bandpass', 1200, 2, 0.4, this.foley); }
  dodge(t) { this.noiseBurst(t, 0.18, 'bandpass', 1200, 0.8, 0.22, this.foley, 400); }
  step(t) { this.noiseBurst(t, 0.05, 'bandpass', 1500 + Math.random() * 600, 2, 0.08, this.foley); }
  dissolve(t) { this.noiseBurst(t, 0.6, 'highpass', 3000, 0.5, 0.14, this.cues, 9000); }
  resonance(t) { this.bell(t, 660, 0.18, 1.4); this.bell(t, 990, 0.12, 1.4); this.tone(t, 165, 1.2, 0.2, 'triangle'); }
  mute(t) { this.noiseBurst(t, 1.2, 'lowpass', 700, 1, 0.5, this.cues, 120); this.bell(t, 440, 0.2, 1.6); }
  ui(t) { this.bell(t, 1760, 0.05, 0.15); }
  wrong(t) { this.tone(t, 196, 0.18, 0.12, 'triangle'); this.tone(t + 0.12, 185, 0.22, 0.1, 'triangle'); }
  solved(t) { this.bell(t, 440, 0.18, 1.6); this.bell(t + 0.12, 660, 0.15, 1.6); this.bell(t + 0.24, 880, 0.13, 2); }
  impact(t) { this.noiseBurst(t, 0.6, 'lowpass', 300, 1, 0.7, this.foley); this.tone(t, 46, 0.6, 0.45); }
}
