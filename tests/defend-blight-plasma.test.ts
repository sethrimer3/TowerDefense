import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim, type Enemy } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { ENEMIES, UPGRADES } from '../src/defend/catalog.ts';
import { BLIGHT_PLASMA, plasmaBallRadius, stepPlasmaTurret, stepPlasma, type PlasmaShot } from '../src/defend/blight-plasma.ts';
import { plasmaShotPose } from '../src/defend/blight-plasma-art.ts';
import { FORTRESS_FALL, stepFortressCore, syncFortress } from '../src/defend/fortress.ts';
import { buildDifficultyWave } from '../src/defend/waves.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';
import { journalHTML } from '../src/defend/journal.ts';

function scene() {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  (sim as any).spawnEnemy('blightPlasmaFortress');
  const core = sim.enemies[0]; core.x = 10; core.y = 5; syncFortress(core);
  const turret = core.fortressParts!.find(p => p.fortressPart!.role === 'turret')!;
  const target = { id: 10000, kind: 'sword', x: 12, y: 5, hp: 10000, maxHp: 10000, flash: 0, home: 0 } as any;
  sim.soldiers.push(target);
  return { sim, core, turret, target };
}
function shot(at: { x: number; y: number }): PlasmaShot {
  return { x0: at.x - 8, y0: at.y, x1: at.x, y1: at.y, t: 0, dur: 2, ballRadius: plasmaBallRadius('blightPlasmaFortress', 1), damage: 10, seed: 91 };
}

test('large plasma fortress has twelve legs and exactly one centered plasma turret, with normal discovery', () => {
  const { sim, core, turret } = scene(), def = ENEMIES.blightPlasmaFortress;
  assert.equal(def.color, '#000000'); assert.equal(def.faction, 'darkOne'); assert.ok(def.scriptedOnly);
  assert.equal(core.fortressParts!.filter(p => p.fortressPart!.role === 'leg').length, 12);
  assert.equal(core.fortressParts!.filter(p => p.fortressPart!.role === 'turret').length, 1);
  assert.equal(turret.fortressPart!.weapon, 'plasma'); assert.equal(turret.fortressPart!.dx, 0); assert.equal(turret.fortressPart!.dy, 0);
  assert.equal(core.hp, turret.hp); assert.equal(sim.hurtEnemy(core, 5), false);
  const saved = defaultDefendSave(); saved.discovered = ['blightPlasmaFortress'];
  assert.deepEqual(decodeDefendSave(saved).discovered, saved.discovered);
  assert.match(journalHTML(saved.discovered), /Blight Plasma Fortress/);
  assert.ok(buildDifficultyWave(1e5, () => .6).every(k => k !== 'blightPlasmaFortress'));
});

test('the charge takes fifteen seconds, locks its aim, and grows to exactly 75 percent of body width', () => {
  const { sim, turret, target } = scene();
  stepPlasmaTurret(sim, turret, 0); const aim = { x: turret.plasmaCharge!.x, y: turret.plasmaCharge!.y };
  target.x += 1;
  for (let n = 0; n < 449; n++) stepPlasmaTurret(sim, turret, 1 / 30);
  assert.equal(sim.plasmaShots.length, 0); assert.ok(turret.plasmaCharge!.elapsed < 15);
  stepPlasmaTurret(sim, turret, 1 / 30);
  assert.equal(sim.plasmaShots.length, 1); assert.equal(turret.plasmaCharge, undefined);
  const fired = sim.plasmaShots[0]; assert.deepEqual({ x: fired.x1, y: fired.y1 }, aim);
  assert.equal(fired.ballRadius * 2 / ENEMIES.blightPlasmaFortress.size, .75);
  const radii = [0, .25, .5, .75, 1].map(k => plasmaBallRadius('blightPlasmaFortress', k));
  assert.ok(radii.every((r, i) => i === 0 || r > radii[i - 1]));
  assert.equal(turret.cd, BLIGHT_PLASMA.recovery);
});

test('a charge survives grounding, but destroying the sole turret cancels it and kills the whole fortress', () => {
  const { sim, core, turret } = scene(); stepPlasmaTurret(sim, turret, 7);
  const legs = core.fortressParts!.filter(p => p.fortressPart!.role === 'leg');
  for (const leg of legs.slice(2)) sim.hurtEnemy(leg, 1e9, true, 'melee');
  stepFortressCore(sim, core, FORTRESS_FALL); assert.equal(core.walker!.phase, 'grounded');
  assert.equal(turret.plasmaCharge!.elapsed, 7);
  sim.hurtEnemy(core, 1e9, true, 'melee'); assert.equal(core.hp, 0);
  stepPlasmaTurret(sim, turret, 20); assert.equal(sim.plasmaShots.length, 0);
});

test('the ball follows a high arc and only creates a sphere and dense scorch on impact', () => {
  const { sim, target } = scene(); const projectile = shot(target); sim.plasmaShots.push(projectile);
  assert.equal(plasmaShotPose(projectile).height, 0);
  stepPlasma(sim, 1); const pose = plasmaShotPose(projectile);
  assert.ok(pose.height > 2 && pose.x > projectile.x0 && pose.x < projectile.x1);
  assert.equal(sim.plasmaSpheres.length, 0); assert.equal(target.hp, 10000);
  stepPlasma(sim, 1); assert.equal(sim.plasmaShots.length, 0); assert.equal(sim.plasmaSpheres.length, 1);
  assert.equal(target.hp, 9990); assert.equal(sim.plasmaSpheres[0].pulses, 1);
  const scorch = sim.scorches.find(s => s.plasma)!;
  assert.ok(scorch.r > BLIGHT_PLASMA.radius); assert.equal(scorch.life, 24);
  assert.equal(plasmaShotPose({ ...projectile, t: projectile.dur }).height, 0);
});

function blastScene() {
  const s = scene(), rect = s.sim.keep.rect, center = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  s.sim.hp[s.sim.keep.id] = s.sim.maxHp[s.sim.keep.id] = 10000;
  s.core.x = center.x + 1; s.core.y = center.y + 1; syncFortress(s.core);
  s.target.x = center.x; s.target.y = center.y;
  const guarded = { ...s.target, id: 10001, guard: 10 };
  const outside = { ...s.target, id: 10002, x: center.x + BLIGHT_PLASMA.radius + .1 };
  s.sim.soldiers.push(guarded, outside);
  s.sim.civilians.push({ id: 10003, x: center.x, y: center.y, hp: 10000, flash: 0 } as any);
  const enemy = (s.sim as any).newEnemy('orc', center.x, center.y) as Enemy; enemy.hp = enemy.maxHp = 10000; s.sim.enemies.push(enemy);
  s.sim.plasmaShots.push(shot(center));
  return { ...s, center, guarded, outside, enemy };
}

test('twelve sphere pulses hit troops, civilians, buildings and Blight, respecting guards and the radius', () => {
  const { sim, target, guarded, outside, enemy, turret, core } = blastScene(), hp = turret.hp;
  stepPlasma(sim, 2); assert.equal(target.hp, 9990);
  stepPlasma(sim, .49); assert.equal(target.hp, 9990);
  stepPlasma(sim, .01); assert.equal(target.hp, 9980);
  stepPlasma(sim, 5.5);
  assert.equal(target.hp, 9880); assert.equal(sim.civilians[0].hp, 9880); assert.equal(enemy.hp, 9880);
  assert.equal(sim.hp[sim.keep.id], 9880); assert.equal(guarded.hp, 10000); assert.equal(outside.hp, 10000);
  assert.equal(turret.hp, hp - 120); assert.equal(core.hp, turret.hp);
  assert.equal(sim.plasmaSpheres.length, 0);
});

test('pulse timing is independent of step size and does not tick twice on the landing frame', () => {
  const a = blastScene(), b = blastScene();
  stepPlasma(a.sim, 8);
  for (let n = 0; n < 240; n++) stepPlasma(b.sim, 1 / 30);
  assert.equal(a.target.hp, b.target.hp); assert.equal(a.enemy.hp, b.enemy.hp);
  assert.equal(a.sim.hp[a.sim.keep.id], b.sim.hp[b.sim.keep.id]);
  assert.equal(a.sim.plasmaShots.length, 0); assert.equal(a.sim.plasmaSpheres.length, 0);
  assert.equal(b.sim.plasmaSpheres.length, 0);
});

test('released shots outlive the shooter and magic water retains its native blast counterplay', () => {
  const { sim, turret, target } = scene(); stepPlasmaTurret(sim, turret, 15);
  const projectile = sim.plasmaShots[0]; assert.ok(projectile);
  sim.hurtEnemy(turret, 1e9, true, 'ranged'); (sim as any).sweepAway();
  stepPlasma(sim, projectile.dur); assert.equal(sim.plasmaSpheres.length, 1); assert.ok(target.hp < 10000);
  const wet = scene(); wet.sim.plasmaShots.push(shot(wet.target));
  wet.sim.floods.push({ x: wet.target.x, y: wet.target.y, r: 3, t: 0, life: 20, boat: 999 });
  stepPlasma(wet.sim, 2); assert.equal(wet.sim.plasmaSpheres.length, 0); assert.equal(wet.target.hp, 10000);
  assert.ok(wet.sim.effects.some(e => e.kind === 'steam'));
});
