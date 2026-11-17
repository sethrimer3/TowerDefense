import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { eyeLook, eyeOpen, floatAt, hasNadir, heartbeat, moteAt, NADIR, nadirPlan } from "../src/defend/nadir.ts";
import { doorPiece, fillVoidstone, nadirFloorSteps, pyramidPiece, stairPiece, voidWilds } from "../src/defend/nadir-art.ts";

const ART = 8, W = CELLS_W * ART, H = CELLS_H * ART;
function city() {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}
function drain<T>(g: Generator<void, T, void>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

test("zone 10 is the Nadir, floored as its own void", () => {
  assert.equal(areaForWave(181).id, "nadir");
  assert.ok(hasNadir("nadir") && !hasNadir("obsidian") && !hasNadir("ember"));
});

test("the Nadir plans rifts, pyramids, stairs, trapdoors, eyes and floaters on open ground, inside the board", () => {
  const map = city(), plan = nadirPlan(map);
  assert.equal(nadirPlan(map), plan);
  assert.ok(plan.rifts.length >= 2 && plan.pyramids.length >= 2 && plan.stairs.length >= 2 && plan.doors.length >= 1 && plan.eyes.length >= 3 && plan.floaters.length >= 4);
  for (const f of [...plan.pyramids, ...plan.stairs, ...plan.doors, ...plan.eyes, ...plan.floaters]) {
    assert.equal(map.type[cellIndex(Math.floor(f.x), Math.floor(f.y))], CellType.OUT);
    assert.ok(f.x - f.r > 0 && f.y - f.r > 0 && f.x + f.r < CELLS_W && f.y + f.r < CELLS_H, "not cut off by the board's edge");
  }
  assert.equal(JSON.stringify(nadirPlan(city())), JSON.stringify(plan), "planned from the map alone");
});

test("eyes watch the nearest walker, shut when stood on, and blink", () => {
  const e = nadirPlan(city()).eyes[0];
  const look = eyeLook(e, 0, [{ x: e.x + 3, y: e.y }, { x: e.x - 6, y: e.y }]);
  assert.ok(look.x > 0.9 && Math.abs(look.y) < 0.01 && Math.abs(look.near - 3) < 1e-9);
  assert.equal(eyeOpen(e, 10, NADIR.flinch / 2), 0);
  let shut = false;
  for (let t = 0; t < 10; t += 0.02) if (eyeOpen(e, t, 99) < 0.5) shut = true;
  assert.ok(shut, "blinks within ten seconds");
});

test("floaters bob and drift near their spot, motes fall into the rifts, the veins beat", () => {
  const plan = nadirPlan(city());
  for (const f of plan.floaters) {
    const a = floatAt(f, 3);
    assert.ok(Math.hypot(a.x - f.x, a.y - f.y) < 0.3 && a.lift > 0.5);
  }
  const r = plan.rifts[0], early = moteAt(r, 0, 0), m = Array.from({ length: 50 }, (_, k) => moteAt(r, 0, k * 0.1));
  assert.ok(m.every((p) => p.show >= 0 && p.show <= 1) && early.show >= 0);
  const beats = Array.from({ length: 40 }, (_, k) => heartbeat(k * 0.04));
  assert.ok(Math.max(...beats) > 0.9 && Math.min(...beats) < 0.05);
});

test("the floor covers every open cell and nothing else", () => {
  const map = city(), plan = nadirPlan(map), { floor, glow } = drain(nadirFloorSteps(plan));
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

test("the wilds' ground meets the field's with no seam", () => {
  const w = 80, h = 40, wild = new Uint32Array(w * h), field = new Uint32Array(W * H);
  drain(fillVoidstone(wild, w, h, 40, 0, () => true));
  drain(fillVoidstone(field, W, H, 0, 0, (x, y) => x < 40 && y < h));
  for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) assert.equal(wild[y * w + 40 + x], field[y * W + x], `${x},${y}`);
});

test("pieces are opaque where drawn and the void's islands stay off the field", () => {
  const plan = nadirPlan(city());
  for (const p of [pyramidPiece(plan.pyramids[0]), stairPiece(plan.stairs[0]), doorPiece(plan.doors[0])]) {
    const n = p.px.filter((v) => v !== 0).length;
    assert.ok(n > 40);
    for (const v of p.px) if (v) assert.equal(v >>> 24, 255);
  }
  const v = voidWilds(40);
  assert.ok(v.isles.length > 10);
  for (const s of v.isles) assert.ok(s.x + s.r < 0 || s.y + s.r < 0 || s.x - s.r > CELLS_W || s.y - s.r > CELLS_H);
});
