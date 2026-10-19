// Cloudborne (src/defend/sky-palace.ts): a Valkyrie palace on the path
// rises off its lot, drifts west and comes round from the east at another
// height, out of every enemy's reach, its valkyries dropping from wherever
// it floats; Diving descent and Heavenly host; and its art.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { buildingTree, nextSteps, specialtyOf, upgradeBuilding } from "../src/specializations.ts";
import { CLOUDBORNE } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks } from "../src/defend/troops.ts";
import { CELLS_W } from "../src/defend/grid.ts";
import { cellAt } from "../src/defend/pathing.ts";
import { soldierCap } from "../src/defend/catalog.ts";
import { landingCell, skyRow } from "../src/defend/sky-palace.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";
import { mooringPixels, skyPalacePixels, MARGIN } from "../src/defend/sky-palace-art.ts";
import { ART } from "../src/defend/park-art.ts";

/** A save with a Valkyrie palace beside the keep, at Cloudborne `rank` (plain at 0). */
function palace(rank: number) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.valkyriePalace = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "valkyriePalace", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  const uid = l.structures.find((st) => st.kind === "valkyriePalace")!.uid;
  for (let r = 0; r < rank; r++) {
    const step = nextSteps("valkyriePalace", specialtyOf(s.defend.layout, { uid })).find((st) => st.type === "path" && st.path === "cloudborne") ?? assert.fail("a Cloudborne step");
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
  return s;
}
function battle(rank: number) {
  const s = palace(rank), fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  return { sim, b: sim.map.buildings.find((b) => b.kind === "valkyriePalace")! };
}
function orc(sim: DefendSim, x: number, y: number) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}

test("Cloudborne: the palace's tree carries it, three ranks up", () => {
  const nodes = buildingTree("valkyriePalace");
  assert.deepEqual(nodes.filter((n) => n.path === "cloudborne").map((n) => n.rank), [1, 2, 3]);
  assert.equal(specialtyOf(palace(2).defend.layout, { uid: palace(2).defend.layout.structures.find((s) => s.kind === "valkyriePalace")!.uid })?.rank, 2);
});

test("Cloudborne: a plain palace stays on its lot", () => {
  const { sim, b } = battle(0);
  assert.equal(sim.skyPalaces.length, 0);
  assert.ok(b.cells.every((c) => sim.solid[c] === 1));
});

test("Cloudborne: the palace lifts off its lot, out of every enemy's reach", () => {
  const { sim, b } = battle(1);
  assert.equal(sim.skyPalaces.length, 1);
  assert.ok(b.cells.every((c) => sim.solid[c] === 0 && sim.ownSolid[c] === 0), "its lot is open ground");
  const hp = sim.hp[b.id];
  sim.damageBuilding(b.id, 1e9);
  sim.sink(b.id);
  assert.equal(sim.hp[b.id], hp);
  assert.ok(sim.intact(b));
});

test("Cloudborne: it drifts west and comes round from the east at another height", () => {
  const { sim, b } = battle(1);
  const p = sim.skyPalaces[0], x0 = p.x;
  sim.step(1);
  assert.ok(Math.abs(p.x - (x0 - CLOUDBORNE.speed)) < 1e-9);
  // Long enough to leave the west edge, clouds and all.
  for (let t = 0; t < (x0 + b.rect.w + 4) / CLOUDBORNE.speed && p.lap === 0; t += 0.25) sim.step(0.25);
  assert.equal(p.lap, 1);
  assert.ok(p.x > CELLS_W, "it comes back past the east edge");
  assert.equal(p.y, skyRow(b.id, 1, b.rect.h));
  const rows = new Set(Array.from({ length: 12 }, (_, lap) => skyRow(b.id, lap, b.rect.h)));
  assert.ok(rows.size > 4, "it comes round at different heights");
});

test("Cloudborne: valkyries drop from where it floats, and none while it is off the board", () => {
  const { sim, b } = battle(1);
  const p = sim.skyPalaces[0];
  p.x = 10; p.y = 20;
  new Barracks().step(sim, 0.01);
  const v = sim.soldiers.find((s) => s.kind === "valkyrie" && s.home === b.id) ?? assert.fail("a valkyrie");
  assert.equal(cellAt(v.x, v.y), landingCell(sim, p));
  assert.ok(Math.abs(v.x - (p.x + b.rect.w / 2)) < 3 && Math.abs(v.y - (p.y + b.rect.h / 2)) < 3);
  const off = battle(1);
  off.sim.skyPalaces[0].x = CELLS_W + 3;
  assert.equal(landingCell(off.sim, off.sim.skyPalaces[0]), -1);
  new Barracks().step(off.sim, 0.01);
  assert.equal(off.sim.soldiers.filter((s) => s.kind === "valkyrie").length, 0);
});

test("Cloudborne: Diving descent lands with a charge; Heavenly host holds more", () => {
  for (const rank of [1, 2]) {
    const { sim, b } = battle(rank);
    const p = sim.skyPalaces[0];
    p.x = 10; p.y = 20;
    const e = orc(sim, p.x + b.rect.w / 2 + 3, p.y + b.rect.h / 2);
    new Barracks().step(sim, 0.01);
    assert.equal(e.hp < e.maxHp, rank >= 2, `rank ${rank}`);
  }
  const { sim, b } = battle(3), barracks = new Barracks();
  sim.skyPalaces[0].x = 10; sim.skyPalaces[0].y = 20;
  for (let t = 0; t < 600; t++) barracks.step(sim, 0.5);
  assert.equal(sim.soldiers.filter((s) => s.home === b.id).length, soldierCap(sim.levels.barracksCapacity) + CLOUDBORNE.host);
});

test("Cloudborne art: its own look, its clouds, its mooring", () => {
  assert.deepEqual(PATH_LOOKS.valkyriePalace, ["cloudborne"]);
  assert.notDeepEqual(structurePixels("valkyriePalace", 6, 6, 0, 1, "cloudborne"), structurePixels("valkyriePalace", 6, 6, 0, 1));
  for (const [w, h] of [[6, 6], [4, 6]]) {
    const sky = skyPalacePixels(w, h, 3), W = (w + 2 * MARGIN) * ART;
    assert.equal(sky.length, W * (h + 2 * MARGIN) * ART);
    // Cloud reaches past the palace on every side; the sprite's corner stays clear.
    assert.equal(sky[0] >>> 24, 0);
    assert.ok(sky[(MARGIN * ART + 4) * W + MARGIN * ART - 4] >>> 24, "cloud to the west");
    assert.ok(sky[((h + MARGIN) * ART + 4) * W + Math.floor(W / 2)] >>> 24, "cloud below");
    const pad = mooringPixels(w, h, 3);
    assert.equal(pad.length, w * ART * h * ART);
    assert.ok(pad.filter((v) => v >>> 24).length > pad.length * 0.8);
  }
});
