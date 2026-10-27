import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, PZ01, PZ09, STATION, MASKS, SHAPE, M, angleTo } from '../dist/game.js';

const run = (g, sec, input = { x: 0, y: 0 }) => { for (let t = 0; t < sec; t += 0.05) g.step(0.05, input); };
const place = (g, x, y) => Object.assign(g.player, { x, y });
function solvePz01(g) { place(g, 26, 0); g.pz01.charged = true; place(g, PZ01.lever.x - 1, PZ01.lever.y); g.interact(); }
function clearP2(g) { place(g, 47, 0); run(g, 0.1); for (const e of g.enemies) e.hp = 0; run(g, 0.1); }
function solvePz09(g) { place(g, 25, -26); for (const k of ['reserve', 'command']) { place(g, PZ09.levers[k].x, PZ09.levers[k].y + 0.8); g.interact(); } }
function toArena(g) { solvePz01(g); clearP2(g); solvePz09(g); place(g, STATION.x, STATION.y + 0.8); g.interact(); place(g, 3, -45); run(g, 0.1); for (let w = 0; w < 2; w++) { for (const e of g.enemies) e.hp = 0; run(g, 2.3); } }

test('closed gate G01 blocks the bridge until PZ-01 is solved', () => {
  const g = new Game();
  place(g, 29, 0); run(g, 3, { x: 1, y: 0 });
  assert.ok(g.player.x < 30.2, 'stopped at gate');
  assert.equal(g.gates.G01, 'locked');
});

test('edges stop movement without falling', () => {
  const g = new Game();
  run(g, 5, { x: 0, y: 1 });
  assert.ok(g.player.y <= 4 - M.radius + 1e-6);
  assert.equal(g.mode, 'play');
});

test('PZ-01: lever is neutral before C; До returns the test impulse to the faced port', () => {
  const g = new Game();
  place(g, PZ01.lever.x - 1, PZ01.lever.y); g.interact();
  assert.equal(g.pz01.done, false);
  // стати так, щоб тестовий імпульс летів у героїню, дивитися на C
  place(g, 26, -3);
  g.projectiles.push({ x: g.player.x - 0.6, y: g.player.y, vx: 3, vy: 0, r: 0.24, marked: true, harmless: true, origin: { kind: 'emitter' }, age: 0 });
  g.player.face = angleTo(g.player, PZ01.ports.C);
  g.parry(); run(g, 0.6);
  assert.equal(g.pz01.fed.C, 1);
  assert.ok(g.pz01.charged);
  assert.equal(g.player.hp, 5);
  place(g, PZ01.lever.x - 1, PZ01.lever.y); g.interact();
  assert.ok(g.pz01.done); assert.equal(g.gates.G01, 'open');
});

test('PZ-01 test impulses never damage', () => {
  const g = new Game(); place(g, 24, 3);
  run(g, 8);
  assert.equal(g.player.hp, 5);
});

test('PZ-09: wrong order engages the fixator; recovery is always possible', () => {
  const g = new Game();
  g.togglePz09('command');
  assert.ok(g.pz09.lock); assert.equal(g.homeLineLive(), false); assert.equal(g.gates.G04, 'locked');
  g.togglePz09('reserve');
  assert.equal(g.pz09.done, false, 'fixator still holds');
  g.togglePz09('command'); g.togglePz09('command');
  assert.ok(g.pz09.done); assert.equal(g.gates.G04, 'open');
  assert.ok(g.homeLineLive()); assert.equal(g.pendulumMoving(), false);
});

test('PZ-09: power off keeps it unsolved', () => {
  const g = new Game();
  g.togglePz09('power'); g.togglePz09('reserve'); g.togglePz09('command');
  assert.equal(g.pz09.done, false);
  g.togglePz09('power');
  assert.ok(g.pz09.done);
});

test('Тактовик blocks from the front outside the pause and hurts only inside its sector', () => {
  const g = new Game(); solvePz01(g);
  place(g, 47, 2); run(g, 1.2);
  const e = g.enemies[0];
  assert.equal(e.type, 'tact');
  e.state = 'chase'; e.x = 47; e.y = 0; e.angle = Math.PI / 2; place(g, 47, 1.4); g.player.face = -Math.PI / 2;
  g.attack();
  assert.equal(e.hp, 4, 'guarded');
  e.state = 'recover'; e.t = 1; g.player.atkCD = 0; g.attack();
  assert.equal(e.hp, 3);
  // сектор: стоїмо збоку поза ним
  Object.assign(e, { state: 'windup', t: 0.01, lock: Math.PI / 2, clicks: 2 });
  place(g, 49.5, 0); run(g, 0.05);
  assert.equal(g.player.hp, 5);
  Object.assign(e, { state: 'windup', t: 0.01, lock: Math.PI / 2, clicks: 2 });
  place(g, 47, 1.8); g.player.hurtCD = 0; run(g, 0.05);
  assert.equal(g.player.hp, 4);
});

test('dodge gives i-frames and has a cooldown; ре is separate', () => {
  const g = new Game();
  g.dodge(); assert.equal(g.hurt(), false);
  assert.equal(g.dodge(), false);
  assert.equal(g.re(), false, 'ре ще не відкрита');
  g.flags.re = true; assert.equal(g.re(), true, 'ре не залежить від ухилення');
  run(g, 0.8); assert.ok(g.hurt());
});

test('repair: 0.9 s, movement cancels without cost, completion heals 2 once', () => {
  const g = new Game(); g.player.hp = 2;
  g.repair(); run(g, 0.4, { x: 1, y: 0 });
  assert.equal(g.player.repairs, 2); assert.equal(g.player.hp, 2);
  g.repair(); run(g, 1);
  assert.equal(g.player.hp, 4); assert.equal(g.player.repairs, 1);
  g.repair(); run(g, 1);
  assert.equal(g.player.hp, 5); assert.equal(g.player.repairs, 0);
  g.player.hp = 3; assert.equal(g.repair(), false);
});

test('P6: one Рупор, then a pair that never telegraphs at the same time', () => {
  const g = new Game(); solvePz01(g); clearP2(g); solvePz09(g);
  place(g, 3, -40); run(g, 0.1);
  assert.equal(g.enemies.length, 1); assert.equal(g.enemies[0].type, 'horn');
  g.enemies[0].hp = 0; run(g, 2.5);
  assert.equal(g.enemies.length, 2);
  let both = 0;
  for (let i = 0; i < 400; i++) { g.player.inv = 1; g.step(0.05); if (g.enemies.filter(e => e.state === 'windup' || e.state === 'tele').length > 1) both++; }
  assert.equal(both, 0);
});

test('Рупор marked impulse returned by До damages the Рупор', () => {
  const g = new Game(); solvePz01(g); clearP2(g); solvePz09(g);
  place(g, 3, -40); run(g, 1.5);
  const h = g.enemies[0];
  g.projectiles.push({ x: g.player.x, y: g.player.y - 0.5, vx: 0, vy: 4, r: 0.24, marked: true, origin: { kind: 'enemy', ref: h }, age: 0 });
  g.player.face = -Math.PI / 2; g.parry(); run(g, 2);
  assert.equal(h.hp, 2);
});

test('boss: G05 closes behind, death retries only the boss with full HP', () => {
  const g = new Game(); toArena(g);
  assert.equal(g.enc.P6.state, 'done'); assert.equal(g.gates.G05, 'open');
  place(g, 3, -66); run(g, 1.2);
  assert.equal(g.gates.G05, 'fight');
  run(g, 6);
  assert.equal(g.boss.state, 'fight'); assert.equal(g.boss.phase, 1);
  g.player.repairs = 0;
  for (let i = 0; i < 5; i++) { g.player.inv = 0; g.player.hurtCD = 0; g.hurt(); }
  assert.equal(g.mode, 'dead');
  g.respawn();
  assert.equal(g.player.hp, 5); assert.equal(g.player.repairs, 2);
  assert.equal(g.gates.G05, 'open'); assert.equal(g.boss.state, 'dormant');
  assert.ok(g.pz01.done && g.pz09.done && g.enc.P6.state === 'done');
  assert.ok(g.player.y > -61.6 && g.player.y < -54.5);
});

test('boss: only the singing mask takes damage; phases clear hazards; victory opens the palm and G06', () => {
  const g = new Game(); toArena(g);
  place(g, 3, -66); run(g, 7);
  g.hitMask(1, 4, 'do');
  assert.equal(g.boss.hp, 36, 'inactive mask deflects');
  g.projectiles.push({ x: 0, y: -70, vx: 0, vy: 0, r: 0.2, origin: null, age: 0 });
  g.hitMask(0, 12, 'melee');
  assert.equal(g.boss.phase, 2); assert.equal(g.boss.state, 'trans'); assert.equal(g.projectiles.length, 0);
  run(g, 2); g.hitMask(1, 12, 'do'); assert.equal(g.boss.phase, 3);
  run(g, 2); g.hitMask(g.boss.active, 12, 'do');
  assert.equal(g.boss.state, 'dead');
  run(g, 3);
  place(g, 3, -70); assert.equal(g.nearestInteractable().id, 'palm'); g.interact();
  assert.equal(g.gates.G06, 'open'); assert.equal(g.windows[3], 0);
  place(g, 20, -73); run(g, 3, { x: 1, y: 0 });
  assert.equal(g.mode, 'end');
});

test('ring has a dodge-able gap and beam keeps its warned angle', () => {
  const g = new Game(); toArena(g);
  place(g, 3, -66); run(g, 7);
  g.boss.phase = 2; g.boss.step = 0; g.boss.pending = null; g.boss.nextAt = g.time;
  g.player.inv = 5; run(g, 0.05);
  assert.equal(g.boss.pending.kind, 'ring');
  const gap = g.boss.pending.gap;
  run(g, 1.1);
  const r = g.rings[0]; assert.ok(r);
  // стоїмо в розриві: кільце проходить без шкоди
  const src = MASKS[1];
  g.player.inv = 0; place(g, src.x + Math.cos(gap) * 8, src.y + Math.sin(gap) * 8);
  run(g, 2);
  assert.equal(g.player.hp, 5);
  g.player.inv = 5; g.boss.nextAt = g.time; g.boss.pending = null; g.boss.step = 1; run(g, 0.05);
  assert.equal(g.boss.pending.kind, 'beam');
  const a = g.boss.pending.angle; run(g, 1.2, { x: 1, y: 0 });
  assert.equal(g.beams[0]?.angle ?? a, a);
});

test('reset returns a clean replayable state', () => {
  const g = new Game(); solvePz01(g); g.reset();
  assert.equal(g.pz01.done, false); assert.equal(g.gates.G01, 'locked'); assert.equal(g.mode, 'play');
  assert.deepEqual([g.player.x, g.player.y], [0, 1]);
});
