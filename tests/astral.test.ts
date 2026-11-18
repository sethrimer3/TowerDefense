import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout, moveKeep } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { ASTRAL, astralPlan, hasAstral, hoverAt, islandLand, keepCenter, lushness, moteAt } from "../src/defend/astral.ts";
import { astralFloorSteps, crystalPiece, dialPiece, fillMeadow, isletPixels, skyIsles, stonePiece } from "../src/defend/astral-art.ts";

const ART = 8, W = CELLS_W * ART, H = CELLS_H * ART;
function city(keep?: { tx: number; ty: number }) {
  let layout = defaultLayout();
  if (keep) layout = moveKeep(layout, keep.tx, keep.ty)!;
  const fit = fitLayout(layout);
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}
function drain<T>(g: Generator<void, T, void>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

test("zone 9 is the Astral Sanctuary, floored as a floating island", () => {
  assert.equal(areaForWave(161).id, "astral");
  assert.ok(hasAstral("astral") && !hasAstral("nadir") && !hasAstral("obsidian"));
});

test("the island plans holes, stones, dials, crystals and islets on open ground, inside the board", () => {
  const map = city(), plan = astralPlan(map);
  assert.equal(astralPlan(map), plan);
  assert.ok(plan.holes.length >= 1 && plan.stones.length >= 3 && plan.dials.length >= 1 && plan.crystals.length >= 3 && plan.islets.length >= 3);
  for (const f of [...plan.holes, ...plan.stones, ...plan.dials, ...plan.crystals, ...plan.islets]) {
    assert.equal(map.type[cellIndex(Math.floor(f.x), Math.floor(f.y))], CellType.OUT);
    assert.ok(f.x - f.r > 0 && f.y - f.r > 0 && f.x + f.r < CELLS_W && f.y + f.r < CELLS_H, "not cut off by the board's edge");
  }
  assert.equal(JSON.stringify(astralPlan(city())), JSON.stringify(plan), "planned from the map alone");
});

test("the land grows round the keep: lush near it, and past the board on its side", () => {
  const map = city({ tx: 2, ty: 3 }), k = keepCenter(map);
  assert.ok(k.x < 30 && k.y < 40);
  assert.equal(astralPlan(map).keep.x, k.x);
  assert.equal(lushness(k.x, k.y, k), 1);
  assert.equal(lushness(CELLS_W, CELLS_H, k), 0);
  // Well past the board on the keep's side is land; as far past on the far side is sky.
  assert.ok(islandLand(-20, k.y, k, 0.5, 0.5, 0.5));
  assert.ok(!islandLand(CELLS_W + 20, k.y, k, 0.5, 0.5, 0.5));
  // The board itself is always land, wherever the keep stands.
  for (const keep of [k, { x: CELLS_W - 10, y: CELLS_H - 10 }]) for (const [x, y] of [[0, 0], [CELLS_W, 0], [0, CELLS_H], [CELLS_W, CELLS_H]]) assert.ok(islandLand(x, y, keep, 0, 0, 0));
  assert.ok(ASTRAL.lobe + ASTRAL.lobeWander < 72, "within the wilds");
});

test("islets hover near their spot and motes rise only off open ground", () => {
  const plan = astralPlan(city());
  for (const f of plan.islets) {
    const a = hoverAt(f, 3);
    assert.ok(Math.hypot(a.x - f.x, a.y - f.y) < 0.3 && a.lift > 0.7);
  }
  for (let k = 0; k < 20; k++) for (let t = 0; t < 20; t += 1.3) {
    const m = moteAt(plan, k, t);
    assert.ok(m.show >= 0 && m.show <= 1);
  }
});

test("the floor covers every open cell and nothing else", () => {
  const map = city(), plan = astralPlan(map), { floor, glow } = drain(astralFloorSteps(plan));
  let lit = 0;
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      const open = map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))] === CellType.OUT, i = y * W + x;
      assert.equal(floor[i] !== 0, open, `pixel ${x},${y}`);
      if (!open) assert.equal(glow[i], 0);
      if (glow[i]) lit++;
    }
  assert.ok(lit > 20, `${lit} glowing samples`);
});

test("the wilds' meadow meets the field's with no seam", () => {
  const home = { x: 40, y: 50 }, w = 80, h = 40, wild = new Uint32Array(w * h), field = new Uint32Array(W * H);
  drain(fillMeadow(wild, w, h, 40, 0, () => true, home));
  drain(fillMeadow(field, W, H, 0, 0, (x, y) => x < 40 && y < h, home));
  for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) assert.equal(wild[y * w + 40 + x], field[y * W + x], `${x},${y}`);
});

test("pieces are opaque where drawn and the sky's islets stay off the field", () => {
  const plan = astralPlan(city());
  for (const p of [stonePiece(plan.stones[0]), dialPiece(plan.dials[0]), crystalPiece(plan.crystals[0]), isletPixels(plan.islets[0])]) {
    const n = p.px.filter((v) => v !== 0).length;
    assert.ok(n > 30);
    for (const v of p.px) if (v) assert.equal(v >>> 24, 255);
  }
  const isles = skyIsles(40);
  assert.ok(isles.length > 10);
  for (const s of isles) assert.ok(s.x + s.r < 0 || s.y + s.r < 0 || s.x - s.r > CELLS_W || s.y - s.r > CELLS_H);
});
