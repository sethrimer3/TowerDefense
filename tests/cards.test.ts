import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { syncCards, equipCard, evolveCard, spikeKey, decodeCards } from "../src/cards.ts";
import { learnPath, evolve } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, removeStructure, moveStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Wizards, stepFrosts } from "../src/defend/wizard.ts";
import { Barracks } from "../src/defend/troops.ts";
import { Towers } from "../src/defend/towers.ts";
import { center } from "../src/defend/pathing.ts";
import { NO_BONUSES, UPGRADES, type PaletteItem } from "../src/defend/catalog.ts";
import { buyTile } from "../src/tiles.ts";

function fixture(kind: PaletteItem, count = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = count;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  const inside = kind === "barracks" || kind === "mageGuild";
  for (let i = 0; i < count; i++) { const [dx, dy] = inside ? [[0, -1], [-1, 0], [1, 0]][i] : [i - 1, -3]; l = placeStructure(l, kind, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("placement"); }
  s.defend.layout = l;
  syncCards(s.defend);
  return s;
}
function simulation(s: ReturnType<typeof defaults>) {
  const fit = fitLayout(s.defend.layout); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
}
function enemy(sim: DefendSim, x: number, y: number) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
}

test("three Wizard cards cast Fire, Ice and Storm together from a persisted save", () => {
  const s = fixture("wizardTower"), cards = s.defend.cards.filter(c => c.kind === "wizardTower");
  for (const [i, path] of (["pyromancy", "rime", "storm"] as const).entries()) {
    for (let n = 0; n < 3; n++) assert.ok(learnPath(s, path));
    assert.ok(equipCard(s, cards[i].id, path));
  }
  const loaded = decode(JSON.stringify(s)), sim = simulation(loaded), w = new Wizards();
  for (const b of sim.map.buildings.filter(b => b.kind === "wizardTower")) { const at = center(b.rect); enemy(sim, at.x, at.y - 2); }
  w.step(sim, 0.01);
  assert.equal(sim.flames.length, 1); assert.equal(sim.frosts.length, 1); assert.ok(sim.bolts.length > 0);
  const uid = sim.map.buildings[sim.flames[0].tower].structureUid!;
  assert.equal(sim.bonuses.cardPaths![uid].wizardTower!.path, "pyromancy");
  assert.equal(sim.bonuses.paths, undefined, "no global specialization leaks between copies");
});

test("Crusader and Assassin barracks recruit with their own health and damage", () => {
  const s = fixture("barracks", 2), cards = s.defend.cards.filter(c => c.kind === "barracks");
  for (const path of ["crusaders", "assassins"] as const) for (let n = 0; n < 3; n++) learnPath(s, path);
  equipCard(s, cards[0].id, "crusaders"); equipCard(s, cards[1].id, "assassins");
  const sim = simulation(s); new Barracks().step(sim, 0.01);
  const troops = sim.soldiers.filter(s => s.kind === "sword");
  assert.equal(troops.length, 2); assert.equal(troops[0].maxHp, 88); assert.equal(troops[1].maxHp, 32);
  assert.equal(troops[0].damage, 9); assert.equal(troops[1].damage, 6);
});

test("Fire arrows and Sharpshooters on separate cards keep their own projectiles and targets", () => {
  const s = fixture("archerTower", 2), cards = s.defend.cards.filter(c => c.kind === "archerTower");
  for (const p of ["fireArrows", "sharpshooters"] as const) for (let n = 0; n < 3; n++) learnPath(s, p);
  equipCard(s, cards[0].id, "fireArrows"); equipCard(s, cards[1].id, "sharpshooters");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "archerTower");
  for (const tower of b) { const at = center(tower.rect); enemy(sim, at.x, at.y - 2); }
  new Towers().step(sim, 0.01);
  const fire = sim.arrows.filter(a => a.origin?.building === b[0].id), sharp = sim.arrows.filter(a => a.origin?.building === b[1].id);
  assert.ok(fire.every(a => a.burn)); assert.equal(sharp.length, 1); assert.equal(sharp[0].burn, undefined);
});

test("moving, returning, re-placing and buying cards preserve identity without inheriting other paths", () => {
  const s = fixture("wizardTower", 1), c = s.defend.cards.find(c => c.kind === "wizardTower")!;
  learnPath(s, "rime"); equipCard(s, c.id, "rime");
  const uid = s.defend.layout.structures[0].uid;
  s.defend.layout = moveStructure(s.defend.layout, uid, s.defend.layout.keep.tx + 1, s.defend.layout.keep.ty - 3)!;
  syncCards(s.defend); assert.equal(c.placement, `structure:${uid}`);
  s.defend.layout = removeStructure(s.defend.layout, uid); syncCards(s.defend);
  assert.equal(c.placement, undefined); assert.equal(c.path, "rime");
  assert.ok(buyTile(s, "wizardTower"));
  assert.equal(s.defend.cards.filter(c => c.kind === "wizardTower" && !c.path).length, 1);
  s.defend.layout = placeStructure(s.defend.layout, "wizardTower", s.defend.layout.keep.tx, s.defend.layout.keep.ty - 3)!;
  syncCards(s.defend); assert.equal(c.path, "rime"); assert.ok(c.placement);
  assert.equal(decode(JSON.stringify(s)).defend.cards.find(v => v.id === c.id)!.path, "rime");
});

test("research unlocks do not grant unresearched ranks or allow another building's path", () => {
  const s = fixture("wizardTower", 1), c = s.defend.cards.find(c => c.kind === "wizardTower")!;
  assert.equal(equipCard(s, c.id, "rime"), false); learnPath(s, "rime");
  assert.equal(equipCard(s, c.id, "rime", 3), false); learnPath(s, "assassins");
  assert.equal(equipCard(s, c.id, "assassins"), false); assert.ok(equipCard(s, c.id, "rime", 1));
  const knowledge = s.knowledge; assert.ok(equipCard(s, c.id)); assert.equal(s.knowledge, knowledge);
});

test("card choices and shared equipment are snapshotted at battle start", () => {
  const s = fixture("wizardTower", 1), c = s.defend.cards.find(c => c.kind === "wizardTower")!;
  learnPath(s, "rime"); learnPath(s, "storm"); equipCard(s, c.id, "rime");
  const sim = simulation(s), uid = Number(c.placement!.slice(10));
  equipCard(s, c.id, "storm"); s.training.towerDamage = 2;
  assert.equal(sim.bonuses.cardPaths![uid].wizardTower!.path, "rime");
  assert.equal(bonuses(s).cardPaths![uid].wizardTower!.path, "storm"); assert.equal(sim.bonuses.towerDamage, 1);
});

test("legacy paths migrate ranks, paid Knowledge, choices and crowns exactly once", () => {
  const s = fixture("wizardTower", 2); const raw: any = JSON.parse(JSON.stringify(s));
  delete raw.pathResearch; delete raw.defend.cards;
  raw.paths = { wizardTower: { path: "rime", rank: 2, spent: 4008 } };
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.pathResearch.rime, { rank: 2, spent: 4008 });
  assert.ok(loaded.defend.cards.filter(c => c.kind === "wizardTower").every(c => c.path === "rime" && c.rank === 2));
  assert.deepEqual(decode(JSON.stringify(loaded)).defend.cards, loaded.defend.cards);
  raw.paths = { wizardTower: { path: "storm", rank: 3, spent: 175015, crowned: 2 } };
  raw.defend.owned.wizardTower = 0; raw.defend.owned.darkKeep = 2; raw.defend.layout.structures = [];
  const crowned = decode(JSON.stringify(raw));
  assert.equal(crowned.pathResearch.storm!.crowned, true);
  assert.equal(crowned.defend.cards.filter(c => c.evolved === "storm").length, 2);
});

test("malformed cards, repeated IDs and wrong placement bindings cannot duplicate a specialization", () => {
  const s = fixture("wizardTower", 1); learnPath(s, "rime");
  decodeCards([{ id: 10, kind: "wizardTower", path: "rime", rank: 9, placement: "structure:999" },
    { id: 10, kind: "wizardTower", path: "rime", rank: 1 }, { id: -2, kind: "wizardTower" }], s);
  const cards = s.defend.cards.filter(c => c.kind === "wizardTower");
  assert.equal(cards.length, 1); assert.equal(cards[0].path, undefined);
  assert.equal(cards[0].placement, `structure:${s.defend.layout.structures[0].uid}`);
});
