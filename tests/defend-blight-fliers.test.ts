import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ENEMIES, UPGRADES } from "../src/defend/catalog.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { isBlightPrism, dartDirection, BLIGHT_FLIERS } from "../src/defend/blight-fliers.ts";
import { prismAngles, PRISM_ART } from "../src/defend/blight-flier-art.ts";
import { stepEnemy } from "../src/defend/enemies.ts";
import { groundBody } from "../src/defend/enemy-crowd.ts";
import { slots, buildWave } from "../src/defend/waves.ts";
import { basicName, basicUnitPixels, basicUnitPieces } from "../src/defend/basic-unit-art.ts";
import { setArtOverride } from "../src/defend/art-overrides.ts";
import { setPixelArt } from "../src/defend/pixel-sprites.ts";
import { journalHTML } from "../src/defend/journal.ts";
import { DarkDensity } from "../src/defend/dark-drain.ts";

const kinds = ["blightDart", "blightPrism", "greaterBlightPrism"] as const;
const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  return sim;
}
const sweep = (sim: DefendSim) => (sim as any).sweepAway();

test("three flying Dark One kinds have native stats, journal entries, split slots and color drain", () => {
  const sim = fixture();
  for (const kind of kinds) {
    const def = ENEMIES[kind], e = sim.spawnAuxiliary(kind, 20, 20)!;
    assert.ok(def.flying && def.scriptedOnly && def.portalOutline); assert.equal(def.faction, "darkOne");
    assert.equal(groundBody(e), false);
    assert.equal(slots(def), kind === "blightDart" ? 1 : 4);
    assert.match(journalHTML([kind]), new RegExp(def.name));
    assert.equal(new DarkDensity().update(Array.from({ length: 60 }, (_, id) => ({ ...e, id }))), true);
    if (isBlightPrism(kind)) { assert.ok(def.speed < .4); assert.deepEqual(def.splits, { into: "blightDart", count: 3 }); }
  }
  for (const n of [21, 181, 201]) assert.ok(buildWave(n, () => .5).every(k => !kinds.includes(k as any)));
});

test("prisms release exactly three darts 120 degrees apart, above solid structures, without extra RNG", () => {
  for (const kind of ["blightPrism", "greaterBlightPrism"] as const) {
    const sim = fixture(), parent = sim.spawnAuxiliary(kind, 36, 50)!;
    parent.facing = { x: 3, y: 4 };
    // All three release sites are solid: air children must not collapse onto their parent.
    sim.solid.fill(1);
    let draws = 0; sim.rand = () => { draws++; return .5; };
    parent.hp = 0; sweep(sim);
    assert.equal(sim.slain[kind], 1); assert.equal(sim.enemies.length, 3); assert.equal(draws, 9);
    const before = sim.enemies.map(e => ({ x: e.x, y: e.y }));
    for (let n = 0; n < 3; n++) {
      const e = sim.enemies[n], dir = dartDirection(parent.facing, n);
      assert.equal(e.kind, "blightDart"); assert.equal(e.hp, ENEMIES.blightDart.hp);
      close(e.x - parent.x, dir.x * ENEMIES[kind].size / 2); close(e.y - parent.y, dir.y * ENEMIES[kind].size / 2);
      for (let m = n + 1; m < 3; m++) {
        const other = dartDirection(parent.facing, m); close(dir.x * other.x + dir.y * other.y, -.5);
      }
      for (let tick = 0; tick < 30; tick++) stepEnemy(sim, e, BLIGHT_FLIERS.scatterSeconds / 30);
      close(e.x - before[n].x, dir.x * ENEMIES.blightDart.speed * BLIGHT_FLIERS.scatterSeconds);
      close(e.y - before[n].y, dir.y * ENEMIES.blightDart.speed * BLIGHT_FLIERS.scatterSeconds);
      assert.equal(e.dartBurst, undefined);
      const old = { x: e.x, y: e.y }; stepEnemy(sim, e, .1);
      assert.ok(Math.hypot(e.x - old.x, e.y - old.y) > 0, 'native keep flight resumes');
    }
    assert.equal(draws, 9, 'burst and ordinary flight do not roll');
    sim.enemies.forEach(e => e.hp = 0); sweep(sim); assert.equal(sim.enemies.length, 0); assert.equal(sim.slain.blightDart, 3);
  }
});

test("burst respects chill, freeze, impalement and wave cap", () => {
  const sim = fixture(), p = sim.spawnAuxiliary("blightPrism", 20, 10)!; p.hp = 0; sweep(sim);
  const [a, b, c] = sim.enemies; a.freeze = 2; b.chill = 2; c.impaled = 1;
  const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y;
  stepEnemy(sim, a, .1); stepEnemy(sim, b, .1); stepEnemy(sim, c, .1);
  close(a.x, ax); close(a.y, ay); close(c.x, cx); close(c.y, cy);
  assert.ok(Math.hypot(b.x - bx, b.y - by) < .24);
  const capped = fixture(), parent = capped.spawnAuxiliary("greaterBlightPrism", 20, 10)!;
  (capped as any).waveSpawned = 4999; parent.hp = 0; sweep(capped);
  assert.equal(capped.enemies.length, 1); assert.equal((capped as any).waveSpawned, 5000);
  assert.equal(fixture().spawnAuxiliary("roach", 20, 10)!.dartBurst, undefined);
});

test("outline-free black silhouettes export with a shallow dart notch and accept artist replacements", () => {
  setPixelArt(true);
  for (const kind of kinds) {
    const { w, h, data } = basicUnitPixels(kind, true);
    assert.equal(w, ENEMIES[kind].size * 8); assert.equal(h, w);
    assert.ok(data.some(v => v === 0)); assert.ok(data.some(v => v === 0xff000000));
    assert.ok(data.every(v => v === 0 || v === 0xff000000));
    const piece = basicUnitPieces().find(p => p.name === basicName(kind, true))!;
    assert.deepEqual(piece.pixels(), data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) assert.equal(data[y * w + x], data[y * w + w - 1 - x], 'bilateral symmetry');
    const blue = new Uint32Array(w * h).fill(0xffdd2200);
    try { setArtOverride(basicName(kind, true), { w, h, data: blue }); assert.deepEqual(basicUnitPixels(kind, true).data, blue); }
    finally { setArtOverride(basicName(kind, true), null); }
  }
  const dart = basicUnitPixels("blightDart", true);
  assert.equal(dart.data[5 * dart.w + 2], 0); assert.equal(dart.data[5 * dart.w], 0xff000000);
});

test("nested rotation rates are fractional and realign periodically", () => {
  assert.deepEqual(PRISM_ART.rates, [1, .5, .25, .125]);
  for (const count of [3, 4]) {
    const period = PRISM_ART.period / PRISM_ART.rates[count - 1];
    assert.ok(new Set(prismAngles(1, count)).size === count);
    for (const angle of prismAngles(period, count)) close(Math.cos(angle), 1);
  }
});

test("identical seeds produce identical flying and split state hashes", () => {
  const run = () => {
    const sim = fixture(); sim.spawnAuxiliary("blightPrism", 20, 10); sim.spawnAuxiliary("greaterBlightPrism", 30, 10);
    const snapshots: string[] = [];
    for (let i = 0; i < 100; i++) {
      for (const e of sim.enemies) stepEnemy(sim, e, 1 / 30);
      if (i === 20) sim.enemies[0].hp = 0;
      if (i === 50) sim.enemies.find(e => e.kind === "greaterBlightPrism")!.hp = 0;
      sweep(sim); snapshots.push(JSON.stringify(sim.enemies));
    }
    return createHash("sha256").update(snapshots.join("\n")).digest("hex");
  };
  assert.equal(run(), run());
});
