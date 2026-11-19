import test from "node:test";
import assert from "node:assert/strict";
import { areaForWave } from "../src/defend/areas.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex, CELLS_W, CELLS_H } from "../src/defend/grid.ts";
import { flicker, glintAt, hasPalace, onCarpet, PALACE, palacePlan, palaceTorches, slabLaid, torchesLit, workAt } from "../src/defend/palace.ts";
import { blocksPiece, crystalPiece, fillPalaceFloor, palaceFloorSteps, palaceWilds, pillarPiece, thronePiece, throneSprite, torchPiece } from "../src/defend/palace-art.ts";

const ART = 8, W = CELLS_W * ART, H = CELLS_H * ART;
function city() {
  const fit = fitLayout(defaultLayout());
  assert.ok(fit.ok);
  return generateCity(fit, 1);
}
function drain<T>(g: Generator<void, T, void>): T {
  for (;;) { const r = g.next(); if (r.done) return r.value; }
}

test("zone 8 is the Blight Prince's Obsidian Palace", () => {
  const area = areaForWave(141);
  assert.equal(area.id, "obsidian");
  assert.equal(area.name, "Obsidian Palace");
  assert.ok(hasPalace("obsidian") && !hasPalace("nadir") && !hasPalace("ember"));
});

test("the palace is worked toward the throne and raw to the south and out past the board", () => {
  let north = 0, south = 0;
  for (let sx = 0; sx < CELLS_W / 2; sx++) {
    if (slabLaid(sx, 4)) north++;
    if (slabLaid(sx, CELLS_H / 2 - 3)) south++;
  }
  assert.ok(north > south * 2, `${north} laid in the north, ${south} in the south`);
  assert.ok(workAt(CELLS_W / 2, -40) < workAt(CELLS_W / 2, 10));
});

test("the throne, colonnade and pieces stand on open ground, inside the board, planned from the map alone", () => {
  const map = city(), plan = palacePlan(map);
  assert.equal(palacePlan(map), plan);
  assert.deepEqual([plan.throne.x, plan.throne.y], [CELLS_W / 2, PALACE.throne.y]);
  assert.ok(plan.throne.y < 8, "the throne stands outside the building field");
  assert.ok(plan.pillars.length >= 6 && plan.torches.length === 20 && plan.crystals.length >= 3, JSON.stringify({ p: plan.pillars.length, c: plan.crystals.length }));
  assert.ok(plan.pillars.some((p) => p.stage === 0) && plan.pillars.some((p) => p.stage > 0), "finished and unfinished pillars");
  for (const f of [...plan.pillars, ...plan.torches, ...plan.crystals, ...plan.blocks]) {
    assert.equal(map.type[cellIndex(Math.floor(f.x), Math.floor(f.y))], CellType.OUT);
    assert.ok(f.x - f.r > 0 && f.y - f.r > 0 && f.x + f.r < CELLS_W && f.y + f.r < CELLS_H, "not cut off by the board's edge");
    assert.ok(!onCarpet(plan.throne, f.x, f.y), "off the carpet");
  }
  assert.equal(JSON.stringify(palacePlan(city())), JSON.stringify(plan));
});

test("ten torches down each side, mirrored and evenly spaced outside the building field, lit one a wave", () => {
  const t = palaceTorches(), left = t.filter((p) => p.x < CELLS_W / 2), right = t.filter((p) => p.x > CELLS_W / 2);
  assert.equal(left.length, 10);
  assert.equal(right.length, 10);
  for (let k = 0; k < 10; k++) {
    assert.equal(left[k].x + right[k].x, CELLS_W, "mirrored");
    assert.equal(left[k].y, right[k].y);
    assert.ok(left[k].x < 8 && right[k].x > CELLS_W - 8, "outside the building field");
    if (k) assert.equal(left[k].y - left[k - 1].y, left[1].y - left[0].y, "evenly spaced");
  }
  assert.deepEqual(t.map((p) => p.order).sort((a, b) => a - b), Array.from({ length: 20 }, (_, k) => k));
  assert.equal(torchesLit(141, false), 0);
  assert.equal(torchesLit(141, true), 1);
  assert.equal(torchesLit(150, true), 10);
  assert.equal(torchesLit(160, true), 20);
  assert.equal(torchesLit(160, false), 19);
});

test("glints flash now and then, the fires flicker", () => {
  let lit = 0;
  for (let t = 0; t < 10; t += 0.05) if (glintAt(3, t) > 0.5) lit++;
  assert.ok(lit > 0 && lit < 60, `${lit} bright samples`);
  for (let t = 0; t < 5; t += 0.1) { const f = flicker(7, t); assert.ok(f > 0.5 && f <= 1); }
});

test("the floor covers every open cell and nothing else, and finds gold to glint", () => {
  const map = city(), plan = palacePlan(map), { floor, glow, glints } = drain(palaceFloorSteps(plan));
  let lit = 0;
  for (let y = 0; y < H; y += 3)
    for (let x = 0; x < W; x += 3) {
      const open = map.type[cellIndex(Math.floor(x / ART), Math.floor(y / ART))] === CellType.OUT, i = y * W + x;
      assert.equal(floor[i] !== 0, open, `pixel ${x},${y}`);
      if (!open) assert.equal(glow[i], 0);
      if (glow[i]) lit++;
    }
  assert.ok(lit > 20, `${lit} glowing samples`);
  assert.ok(glints.length >= 20 && glints.length <= PALACE.glints * 2, `${glints.length / 2} glints`);
});

test("the wilds' floor meets the field's with no seam", () => {
  const w = 80, h = 40, wild = new Uint32Array(w * h), field = new Uint32Array(W * H);
  drain(fillPalaceFloor(wild, w, h, 40, 0, () => true));
  drain(fillPalaceFloor(field, W, H, 0, 0, (x, y) => x < 40 && y < h));
  for (let y = 0; y < h; y++) for (let x = 0; x < 40; x++) assert.equal(wild[y * w + 40 + x], field[y * W + x], `${x},${y}`);
});

test("pieces are opaque where drawn and the wilds' pieces stay off the field and out of the walls", () => {
  const plan = palacePlan(city());
  const throne = throneSprite(plan.throne);
  assert.ok(throne.shadow.some((v) => v !== 0) && throne.glow.some((v) => v !== 0));
  const pieces = [thronePiece(plan.throne), torchPiece(plan.torches[0]), crystalPiece(plan.crystals[0]), ...[0, 1, 2].map((stage) => pillarPiece({ x: 0, y: 0, r: 1, seed: 5, stage: stage as 0 | 1 | 2, banner: true }))];
  if (plan.blocks[0]) pieces.push(blocksPiece(plan.blocks[0]));
  for (const p of pieces) {
    assert.ok(p.px.filter((v) => v !== 0).length > 30);
    for (const v of p.px) if (v) assert.equal(v >>> 24, 255);
  }
  const wall = (x: number, y: number) => Math.abs(x - CELLS_W / 2) > 70 || Math.abs(y - CELLS_H / 2) > 70;
  const v = palaceWilds(40, wall), all = [...v.pillars, ...v.crystals, ...v.blocks];
  assert.ok(all.length > 10);
  for (const s of all) {
    assert.ok(s.x < 0 || s.y < 0 || s.x > CELLS_W || s.y > CELLS_H);
    assert.ok(!wall(s.x, s.y));
  }
});
