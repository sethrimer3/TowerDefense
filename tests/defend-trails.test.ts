// The worn monster trails (src/defend/trails.ts, trail-art.ts): the
// Mossbound Ruins' country roads and the Amber Desert's Galton trails, where
// they run, that only Defend's own cities have them, that the forest keeps
// off the roads, that ground enemies enter at the trailheads and walk them,
// and that forks split a crowd by each enemy's own coin.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile, placeGate } from "../src/defend/layout.ts";
import { CellType, generateCity, type CityMap } from "../src/defend/citygen.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { TRAIL, forkPick, trailCost, trailPlan, trailStyle } from "../src/defend/trails.ts";
import { forestPlan } from "../src/defend/forest.ts";
import { paintRoads, onTrailPixel } from "../src/defend/trail-art.ts";
import { DefendSim } from "../src/defend/sim.ts";
import { defaultDefendSave } from "../src/defend/progress.ts";
import { ENEMIES } from "../src/defend/catalog.ts";

const city = (seed = 7, trails = true, layout = defaultLayout()): CityMap => {
  const fit = fitLayout(layout);
  assert.ok(fit.ok);
  const map = generateCity(fit, seed);
  if (trails) map.trails = { seed };
  return map;
};
const cellOf = (x: number, y: number) => cellIndex(Math.max(0, Math.min(CELLS_W - 1, Math.floor(x))), Math.max(0, Math.min(CELLS_H - 1, Math.floor(y))));

test("only the first two areas wear trails, and only on Defend's own cities", () => {
  assert.equal(trailStyle("moss"), "road");
  assert.equal(trailStyle("desert"), "galton");
  assert.equal(trailStyle("drowned"), null);
  assert.equal(trailPlan(city(7, false), "road"), null);
  assert.equal(trailPlan(city(7, false), "galton"), null);
  const map = city();
  assert.equal(trailPlan(map, "road"), trailPlan(map, "road"), "planned once a map");
  assert.equal(forestPlan(city(7, false)).roads, null);
});

test("country roads come in at the top edge and wind down to the city, and one leaves out the bottom", () => {
  for (const seed of [3, 7, 11]) {
    const map = city(seed), plan = trailPlan(map, "road")!;
    assert.ok(plan.heads.length >= 2, "several roads in");
    for (const x of plan.heads) assert.ok(map.type[cellIndex(Math.floor(x), 0)] === CellType.OUT);
    const fromTop = plan.lines.filter((l) => l.points[0].y < 0);
    assert.equal(fromTop.length, plan.heads.length);
    for (const line of plan.lines) {
      const end = line.points[line.points.length - 1];
      assert.notEqual(map.type[cellOf(end.x, end.y)], CellType.OUT, "a road ends at the city");
    }
    assert.ok(plan.lines.some((l) => l.points[0].y > CELLS_H), "a road out the bottom");
    for (let i = 0; i < CELL_COUNT; i++) if (plan.wear[i] > 0) assert.equal(map.type[i], CellType.OUT, "worn only on open ground");
  }
});

test("roads lead to a gate where the city has one", () => {
  let layout = defaultLayout();
  layout = placeCityTile(layout, 6, 7) ?? layout;
  layout = placeGate(layout, { tx: 6, ty: 7, side: "n" }) ?? layout;
  const map = city(7, true, layout), plan = trailPlan(map, "road")!;
  const gate = map.buildings.find((b) => b.kind === "gate");
  assert.ok(gate, "the gate stands");
  const gateCells = new Set(gate!.cells);
  const ends = plan.lines.filter((l) => l.points[0].y < 0).map((l) => l.points[l.points.length - 1]);
  assert.ok(ends.some((p) => gateCells.has(cellOf(p.x, p.y))), "a road from the top ends at the gate");
});

test("the forest keeps its trees, lakes and rocks off the roads", () => {
  const map = city(), plan = forestPlan(map), roads = plan.roads!;
  assert.ok(roads);
  for (const t of plan.trees) assert.ok(roads.wear[cellOf(t.x, t.y)] < 0.2, "no trunk on a road");
  for (const r of plan.rocks) assert.ok(roads.wear[cellOf(r.x, r.y)] < 0.2, "no rock on a road");
  for (const l of plan.lakes) for (const d of l.discs) assert.ok(roads.wear[cellOf(d.x, d.y)] === 0, "no lake on a road");
  // The road's own pixels are dirt: none left the plain lawn green.
  const W = CELLS_W * 8, H = CELLS_H * 8, out = new Uint32Array(W * H);
  paintRoads(out, roads, plan.open, { x0: 0, y0: 0, x1: W, y1: H });
  let painted = 0, onRoad = 0;
  for (let Y = 0; Y < H; Y += 3) for (let X = 0; X < W; X += 3) if (onTrailPixel(roads, X, Y)) { onRoad++; if (out[Y * W + X]) painted++; }
  assert.ok(onRoad > 500 && painted / onRoad > 0.6, `roads painted (${painted}/${onRoad})`);
});

test("Galton trails part round pegs in rows, more worn toward the keep", () => {
  const map = city(), plan = trailPlan(map, "galton")!;
  assert.ok(plan.heads.length >= 5, "a trailhead every couple of tiles");
  assert.ok(plan.pegs.length >= 6, "pins the trails part round");
  for (let i = 0; i < CELL_COUNT; i++) if (plan.wear[i] > 0) assert.equal(map.type[i], CellType.OUT);
  const keep = map.buildings.find((b) => b.kind === "keep")!, kx = keep.rect.x + keep.rect.w / 2;
  // Worn deeper near the keep's side of the field than far out at its edges.
  const near = plan.lines.filter((l) => Math.abs(l.points[l.points.length - 1].x - kx) < 16).map((l) => l.level);
  const far = plan.lines.filter((l) => Math.abs(l.points[l.points.length - 1].x - kx) > 32 && l.points[0].y > 20).map((l) => l.level);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  assert.ok(mean(near) > mean(far), `${mean(near)} > ${mean(far)}`);
});

test("a worn trail is cheaper to walk than open ground", () => {
  assert.equal(trailCost(0), 1.25);
  assert.equal(trailCost(1), 1.25 - TRAIL.cost);
  assert.ok(trailCost(1) < 1, "cheaper than the city's own streets");
});

test("at a fork each enemy takes a near-equal branch by its own coin, always the same one", () => {
  const field = new Float64Array(CELL_COUNT).fill(50), wear = new Float32Array(CELL_COUNT);
  const here = cellIndex(40, 40), left = cellIndex(39, 41), right = cellIndex(41, 41), off = cellIndex(40, 41);
  field[here] = 20; field[left] = 18; field[right] = 18.5; field[off] = 19;
  wear[here] = wear[left] = wear[right] = 1;
  const choices = [left, off, right];
  const picks = new Set<number>();
  for (let id = 1; id <= 40; id++) {
    const p = forkPick(field, wear, here, left, choices, id);
    assert.ok(p === left || p === right, "only trail cells downhill");
    assert.equal(forkPick(field, wear, here, left, choices, id), p, "the same enemy, the same way");
    picks.add(p);
  }
  assert.equal(picks.size, 2, "the crowd splits");
  field[right] = 18 + TRAIL.slack + 0.5;
  for (let id = 1; id <= 10; id++) assert.equal(forkPick(field, wear, here, left, choices, id), left, "a far dearer branch is never taken");
});

/** Runs a battle at `wave` on `map`, sampling where ground walkers go. */
function march(map: CityMap, wave: number, seconds = 40) {
  const save = defaultDefendSave();
  const sim = new DefendSim(map, save.levels, 9);
  sim.startAt(wave);
  let samples = 0, onTrail = 0;
  const entries: number[] = [];
  const seen = new Set<number>();
  let top = CELLS_H;
  for (let i = 0; i < CELL_COUNT; i++) if (map.type[i] !== CellType.OUT) top = Math.min(top, Math.floor(i / CELLS_W));
  for (let t = 0; t < seconds * 30; t++) {
    sim.update(1 / 30);
    const wear = sim.trails?.wear;
    for (const e of sim.enemies) {
      const def = ENEMIES[e.kind];
      // Burrowed worms are out of sight, and worm segments trail their head.
      if (def.flying || def.boat || def.fortress || e.burrow || e.leader !== undefined || e.hp <= 0) continue;
      if (!seen.has(e.id)) { seen.add(e.id); if (e.y < 3) entries.push(e.x); }
      const i = cellOf(e.x, e.y);
      // On the way in: open ground above the city, past the board's top rows.
      if (map.type[i] !== CellType.OUT || e.y < 2 || e.y > top - 2) continue;
      samples++;
      if (wear && wear[i] > 0) onTrail++;
    }
  }
  return { sim, samples, share: onTrail / Math.max(1, samples), entries };
}

test("in battle, ground enemies enter at the trailheads and keep to the roads", () => {
  const map = city(), { sim, samples, share, entries } = march(map, 1);
  assert.equal(sim.trails?.style, "road");
  assert.ok(samples > 200, `enough walkers (${samples})`);
  assert.ok(share > 0.8, `on the roads ${Math.round(share * 100)}% of the time`);
  // (Each has taken its first step by the time it is seen.)
  for (const x of entries) assert.ok(sim.trails!.heads.some((h) => Math.abs(h - x) <= TRAIL.spread + 0.5), `entered at a trailhead (${x})`);
});

test("in the desert, the surfaced Blight worms slither down the Galton trails", () => {
  const map = city(), { sim, samples, share } = march(map, 23);
  assert.equal(sim.trails?.style, "galton");
  assert.ok(samples > 100, `enough walkers (${samples})`);
  assert.ok(share > 0.8, `on the trails ${Math.round(share * 100)}% of the time`);
});

test("a map without trails battles exactly as before", () => {
  const plain = march(city(7, false), 1, 10);
  assert.equal(plain.sim.trails, null);
  assert.ok(plain.entries.some((x) => x < 20) && plain.entries.some((x) => x > 70), "spread right across the top");
});
