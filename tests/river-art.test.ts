import test from "node:test";
import assert from "node:assert/strict";
import { ambushField } from "../src/campaign/battlefield.ts";
import { CELLS_W, CELLS_H, cellIndex } from "../src/defend/grid.ts";
import { ART } from "../src/defend/park-art.ts";
import { RIVER_ART, RiverLife, riverBed, paintRiver, riverCanvas, riverCell, riverDepth, riverShape } from "../src/defend/river-art.ts";
import { BANK, WATER, WATER_OUTLINE } from "../src/defend/water-palette.ts";
import { Birds, roosting } from "../src/defend/forest-birds.ts";
import type { ForestTree } from "../src/defend/forest.ts";

const field = ambushField(0), map = field.map, W = CELLS_W * ART;
const rgba = (c: number) => ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

test("the river art shares park-art's scale and reads the level's river back from the map", () => {
  assert.equal(RIVER_ART, ART);
  const bed = riverBed(map)!, track = field.track.river!;
  assert.deepEqual(bed, track, "the river read from the cells is the level's");
  const wet = [...map.type.keys()].filter((i) => riverCell(map, i));
  assert.ok(wet.length > CELLS_W * 2);
});

test("the shores are smoothed: no step of a whole cell between neighbouring art columns", () => {
  const s = riverShape(riverBed(map)!);
  for (let X = 1; X < W; X++) {
    assert.ok(Math.abs(s.top[X] - s.top[X - 1]) < 3, `top at ${X}`);
    assert.ok(Math.abs(s.bot[X] - s.bot[X - 1]) < 3, `bottom at ${X}`);
  }
  assert.ok(riverShape(riverBed(map)!) === s, "made once");
});

test("the river is painted in the lakes' palette and covers its own cells whole", () => {
  const s = riverShape(riverBed(map)!), out = new Uint32Array(W * CELLS_H * ART), cells = riverCanvas(map, true);
  paintRiver(out, s, cells, { x0: 0, y0: 0, x1: W, y1: CELLS_H * ART });
  const water = new Set(WATER.map(rgba)), seen = new Set(out);
  assert.ok([...water].some((c) => seen.has(c)), "lake water tones");
  assert.ok(seen.has(rgba(WATER_OUTLINE)) && BANK.some((c) => seen.has(rgba(c))), "an outline and a muddy bank");
  // Every art pixel of every river cell is painted.
  for (let i = 0; i < map.type.length; i++) {
    if (!riverCell(map, i)) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    for (let y = cy * ART; y < (cy + 1) * ART; y++) for (let x = cx * ART; x < (cx + 1) * ART; x++) assert.notEqual(out[y * W + x], 0);
  }
  // The middle of each column is deep water.
  const X = W >> 1, mid = Math.round((s.top[X] + s.bot[X]) / 2);
  assert.ok(riverDepth(s, X, mid) > 8);
});

test("the live water keeps off the bridges, and fish dart away from a walker", () => {
  const life = new RiverLife();
  life.sync(map);
  for (let i = 0; i < map.type.length; i++) {
    if (!map.bridges?.[i]) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    for (let y = cy * ART; y < (cy + 1) * ART; y++) for (let x = cx * ART; x < (cx + 1) * ART; x++) assert.equal(life.isOpen(x, y), false);
  }
  const fish = life.shoal;
  assert.ok(fish.length >= 2);
  const frame = { now: 0, dt: 1 / 30, rain: false, cold: false, walkers: [] as { x: number; y: number }[], reduceMotion: false };
  for (let k = 0; k < 60; k++) life.step({ ...frame, now: k * 33 });
  // Every fish keeps to open water as it swims.
  for (const f of life.shoal) if (!f.hidden) assert.ok(life.isOpen(Math.round(f.x), Math.round(f.y)), "on open water");
  const f = life.shoal.find((g) => !g.hidden)!;
  life.step({ ...frame, walkers: [{ x: f.x / ART, y: f.y / ART + 1 }] });
  assert.ok(life.shoal.some((g) => g.scared), "frightened");
  for (let k = 0; k < 40; k++) life.step({ ...frame, walkers: [{ x: f.x / ART, y: f.y / ART + 1 }] });
  assert.ok(life.shoal.some((g) => g.hidden), "dived out of sight");
});

test("startled birds fly off from a tree, once until they roost again", () => {
  const trees: ForestTree[] = Array.from({ length: 40 }, (_, id) => ({ id, x: 30, y: 30, r: 1, kind: "oak", size: 1, variant: 0, phase: 0 }) as ForestTree);
  const tree = trees.find((t) => roosting(t) > 0)!;
  assert.ok(tree && trees.some((t) => roosting(t) === 0), "some trees have birds, some don't");
  const birds = new Birds();
  birds.flush(tree, 28, 30, 1);
  const n = birds.count;
  assert.equal(n, roosting(tree));
  birds.flush(tree, 28, 30, 2);
  assert.equal(birds.count, n, "gone until they come back");
  for (let k = 0; k < 400; k++) birds.update(0.05);
  assert.equal(birds.count, 0, "flown off");
  birds.flush(tree, 28, 30, 60);
  assert.equal(birds.count, n, "back to roost after a while");
});

test("a map without a river has no river art", () => {
  const life = new RiverLife(), plain = { ...map, type: map.type.map((t, i) => (riverCell(map, i) ? 0 : t)), bridges: undefined };
  life.sync(plain);
  assert.equal(life.shoal.length, 0);
  assert.equal(riverBed(plain), null);
  assert.equal(riverCell(plain, cellIndex(0, 30)), false);
});
