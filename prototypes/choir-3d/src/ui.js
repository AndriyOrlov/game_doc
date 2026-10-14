// Thin DOM layer: writes only when a value changes.
const $ = (id) => document.getElementById(id);
const ROMAN = ['', 'I', 'II', 'III'];

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'hp', 'res-fill', 'res-val', 'boss', 'boss-fill', 'phase', 'voice', 'pattern', 'beats', 'objective', 'prompt', 'toast', 'subtitle', 'speaker', 'line', 'bar', 'letterbox', 'title', 'pause', 'puzzle', 'dead', 'end', 'fade', 'fps', 'banner', 'touch', 'skip', 'vignette', 'p-slots', 'p-msg'])
      this.el[id] = $(id);
    this.cache = {};
    this.subQ = []; this.subT = 0; this.toastT = 0; this.bannerT = 0;
    this.hpBuilt = false;
  }
  set(key, v, fn) { if (this.cache[key] === v) return; this.cache[key] = v; fn(v); }
  show(id, on) { const e = this.el[id]; if (e && e.hidden === on) e.hidden = !on; }

  hp(n, max) {
    this.set('hp', n, () => {
      if (!this.hpBuilt) { this.el.hp.innerHTML = Array.from({ length: max }, () => '<i></i>').join(''); this.hpBuilt = true; }
      [...this.el.hp.children].forEach((c, i) => c.classList.toggle('lost', i >= n));
    });
  }
  res(v) {
    const r = Math.round(v);
    this.set('res', r, () => {
      this.el['res-fill'].style.width = r + '%';
      this.el['res-val'].textContent = r;
      this.el['res-fill'].parentElement.classList.toggle('ready', r >= 40);
    });
  }
  boss(on, hp, phase, voice, pattern) {
    this.show('boss', on);
    this.set('inf', on, (v) => document.body.classList.toggle('in-fight', v));
    if (!on) return;
    this.set('bhp', Math.round(hp * 10) / 10, (v) => { this.el['boss-fill'].style.width = v + '%'; });
    this.set('phase', phase, (v) => { this.el.phase.textContent = 'Фаза ' + ROMAN[v]; });
    this.set('voice', voice, (v) => { this.el.voice.textContent = v; });
    this.set('pattern', pattern, (v) => { this.el.pattern.textContent = v; });
  }
  beat(b) {
    this.set('beat', b, (v) => { [...this.el.beats.children].forEach((c, i) => c.classList.toggle('on', i === v)); });
  }
  bar(n) { this.set('barn', n, (v) => { this.el.bar.textContent = v; }); }
  objective(t) { this.set('obj', t, (v) => { this.el.objective.textContent = v; this.el.objective.parentElement.classList.remove('flash'); void this.el.objective.offsetWidth; this.el.objective.parentElement.classList.add('flash'); }); }
  prompt(t) { this.set('prompt', t || '', (v) => { this.el.prompt.hidden = !v; this.el.prompt.innerHTML = v; }); }
  toast(t, dur = 1.6) { this.el.toast.textContent = t; this.el.toast.classList.add('on'); this.toastT = dur; }
  banner(title, sub, dur = 2.6) {
    this.el.banner.innerHTML = `<div class="b-title">${title}</div><div class="b-sub">${sub}</div>`;
    this.el.banner.classList.add('on'); this.bannerT = dur;
  }
  say(speaker, line, dur = null) {
    this.subQ.push({ speaker, line, dur: dur ?? Math.min(6, 1.8 + line.length * 0.055) });
    if (this.subT <= 0) this.nextSub();
  }
  clearSubs() { this.subQ = []; this.subT = 0; this.el.subtitle.classList.remove('on'); }
  nextSub() {
    const s = this.subQ.shift();
    if (!s) { this.el.subtitle.classList.remove('on'); return; }
    this.el.speaker.textContent = s.speaker; this.el.line.textContent = s.line;
    this.el.subtitle.classList.add('on'); this.subT = s.dur;
  }
  hurtFlash() { this.el.vignette.classList.remove('hit'); void this.el.vignette.offsetWidth; this.el.vignette.classList.add('hit'); }
  letterbox(on) { this.el.letterbox.classList.toggle('on', on); document.body.classList.toggle('cine', on); }
  fade(v) { this.el.fade.style.opacity = v; }
  update(dt) {
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.nextSub(); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.el.banner.classList.remove('on'); }
  }
}
