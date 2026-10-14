import * as THREE from 'three';
import { angDiff, clamp, TAU } from './util.js';
import { COLUMNS, ARENA_R } from './world.js';

// Shape language (GDD p.4): amber ROUND pulses with a double ring = can be deflected;
// wide DARK bands with a bone rim = move or dodge; the striped cold line = the beam that columns block.

const VERT = /* glsl */`
varying vec3 vW;
void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const FRAG = /* glsl */`
uniform vec2 uO; uniform float uR; uniform float uTh; uniform float uA; uniform float uMode; uniform float uTime; uniform float uClip;
uniform vec2 uSec; uniform float uSecOn; uniform vec2 uGaps[4]; uniform int uGapN;
uniform vec3 uCore; uniform vec3 uRim; uniform vec3 uTel; uniform float uSpeed; uniform float uMaxR;
varying vec3 vW;
float adiff(float a, float b){ return abs(mod(b - a + 3.14159265, 6.28318531) - 3.14159265); }
void main(){
  if (length(vW.xz) > uClip) discard;
  vec2 p = vW.xz - uO; float d = length(p); float ang = atan(p.y, p.x);
  if (d > uMaxR) discard;
  if (uSecOn > 0.5 && adiff(uSec.x, ang) > uSec.y) discard;
  float gapEdge = 10.0;
  for (int i = 0; i < 4; i++) { if (i >= uGapN) break; float ad = adiff(uGaps[i].x, ang); if (ad < uGaps[i].y) discard; gapEdge = min(gapEdge, (ad - uGaps[i].y) * d); }
  if (uMode < 0.5) {
    float e = abs(d - uR); float h = uTh * 0.5;
    if (e > h) discard;
    float rim = smoothstep(h - 0.16, h, e);
    float side = 1.0 - smoothstep(0.0, 0.14, gapEdge);
    rim = max(rim, side);
    vec3 c = mix(uCore, uRim, rim);
    gl_FragColor = vec4(c, mix(0.9, 1.0, rim) * uA);
  } else if (uMode < 1.5) {
    if (d < 0.9) discard;
    float stripe = step(0.55, fract((d - uTime * uSpeed) * 0.75));
    float lane = 1.0 - smoothstep(0.0, 0.25, gapEdge);
    float a = uA * (0.08 + 0.17 * stripe + 0.35 * lane) * smoothstep(30.0, 8.0, d);
    gl_FragColor = vec4(mix(uTel, uRim, lane), a);
  } else {
    float rr = mod(uTime * uSpeed, min(18.0, uMaxR));
    float e = abs(d - rr);
    float a = uA * (0.55 * (1.0 - smoothstep(0.0, 0.35, e)) + 0.06) * smoothstep(20.0, 6.0, d);
    gl_FragColor = vec4(uTel, a);
  }
}`;

const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const COL_CORE = new THREE.Color(0x0e0709);
const COL_RIM = new THREE.Color(1.35, 1.0, 0.78);
const COL_TEL = new THREE.Color(0.75, 0.16, 0.18);
const COL_TEL_RING = new THREE.Color(0.9, 0.75, 0.6);

function waveMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: {
      uO: { value: new THREE.Vector2() }, uR: { value: 0 }, uTh: { value: 1 }, uA: { value: 1 }, uMode: { value: 0 }, uTime: { value: 0 },
      uClip: { value: ARENA_R - 0.05 }, uSec: { value: new THREE.Vector2(0, Math.PI) }, uSecOn: { value: 0 },
      uGaps: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] }, uGapN: { value: 0 },
      uCore: { value: COL_CORE.clone() }, uRim: { value: COL_RIM.clone() }, uTel: { value: COL_TEL.clone() }, uSpeed: { value: 2 }, uMaxR: { value: 999 },
    },
  });
}

// beam dashed material
const BEAM_FRAG = /* glsl */`
varying vec2 vUv; uniform float uA; uniform float uTime; uniform float uLen; uniform float uLock;
void main(){
  float s = step(0.5, fract(vUv.x * uLen * 0.9 - uTime * 6.0));
  float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
  vec3 c = mix(vec3(0.55, 1.6, 1.7), vec3(2.2, 2.4, 2.4), uLock);
  gl_FragColor = vec4(c, uA * (0.35 + 0.65 * s) * smoothstep(0.0, 0.4, edge));
}`;
const BEAM_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const BEAM_GEO = new THREE.PlaneGeometry(1, 1).translate(0.5, 0, 0).rotateX(-Math.PI / 2);

const SPH = new THREE.SphereGeometry(0.28, 16, 12);
const TOR = new THREE.TorusGeometry(0.46, 0.035, 6, 32);
const OCT = new THREE.OctahedronGeometry(0.2, 0).scale(0.65, 0.65, 1.7);
const DISC = new THREE.CircleGeometry(0.4, 20).rotateX(-Math.PI / 2);

export function occludeBeam(ox, oz, dx, dz, maxLen, radius = 0.74) {
  let len = maxLen, hitCol = -1;
  COLUMNS.forEach((c, i) => {
    const cx = c.x - ox, cz = c.y - oz;
    const t = cx * dx + cz * dz;
    if (t <= 0) return;
    const d2 = cx * cx + cz * cz - t * t;
    if (d2 < radius * radius) {
      const tt = t - Math.sqrt(radius * radius - d2);
      if (tt < len) { len = tt; hitCol = i; }
    }
  });
  return { len, hitCol };
}

export class Sparks {
  constructor(scene, tex, n = 700) {
    this.n = n; this.i = 0;
    this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ map: tex, size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pts.frustumCulled = false;
    scene.add(this.pts);
  }
  burst(x, y, z, color, count = 20, speed = 4, up = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.i = (this.i + 1) % this.n;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      const a = Math.random() * TAU, e = Math.random() * 0.9 + 0.1;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.v[i * 3] = Math.cos(a) * s; this.v[i * 3 + 1] = (Math.random() * 0.8 + 0.2) * s * up; this.v[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = 0.4 + Math.random() * 0.5 * e;
      this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.c[i * 3] = this.c[i * 3 + 1] = this.c[i * 3 + 2] = 0; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 9 * dt;
      for (let k = 0; k < 3; k++) this.p[i * 3 + k] += this.v[i * 3 + k] * dt;
      if (this.p[i * 3 + 1] < 0.03) { this.p[i * 3 + 1] = 0.03; this.v[i * 3 + 1] *= -0.3; }
      const f = clamp(this.life[i] * 2.2, 0, 1);
      for (let k = 0; k < 3; k++) this.c[i * 3 + k] = this.base[i * 3 + k] * f;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
    this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

export class Hazards {
  constructor(scene, sparks) {
    this.scene = scene; this.sparks = sparks; this.list = []; this.debug = false;
  }

  // ---------- creation (times are absolute transport times) ----------
  wave({ at, origin, sector = null, gaps = [], speed = 9, th = 1.0, harmless = false, maxR = null, clip = ARENA_R - 0.05, voice = 0 }) {
    const mat = waveMaterial();
    const mesh = new THREE.Mesh(PLANE, mat);
    const size = 2 * ((maxR ?? (Math.hypot(origin.x, origin.y) + ARENA_R)) + 2);
    mesh.scale.set(size, 1, size); mesh.position.set(origin.x, 0.035, origin.y);
    mesh.renderOrder = 5; mesh.visible = false; mesh.frustumCulled = false;
    this.scene.add(mesh);
    const u = mat.uniforms;
    u.uO.value.copy(origin); u.uTh.value = th; u.uClip.value = clip;
    if (sector) { u.uSecOn.value = 1; u.uSec.value.set(sector.c, sector.hw); }
    gaps.slice(0, 4).forEach((g, i) => u.uGaps.value[i].set(g[0], g[1])); u.uGapN.value = Math.min(4, gaps.length);
    if (harmless) { u.uCore.value.setRGB(0.05, 0.03, 0.04); u.uA.value = 0.5; }
    const h = { kind: 'wave', at, origin: origin.clone(), sector, gaps, speed, th, harmless, maxR: maxR ?? Math.hypot(origin.x, origin.y) + ARENA_R + th, mesh, mat, r: 0, voice, spawned: false };
    this.list.push(h); return h;
  }

  telegraph({ from, to, origin, sector = null, gaps = [], mode = 1, speed = 2.5, clip = ARENA_R - 0.05, color = null, maxR = 999 }) {
    const mat = waveMaterial();
    const mesh = new THREE.Mesh(PLANE, mat);
    const size = 2 * (Math.hypot(origin.x, origin.y) + ARENA_R + 2);
    mesh.scale.set(size, 1, size); mesh.position.set(origin.x, 0.03, origin.y);
    mesh.renderOrder = 4; mesh.visible = false; mesh.frustumCulled = false;
    this.scene.add(mesh);
    const u = mat.uniforms;
    u.uO.value.copy(origin); u.uMode.value = mode; u.uSpeed.value = speed; u.uClip.value = clip; u.uMaxR.value = maxR;
    if (mode === 2) u.uTel.value.copy(COL_TEL_RING);
    if (color) u.uTel.value.copy(color);
    if (sector) { u.uSecOn.value = 1; u.uSec.value.set(sector.c, sector.hw); }
    gaps.slice(0, 4).forEach((g, i) => u.uGaps.value[i].set(g[0], g[1])); u.uGapN.value = Math.min(4, gaps.length);
    const h = { kind: 'tel', at: from, to, mesh, mat };
    this.list.push(h); return h;
  }

  pulse({ at, origin, aim = null, dir = null, speed = 7, harmless = false, node = -1, y = 1.2 }) {
    const g = new THREE.Group();
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.45, 0.38) });
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 1.4), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(SPH, coreMat);
    const r1 = new THREE.Mesh(TOR, ringMat); r1.rotation.x = Math.PI / 2;
    const r2 = new THREE.Mesh(TOR, ringMat); r2.scale.setScalar(0.78);
    const sh = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    g.add(core, r1, r2); g.visible = false;
    sh.visible = false;
    this.scene.add(g, sh);
    const h = { kind: 'pulse', at, pos: origin.clone(), y, dir: dir ? dir.clone() : null, aim, speed, harmless, node, reflected: false, target: null, mesh: g, shadow: sh, coreMat, ringMat, r1, r2, spawned: false, life: 6 };
    this.list.push(h); return h;
  }

  needle({ at, origin, angle, speed = 5.5 }) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(OCT, new THREE.MeshStandardMaterial({ color: 0x150a0e, roughness: 0.4, metalness: 0.2 }));
    const rim = new THREE.Mesh(OCT, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.9, 0.75), side: THREE.BackSide }));
    rim.scale.setScalar(1.28);
    g.add(m, rim); g.visible = false; this.scene.add(g);
    const h = { kind: 'needle', at, pos: origin.clone(), dir: new THREE.Vector2(Math.cos(angle), Math.sin(angle)), speed, mesh: g, spawned: false, life: 7 };
    this.list.push(h); return h;
  }

  beam({ telAt, lockAt, fireAt, origin, hero, harmless = false, dur = 0.45 }) {
    const telMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uLen: { value: 10 }, uLock: { value: 0 } } });
    const tel = new THREE.Mesh(BEAM_GEO, telMat); tel.position.set(origin.x, 0.06, origin.y); tel.visible = false; tel.renderOrder = 6; tel.frustumCulled = false;
    const fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.8, 2.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), fireMat); fire.visible = false; fire.frustumCulled = false;
    const core = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) })); core.visible = false; core.frustumCulled = false;
    this.scene.add(tel, fire, core);
    const a = Math.atan2(hero.pos.y - origin.y, hero.pos.x - origin.x);
    const h = { kind: 'beam', at: telAt, lockAt, fireAt, endAt: fireAt + dur, origin: origin.clone(), angle: a, len: 30, hitCol: -1, tel, telMat, fire, fireMat, core, harmless, didHit: false, spawned: false, fired: false };
    this.list.push(h); return h;
  }

  // ---------- control ----------
  dissolveAll(except = null) {
    for (const h of this.list) if (h !== except && !(h.kind === 'pulse' && h.reflected)) { if (!h.dying) h.dying = 0.35; }
  }
  dissolveNear(p, r) {
    let n = 0;
    for (const h of this.list) {
      if ((h.kind === 'pulse' && !h.reflected) || h.kind === 'needle') {
        if (h.spawned && h.pos.distanceTo(p) < r && !h.dying) { h.dying = 0.3; n++; this.sparks.burst(h.pos.x, 1, h.pos.y, new THREE.Color(0.5, 1.6, 1.5), 6, 3); }
      }
    }
    return n;
  }
  clear() { for (const h of this.list) this.remove(h); this.list = []; }
  remove(h) {
    for (const k of ['mesh', 'shadow', 'tel', 'fire', 'core']) if (h[k]) { this.scene.remove(h[k]); }
    h.mat?.dispose(); h.telMat?.dispose(); h.fireMat?.dispose(); h.coreMat?.dispose(); h.ringMat?.dispose();
    h.dead = true;
  }
  activeThreat() { return this.list.some((h) => !h.dead && !h.dying && h.kind !== 'tel'); }

  // ---------- simulation ----------
  update(t, dt, hero, game) {
    const ev = [];
    const hp = hero.pos, hr = 0.32;
    for (const h of this.list) {
      if (h.dead) continue;
      if (h.dying !== undefined) {
        h.dying -= dt;
        const f = clamp(h.dying / 0.35, 0, 1);
        if (h.mat) h.mat.uniforms.uA.value *= 0.85;
        if (h.mesh && h.kind !== 'wave' && h.kind !== 'tel') h.mesh.scale.setScalar(Math.max(0.01, f));
        if (h.telMat) h.telMat.uniforms.uA.value *= 0.8;
        if (h.fireMat) h.fireMat.opacity *= 0.8;
        if (h.dying <= 0) this.remove(h);
        continue;
      }
      if (t < h.at) continue;
      if (h.kind === 'tel') {
        h.mesh.visible = true;
        const k = clamp((t - h.at) / Math.max(0.01, h.to - h.at), 0, 1);
        h.mat.uniforms.uA.value = Math.min(1, k * 1.6) * (t > h.to - 0.12 ? clamp((h.to - t) / 0.12, 0, 1) : 1);
        h.mat.uniforms.uTime.value = t;
        if (t >= h.to) this.remove(h);
        continue;
      }
      if (h.kind === 'wave') {
        if (!h.spawned) { h.spawned = true; h.mesh.visible = true; ev.push({ type: 'waveSpawn', h }); }
        h.r = (t - h.at) * h.speed;
        h.mat.uniforms.uR.value = h.r;
        if (h.r - h.th > h.maxR) { this.remove(h); continue; }
        // hit test (mirrors the shader)
        const dx = hp.x - h.origin.x, dz = hp.y - h.origin.y, d = Math.hypot(dx, dz);
        if (Math.hypot(hp.x, hp.y) > h.mat.uniforms.uClip.value + hr) continue;
        if (Math.abs(d - h.r) > h.th * 0.5 + hr) continue;
        const ang = Math.atan2(dz, dx);
        if (h.sector && Math.abs(angDiff(h.sector.c, ang)) > h.sector.hw + hr / Math.max(d, 0.5)) continue;
        let inGap = false;
        for (const g of h.gaps) if (Math.abs(angDiff(g[0], ang)) < g[1] - hr / Math.max(d, 0.5)) inGap = true;
        if (inGap) continue;
        this.contact(h, hero, ev, new THREE.Vector2(h.origin.x, h.origin.y));
        continue;
      }
      if (h.kind === 'pulse') {
        if (!h.spawned) {
          h.spawned = true; h.mesh.visible = true; h.shadow.visible = true;
          if (!h.dir) {
            const a = h.aim ? h.aim.clone() : hp.clone(); h.dir = a.sub(h.pos).normalize();
            if (h.spreadOff) h.dir.rotateAround(new THREE.Vector2(), h.spreadOff);
          }
          ev.push({ type: 'pulseSpawn', h });
        }
        h.life -= dt;
        if (h.reflected) {
          const tp = h.target.pos;
          const to = new THREE.Vector2(tp.x - h.pos.x, tp.z - h.pos.y);
          const dist = to.length();
          h.dir.lerp(to.normalize(), 1 - Math.exp(-10 * dt)).normalize();
          h.y += (tp.y - h.y) * Math.min(1, dt * 3);
          if (dist < 0.8 || h.life < 0) { ev.push({ type: 'reflectHit', h, target: h.target }); this.remove(h); continue; }
        }
        h.pos.addScaledVector(h.dir, h.speed * dt);
        h.mesh.position.set(h.pos.x, h.y + Math.sin(t * 9) * 0.05, h.pos.y);
        h.shadow.position.set(h.pos.x, 0.02, h.pos.y);
        h.r1.rotation.z += dt * 4; h.r2.rotation.y += dt * 5;
        if (h.life < 0 || Math.hypot(h.pos.x, h.pos.y) > 40) { this.remove(h); continue; }
        if (h.reflected) continue;
        const d = h.pos.distanceTo(hp);
        // deflection: generous reach inside the timed window
        if (hero.parryT > 0 && d < 1.25) {
          const target = game.reflectTarget(hero, h);
          h.reflected = true; h.target = target; h.speed = 17; h.life = 3;
          h.coreMat.color.setRGB(0.7, 2.6, 2.4); h.ringMat.color.setRGB(1.6, 2.6, 2.5);
          hero.parryT = 0;
          ev.push({ type: 'parry', h, pos: h.pos.clone(), harmless: h.harmless });
          continue;
        }
        if (d < 0.28 + hr) {
          if (h.harmless) { ev.push({ type: 'touch', h }); this.burstAt(h, new THREE.Color(2, 1.2, 0.4)); this.remove(h); continue; }
          if (this.contact(h, hero, ev, h.pos.clone())) { this.burstAt(h, new THREE.Color(2.4, 1.2, 0.4)); this.remove(h); }
        }
        continue;
      }
      if (h.kind === 'needle') {
        if (!h.spawned) { h.spawned = true; h.mesh.visible = true; }
        h.life -= dt;
        h.pos.addScaledVector(h.dir, h.speed * dt);
        h.mesh.position.set(h.pos.x, 0.75, h.pos.y);
        h.mesh.rotation.y = Math.atan2(h.dir.x, h.dir.y);
        h.mesh.children[0].rotation.z += dt * 6;
        if (h.life < 0 || Math.hypot(h.pos.x, h.pos.y) > ARENA_R - 0.2) { this.remove(h); continue; }
        if (h.pos.distanceTo(hp) < 0.2 + hr) { if (this.contact(h, hero, ev, h.pos.clone())) this.remove(h); }
        continue;
      }
      if (h.kind === 'beam') {
        if (!h.spawned) { h.spawned = true; h.tel.visible = true; ev.push({ type: 'beamTel', h }); }
        if (t < h.lockAt) {
          const want = Math.atan2(hp.y - h.origin.y, hp.x - h.origin.x);
          h.angle += angDiff(h.angle, want) * (1 - Math.exp(-5 * dt));
        }
        const dx = Math.cos(h.angle), dz = Math.sin(h.angle);
        const oc = occludeBeam(h.origin.x, h.origin.y, dx, dz, 30);
        h.len = oc.len; h.hitCol = oc.hitCol;
        const rot = -h.angle;
        if (t < h.fireAt) {
          const k = clamp((t - h.at) / (h.fireAt - h.at), 0, 1);
          h.telMat.uniforms.uA.value = 0.25 + 0.75 * k;
          h.telMat.uniforms.uTime.value = t;
          h.telMat.uniforms.uLen.value = h.len;
          h.telMat.uniforms.uLock.value = t >= h.lockAt ? 1 : 0;
          h.tel.scale.set(h.len, 1, t >= h.lockAt ? 0.34 : 0.16);
          h.tel.rotation.y = rot;
        } else if (t < h.endAt) {
          if (!h.fired) { h.fired = true; h.tel.visible = false; h.fire.visible = true; h.core.visible = true; ev.push({ type: 'beamFire', h }); }
          const k = (t - h.fireAt) / (h.endAt - h.fireAt);
          h.fireMat.opacity = 0.75 * (1 - k * 0.6);
          h.fire.position.set(h.origin.x, 1.0, h.origin.y); h.fire.rotation.y = rot; h.fire.scale.set(h.len, 1.0, 1.1);
          h.core.position.set(h.origin.x, 1.0, h.origin.y); h.core.rotation.y = rot; h.core.scale.set(h.len, 0.28, 0.3);
          if (h.hitCol >= 0 && Math.random() < 0.6) {
            const c = COLUMNS[h.hitCol];
            this.sparks.burst(h.origin.x + dx * h.len, 1.0, h.origin.y + dz * h.len, new THREE.Color(1.5, 2.4, 2.4), 3, 5);
            void c;
          }
          // segment distance
          const px = hp.x - h.origin.x, pz = hp.y - h.origin.y;
          const tt = clamp(px * dx + pz * dz, 0, h.len);
          const dd = Math.hypot(px - dx * tt, pz - dz * tt);
          if (!h.didHit && dd < 0.55 + hr && !h.harmless) {
            if (this.contact(h, hero, ev, new THREE.Vector2(h.origin.x + dx * tt, h.origin.y + dz * tt))) h.didHit = true;
          }
        } else { this.remove(h); }
      }
    }
    this.list = this.list.filter((h) => !h.dead);
    return ev;
  }

  contact(h, hero, ev, from) {
    if (hero.dodging) {
      if (!h.nearMiss) { h.nearMiss = true; ev.push({ type: 'nearMiss', h }); }
      return false;
    }
    if (h.harmless) { if (!h.touched) { h.touched = true; ev.push({ type: 'touch', h }); } return false; }
    if (hero.invulnerable) return false;
    ev.push({ type: 'hurt', h, from });
    return true;
  }

  burstAt(h, c) { this.sparks.burst(h.pos.x, h.y ?? 1, h.pos.y, c, 14, 4); }
}
