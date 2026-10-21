import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere, windAt, CLEANUP_DEPTH, SAND_PRESS, DUNE_PERIOD, DUNE_SPEED, DUNE_WAVE, duneAt } from '../src/defend/atmosphere.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout, placeCityTile } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { UPGRADES } from '../src/defend/catalog.ts';
import { CELLS_W, CELLS_H, CELL_COUNT } from '../src/defend/grid.ts';
import { SNOW_CAP, STORM_CHANCE, rollWeather, skyLabel, Snow } from '../src/defend/weather.ts';
import { areaForWave } from '../src/defend/areas.ts';
import { tumbleweedPixels, dunePixels } from '../src/defend/atmosphere-art.ts';
import { OUTLINE } from '../src/defend/pixel-fx.ts';

function scene(wave = 21) {
  const layout = defaultLayout();
  const expanded = placeCityTile(layout, layout.keep.tx + 1, layout.keep.ty)!;
  const sim = new DefendSim(generateCity(fitLayout(expanded), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4);
  sim.wave = wave; sim.breakT = 1e9;
  sim.atmosphere = new Atmosphere(); sim.atmosphere.step(sim, .1);
  return sim;
}
function run(sim: DefendSim, seconds: number) { for (let i = 0; i < seconds * 10; i++) sim.atmosphere!.step(sim, .1); }
const inside = (sim: DefendSim, a: Float32Array) => a.reduce((sum, v, i) => sum + (sim.map.city[i] ? v : 0), 0);
function wall(sim: DefendSim) {
  return sim.map.buildings.find(b => b.kind === 'wall' && b.cells.some(i =>
    [-1, 1, -CELLS_W, CELLS_W].some(d => sim.map.city[i + d] && !sim.solid[i + d])))!;
}
function corridor(sim: DefendSim) {
  const b = wall(sim), i = b.cells[0];
  const toward = [-1, 1, -CELLS_W, CELLS_W].find(d => sim.map.city[i + d] && !sim.solid[i + d])!;
  const walls = [b];
  for (let j = i - toward; sim.map.wall[j]; j -= toward) walls.push(sim.map.buildings[sim.map.owner[j]]);
  return walls;
}

test('area precipitation selects snow/blizzards, sandstorms and mist without rain', () => {
  for (const wave of [21, 81, 101]) assert.equal(rollWeather(() => 0, areaForWave(wave)).rain, false);
  assert.equal(skyLabel(rollWeather(() => .5, areaForWave(101)), 0), 'Snow');
  assert.equal(skyLabel(rollWeather(() => .5, areaForWave(101)), 1), 'Blizzard');
  // A stormy roll in the cold is a blizzard by day too.
  assert.equal(rollWeather(() => 0, areaForWave(101)).blizzard, true);
  assert.equal(rollWeather(() => STORM_CHANCE, areaForWave(101)).blizzard, undefined);
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(101)), 0), 'Blizzard');
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(21)), 0), 'Sandstorm');
  assert.equal(skyLabel(rollWeather(() => 0, areaForWave(81)), 0), 'Mist');
  const snow = new Snow() as any;
  snow.update(0, 720, 840, 0); const normal = snow.flakes.length;
  snow.update(.1, 720, 840, 1);
  assert.ok(snow.flakes.length > normal * 2 && snow.flakes.length <= SNOW_CAP);
});

test('intact walls exclude mist, cracks leak, and repaired masonry seals again', () => {
  const sim = scene(81), env = sim.atmosphere!, b = wall(sim); assert.ok(b);
  run(sim, 10); assert.equal(inside(sim, env.air), 0);
  for (const w of corridor(sim)) sim.damageBuilding(w.id, sim.maxHp[w.id] * .55);
  run(sim, 15); assert.ok(inside(sim, env.air) > .01, 'mist seeps through damage without a complete breach');
  assert.ok(env.passage[b.cells[0]] > 0 && env.passage[b.cells[0]] < 1);
  sim.hp[b.id] = sim.maxHp[b.id]; env.step(sim, .1);
  assert.equal(env.passage[b.cells[0]], 0); assert.equal(env.air[b.cells[0]], 0);
});

test('sand stays outside cracked walls, pours through a breach, and creates cleanup work', () => {
  const sim = scene(), env = sim.atmosphere!, b = wall(sim);
  for (const w of corridor(sim)) sim.damageBuilding(w.id, sim.maxHp[w.id] * .6);
  run(sim, 10);
  assert.equal(inside(sim, env.sand), 0);
  for (const w of corridor(sim)) sim.damageBuilding(w.id, sim.maxHp[w.id]);
  run(sim, 40);
  assert.ok(inside(sim, env.sand) > .02, 'wind and grain transport enter a breached city');
  assert.equal(env.passage[b.cells[0]], 1);
  sim.rebuildCell(b.cells[0]); env.step(sim, .1);
  assert.equal(env.passage[b.cells[0]], 0);
  assert.equal(env.sand[b.cells[0]], 0);
  assert.equal(env.grains.length, 192); assert.equal(env.weeds.length, 10);
});

test('wind changes continuously and particles remain within the board and out of walls', () => {
  for (let t = 0; t < 200; t += .05) {
    const a = windAt(t), b = windAt(t + .05);
    assert.ok(Math.abs(a.x - b.x) < .03 && Math.abs(a.y - b.y) < .03);
  }
  assert.notDeepEqual(windAt(0), windAt(44));
  const sim = scene(); run(sim, 30);
  for (const p of [...sim.atmosphere!.grains, ...sim.atmosphere!.weeds]) {
    assert.ok(p.x >= 0 && p.x < CELLS_W && p.y >= 0 && p.y < CELLS_H);
    assert.equal(sim.solid[Math.floor(p.y) * CELLS_W + Math.floor(p.x)], 0);
  }
});

test('explosions and moving projectiles generate bounded vortices in mist', () => {
  const sim = scene(81), env = sim.atmosphere!;
  const i = 10 * CELLS_W + 10, before = env.air[i];
  sim.explode(10.5, 10.5, { r: 2, damage: 1, friendlyFire: false });
  assert.ok(env.air[i] < before);
  assert.ok(env.vx.some(v => v !== 0) && env.vy.some(v => v !== 0));
  env.vx.fill(0); env.vy.fill(0);
  const arrow = { x: 5, y: 10, tx: 20, ty: 10, target: -1, damage: 1, life: 10 };
  sim.arrows.push(arrow); env.step(sim, .1); arrow.x = 7; env.step(sim, .1);
  assert.ok(env.vx.some(v => v !== 0));
  for (const field of [env.air, env.sand, env.vx, env.vy]) {
    assert.equal(field.length, CELL_COUNT);
    assert.ok(field.every(Number.isFinite));
  }
});

test('moving enemies push sand into ridges without changing combat random draws', () => {
  const sim = scene(), env = sim.atmosphere!, e = sim.spawnAuxiliary('orc', 10.5, 10.5)!;
  env.step(sim, .1);
  const i = 10 * CELLS_W + 10; env.sand[i] = 1;
  const before = env.sand[i]; e.x += .2; env.step(sim, .1);
  assert.ok(env.sand[i] < before - .05);
  const control = scene(); control.spawnAuxiliary('orc', 10.5, 10.5);
  assert.equal(sim.rand(), control.rand());
});

test('civilians sweep only after repairs, preempt cleanup, and stop near enemies', () => {
  const sim = scene(), env = sim.atmosphere!, builders = (sim as any).builders;
  builders.respawn.length = 1; builders.respawn[0] = 0;
  const i = sim.map.city.findIndex((v, i) => !!v && !sim.solid[i] && sim.map.owner[i] < 0);
  env.sand[i] = .8; env.cleanup.add(i);
  builders.step(sim, .1);
  const c = sim.civilians[0]; assert.ok(c); assert.equal(c.jobKind, 'sand');
  c.x = i % CELLS_W + .5; c.y = Math.floor(i / CELLS_W) + .5; c.state = 'working';
  builders.step(sim, .1); assert.ok(env.sand[i] < .8);
  const b = wall(sim); sim.damageBuilding(b.id, 1e9); c.cleanupCheck = 0;
  builders.step(sim, .1); assert.equal(c.jobKind, undefined); assert.equal(c.job, b.cells[0]);
  sim.rebuildCell(b.cells[0]); c.job = i; c.jobKind = 'sand'; c.state = 'working';
  sim.spawnAuxiliary('orc', c.x, c.y); (sim as any).indexEnemies();
  const sand = env.sand[i]; builders.step(sim, .1); assert.equal(env.sand[i], sand);
  env.clean(i, 1); assert.ok(env.sand[i] < CLEANUP_DEPTH); assert.equal(env.cleanup.has(i), false);
});

test('the dunes blow away once the battle leaves the desert', () => {
  const sim = scene(), env = sim.atmosphere!;
  run(sim, 2);
  assert.ok(env.sand.some(v => v > 0));
  sim.wave = 41; env.step(sim, .1);
  assert.equal(env.mode, null);
  assert.ok(env.sand.every(v => v === 0)); assert.equal(env.cleanup.size, 0);
  sim.wave = 21; env.step(sim, .1);
  assert.ok(env.sand.some(v => v > 0), 'returning to the desert lays fresh dunes');
});

test('tumbleweeds are twigs in a black outline, turning frame to frame', () => {
  const a = tumbleweedPixels(0), b = tumbleweedPixels(.4);
  assert.equal(a.px.length, a.size * a.size);
  const twigs = a.px.filter(p => p && p !== OUTLINE).length;
  assert.ok(twigs > 20 && a.px.includes(OUTLINE));
  // Every twig touching the air is outlined: no twig borders a clear pixel.
  for (let i = 0; i < a.px.length; i++) {
    if (!a.px[i] || a.px[i] === OUTLINE) continue;
    const x = i % a.size, y = Math.floor(i / a.size);
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < a.size && ny < a.size) assert.ok(a.px[ny * a.size + nx], 'outlined');
    }
  }
  assert.notDeepEqual(a.px, b.px);
});

test('the dunes are large, creep slowly downwind and leave the sand outside settled into them', () => {
  const sim = scene(), env = sim.atmosphere!;
  // Crests stand a whole dune wave apart: several tiles, not a few cells.
  let crests = 0;
  for (let y = 0; y < DUNE_PERIOD * 4; y++) if (duneAt(10, y / 4).wave > duneAt(10, (y + 1) / 4).wave) crests++;
  assert.ok(crests <= DUNE_PERIOD / DUNE_WAVE + 2 && DUNE_WAVE >= 16);
  for (const [x, y] of [[0, 0], [5.3, 17.1], [40, 90]]) {
    const a = duneAt(x, y), b = duneAt(x + DUNE_PERIOD, y - DUNE_PERIOD);
    assert.ok(Math.abs(a.height - b.height) < 1e-6, 'the field tiles');
  }
  const before = { ...env.drift };
  run(sim, 20);
  const moved = Math.sqrt((env.drift.x - before.x) ** 2 + (env.drift.y - before.y) ** 2);
  assert.ok(moved > 0 && moved <= DUNE_SPEED * 20 * 1.5 + 1e-9, `drifted ${moved} cells in 20 s`);
  const i = sim.map.city.findIndex((v, i) => !v && !sim.solid[i]);
  assert.ok(Math.abs(env.sand[i] - env.duneAt(i)) < .3);
});

test('the dune sprite tiles seamlessly in opaque sand outlined in black', () => {
  const { size, data } = dunePixels(), alpha = (x: number, y: number) => data[((y % size) * size + (x % size)) * 4 + 3];
  let sand = 0, outline = 0;
  const [r, g, b] = [0x14, 0x0c, 0x0a];
  for (let i = 0; i < size * size; i++) {
    assert.ok(data[i * 4 + 3] === 0 || data[i * 4 + 3] === 255);
    if (!data[i * 4 + 3]) continue;
    sand++;
    if (data[i * 4] === r && data[i * 4 + 1] === g && data[i * 4 + 2] === b) outline++;
  }
  assert.ok(sand > size * size * .7 && outline > size * 2);
  // Wherever sand meets the bare floor, across the seam too, the sand pixel is outline.
  for (let y = 0; y < size; y++) for (const x of [0, size - 1]) {
    if (alpha(x, y) && !alpha(x + 1, y)) { const k = (y * size + x) * 4; assert.equal(data[k], r); }
  }
});

test('sand banked against a building crushes it, but walls and the keep stand firm', () => {
  const sim = scene(), env = sim.atmosphere!;
  const beside = (ids: number[]) => [...new Set(ids.flatMap(i => [i - 1, i + 1, i - CELLS_W, i + CELLS_W]))]
    .filter(j => sim.map.city[j] && !sim.solid[j]);
  const house = sim.map.buildings.find(b => b.kind === 'house' && sim.hp[b.id] > 0 && beside(b.cells).length >= 3)!;
  assert.ok(house, 'a house on a street');
  const banks = beside(house.cells);
  // A light dusting presses nothing.
  for (const j of banks) env.sand[j] = SAND_PRESS.depth;
  env.press(sim); assert.equal(sim.hp[house.id], sim.maxHp[house.id]);
  for (const j of [...banks, ...beside(sim.map.buildings[sim.keepId].cells)]) env.sand[j] = 3;
  const keep = sim.hp[sim.keepId];
  for (let t = 0; t < 120 && sim.hp[house.id] > 0; t++) { for (const j of banks) env.sand[j] = 3; env.press(sim); }
  assert.ok(sim.hp[house.id] <= 0, 'the house gave way');
  assert.equal(sim.hp[sim.keepId], keep);
  const w = wall(sim); for (const j of beside(w.cells)) env.sand[j] = 3;
  env.press(sim); assert.equal(sim.hp[w.id], sim.maxHp[w.id]);
});
