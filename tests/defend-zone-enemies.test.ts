import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, areaForWave } from '../src/defend/areas.ts';
import { AREA_ENEMIES } from '../src/defend/area-enemies.ts';
import { ENEMIES, UPGRADES } from '../src/defend/catalog.ts';
import { buildWave, waveDifficulty } from '../src/defend/waves.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { cellIndex } from '../src/defend/grid.ts';
import { stepEnemy } from '../src/defend/enemies.ts';
import { stepBlazes } from '../src/defend/mages.ts';
import { iceAt, meltIce, ageWater, stepBoat } from '../src/defend/boats.ts';
import { journalHTML } from '../src/defend/journal.ts';
import { defaultDefendSave, decodeDefendSave } from '../src/defend/progress.ts';

function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.breakT = 1e9; return sim;
}

test('ten areas follow the requested order, with unrestricted Nadir and repeating cycles', () => {
  const order = ['moss','desert','ember','drowned','fungal','frozen','crystal','obsidian','astral','nadir'];
  assert.deepEqual(AREAS.map(a => a.id), order);
  order.forEach((id, n) => {
    assert.equal(areaForWave(n * 20 + 1).id, id);
    assert.equal(areaForWave(n * 20 + 20).id, id);
    assert.equal(areaForWave(n * 20 + 201).id, id);
  });
  const normal = Object.values(ENEMIES).filter(e => !e.hatched).map(e => e.kind).sort();
  assert.deepEqual([...AREA_ENEMIES.nadir].sort(), normal);
  assert.ok(normal.every(k => AREAS.some(a => a.id !== 'nadir' && AREA_ENEMIES[a.id].includes(k))), 'every species has a themed home');
  for (const e of Object.values(ENEMIES).filter(e => e.boat)) assert.ok(AREA_ENEMIES.frozen.includes(e.kind));
});

test('actual waves respect zone membership, affordability and offspring rules', () => {
  let seed = 19;
  const rand = () => ((seed = seed * 16807 % 2147483647) / 2147483647);
  for (let wave = 1; wave <= 200; wave++) {
    const mix = buildWave(wave, rand), allowed = AREA_ENEMIES[areaForWave(wave).id];
    assert.ok(mix.length > 0, `wave ${wave} is not empty`);
    assert.ok(mix.every(k => allowed.includes(k) && !ENEMIES[k].hatched));
    const spent = mix.reduce((sum, k) => sum + ENEMIES[k].cost, 0);
    assert.ok(spent <= waveDifficulty(wave));
    const cheapest = Math.min(...allowed.map(k => ENEMIES[k].cost));
    assert.ok(waveDifficulty(wave) - spent < cheapest, `wave ${wave} uses all spendable budget`);
  }
});

test('ice golems take double fire and explosion damage but normal physical damage', () => {
  const sim = fixture(), e = sim.spawnAuxiliary('iceGolem', 10, 10)!;
  sim.hurtEnemy(e, 10, true, 'melee'); assert.equal(e.hp, 230);
  sim.hurtEnemy(e, 10); assert.equal(e.hp, 220);
  sim.explode(10, 10, { r: 1, damage: 10, friendlyFire: false }); assert.equal(e.hp, 200);
  sim.blazes.push({ x: 10, y: 10, r: 1, t: 0, life: 10, dps: 10, seed: 1 });
  stepBlazes(sim, 1); assert.equal(e.hp, 180);
  e.burn = 1; e.burnDps = 10; (sim as any).tick(1); assert.equal(e.hp, 160);
});

test('cubes slide orthogonally, turn sharply, leave bounded persistent ice and ignore diagonal blast impulses', () => {
  const sim = fixture(); sim.wave = 181; sim.solid.fill(0);
  sim.field.fill(1000);
  // A forced L-shaped route through open ground.
  for (let x = 10; x <= 14; x++) sim.field[cellIndex(x, 10)] = 20 - x;
  for (let y = 11; y <= 14; y++) sim.field[cellIndex(14, y)] = 16 - y;
  const cube = sim.spawnAuxiliary('iceCube', 10.5, 10.5)!;
  let horizontal = false, vertical = false;
  for (let i = 0; i < 180; i++) {
    const { x, y } = cube; stepEnemy(sim, cube, 1/30);
    assert.ok(cube.x === x || cube.y === y, 'never moves diagonally');
    horizontal ||= cube.x !== x; vertical ||= cube.y !== y;
  }
  assert.ok(horizontal && vertical); assert.equal(cube.x, 14.5); assert.equal(cube.y, 14.5);
  assert.ok(iceAt(sim, 11.5, 10.5));
  const count = sim.floods.length;
  for (let i = 0; i < 100; i++) stepEnemy(sim, cube, 1/30);
  assert.equal(sim.floods.length, count); assert.ok(count < 30);
  ageWater(sim, 1000); assert.ok(iceAt(sim, 11.5, 10.5));
  const pos = [cube.x, cube.y]; sim.iceBlast(cube.x - .1, cube.y - .1, 1);
  (sim as any).iceMotion.step(sim, 1/30); assert.deepEqual([cube.x, cube.y], pos);
  meltIce(sim, 11.5, 10.5, 1); assert.equal(iceAt(sim, 11.5, 10.5), false);
  ageWater(sim, 9); assert.ok(sim.floods.length < count);
});

test('cubes smash blocking walls instead of sliding through them; frozen-zone ships leave ice', () => {
  const sim = fixture(); sim.field.fill(1000);
  const wall = sim.map.buildings.find(b => b.kind === 'wall')!;
  const slider = sim.spawnAuxiliary('iceCube', wall.rect.x + .5, wall.rect.y - 1)!;
  sim.field[wall.cells[0]] = 0;
  const wallHp = sim.hp[wall.id];
  for (let i = 0; i < 30; i++) {
    stepEnemy(sim, slider, 1/30);
    assert.ok(slider.y < wall.rect.y, 'cannot cross the standing wall');
  }
  assert.ok(sim.hp[wall.id] < wallHp);
  // Use the real keep boundary, independent of generated wall positions.
  const cube = sim.spawnAuxiliary('iceCube', sim.keep.rect.x - .5, sim.keep.rect.y + .5)!;
  const hp = sim.hp[sim.keepId]; stepEnemy(sim, cube, 1/30);
  assert.ok(sim.hp[sim.keepId] < hp); assert.equal(cube.x, sim.keep.rect.x - .5);
  sim.wave = 101;
  const ship = sim.spawnAuxiliary('boatDinghy', 10, 10)!; stepBoat(sim, ship, 0);
  assert.equal(sim.cold, true); assert.ok(iceAt(sim, 10, 10));
  sim.wave = 61; assert.equal(sim.cold, false);
});

test('new enemies have rewards and journal discovery survives decoding', () => {
  const save = defaultDefendSave(); save.discovered = ['iceGolem', 'iceCube'];
  assert.deepEqual(decodeDefendSave(save).discovered, save.discovered);
  const html = journalHTML(save.discovered);
  assert.match(html, /double damage/); assert.match(html, /horizontally or vertically/);
});
