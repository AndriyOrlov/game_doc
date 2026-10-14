// Keyboard + mouse + gamepad + touch. Movement is screen-relative (camera faces north).
const KEYMAP = {
  KeyJ: 'attack', Space: 'dodge', KeyK: 'parry', KeyQ: 'part', KeyE: 'act',
  Escape: 'pause', KeyP: 'pause', KeyH: 'debug', KeyM: 'mute', Enter: 'confirm', NumpadEnter: 'confirm',
  Digit1: 'r1', Digit2: 'r2', Digit3: 'r3', Numpad1: 'r1', Numpad2: 'r2', Numpad3: 'r3', KeyR: 'listen', Backspace: 'back',
};

export class Input {
  constructor(canvas) {
    this.down = new Set(); this.pressed = new Set();
    this.move = { x: 0, z: 0 };
    this.stick = { x: 0, z: 0, active: false };
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.lastDevice = this.touch ? 'touch' : 'keys';
    this.pads = {};
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      this.down.add(e.code);
      if (a) { this.pressed.add(a); if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault(); }
      if (e.code.startsWith('Arrow')) e.preventDefault();
      this.lastDevice = 'keys';
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.pressed.add('attack');
      if (e.button === 2) this.pressed.add('parry');
      this.lastDevice = 'keys';
    });
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') this.pressed.add('tap'); });
    document.getElementById('letterbox')?.addEventListener('pointerdown', () => this.pressed.add('tap'));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(a) { this.pressed.add(a); }
  hit(a) { return this.pressed.has(a); }

  // Floating stick: touch anywhere in the left zone, the stick appears under the thumb.
  bindTouch(root) {
    const zone = root.querySelector('#stickzone');
    const pad = root.querySelector('#stick');
    const knob = root.querySelector('#stick-knob');
    let id = null, ox = 0, oy = 0;
    const R = 52;
    const place = (x, y) => { pad.style.left = x + 'px'; pad.style.top = y + 'px'; };
    const rest = () => { pad.style.left = ''; pad.style.top = ''; pad.classList.remove('live'); };
    zone.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId; zone.setPointerCapture(id);
      ox = e.clientX; oy = e.clientY; place(ox, oy); pad.classList.add('live');
      this.stick.active = true; this.lastDevice = 'touch'; this.pressed.add('tap'); move(e);
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const l = Math.hypot(dx, dy);
      // the base follows the thumb when it is dragged far, so direction changes stay quick
      if (l > R * 1.6) { const k = (l - R * 1.6) / l; ox += dx * k; oy += dy * k; place(ox, oy); dx = e.clientX - ox; dy = e.clientY - oy; }
      const l2 = Math.hypot(dx, dy), c = l2 > R ? R / l2 : 1;
      knob.style.transform = `translate(${dx * c}px, ${dy * c}px)`;
      const m = Math.min(1, l2 / R);
      if (m < 0.12) { this.stick.x = this.stick.z = 0; return; }
      const sc = Math.min(1, (m - 0.12) / 0.6) / l2; // reaches full speed at ~70% throw
      this.stick.x = dx * sc; this.stick.z = dy * sc;
    };
    zone.addEventListener('pointermove', move);
    const end = (e) => { if (e.pointerId !== id) return; id = null; this.stick.active = false; this.stick.x = this.stick.z = 0; knob.style.transform = ''; rest(); };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.press(b.dataset.act); this.lastDevice = 'touch'; b.classList.add('on'); });
      const off = () => b.classList.remove('on');
      b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off);
    });
  }

  update() {
    let x = 0, z = 0;
    const d = this.down;
    if (d.has('KeyA') || d.has('ArrowLeft')) x -= 1;
    if (d.has('KeyD') || d.has('ArrowRight')) x += 1;
    if (d.has('KeyW') || d.has('ArrowUp')) z -= 1;
    if (d.has('KeyS') || d.has('ArrowDown')) z += 1;
    if (this.stick.active) { x = this.stick.x; z = this.stick.z; }
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0, az = p.axes[1] || 0;
      if (Math.hypot(ax, az) > 0.2) { x = ax; z = az; this.lastDevice = 'pad'; }
      const map = { 0: 'dodge', 2: 'attack', 1: 'parry', 3: 'part', 5: 'act', 9: 'pause', 4: 'act' };
      const prev = this.pads[p.index] || [];
      p.buttons.forEach((b, i) => { if (b.pressed && !prev[i] && map[i]) { this.pressed.add(map[i]); this.lastDevice = 'pad'; } });
      this.pads[p.index] = p.buttons.map((b) => b.pressed);
    }
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    this.move.x = x; this.move.z = z;
  }

  endFrame() { this.pressed.clear(); }
}
