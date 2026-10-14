import * as THREE from 'three';
import { clamp, damp, angDiff, TAU } from './util.js';

// GDD v0.1 numbers
export const HERO = {
  speed: 5,            // m/s
  radius: 0.32,        // hitbox (smaller than the cloak)
  dodgeTime: 0.24,     // invulnerable
  dodgeSpeed: 12.5,
  dodgeRecover: 0.7,
  parryWindow: 0.12,
  parryAssist: 0.22,
  hurtGuard: 1.0,
  maxHp: 5,
  resCost: 40,
  swing: 0.3,
};

export class Hero {
  constructor(scene, mats) {
    this.scene = scene;
    this.pos = new THREE.Vector2();
    this.yaw = Math.PI; // facing north (-z)
    this.hp = HERO.maxHp;
    this.res = 0;
    this.assist = false;
    this.build(mats);
    this.reset(0, 0);
  }

  reset(x, z, yaw = Math.PI) {
    this.pos.set(x, z); this.yaw = yaw;
    this.hp = HERO.maxHp;
    this.atk = 0; this.atkT = 0; this.queued = false; this.hitDone = false; this.comboGap = 0;
    this.dodgeT = 0; this.dodgeCd = 0; this.dodgeDir = new THREE.Vector2(0, -1);
    this.parryT = 0; this.parryCd = 0; this.parryVis = 0;
    this.hurtT = 0; this.kb = new THREE.Vector2(); this.partT = 0;
    this.locked = false; this.auto = null;
    this.moving = 0; this.stepPh = 0; this.flash = 0;
    this.nearMissCd = 0;
  }

  get invulnerable() { return this.dodgeT > 0 || this.hurtT > 0 || this.partT > 0; }
  get dodging() { return this.dodgeT > 0; }
  forward() { return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw)); }

  build(mats) {
    const root = new THREE.Group();
    const body = new THREE.Group(); root.add(body); body.scale.setScalar(1.15);
    const teal = new THREE.MeshStandardMaterial({ color: 0x1b5a5d, roughness: 0.78, side: THREE.DoubleSide, envMapIntensity: 0.4 });
    const tealDark = new THREE.MeshStandardMaterial({ color: 0x0d2b2d, roughness: 0.9 });
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.02, 20, 3, true), teal);
    mantle.position.y = 0.52; mantle.castShadow = true; body.add(mantle);
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.44, 0.95, 16, 1, false), tealDark); inner.position.y = 0.5; body.add(inner);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12, 0, TAU, 0, Math.PI * 0.62), teal);
    hood.position.set(0, 1.05, -0.03); hood.castShadow = true; body.add(hood);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), mats.ceramicPlain);
    head.position.set(0, 1.03, 0.04); head.castShadow = true; body.add(head);
    const visorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 2.4, 2.2) });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.03), visorMat); visor.position.set(0, 1.05, 0.215); body.add(visor);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 18), mats.copper);
    disc.rotation.x = Math.PI / 2; disc.position.set(0, 0.82, -0.33); body.add(disc);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mats.copper); shoulder.position.set(0.3, 0.84, 0.02); body.add(shoulder);
    // arm + tuning fork
    const arm = new THREE.Group(); arm.position.set(0.3, 0.82, 0.04); body.add(arm);
    const fork = new THREE.Group(); fork.position.set(0, -0.05, 0.12); fork.rotation.x = Math.PI / 2 - 0.25; arm.add(fork);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), mats.brass); handle.position.y = 0.05; fork.add(handle);
    const tipMat = new THREE.MeshStandardMaterial({ color: 0xb08a4a, metalness: 0.9, roughness: 0.25, emissive: new THREE.Color(0.2, 1.0, 0.95), emissiveIntensity: 0 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.04, 0.04), mats.brass); base.position.y = 0.27; fork.add(base);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.52, 0.032), tipMat); p.position.set(s * 0.068, 0.53, 0); p.castShadow = true; fork.add(p);
    }
    // readable ground ring (diegetic glow from the fork)
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.6, 1.5), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; root.add(ring);
    // hitbox ring for the level-design layer
    const hb = new THREE.Mesh(new THREE.RingGeometry(HERO.radius - 0.03, HERO.radius, 32), new THREE.MeshBasicMaterial({ color: 0xff4040, depthTest: false }));
    hb.rotation.x = -Math.PI / 2; hb.position.y = 0.05; hb.visible = false; hb.renderOrder = 1000; root.add(hb);
    // swing trail
    const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.5, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const trail = new THREE.Mesh(new THREE.RingGeometry(0.55, 1.45, 24, 1, -1.15, 2.3), trailMat);
    trail.rotation.x = -Math.PI / 2; trail.position.y = 0.7; root.add(trail);
    // parry ring
    const parryMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.0), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const parry = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.04, 8, 40), parryMat); parry.rotation.x = Math.PI / 2; parry.position.y = 0.7; root.add(parry);
    // resonance shield
    const shieldMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.3, 1.25), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, wireframe: true });
    const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), shieldMat); shield.position.y = 0.6; root.add(shield);
    // dodge ghosts
    this.ghosts = [];
    for (let i = 0; i < 4; i++) {
      const gm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.1, 1.05), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const g = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.15, 14, 1, true), gm);
      g.visible = false; this.scene.add(g); this.ghosts.push({ m: g, t: 0 });
    }
    const light = new THREE.PointLight(0x7fe7df, 1.4, 4.5, 2); light.position.y = 1.0; root.add(light);
    this.scene.add(root);
    Object.assign(this, { root, body, arm, fork, tipMat, ring, ringMat, hb, trail, trailMat, parry, parryMat, shield, shieldMat, mantle, visorMat, light, teal });
  }

  // ------------------------------------------------------------------ update
  update(dt, input, world, game) {
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryVis = Math.max(0, this.parryVis - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.partT = Math.max(0, this.partT - dt);
    this.comboGap = Math.max(0, this.comboGap - dt);
    this.nearMissCd = Math.max(0, this.nearMissCd - dt);
    this.flash = Math.max(0, this.flash - dt * 3);

    let mx = 0, mz = 0;
    if (this.auto) {
      const d = new THREE.Vector2(this.auto.x - this.pos.x, this.auto.y - this.pos.y);
      if (d.length() > 0.15) { d.normalize(); mx = d.x * (this.auto.speed ?? 0.7); mz = d.y * (this.auto.speed ?? 0.7); }
      else if (this.auto.face !== undefined) { this.yaw = damp(this.yaw, this.yaw + angDiff(this.yaw, this.auto.face), 8, dt); }
    } else if (!this.locked) {
      mx = input.move.x; mz = input.move.z;
    }
    const mlen = Math.hypot(mx, mz);
    const canAct = !this.locked && !this.auto;

    // actions
    if (canAct) {
      if (input.hit('dodge') && this.dodgeCd <= 0 && this.dodgeT <= 0) {
        this.dodgeT = HERO.dodgeTime; this.dodgeCd = HERO.dodgeTime + HERO.dodgeRecover;
        this.dodgeDir = mlen > 0.2 ? new THREE.Vector2(mx / mlen, mz / mlen) : this.forward();
        this.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.y);
        this.atk = 0; this.queued = false;
        game.onDodge?.(this);
      }
      if (input.hit('parry') && this.parryCd <= 0 && this.dodgeT <= 0) {
        this.parryT = this.assist ? HERO.parryAssist : HERO.parryWindow;
        this.parryCd = 0.42; this.parryVis = 0.28;
        game.onParryTry?.(this);
      }
      if (input.hit('part')) game.onPart?.(this);
      if (input.hit('attack') && this.dodgeT <= 0) {
        this.pressT = game.T;
        if (this.atk === 0) this.startSwing(this.comboGap > 0 ? this.nextCombo : 1, game);
        else if (this.atkT > 0.1) this.queued = true;
      }
    }

    // swing progress
    if (this.atk > 0) {
      this.atkT += dt;
      const T = HERO.swing + (this.atk === 3 ? 0.08 : 0);
      if (!this.hitDone && this.atkT >= (this.atk === 3 ? 0.13 : 0.09)) {
        this.hitDone = true;
        const f = this.forward();
        game.onStrike?.(new THREE.Vector2(this.pos.x + f.x * 1.0, this.pos.y + f.y * 1.0), this.atk, this);
      }
      if (this.atkT >= T) {
        const was = this.atk;
        this.atk = 0;
        if (this.queued && was < 3) { this.queued = false; this.startSwing(was + 1, game); }
        else { this.queued = false; this.nextCombo = was < 3 ? was + 1 : 1; this.comboGap = was < 3 ? 0.45 : 0; }
      }
    }

    // movement
    let vx = 0, vz = 0;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = this.dodgeDir.x * HERO.dodgeSpeed; vz = this.dodgeDir.y * HERO.dodgeSpeed;
      this.spawnGhost(dt);
    } else {
      const sp = HERO.speed * (this.atk > 0 ? 0.32 : 1) * (this.auto ? 1 : 1);
      vx = mx * sp; vz = mz * sp;
      if (this.atk > 0) { const f = this.forward(); const l = this.atkT < 0.12 ? 1.6 : 0; vx += f.x * l; vz += f.y * l; }
      if (mlen > 0.15 && this.atk === 0) {
        const target = Math.atan2(mx, mz);
        this.yaw += angDiff(this.yaw, target) * (1 - Math.exp(-16 * dt));
      }
    }
    vx += this.kb.x; vz += this.kb.y;
    this.kb.multiplyScalar(Math.exp(-10 * dt));
    world.move(this.pos, vx * dt, vz * dt);

    this.moving = damp(this.moving, this.dodgeT > 0 ? 0 : Math.min(1, mlen), 10, dt);
    if (this.moving > 0.3) {
      const prev = this.stepPh;
      this.stepPh += dt * 9.5 * this.moving;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepPh / Math.PI)) game.onStep?.(this);
    }
    this.animate(dt, game.time ?? 0);
  }

  startSwing(n, game) {
    this.atk = n; this.atkT = 0; this.hitDone = false; this.queued = false; this.swingT = this.pressT ?? game.T;
    const tgt = game.softTarget?.(this);
    if (tgt) this.yaw = Math.atan2(tgt.x - this.pos.x, tgt.y - this.pos.y);
    game.onSwing?.(this, n);
  }

  hurt(from) {
    this.hp = Math.max(0, this.hp - 1);
    this.hurtT = HERO.hurtGuard;
    const d = new THREE.Vector2(this.pos.x - from.x, this.pos.y - from.y);
    if (d.lengthSq() < 1e-4) d.set(0, 1);
    d.normalize().multiplyScalar(5.5);
    this.kb.copy(d);
    this.atk = 0; this.flash = 1;
  }

  spawnGhost(dt) {
    this._gT = (this._gT || 0) - dt;
    if (this._gT > 0) return;
    this._gT = 0.05;
    const g = this.ghosts.find((x) => x.t <= 0) || this.ghosts[0];
    g.t = 0.28; g.m.visible = true;
    g.m.position.set(this.pos.x, 0.58, this.pos.y);
  }

  animate(dt, t) {
    const r = this.root;
    r.position.set(this.pos.x, 0, this.pos.y);
    r.rotation.y = this.yaw;
    const bob = Math.abs(Math.sin(this.stepPh)) * 0.06 * this.moving;
    this.body.position.y = bob + Math.sin(t * 2.2) * 0.012;
    this.body.rotation.x = this.moving * 0.12 + (this.dodgeT > 0 ? 0.35 : 0);
    this.mantle.scale.set(1 + this.moving * 0.06, 1, 1 + this.moving * 0.1 + Math.sin(this.stepPh * 2) * 0.02);
    // fork swing
    const T = HERO.swing + (this.atk === 3 ? 0.08 : 0);
    let ay = 0.25, ax = 0;
    if (this.atk > 0) {
      const k = clamp(this.atkT / (T * 0.55), 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      if (this.atk === 1) ay = 1.3 - 2.7 * e;
      else if (this.atk === 2) ay = -1.4 + 2.8 * e;
      else { ay = 0; ax = -1.6 + 2.6 * e; }
      this.trailMat.opacity = this.atkT < T * 0.7 ? 0.75 * (1 - this.atkT / (T * 0.7)) : 0;
      this.trail.rotation.z = this.atk === 2 ? Math.PI * 0.0 : 0;
      this.trail.scale.setScalar(this.atk === 3 ? 1.25 : 1);
    } else this.trailMat.opacity = Math.max(0, this.trailMat.opacity - dt * 6);
    this.arm.rotation.y = damp(this.arm.rotation.y, ay, this.atk ? 40 : 10, dt);
    this.arm.rotation.x = damp(this.arm.rotation.x, ax, this.atk ? 40 : 10, dt);
    this.tipMat.emissiveIntensity = this.res >= HERO.resCost ? 1.6 + Math.sin(t * 6) * 0.4 : 0.15;
    // parry & shield
    const pv = this.parryVis / 0.28;
    this.parryMat.opacity = pv * 0.9; this.parry.scale.setScalar(1.25 - pv * 0.45);
    this.shieldMat.opacity = Math.min(1, this.partT * 1.2) * 0.5; this.shield.rotation.y += dt * 1.5;
    // hurt blink
    const blink = this.hurtT > 0 && Math.floor(this.hurtT * 14) % 2 === 0;
    this.body.visible = !blink;
    this.visorMat.color.setRGB(0.5 + this.flash * 3, 2.4 - this.flash * 1.8, 2.2 - this.flash * 1.8);
    this.ringMat.opacity = 0.42 + (this.dodgeCd > 0 ? 0 : 0.2);
    for (const g of this.ghosts) {
      if (g.t > 0) { g.t -= dt; g.m.material.opacity = Math.max(0, g.t / 0.28) * 0.5; if (g.t <= 0) g.m.visible = false; }
    }
  }
}
