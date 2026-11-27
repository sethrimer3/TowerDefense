import { test } from "node:test";
import assert from "node:assert/strict";
import { ENEMIES, UPGRADES } from "../src/defend/catalog.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { buildWave, SLIME_WAVES } from "../src/defend/waves.ts";
import { BLIGHT_SLIME, slimeHop } from "../src/defend/blight-slime.ts";
import { slimeBodyPixels, slimePixels, slimeBox } from "../src/defend/blight-slime-shapes.ts";
import { blightDrawnPixels } from "../src/defend/blight-size.ts";
import { journalHTML } from "../src/defend/journal.ts";

function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, 4);
  sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
  return sim;
}

test("blows and arrows do a tenth, blasts five times", () => {
  const sim = fixture();
  const hp = ENEMIES.blightSlime.hp;
  const a = sim.spawnAuxiliary("blightSlime", 20, 10)!;
  sim.hurtEnemy(a, 50, true, "melee");
  assert.ok(Math.abs(hp - a.hp - 5) < 1e-9, "melee");
  const b = sim.spawnAuxiliary("blightSlime", 22, 10)!;
  sim.hurtEnemy(b, 50, true, "ranged", undefined, true);
  assert.ok(Math.abs(hp - b.hp - 5) < 1e-9, "arrow");
  const c = sim.spawnAuxiliary("blightSlime", 24, 10)!;
  sim.hurtEnemy(c, 20, true, "ranged", undefined, false, "explosion");
  assert.ok(Math.abs(hp - c.hp - 100) < 1e-9, "blast");
});

test("a dying slime splats", () => {
  const sim = fixture();
  const e = sim.spawnAuxiliary("blightSlime", 20, 10)!;
  sim.hurtEnemy(e, 1000, true, "ranged", undefined, false, "explosion");
  assert.ok(sim.effects.some(fx => fx.kind === "splat"));
});

test("Crystal Caves' odd waves 41-49 release Blight Slimes", () => {
  for (const [wave, count] of Object.entries(SLIME_WAVES)) {
    const q = buildWave(+wave, () => { throw Error("authored wave rolled"); });
    assert.equal(q.length, count);
    assert.ok(q.every(k => k === "blightSlime"));
  }
  const def = ENEMIES.blightSlime;
  assert.ok(def.scriptedOnly && def.faction === "darkOne" && !def.flying);
  assert.match(journalHTML(["blightSlime"]), /Blight Slime/);
});

test("the hop leaves from its landing and comes down on its body; still slimes hop in place", () => {
  const e = { id: 0, kind: "blightSlime", x: 5, y: 5 } as never as Parameters<typeof slimeHop>[0];
  const P = BLIGHT_SLIME.period, phase = (Math.imul(0x51ed, 0x9e3779b1) >>> 0) / 4294967296;
  const start = (10 - phase) * P;
  slimeHop(e, start - P + .01);
  (e as { x: number }).x = 6;
  const top = slimeHop(e, start + P * BLIGHT_SLIME.air / 2);
  assert.ok(top.lift > BLIGHT_SLIME.height * .9 && top.x > 5 && top.x < 6);
  const land = slimeHop(e, start + P * (BLIGHT_SLIME.air + .05));
  assert.equal(land.lift, 0); assert.equal(land.x, 6); assert.ok(land.squash > 0 && land.splat >= 0);
  const next = slimeHop(e, start + P * 1.25);
  assert.ok(next.lift > 0 && next.lift <= BLIGHT_SLIME.idleHeight, "in place");
  assert.equal(slimeHop(e, undefined).lift, 0);
});

test("the body is an outline-free glob that flattens when squashed", () => {
  const w = blightDrawnPixels("blightSlime")!;
  assert.equal(w, 8);
  const body = slimeBodyPixels(w);
  assert.ok(body.filter(Boolean).length > w * w * .5);
  const n = slimeBox(w), rows = (px: Uint32Array) => new Set([...px.keys()].filter(i => px[i]).map(i => Math.floor(i / n))).size;
  assert.ok(rows(slimePixels(w, 4)) < rows(slimePixels(w, 0)));
  assert.ok(rows(slimePixels(w, -3)) > rows(slimePixels(w, 0)));
});
