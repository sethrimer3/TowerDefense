import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Atmosphere, windAt, WIND, WEED_SIZES, CLEANUP_DEPTH, SAND_PRESS, DUNE_PERIOD, DUNE_SPEED, DUNE_WAVE, DUNE_CREST, duneAt } from '../src/defend/atmosphere.ts';
import { DefendSim } from '../src/defend/sim.ts';
import { defaultLayout, fitLayout, placeCityTile, placeGate, placeStructure } from '../src/defend/layout.ts';
import { generateCity } from '../src/defend/citygen.ts';
import { UPGRADES, NO_BONUSES } from '../src/defend/catalog.ts';
import { CELLS_W, CELLS_H, CELL_COUNT } from '../src/defend/grid.ts';
import { ART } from '../src/defend/park-art.ts';
import { SNOW_CAP, STORM_CHANCE, rollWeather, skyLabel, Snow } from '../src/defend/weather.ts';
import { areaForWave } from '../src/defend/areas.ts';
import { tumbleweedPixels, dunePixels, duneHeights, SandMarks, CHUNK, DUNE_RELIEF, DUNE_TONES, FLOOR, SUN, SWELL, sunlight, setDuneLight, duneLightKey } from '../src/defend/atmosphere-art.ts';
import { OUTLINE } from '../src/defend/pixel-fx.ts';

function scene(wave = 21, gate = false, repair = false) {
  const layout = defaultLayout();
  let expanded = placeCityTile(layout, layout.keep.tx + 1, layout.keep.ty)!;
  if (gate) expanded = placeGate(expanded, { tx: layout.keep.tx, ty: layout.keep.ty, side: 'n' })!;
  if (repair) expanded = placeStructure(expanded, "repairShop", layout.keep.tx + 1, layout.keep.ty)!;
  const sim = new DefendSim(generateCity(fitLayout(expanded), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as any, 4, repair ? { ...NO_BONUSES, repair: { masonry: 1 } } : undefined);
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
  assert.equal(env.weeds.length, 10);
  assert.ok(!('grains' in env), 'no specks of sand fly over the board');
});

test('an open gate lets the sand pour into the city, and a shut one keeps it out', () => {
  const sim = scene(21, true), env = sim.atmosphere!, gate = sim.gates[0];
  assert.ok(gate, 'a gate in the north wall');
  run(sim, 20);
  assert.equal(inside(sim, env.sand), 0, 'shut, nothing comes in');
  assert.ok(gate.cells.every(i => env.passage[i] === 0));
  sim.gateOpen.set(gate.id, 1e9); run(sim, 30);
  assert.ok(gate.cells.every(i => env.passage[i] === 1), 'open, the gateway lets sand through');
  assert.ok(inside(sim, env.sand) > .02, 'sand pours in through the open gate');
  sim.gateOpen.delete(gate.id); env.step(sim, .1);
  assert.ok(gate.cells.every(i => env.passage[i] === 0 && env.sand[i] === 0));
});

test('the wind always blows down and to the left, and tumbleweeds go with it and round the walls', () => {
  for (let t = 0; t < 200; t += 7.3) assert.deepEqual(windAt(t), WIND);
  assert.ok(WIND.x < 0 && WIND.y > 0);
  const sim = scene(), env = sim.atmosphere!;
  assert.ok(new Set(env.weeds.map(w => w.size)).size > 1, 'tumbleweeds of several sizes');
  assert.ok(env.weeds.every(w => w.size >= 0 && w.size < WEED_SIZES));
  // One set against the city's east wall, a cell out: it rolls down along it.
  const b = wall(sim), east = sim.map.buildings.filter(w => w.kind === 'wall')
    .map(w => w.cells[0]).filter(i => !sim.solid[i + 1] && !sim.map.city[i + 1] && sim.map.city[i - 2]);
  const i = east[Math.floor(east.length / 2)];
  assert.ok(b && i !== undefined, 'an east wall');
  const weed = env.weeds[0];
  Object.assign(weed, { x: i % CELLS_W + 1.3, y: Math.floor(i / CELLS_W) + .5, stuck: 0 });
  const start = { ...weed };
  let movedLeft = 0, movedDown = 0;
  for (let n = 0; n < 40; n++) {
    const before = env.weeds.map(w => ({ ...w }));
    env.step(sim, .1);
    env.weeds.forEach((w, k) => { if (Math.abs(w.x - before[k].x) < 1) movedLeft += before[k].x - w.x; if (Math.abs(w.y - before[k].y) < 1) movedDown += w.y - before[k].y; });
    for (const w of env.weeds) {
      assert.ok(w.x >= 0 && w.x < CELLS_W && w.y >= 0 && w.y < CELLS_H);
      assert.equal(sim.solid[Math.floor(w.y) * CELLS_W + Math.floor(w.x)], 0);
    }
  }
  assert.ok(movedLeft > 0 && movedDown > 0, 'downwind is down and to the left');
  assert.ok(weed.y > start.y + 2, 'it rolled down along the wall rather than sticking');
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

test('walkers leave the sand where it lies, without changing combat random draws', () => {
  const sim = scene(), env = sim.atmosphere!, e = sim.spawnAuxiliary('orc', 10.5, 10.5)!;
  env.step(sim, .1);
  const i = 10 * CELLS_W + 10; env.sand[i] = 1;
  const twin = scene(); twin.spawnAuxiliary('orc', 10.5, 10.5); twin.atmosphere!.step(twin, .1); twin.atmosphere!.sand[i] = 1;
  e.x += .2; env.step(sim, .1); twin.atmosphere!.step(twin, .1);
  assert.deepEqual(env.sand, twin.atmosphere!.sand, 'the orc moved no sand');
  const control = scene(); control.spawnAuxiliary('orc', 10.5, 10.5);
  assert.equal(sim.rand(), control.rand());
});

test('civilians sweep only after repairs, preempt cleanup, and stop near enemies', () => {
  const sim = scene(21, false, true), env = sim.atmosphere!, builders = (sim as any).builders;
  builders.respawn.length = 1; builders.respawn[0] = 0;
  const i = sim.map.city.findIndex((v, i) => !!v && !sim.solid[i] && sim.map.owner[i] < 0);
  env.sand[i] = .8; env.cleanup.add(i);
  builders.step(sim, .1);
  const c = sim.civilians[0]; assert.ok(c); assert.equal(c.jobKind, 'sand'); builders.respawn.fill(1e9);
  c.x = i % CELLS_W + .5; c.y = Math.floor(i / CELLS_W) + .5; c.state = 'working'; c.path = [];
  builders.step(sim, .1); assert.ok(env.sand[i] < .8);
  const b = wall(sim); sim.damageBuilding(b.id, 1e9); c.thinkT = 0;
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

test('the dunes are a few low, gentle swells in a handful of flat sand tones, tiling', () => {
  setDuneLight();
  const { size, data } = dunePixels(), h = duneHeights();
  const tones = new Set<string>();
  let tallest = 0, steepest = 0;
  for (let i = 0; i < size * size; i++) {
    assert.equal(data[i * 4 + 3], 255, 'no bare floor anywhere');
    tones.add(`${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]}`);
    tallest = Math.max(tallest, h[i]);
    const x = i % size, y = Math.floor(i / size);
    steepest = Math.max(steepest, Math.abs(h[y * size + (x + 1) % size] - h[i]), Math.abs(h[((y + 1) % size) * size + x] - h[i]));
  }
  assert.ok(tones.size <= DUNE_TONES.length && tones.size >= 3, `${tones.size} tones`);
  for (const t of tones) assert.ok(DUNE_TONES.some(c => c.join(',') === t), 'only the sand tones, no dithered blends');
  assert.ok(tallest <= DUNE_RELIEF + 1e-6 && steepest < .2, `gentle: ${tallest} high, ${steepest} a pixel at most`);
  // Only a couple of crests across a whole field period down any column.
  let crests = 0;
  for (let y = 0; y < size; y++) { const a = h[y * size + 40], b = h[((y + 1) % size) * size + 40], c = h[((y + 2) % size) * size + 40]; if (b > a && b >= c) crests++; }
  assert.ok(crests <= DUNE_PERIOD / SWELL + 1, `${crests} crests`);
  // The surface tiles: the heights across the seam are as smooth as anywhere.
  let seam = 0;
  for (let y = 0; y < size; y++) seam = Math.max(seam, Math.abs(h[y * size] - h[y * size + size - 1]));
  assert.ok(seam <= steepest * 1.5 + 1e-6, `seam ${seam}`);
});

test('the dunes turn with the sun: lit faces follow its heading, and night flattens them', () => {
  setDuneLight();
  assert.ok(sunlight(1, 1) > sunlight(0, 0) && sunlight(0, 0) > sunlight(-1, -1) && SUN.x < 0 && SUN.y < 0, 'from the upper left without a sky');
  const bright = (d: Uint8ClampedArray) => { let n = 0; for (let i = 0; i < d.length; i += 4) n += d[i]; return n; };
  // Morning: shadows fall west, so the sun is in the east and east faces are lit.
  assert.ok(setDuneLight({ x: -1, y: .3, strength: .27 }));
  assert.ok(sunlight(-1, 0) > 0 && sunlight(1, 0) < 0, 'faces turned east are lit');
  const morning = dunePixels().data, key = duneLightKey();
  assert.ok(!setDuneLight({ x: -1.001, y: .3, strength: .27 }), 'a hair of movement does not relight');
  // Evening: the sun in the west.
  assert.ok(setDuneLight({ x: 1, y: .3, strength: .27 }));
  assert.ok(sunlight(1, 0) > 0 && duneLightKey() !== key);
  const evening = dunePixels().data;
  let differ = 0;
  for (let i = 0; i < morning.length; i += 4) if (morning[i] !== evening[i]) differ++;
  assert.ok(differ > morning.length / 40, 'the shading moves with the sun');
  // Night: the sun gone, the swells barely shaded.
  setDuneLight({ x: 1, y: .3, strength: 0 });
  const night = new Set<number>(); const d = dunePixels().data;
  for (let i = 0; i < d.length; i += 4) night.add(d[i]);
  assert.ok(night.size <= 3, `${night.size} tones by night`);
  assert.ok(Math.abs(bright(d) - bright(evening)) < bright(evening) * .1, 'its colour comes from the board\'s darkness, not a second dimming');
  setDuneLight();
});

/** A SandMarks over open ground everywhere but the city, no drift. */
function marked(sim = scene()) {
  const marks = new SandMarks(), ground = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) ground[i] = !sim.map.city[i] && !sim.solid[i] ? 1 : 0;
  marks.setGround(ground, 0, 0, true);
  return { marks, ground };
}
/** An art pixel outside the city on a dune at least `lo` and below `hi` of its height. */
function spot(marks: SandMarks, ground: Uint8Array, lo: number, hi: number) {
  for (let y = 8; y < CELLS_H * ART - 8; y += 3) for (let x = 8; x < CELLS_W * ART - 8; x += 3) {
    const h = marks.base(x, y) / DUNE_RELIEF;
    let clear = true;
    for (let dy = -2; dy <= 2 && clear; dy++) for (let dx = -2; dx <= 2; dx++) if (!ground[((y >> 3) + dy) * CELLS_W + (x >> 3) + dx]) clear = false;
    if (clear && h >= lo && h < hi) return { x, y };
  }
  throw new Error('no such spot');
}

test('walkers press trails into the raised dunes but not the floor sheet, and the wind fills them in', () => {
  const sim = scene(), { marks, ground } = marked(sim);
  const W = CELLS_W * ART;
  const dune = spot(marks, ground, .6, 1.1), floor = spot(marks, ground, 0, FLOOR * .5);
  marks.print(floor.x, floor.y, 1.5);
  assert.equal(marks.delta[floor.y * W + floor.x], 0, 'the floor sheet takes no trail');
  marks.print(dune.x, dune.y, 1.5);
  assert.ok(marks.delta[dune.y * W + dune.x] < -1, 'a footprint in the dune');
  assert.ok(marks.delta[dune.y * W + dune.x + 2] > 0, 'its lip pushed up beside it');
  // Walking the same footprint again does not dig deeper.
  const deep = marks.delta[dune.y * W + dune.x];
  marks.print(dune.x, dune.y, 1.5);
  assert.equal(marks.delta[dune.y * W + dune.x], deep);
  // A walker crossing the dune in the sim prints a trail behind it.
  const e = sim.spawnAuxiliary('orc', (dune.x - 12) / ART, dune.y / ART)!;
  marks.delta.fill(0);
  for (let n = 0; n < 12; n++) { e.x += 2 / ART; marks.update(sim); }
  assert.ok(marks.delta.some(v => v < -.5), 'a trail across the dune');
  // The wind smooths it all away, and the chunks go quiet and clear.
  for (let t = 0; t < 200 && marks.delta.some(v => v); t++) { sim.time += 2.6; e.hp = 0; marks.update(sim); }
  for (let t = 0; t < 40; t++) { sim.time += 2.6; marks.update(sim); }
  assert.ok(marks.delta.every(v => v === 0));
  assert.equal(marks.active.size, 0, 'every chunk went quiet');
});

test('blasts leave craters with their sand thrown out, repainting only the chunks round them', () => {
  const sim = scene(), { marks, ground } = marked(sim), W = CELLS_W * ART;
  const at = spot(marks, ground, 0, .4);
  sim.effects.push({ kind: 'boom', x: at.x / ART, y: at.y / ART, t: 0, r: 1.5, seed: 1 });
  marks.update(sim);
  const r = 1.5 * .8 * ART;
  assert.ok(marks.delta[at.y * W + at.x] < -3, 'a bowl blown out');
  assert.ok(marks.delta[at.y * W + at.x + Math.round(r * 1.2)] > 0, 'a rim of the sand it threw out');
  const reach = Math.ceil(r * 1.7 / CHUNK) + 1;
  assert.ok(marks.active.size <= (2 * reach + 1) ** 2, `${marks.active.size} chunks marked`);
  marks.update(sim);
  // The same blast is not dug twice, and an unmarked painted pixel matches the dune tile.
  const before = marks.delta.slice(); marks.update(sim);
  assert.deepEqual(marks.delta, before);
  const { size, data } = dunePixels(), k = [...marks.active][0], cw = W / CHUNK;
  marks.paintChunk(k);
  const x0 = (k % cw) * CHUNK, y0 = Math.floor(k / cw) * CHUNK;
  let same = 0, checked = 0;
  for (let y = y0 + 1; y < y0 + CHUNK - 1; y++) for (let x = x0 + 1; x < x0 + CHUNK - 1; x++) {
    const i = y * W + x;
    if (!ground[(y >> 3) * CELLS_W + (x >> 3)] || [i, i - 1, i + 1, i - W, i + W].some(j => marks.delta[j])) continue;
    checked++;
    if ([0, 1, 2].every(c => marks.pixels[i * 4 + c] === data[((y % size) * size + x % size) * 4 + c])) same++;
  }
  assert.equal(same, checked, 'unmarked sand in a marked chunk is the tile exactly');
});

test('no sand is drawn over the city wall', () => {
  const sim = scene(), { marks } = marked(sim);
  // A blast right on the wall: its crater and rim stop at the open ground.
  const w = sim.map.wall.findIndex(v => !!v);
  sim.effects.push({ kind: 'boom', x: w % CELLS_W + .5, y: Math.floor(w / CELLS_W) + .5, t: 0, r: 3, seed: 1 });
  for (let n = 0; n < 4; n++) marks.update(sim);
  assert.ok(marks.pixels.some((v, k) => k % 4 === 3 && v > 0), 'the crater was painted');
  for (let k = 0; k < marks.pixels.length / 4; k++) {
    if (!marks.pixels[k * 4 + 3]) continue;
    const c = Math.floor(Math.floor(k / (CELLS_W * ART)) / ART) * CELLS_W + Math.floor(k % (CELLS_W * ART) / ART);
    assert.ok(!sim.map.wall[c] && !sim.map.city[c], 'marks lie only on open ground');
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
