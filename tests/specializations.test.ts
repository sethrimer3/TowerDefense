// Specializations (src/specializations.ts): what the player owns is plain
// counts; each placed building wears its own researched path, chosen in
// Defend, carried when it moves, cleared when it goes back to the palette,
// kept by saves and snapshotted when a battle starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { canSpecialize, evolveOne, unevolveOne, placedBattlePaths, specialize, specialties, specialtyLabel, specialtyOf, spikeKey } from "../src/specializations.ts";
import { learnPath, evolve } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, removeStructure, moveStructure, moveSpikes, placeCityTile, placeSpikes, removeSpikes, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { available } from "../src/defend/progress.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Wizards } from "../src/defend/wizard.ts";
import { Barracks } from "../src/defend/troops.ts";
import { Towers } from "../src/defend/towers.ts";
import { stepMage, stepFireballs, stepBlazes } from "../src/defend/mages.ts";
import { baitBitten } from "../src/defend/bait.ts";
import { center } from "../src/defend/pathing.ts";
import { type PaletteItem } from "../src/defend/catalog.ts";
import { buyTile } from "../src/tiles.ts";
import { specialtyChoicesHtml } from "../src/ui/specialty.ts";

function fixture(kind: PaletteItem, count = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = count;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  const inside = kind === "barracks" || kind === "mageGuild" || kind === "archerBarracks";
  for (let i = 0; i < count; i++) { const [dx, dy] = inside ? [[0, -1], [-1, 0], [1, 0]][i] : [i - 1, -3]; l = placeStructure(l, kind, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("placement"); }
  s.defend.layout = l;
  return s;
}
/** The uids of `kind` standing in `s`'s city, oldest first. */
const uids = (s: ReturnType<typeof defaults>, kind: PaletteItem) => s.defend.layout.structures.filter(st => st.kind === kind).map(st => st.uid);
/** Researches `path` to `rank` and puts it on the structure `uid`. */
function wear(s: ReturnType<typeof defaults>, uid: number, path: Parameters<typeof learnPath>[1], rank = 3) {
  while ((s.pathResearch[path]?.rank ?? 0) < rank) assert.ok(learnPath(s, path));
  assert.ok(specialize(s.defend, s.pathResearch, { uid }, path));
}
function simulation(s: ReturnType<typeof defaults>) {
  const fit = fitLayout(s.defend.layout); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
}
function enemy(sim: DefendSim, x: number, y: number) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
}

test("three Wizard towers cast Fire, Ice and Storm together, beside an unspecialized one, from a persisted save", () => {
  const s = fixture("wizardTower", 4), [a, b, c] = uids(s, "wizardTower");
  wear(s, a, "pyromancy"); wear(s, b, "rime"); wear(s, c, "storm");
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["pyromancy", "rime", "storm", undefined]);
  const sim = simulation(loaded), w = new Wizards();
  for (const b of sim.map.buildings.filter(b => b.kind === "wizardTower")) { const at = center(b.rect); enemy(sim, at.x, at.y - 2); }
  w.step(sim, 0.01);
  assert.equal(sim.flames.length, 2, "Pyromancy's flame and the plain tower's"); assert.equal(sim.frosts.length, 1); assert.ok(sim.bolts.length > 0);
  assert.equal(sim.bonuses.structurePaths![a].wizardTower!.path, "pyromancy");
  assert.equal(sim.bonuses.structurePaths![uids(s, "wizardTower")[3]], undefined, "the fourth wears nothing");
  assert.equal(sim.bonuses.paths, undefined, "no global specialization leaks between copies");
});

test("Crusader and Assassin barracks recruit with their own health and damage", () => {
  const s = fixture("barracks", 2), [a, b] = uids(s, "barracks");
  wear(s, a, "crusaders"); wear(s, b, "assassins");
  const sim = simulation(s); new Barracks().step(sim, 0.01);
  const troops = sim.soldiers.filter(s => s.kind === "sword");
  assert.equal(troops.length, 2); assert.equal(troops[0].maxHp, 88); assert.equal(troops[1].maxHp, 32);
  assert.equal(troops[0].damage, 9); assert.equal(troops[1].damage, 6);
});

test("Fire arrows and Sharpshooters on separate towers keep their own projectiles and targets", () => {
  const s = fixture("archerTower", 2), [a, b2] = uids(s, "archerTower");
  wear(s, a, "fireArrows"); wear(s, b2, "sharpshooters");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "archerTower");
  for (const tower of b) { const at = center(tower.rect); enemy(sim, at.x, at.y - 2); }
  new Towers().step(sim, 0.01);
  const fire = sim.arrows.filter(a => a.origin?.building === b[0].id), sharp = sim.arrows.filter(a => a.origin?.building === b[1].id);
  assert.ok(fire.every(a => a.burn)); assert.equal(sharp.length, 1); assert.equal(sharp[0].burn, undefined);
});

test("moving keeps a building's path; taking it up clears it; placing again starts plain", () => {
  const s = fixture("wizardTower", 1), [uid] = uids(s, "wizardTower"), l0 = s.defend.layout;
  wear(s, uid, "rime", 1);
  s.defend.layout = moveStructure(s.defend.layout, uid, l0.keep.tx + 1, l0.keep.ty - 3)!;
  assert.deepEqual(specialtyOf(s.defend.layout, s.pathResearch, { uid }), { path: "rime", rank: 1 });
  s.defend.layout = removeStructure(s.defend.layout, uid);
  assert.equal(available(s.defend, "wizardTower"), 1);
  assert.ok(buyTile(s, "wizardTower"));
  assert.equal(available(s.defend, "wizardTower"), 2, "copies are interchangeable");
  s.defend.layout = placeStructure(s.defend.layout, "wizardTower", l0.keep.tx, l0.keep.ty - 3)!;
  const [again] = uids(s, "wizardTower");
  assert.notEqual(again, uid);
  assert.equal(specialtyOf(s.defend.layout, s.pathResearch, { uid: again }), undefined, "a fresh placement wears nothing until chosen");
  assert.equal(canSpecialize(s.pathResearch, "wizardTower"), true, "so Defend asks");
  assert.equal(decode(JSON.stringify(s)).defend.layout.structures[0].path, undefined);
});

test("only researched paths of the building's own kind can be worn, and choosing is free", () => {
  const s = fixture("wizardTower", 1), [uid] = uids(s, "wizardTower"), d = s.defend;
  assert.equal(canSpecialize(s.pathResearch, "wizardTower"), false, "nothing to choose yet: no selector");
  assert.equal(specialize(d, s.pathResearch, { uid }, "rime"), false); learnPath(s, "rime");
  assert.equal(specialize(d, s.pathResearch, { uid }, "assassins"), false); learnPath(s, "assassins");
  assert.equal(specialize(d, s.pathResearch, { uid }, "assassins"), false, "another kind's path");
  assert.equal(specialize(d, s.pathResearch, { uid: 999 }, "rime"), false, "nothing stands there");
  const knowledge = s.knowledge;
  assert.ok(specialize(d, s.pathResearch, { uid }, "rime"));
  assert.ok(specialize(d, s.pathResearch, { uid }));
  assert.equal(d.layout.structures[0].path, undefined, "back to unspecialized");
  assert.equal(s.knowledge, knowledge);
  assert.equal(canSpecialize(s.pathResearch, "darkKeep"), false, "evolved kinds have no paths");
  assert.equal(canSpecialize(s.pathResearch, "cityTile"), false);
});

test("the choice lists every path at its researched rank, the rest locked", () => {
  const s = fixture("wizardTower", 1);
  learnPath(s, "pyromancy"); learnPath(s, "pyromancy"); learnPath(s, "storm");
  assert.deepEqual(specialties(s.pathResearch, "wizardTower").map(p => [p.path.id, p.rank]), [["pyromancy", 2], ["rime", 0], ["storm", 1]]);
  const html = specialtyChoicesHtml(s.pathResearch, "wizardTower", "storm");
  assert.match(html, /data-specialty=""/, "unspecialized is a choice");
  assert.match(html, /Pyromancy II/); assert.match(html, /Stormcalling I/);
  assert.match(html, /data-specialty="rime"[^>]*disabled/, "unresearched is locked");
  assert.match(html, /data-specialty="storm"[^>]*aria-pressed="true"/);
  assert.equal(specialtyChoicesHtml(s.pathResearch, "cannonTower").split("data-specialty=").length - 1, 3);
  assert.equal(specialtyChoicesHtml(s.pathResearch, "darkKeep"), "");
  assert.equal(specialtyLabel({ path: "pyromancy", rank: 2 }), "Pyromancy II");
  assert.equal(specialtyLabel(undefined), "Unspecialized");
});

test("a building wears its path's furthest researched rank, rising with research", () => {
  const s = fixture("wizardTower", 2), [a, b] = uids(s, "wizardTower");
  wear(s, a, "pyromancy", 2);
  assert.equal(bonuses(s).structurePaths![a].wizardTower!.rank, 2);
  learnPath(s, "pyromancy");
  assert.equal(bonuses(s).structurePaths![a].wizardTower!.rank, 3, "research raises buildings already wearing the path");
  assert.equal(bonuses(s).structurePaths![b], undefined, "unspecialized buildings stay unspecialized");
  assert.deepEqual(specialtyOf(decode(JSON.stringify(s)).defend.layout, s.pathResearch, { uid: a }), { path: "pyromancy", rank: 3 });
});

test("choices and shared equipment are snapshotted at battle start", () => {
  const s = fixture("wizardTower", 1), [uid] = uids(s, "wizardTower");
  learnPath(s, "storm"); wear(s, uid, "rime", 1);
  const sim = simulation(s);
  specialize(s.defend, s.pathResearch, { uid }, "storm"); s.training.towerDamage = 2;
  assert.equal(sim.bonuses.structurePaths![uid].wizardTower!.path, "rime");
  assert.equal(bonuses(s).structurePaths![uid].wizardTower!.path, "storm"); assert.equal(sim.bonuses.towerDamage, 1);
});

test("wall spikes wear a path per row, keep it as they move along the wall and lose it when taken up", () => {
  const s = defaults(); s.knowledge = 1e6; s.defend.owned.wallSpikes = 2;
  const l = s.defend.layout, north = { tx: l.keep.tx, ty: l.keep.ty, side: "n" as const }, west = { ...north, side: "w" as const };
  s.defend.layout = placeSpikes(placeSpikes(l, north)!, west)!;
  learnPath(s, "blastStakes"); learnPath(s, "rimeStakes");
  assert.ok(specialize(s.defend, s.pathResearch, { spikes: north }, "blastStakes"));
  assert.ok(specialize(s.defend, s.pathResearch, { spikes: west }, "rimeStakes"));
  assert.equal(specialize(s.defend, s.pathResearch, { spikes: west }, "fortified"), false);
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(placedBattlePaths(loaded).spikePaths, { [spikeKey(north)]: { spikes: { path: "blastStakes", rank: 1 } }, [spikeKey(west)]: { spikes: { path: "rimeStakes", rank: 1 } } });
  const east = { ...north, side: "e" as const };
  s.defend.layout = moveSpikes(s.defend.layout, north, east)!;
  assert.equal(specialtyOf(s.defend.layout, s.pathResearch, { spikes: east })?.path, "blastStakes", "moving keeps it");
  s.defend.layout = placeSpikes(removeSpikes(s.defend.layout, east), east)!;
  assert.equal(specialtyOf(s.defend.layout, s.pathResearch, { spikes: east }), undefined, "taking it up clears it");
});

test("version 2 topic paths stay on the buildings standing in the city; copies in the palette are plain", () => {
  const s = fixture("wizardTower", 2); s.defend.owned.wizardTower = 3;
  const raw: any = JSON.parse(JSON.stringify(s));
  delete raw.pathResearch; raw.version = 2;
  raw.paths = { wizardTower: { path: "rime", rank: 2, spent: 4008 } };
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.pathResearch.rime, { rank: 2, spent: 4008 });
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["rime", "rime"]);
  assert.equal(available(loaded.defend, "wizardTower"), 1);
  assert.deepEqual(loaded.defend.owned, s.defend.owned, "counts untouched");
  assert.deepEqual(decode(JSON.stringify(loaded)).defend.layout, loaded.defend.layout, "migrates once");
  raw.paths = { wizardTower: { path: "storm", rank: 3, spent: 175015, crowned: 2 } };
  raw.defend.owned.wizardTower = 0; raw.defend.owned.darkKeep = 2; raw.defend.layout.structures = [];
  const crowned = decode(JSON.stringify(raw));
  assert.equal(crowned.pathResearch.storm!.crowned, true);
  assert.equal(crowned.defend.owned.darkKeep, 2, "crowned copies stay evolved");
});

test("version 3 cards: placed ones keep their path on the city, palette ones become plain copies", () => {
  const s = fixture("wizardTower", 2); s.defend.owned.wizardTower = 4; s.defend.owned.wallSpikes = 1;
  learnPath(s, "pyromancy"); learnPath(s, "rime"); learnPath(s, "blastStakes");
  const north = { tx: s.defend.layout.keep.tx - 1, ty: s.defend.layout.keep.ty, side: "n" as const };
  s.defend.layout = placeSpikes(s.defend.layout, north) ?? assert.fail("spikes");
  const [a, b] = uids(s, "wizardTower"), raw: any = JSON.parse(JSON.stringify(s));
  raw.version = 3;
  raw.defend.nextCardId = 9;
  raw.defend.cards = [
    { id: 1, kind: "wizardTower", path: "pyromancy", rank: 1, placement: `structure:${a}` },
    { id: 2, kind: "wizardTower", path: "rime", rank: 1, placement: `structure:${b}` },
    { id: 3, kind: "wizardTower", path: "rime", rank: 1 },
    { id: 4, kind: "wizardTower", path: "storm", rank: 1 },
    { id: 5, kind: "wallSpikes", path: "blastStakes", rank: 1, placement: spikeKey(north) },
  ];
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["pyromancy", "rime"]);
  assert.equal(loaded.defend.layout.spikes[0].path, "blastStakes");
  assert.equal(available(loaded.defend, "wizardTower"), 2, "the two in the palette are plain copies");
  assert.equal((loaded.defend as any).cards, undefined, "no cards are kept");
  assert.equal(loaded.version, 4);
  assert.deepEqual(loaded.pathResearch, s.pathResearch, "research untouched");
  assert.deepEqual(loaded.defend.owned, s.defend.owned);
});

test("malformed and unresearched paths are dropped from the saved city", () => {
  const s = fixture("wizardTower", 2); learnPath(s, "rime");
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.layout.structures[0].path = "storm";
  raw.defend.layout.structures[1].path = "assassins";
  let loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), [undefined, undefined]);
  assert.equal(loaded.defend.layout.structures.length, 2, "the buildings stand");
  raw.defend.layout.structures[0].path = "rime"; raw.defend.layout.structures[1].path = 7;
  loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["rime", undefined]);
  raw.version = 3;
  raw.defend.cards = [{ id: 10, kind: "wizardTower", path: "rime", rank: 9, placement: "structure:999" }, { id: -2, kind: "wizardTower" }, "x"];
  loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["rime", undefined]);
});

test("Pyroclasm and Cinders effects retain their own origin after the caster dies", () => {
  const s = fixture("mageGuild", 2), [first, second] = uids(s, "mageGuild");
  wear(s, first, "pyroclasm"); wear(s, second, "cinders");
  const sim = simulation(s); new Barracks().step(sim, 0.01);
  for (const troop of sim.soldiers) enemy(sim, troop.x, troop.y - 1);
  for (const troop of sim.soldiers) stepMage(sim, troop, 0.01);
  assert.equal(sim.fireballs.length, 2);
  assert.ok(sim.fireballs[0].damage > sim.fireballs[1].damage);
  sim.soldiers = []; stepFireballs(sim, 10);
  assert.equal(sim.blazes.length, 2); assert.equal(sim.blazes[0].cling, undefined); assert.equal(sim.blazes[1].cling, true);
  assert.ok(sim.blazes[1].life > sim.blazes[0].life);
  sim.enemies = [];
  const b = sim.blazes[0], e = enemy(sim, b.x, b.y); stepBlazes(sim, 0.01);
  assert.equal(e.burn, undefined, "other guild's clinging fire must not leak into this blaze");
});

test("overlapping watch towers combine their strongest mark and slow without multiplying duplicates", () => {
  const s = fixture("watchTower", 2), [first, second] = uids(s, "watchTower");
  wear(s, first, "spotters"); wear(s, second, "signalFires");
  const sim = simulation(s), b = sim.map.buildings.find(b => b.kind === "watchTower")!, at = center(b.rect);
  const e = enemy(sim, at.x + 2, at.y); (sim as any).markEnemies();
  assert.equal(e.markDamage, 3); assert.equal(e.slowed, 0.55);
  const hp = e.hp; sim.hurtEnemy(e, 10, true, "ranged"); assert.equal(hp - e.hp, 30);
});

test("oil-soaked bait and fortified bait retain separate hit reactions and health", () => {
  const s = fixture("monsterBait", 2), [first, second] = uids(s, "monsterBait");
  wear(s, first, "oilSoaked"); wear(s, second, "fortified");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "monsterBait");
  const a = enemy(sim, 1, 1), other = enemy(sim, 2, 1);
  baitBitten(sim, a, 5, b[0]); baitBitten(sim, other, 5, b[1]);
  assert.ok(a.burn); assert.equal(a.hp, a.maxHp); assert.equal(other.burn, undefined);
  assert.equal(other.maxHp - other.hp, 15); assert.ok(sim.maxHp[b[1].id] > sim.maxHp[b[0].id]);
});

test("evolving takes a copy from the palette before one from the city, and never duplicates a building", () => {
  const s = fixture("wizardTower", 2); s.defend.owned.wizardTower = 3;
  const [a, b] = uids(s, "wizardTower");
  wear(s, a, "pyromancy", 1); wear(s, b, "storm"); evolve(s, "storm");
  assert.ok(evolveOne(s, "storm"));
  assert.deepEqual(uids(s, "wizardTower"), [a, b], "the palette's copy went first");
  assert.ok(evolveOne(s, "storm"));
  assert.deepEqual(uids(s, "wizardTower"), [a], "then the city's Stormcalling tower");
  assert.deepEqual([s.defend.owned.wizardTower, s.defend.owned.darkKeep, available(s.defend, "darkKeep")], [1, 2, 2]);
  assert.ok(unevolveOne(s, "darkKeep"));
  assert.deepEqual([s.defend.owned.wizardTower, s.defend.owned.darkKeep], [2, 1]);
  assert.equal(s.defend.layout.structures[0].path, "pyromancy", "the other tower keeps its path");
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(loaded.defend.owned, s.defend.owned);
  assert.deepEqual(loaded.defend.layout, s.defend.layout);
});
