import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMIES, UPGRADES } from "../src/defend/catalog.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { buildWave, waveDifficulty } from "../src/defend/waves.ts";
import { DARK_BLADE, LESSER_DARK_BLADE, bladeSwing, inCrescent } from "../src/defend/dark-blade.ts";
import { darkBladeBodyPixels, darkBladeBox, darkBladeTurned, greatswordTurned, greatswordBox, inPentagon } from "../src/defend/dark-blade-shapes.ts";
import { blightDrawnPixels } from "../src/defend/blight-size.ts";
import { journalHTML } from "../src/defend/journal.ts";

function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  return sim;
}

test("Crystal Caves waves: one Dark Blade on 50, three on 55, one placeholder Blight elsewhere", () => {
  assert.deepEqual(buildWave(50, () => { throw Error("authored wave rolled"); }), ["darkBlade"]);
  assert.deepEqual(buildWave(55, () => { throw Error("authored wave rolled"); }), ["darkBlade", "darkBlade", "darkBlade"]);
  for (let wave = 41; wave <= 60; wave++) {
    if (wave === 50 || wave === 55) continue;
    if (wave <= 48 && wave % 2 === 0) {
      const q = buildWave(wave, () => { throw Error("authored wave rolled"); });
      assert.ok(q.length >= 3 && q.every(k => k === "lesserDarkBlade"), `wave ${wave}`);
      continue;
    }
    const q = buildWave(wave, () => { throw Error("authored wave rolled"); });
    assert.equal(q.length, 1, `wave ${wave}`);
    assert.equal(ENEMIES[q[0]].faction, "darkOne");
  }
  assert.equal(waveDifficulty(55), 3 * ENEMIES.darkBlade.cost);
  const def = ENEMIES.darkBlade;
  assert.ok(def.scriptedOnly && def.faction === "darkOne" && !def.flying);
  assert.match(journalHTML(["darkBlade"]), /Dark Blade/);
});

test("the crescent covers the front within 75 degrees and the reach only", () => {
  const r = DARK_BLADE.reach;
  assert.ok(inCrescent(0, 0, 0, 1, 0, r - .01));
  assert.ok(!inCrescent(0, 0, 0, 1, 0, r + .01));
  assert.ok(inCrescent(0, 0, 0, 1, Math.sin(1.25), Math.cos(1.25)));   // 71.6°
  assert.ok(!inCrescent(0, 0, 0, 1, Math.sin(1.4), Math.cos(1.4)));    // 80.2°
  assert.ok(!inCrescent(0, 0, 0, 1, 0, -1));
});

test("it winds up, cuts once for heavy damage, tears space, then waits out its cooldown", () => {
  const sim = fixture();
  const blade = sim.spawnAuxiliary("darkBlade", 20, 10)!;
  const b = sim.map.buildings.find(x => sim.intact(x) && x.kind !== "keep")!;
  // Stand just beside the building, so it is the nearest thing in reach.
  blade.x = b.rect.x - 1; blade.y = b.rect.y + b.rect.h / 2;
  const before = Array.from(sim.hp);
  const dt = 1 / 30;
  let cuts = 0, raised = false, steps = 0;
  while (steps++ < Math.ceil((DARK_BLADE.windup + 1) / dt)) {
    sim.step(dt);
    if (!sim.enemies.includes(blade)) break;
    if (blade.blade && blade.blade.wind > 0) { raised = true; assert.ok(bladeSwing(blade) >= .35); }
    cuts = sim.tears.length;
    if (cuts) break;
  }
  assert.ok(raised, "the sword was raised first");
  assert.equal(cuts, 1, "one cut");
  const hit = sim.map.buildings.filter(x => sim.hp[x.id] < before[x.id]);
  assert.ok(hit.length > 0, "buildings took the cut");
  for (const x of hit) assert.ok(before[x.id] - sim.hp[x.id] >= Math.min(before[x.id], ENEMIES.darkBlade.damage) - 1e-9, "full damage");
  // No second cut during the cooldown.
  for (let i = 0; i < Math.floor((ENEMIES.darkBlade.cooldown - .5) / dt); i++) sim.step(dt);
  assert.equal(sim.tears.length, 1);
  // The tear closes.
  for (let i = 0; i < Math.ceil(DARK_BLADE.tearLife / dt); i++) sim.step(dt);
  assert.ok(sim.tears.every(t => t.t < DARK_BLADE.tearLife));
});

test("the Lesser Dark Blade is smaller, square, quicker and much weaker", () => {
  const big = ENEMIES.darkBlade, small = ENEMIES.lesserDarkBlade;
  assert.ok(small.scriptedOnly && small.faction === "darkOne");
  assert.ok(small.hp < big.hp / 5 && small.damage < big.damage / 4 && small.cooldown < big.cooldown / 2 && small.size < big.size);
  assert.ok(LESSER_DARK_BLADE.reach < DARK_BLADE.reach && LESSER_DARK_BLADE.windup < DARK_BLADE.windup);
  const w = blightDrawnPixels("lesserDarkBlade")!;
  assert.equal(w, 7);
  assert.ok(darkBladeBodyPixels(w, true).every(Boolean), "square body");
  assert.ok(greatswordTurned(w, 0).filter(Boolean).length < greatswordTurned(11, 0).filter(Boolean).length, "smaller sword");
  const sim = fixture(), e = sim.spawnAuxiliary("lesserDarkBlade", 20, 10)!;
  const b = sim.map.buildings.find(x => sim.intact(x) && x.kind !== "keep")!;
  e.x = b.rect.x - .5; e.y = b.rect.y + b.rect.h / 2;
  const dt = 1 / 30;
  for (let i = 0; i < Math.ceil((LESSER_DARK_BLADE.windup + small.cooldown * 2 + .2) / dt) && sim.enemies.includes(e); i++) sim.step(dt);
  assert.ok(sim.tears.length >= 2, "cuts again quickly");
  assert.ok(sim.tears.every(t => t.r === LESSER_DARK_BLADE.reach && t.life === LESSER_DARK_BLADE.tearLife), "smaller, shorter tears");
});

test("pixel masks: pentagon points forward; the turned knight and sword fit their boxes", () => {
  const w = blightDrawnPixels("darkBlade")!;
  assert.equal(w, 11);
  assert.ok(inPentagon(0, -4.9, 5) && !inPentagon(-4, -4, 5) && inPentagon(0, 3.9, 5));
  const body = darkBladeBodyPixels(w);
  // The top row holds only the point; the lower rows are wider.
  const row = (y: number) => Array.from(body.slice(y * w, y * w + w)).filter(Boolean).length;
  assert.ok(row(0) <= 3 && row(6) > row(1));
  const m = darkBladeBox(w);
  assert.equal(m % 2, w % 2);
  for (const angle of [0, 1, 2.5, 4]) {
    const px = darkBladeTurned(w, angle, 1, m);
    // Nothing touches the box's border: the cloak turns inside it.
    for (let i = 0; i < m; i++) assert.ok(!px[i] && !px[(m - 1) * m + i] && !px[i * m] && !px[i * m + m - 1]);
    const sword = greatswordTurned(w, angle), s = greatswordBox(w);
    assert.ok(sword.some(Boolean));
    for (let i = 0; i < s; i++) assert.ok(!sword[i] && !sword[(s - 1) * s + i]);
  }
});
