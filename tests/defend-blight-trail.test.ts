import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlightTrail, BLIGHT_TRAIL, BLIGHT_W, BLIGHT_H } from '../src/defend/blight-trail.ts';
import { witheredTreeSprite } from '../src/defend/blight-art.ts';
import { canopyRadius } from '../src/defend/forest.ts';
import { treeSprite, charPixels } from '../src/defend/forest-art.ts';
import { ENEMIES, UPGRADES, type EnemyKind } from '../src/defend/catalog.ts';
import type { Enemy } from '../src/defend/sim.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';

const enemy = (kind: EnemyKind = 'miniDarkling', x = 20.25, y = 20.25) => ({ kind, x, y, hp: ENEMIES[kind].hp } as Enemy);
const cross = (trail: BlightTrail, kind: EnemyKind = 'miniDarkling', passes = 1) => {
  for (let n = 0; n < passes; n++) trail.travel(enemy(kind, 21.25), 19.25, 20.25);
};

test('actual ground travel leaves a lasting narrow trail; waiting and teleporting do not extend it', () => {
  const trail = new BlightTrail(); cross(trail);
  assert.ok(trail.at(20.25, 20.25) >= BLIGHT_TRAIL.grass);
  assert.equal(trail.at(20.25, 22.25), 0);
  const version = trail.version, dose = trail.at(20.25, 20.25);
  for (let n = 0; n < 100; n++) trail.travel(enemy(), 20.25, 20.25);
  trail.travel(enemy('blinkImp', 40), 20.25, 20.25);
  assert.equal(trail.version, version);
  assert.equal(trail.at(20.25, 20.25), dose);
});

test('grass dies before bushes; larger trees need more traffic or stronger Blight', () => {
  const lone = new BlightTrail(); cross(lone);
  assert.equal(lone.treeStage(20.25, 20.25, .6), 0);
  const crowd = new BlightTrail(); cross(crowd, 'miniDarkling', 20);
  assert.equal(crowd.treeStage(20.25, 20.25, .6), 3);
  assert.ok(crowd.treeStage(20.25, 20.25, 2.5) < 3);
  const strong = new BlightTrail(); cross(strong, 'significantDarkling', 20);
  assert.equal(strong.treeStage(20.25, 20.25, 2.5), 3);
  const sameCount = new BlightTrail(); cross(sameCount, 'significantDarkling');
  assert.ok(sameCount.at(20.25, 20.25) > lone.at(20.25, 20.25) * 10);
});

test('ordinary enemies, flying Blight, underground worms, corpses and raid proxies leave no walking trail', () => {
  for (const e of [enemy('orc'), enemy('graveWisp'), enemy('blightDart'), enemy('blightPrism'), enemy('greaterBlightPrism'), { ...enemy('blightWorm'), burrow: true }, { ...enemy(), hp: 0 }, { ...enemy(), raidProxy: true }, { ...enemy(), fortressPart: true }]) {
    const trail = new BlightTrail(); trail.travel(e as Enemy, 19.25, 20.25);
    assert.equal(trail.touched.length, 0);
  }
});

test('travel sampling is stable across tick sizes and clips at the board edge', () => {
  const whole = new BlightTrail(), ticks = new BlightTrail(); cross(whole);
  for (let n = 0; n < 60; n++) ticks.travel(enemy('miniDarkling', 19.25 + (n + 1) / 30), 19.25 + n / 30, 20.25);
  assert.ok(Math.abs(ticks.at(20.25, 20.25) - whole.at(20.25, 20.25)) < .12);
  const edge = new BlightTrail(); edge.travel(enemy('darkling', .2, .2), -.2, -.2);
  assert.ok(edge.touched.length > 0);
  assert.ok(edge.touched.every(i => i >= 0 && i < BLIGHT_W * BLIGHT_H));
  edge.travel(enemy('darkling', NaN), 0, 0);
  assert.ok(edge.exposure.every(Number.isFinite));
});

test('history is bounded and a new run starts with living vegetation', () => {
  const trail = new BlightTrail(); cross(trail, 'significantDarkling', 1000);
  assert.ok(trail.exposure.every(n => n <= BLIGHT_TRAIL.cap));
  assert.equal(new Set(trail.touched).size, trail.touched.length);
  assert.equal(new BlightTrail().treeStage(20.25, 20.25, .5), 0);
});

test('dead art retains native dimensions, thins to branching wood and never mutates living sprites', () => {
  for (const kind of ['oak', 'pine', 'bush'] as const) for (const size of [0, 1, 2, 3] as const) {
    const live = treeSprite(kind, 1, 0, size), before = live.px.slice();
    const radius = canopyRadius(kind, 1, size);
    const withered = witheredTreeSprite(live, 1, radius, 1);
    const dead = witheredTreeSprite(live, 3, radius, 1);
    assert.equal(dead.w, live.w); assert.equal(dead.h, live.h);
    assert.equal(dead.ox, live.ox); assert.equal(dead.oy, live.oy);
    assert.ok(dead.px.some(Boolean));
    assert.ok(dead.px.filter(Boolean).length < withered.px.filter(Boolean).length);
    const burning = charPixels(kind, 1, size, 3, 3);
    assert.deepEqual(burning.map(p => p ? 1 : 0), dead.px.map(p => p ? 1 : 0), "burning a dead tree never regrows its canopy");
    assert.deepEqual(live.px, before);
    assert.equal(witheredTreeSprite(live, 3, radius, 1), dead);
  }
});

test('simulation records movement without a renderer and shares no trail across runs', () => {
  const make = () => new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  const sim = make(); sim.breakT = 1e9;
  sim.spawnAuxiliary('miniDarkling', 20, 2);
  for (let n = 0; n < 60; n++) sim.step(1 / 30);
  assert.ok(sim.blight.touched.length > 0);
  assert.equal(make().blight.touched.length, 0);
});
