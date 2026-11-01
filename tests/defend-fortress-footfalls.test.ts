import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DefendSim } from '../src/defend/sim.ts';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { fortressFootfalls } from '../src/defend/fortress-footfall-art.ts';
import { fortressFootStride, FORTRESS_GAIT } from '../src/defend/fortress-motion-art.ts';

function scene(kind: EnemyKind) {
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  (sim as any).spawnEnemy(kind);
  return sim.enemies[0];
}

test('fortress feet remain planted through stance and land continuously after the swing', () => {
  const stride = .65, stance = FORTRESS_GAIT.stance;
  for (let side = 0; side < 4; side++) for (let local = 0; local < 3; local++) {
    const offset = (local + (side === 1 || side === 2 ? 1 : 0)) % 2 * .5;
    const pose = (cycle: number) => fortressFootStride((cycle + 1 - offset) * stride, stride, local, side);
    const a = pose(.1), b = pose(.6);
    assert.equal(a.lift, 0); assert.equal(b.lift, 0);
    assert.ok(Math.abs(b.forward - a.forward + .5 * stride) < 1e-12, 'stance cancels chassis travel');
    assert.ok(pose(stance + (1 - stance) / 2).lift > .99);
    assert.ok(Math.abs(pose(1 - 1e-7).forward - pose(0).forward) < 1e-6, 'no foot jump at touchdown');
  }
});

test('landing puffs follow actual foot contacts for all fortress sizes without changing simulation state', () => {
  for (const kind of ['blightCannon', 'blightFortress', 'blightPlasmaFortress', 'fortressHut', 'fortress', 'fortressSovereign'] as EnemyKind[]) {
    const core = scene(kind), stride = FORTRESS_GAIT.stride * (ENEMIES[kind].fortress!.partScale ?? 1);
    assert.equal(fortressFootfalls(core, 0).length, 0);
    assert.equal(fortressFootfalls(core, .1).length, 0, 'stationary feet do not emit');
    core.walker!.walk = stride * .49;
    assert.equal(fortressFootfalls(core, .2).length, 0, 'lifting is not a contact');
    core.walker!.walk = stride * .51;
    const before = JSON.stringify(core), puffs = fortressFootfalls(core, .22);
    assert.ok(puffs.length >= 3 && puffs.length <= 6, kind);
    assert.ok(puffs.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && p.time <= .22));
    assert.equal(fortressFootfalls(core, .22).length, puffs.length, 'duplicate renders do not emit again');
    assert.equal(JSON.stringify(core), before, 'cosmetic state never enters the simulation');
    assert.equal(fortressFootfalls(core, .7).length, 0, 'dust expires after stopping');
  }
});

test('lost legs, collapse, Reduce Motion, teleports and renderer resets cannot emit stale steps', () => {
  const core = scene('blightPlasmaFortress'), stride = FORTRESS_GAIT.stride * (ENEMIES[core.kind].fortress!.partScale ?? 1);
  const legs = core.fortressParts!.filter(p => p.fortressPart!.role === 'leg');
  for (const leg of legs) leg.hp = 0;
  fortressFootfalls(core, 0); core.walker!.walk = stride * .51;
  assert.equal(fortressFootfalls(core, .1).length, 0);
  for (const leg of legs) leg.hp = 1;
  core.walker!.phase = 'falling'; core.walker!.walk = stride * 1.01;
  assert.equal(fortressFootfalls(core, .2).length, 0);
  core.walker!.phase = 'grounded'; core.walker!.walk = stride * 1.51;
  assert.ok(fortressFootfalls(core, .3).length > 0, 'surviving legs can land while dragging');
  assert.equal(fortressFootfalls(core, .31, true).length, 0);
  core.walker!.walk += 20;
  assert.equal(fortressFootfalls(core, .4).length, 0, 'no burst after teleporting');
  core.walker!.walk += stride;
  assert.equal(fortressFootfalls(core, 5).length, 0, 'no stale burst after being offscreen');
  assert.equal(fortressFootfalls(core, 0).length, 0, 'preview time resets clear dust');
});
