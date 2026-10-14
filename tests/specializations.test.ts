// Each building's own upgrades (src/specializations.ts): the shop sells the
// basic buildings, and each placed one is upgraded on its own with
// Knowledge, into another building or up one of its paths, rank by rank,
// to a crown's evolution. Its path and rank move with it, wait with it in
// the palette, survive saves and are snapshotted when a battle starts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { nextSteps, placedBattlePaths, specialtyLabel, specialtyOf, spikeKey, stepName, upgradeBuilding, upgradedFrom, rootOf, type UpgradeStep } from "../src/specializations.ts";
import { learnPath, type PathId } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, removeStructure, moveStructure, moveSpikes, placeCityTile, placeSpikes, removeSpikes, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { available, keptGroups, plainAvailable, setLayout } from "../src/defend/progress.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Wizards } from "../src/defend/wizard.ts";
import { Barracks, stepArcher, stepSwordsman } from "../src/defend/troops.ts";
import { Towers, stepArrows } from "../src/defend/towers.ts";
import { stepMage, stepFireballs, stepBlazes } from "../src/defend/mages.ts";
import { baitBitten } from "../src/defend/bait.ts";
import { center } from "../src/defend/pathing.ts";
import { BRAWLER, MUSKETEER, SLINGER, SNIPER, STARTING_OWNED, type PaletteItem } from "../src/defend/catalog.ts";
import { upgradeChoicesHtml } from "../src/ui/specialty.ts";

type S = ReturnType<typeof defaults>;
const INSIDE = new Set<PaletteItem>(["barracks", "mageGuild", "archerBarracks", "meleeGuild", "rangedGuild", "sniperLodge", "musketHall"]);

function fixture(kind: PaletteItem, count = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = count;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  for (let i = 0; i < count; i++) {
    const [dx, dy] = INSIDE.has(kind) ? [[0, -1], [-1, 0], [1, 0]][i] : [i - 1, -3];
    l = placeStructure(l, kind as never, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("placement");
  }
  s.defend.layout = l;
  return s;
}
/** The uids of `kind` standing in `s`'s city, oldest first. */
const uids = (s: S, kind: PaletteItem) => s.defend.layout.structures.filter(st => st.kind === kind).map(st => st.uid);
/** Upgrades structure `uid` up `path` to `rank`, one rank at a time. */
function wear(s: S, uid: number, path: PathId, rank = 3) {
  for (let r = specialtyOf(s.defend.layout, { uid })?.rank ?? 0; r < rank; r++) {
    const kind = s.defend.layout.structures.find(st => st.uid === uid)!.kind;
    const step = nextSteps(kind, specialtyOf(s.defend.layout, { uid })).find(st => st.type === "path" && st.path === path) ?? assert.fail(`${path} ${r + 1}`);
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
}
const become = (to: PaletteItem): UpgradeStep => ({ type: "become", to: to as never, cost: 0 });
function simulation(s: S) {
  const fit = fitLayout(s.defend.layout); assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
}
function enemy(sim: DefendSim, x: number, y: number) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
}

// ── The tree ───────────────────────────────────────────────────────────
test("the shop's three basic buildings branch into every other tower and troop building", () => {
  const to = (k: Parameters<typeof nextSteps>[0]) => nextSteps(k).map(stepName);
  assert.deepEqual(to("watchTower"), ["Archer tower", "Cannon tower", "Wizard tower", "Spotters I", "Signal fires I"]);
  assert.deepEqual(to("meleeGuild"), ["Barracks"]);
  assert.deepEqual(to("rangedGuild"), ["Archer barracks", "Mage Guild", "Sniper lodge", "Musket hall"]);
  assert.deepEqual(to("barracks"), ["Crusaders I", "Assassins I"]);
  assert.deepEqual(to("wizardTower"), ["Pyromancy I", "Rime I", "Stormcalling I"]);
  assert.deepEqual(to("sniperLodge"), [], "a leaf for now");
  assert.deepEqual(nextSteps("wizardTower", { path: "storm", rank: 2 }).map(stepName), ["Stormcalling III"]);
  assert.deepEqual(nextSteps("wizardTower", { path: "storm", rank: 3 }).map(stepName), ["Dark wizard keep"], "its crown evolves it");
  assert.deepEqual(nextSteps("barracks", { path: "crusaders", rank: 3 }).map((s) => s.type === "evolve" && s.to), ["valkyriePalace"]);
  assert.deepEqual(nextSteps("wizardTower", { path: "rime", rank: 3 }), [], "a path without a crown ends at III");
  assert.deepEqual(to("wallSpikes"), ["Blasting stakes I", "Spring stakes I", "Rimed stakes I"]);
  assert.equal(rootOf("darkKeep"), "watchTower");
  assert.equal(rootOf("valkyriePalace"), "meleeGuild");
  assert.equal(upgradedFrom("musketHall"), "rangedGuild");
  assert.equal(upgradedFrom("watchTower"), undefined);
  assert.deepEqual([STARTING_OWNED.watchTower, STARTING_OWNED.meleeGuild, STARTING_OWNED.rangedGuild], [1, 1, 1], "a new game starts with one of each");
});

test("each building is upgraded on its own, paying Knowledge rank by rank", () => {
  const s = fixture("wizardTower", 2); s.settings.devMode = false; s.knowledge = 4;
  const [a, b] = uids(s, "wizardTower"), pyro = (rank: number): UpgradeStep => ({ type: "path", path: "pyromancy", rank, cost: 0 });
  assert.equal(upgradeBuilding(s, { uid: a }, pyro(2)).ok, false, "ranks go in order");
  assert.ok(upgradeBuilding(s, { uid: a }, pyro(1)).ok);
  assert.equal(s.knowledge, 0);
  assert.deepEqual(specialtyOf(s.defend.layout, { uid: a }), { path: "pyromancy", rank: 1 });
  assert.equal(specialtyOf(s.defend.layout, { uid: b }), undefined, "the other tower is untouched");
  assert.deepEqual(upgradeBuilding(s, { uid: b }, pyro(1)), { ok: false, reason: "Needs 4 Knowledge." });
  s.knowledge = 1e6;
  assert.equal(upgradeBuilding(s, { uid: a }, { type: "path", path: "rime", rank: 1, cost: 0 }).ok, false, "one path a building");
  assert.equal(upgradeBuilding(s, { uid: a }, become("cannonTower")).ok, false, "a wizard tower doesn't become a cannon");
  assert.equal(upgradeBuilding(s, { uid: 999 }, pyro(1)).ok, false, "nothing stands there");
  wear(s, a, "pyromancy", 3);
  assert.equal(s.knowledge, 1e6 - 4004 - 16004);
  assert.equal(bonuses(s).structurePaths![a].wizardTower!.rank, 3);
  assert.equal(bonuses(s).structurePaths![b], undefined);
  assert.equal(specialtyLabel(specialtyOf(s.defend.layout, { uid: a })), "Pyromancy III");
  const html = upgradeChoicesHtml(s, "wizardTower");
  assert.match(html, /Become|Pyromancy I/); assert.match(html, /Stormcalling I/);
  s.knowledge = 0;
  assert.match(upgradeChoicesHtml(s, "wizardTower"), /data-upgrade-step="0"[^>]*disabled/, "unaffordable upgrades show, locked");
  assert.match(upgradeChoicesHtml(s, "wizardTower", { path: "rime", rank: 3 }), /fully upgraded/);
});

test("becoming another building swaps one copy: in place when it fits, else it waits in the palette", () => {
  const s = fixture("watchTower", 2), [a] = uids(s, "watchTower");
  assert.deepEqual(upgradeBuilding(s, { uid: a }, become("archerTower")), { ok: true, kind: "archerTower", waiting: false });
  assert.deepEqual([s.defend.owned.watchTower, s.defend.owned.archerTower], [1, 1]);
  assert.equal(s.defend.layout.structures.find(st => st.uid === a)!.kind, "archerTower", "the same building, same uid");
  assert.ok(fitLayout(s.defend.layout).ok);
  // A Stormcalling III tower evolving into a keep needs a 2 × 2 block of
  // tiles: it waits in the palette.
  const w = fixture("wizardTower", 1), [t] = uids(w, "wizardTower");
  wear(w, t, "storm");
  const r = upgradeBuilding(w, { uid: t }, { type: "evolve", path: "storm", to: "darkKeep", cost: 0 });
  assert.deepEqual(r, { ok: true, kind: "darkKeep", waiting: true });
  assert.deepEqual([w.defend.owned.wizardTower, w.defend.owned.darkKeep, available(w.defend, "darkKeep")], [0, 1, 1]);
  const g = fixture("rangedGuild", 1), [guild] = uids(g, "rangedGuild");
  assert.ok(upgradeBuilding(g, { uid: guild }, become("musketHall")).ok);
  assert.equal(g.defend.layout.structures[0].kind, "musketHall");
});

test("moving keeps a building's upgrades; taken up, it waits in the palette with them and is placed again", () => {
  const s = fixture("wizardTower", 2), d = s.defend, [uid] = uids(s, "wizardTower"), l0 = d.layout;
  wear(s, uid, "rime", 2);
  setLayout(d, moveStructure(d.layout, uid, l0.keep.tx + 1, l0.keep.ty - 3)!);
  assert.deepEqual(specialtyOf(d.layout, { uid }), { path: "rime", rank: 2 });
  assert.deepEqual(d.kept, []);
  setLayout(d, removeStructure(d.layout, uid));
  assert.deepEqual(keptGroups(d, "wizardTower"), [{ path: "rime", rank: 2, count: 1 }]);
  assert.deepEqual([available(d, "wizardTower"), plainAvailable(d, "wizardTower")], [1, 0]);
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.defend.kept, d.kept, "kept copies survive saves");
  setLayout(d, placeStructure(d.layout, "wizardTower", l0.keep.tx, l0.keep.ty - 3, { path: "rime", rank: 2 })!);
  const again = uids(s, "wizardTower").find(u => u !== uids(s, "wizardTower")[0] || true)!;
  assert.ok(d.layout.structures.some(st => st.kind === "wizardTower" && st.path === "rime" && st.rank === 2));
  assert.ok(again);
  assert.deepEqual(d.kept, [], "placed again, it no longer waits");
  // Never more kept than wait in the palette.
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.kept = [{ kind: "wizardTower", path: "rime", rank: 2 }, { kind: "wizardTower", path: "pyromancy", rank: 9 }, { kind: "barracks", path: "rime", rank: 1 }];
  assert.deepEqual(decode(JSON.stringify(raw)).defend.kept, [], "nothing waits in the palette, and the rest is malformed");
});

test("wall spikes climb a path per row, keep it as they move, and keep it waiting in the palette", () => {
  const s = defaults(); s.settings.devMode = true; s.defend.owned.wallSpikes = 2;
  const d = s.defend, l = d.layout, north = { tx: l.keep.tx, ty: l.keep.ty, side: "n" as const }, west = { ...north, side: "w" as const };
  d.layout = placeSpikes(placeSpikes(l, north)!, west)!;
  assert.ok(upgradeBuilding(s, { spikes: north }, { type: "path", path: "blastStakes", rank: 1, cost: 0 }).ok);
  assert.ok(upgradeBuilding(s, { spikes: west }, { type: "path", path: "rimeStakes", rank: 1, cost: 0 }).ok);
  assert.equal(upgradeBuilding(s, { spikes: west }, { type: "path", path: "fortified", rank: 1, cost: 0 }).ok, false);
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(placedBattlePaths(loaded).spikePaths, { [spikeKey(north)]: { spikes: { path: "blastStakes", rank: 1 } }, [spikeKey(west)]: { spikes: { path: "rimeStakes", rank: 1 } } });
  const east = { ...north, side: "e" as const };
  setLayout(d, moveSpikes(d.layout, north, east)!);
  assert.equal(specialtyOf(d.layout, { spikes: east })?.path, "blastStakes", "moving keeps it");
  setLayout(d, removeSpikes(d.layout, east));
  assert.deepEqual(d.kept, [{ kind: "wallSpikes", path: "blastStakes", rank: 1 }]);
  setLayout(d, placeSpikes(d.layout, east)!);
  assert.equal(specialtyOf(d.layout, { spikes: east }), undefined, "a plain row placed");
});

test("upgrades are snapshotted at battle start", () => {
  const s = fixture("wizardTower", 1), [uid] = uids(s, "wizardTower");
  wear(s, uid, "rime", 1);
  const sim = simulation(s);
  wear(s, uid, "rime", 2); s.training.towerDamage = 2;
  assert.equal(sim.bonuses.structurePaths![uid].wizardTower!.rank, 1);
  assert.equal(bonuses(s).structurePaths![uid].wizardTower!.rank, 2); assert.equal(sim.bonuses.towerDamage, 1);
});

// ── Older saves ────────────────────────────────────────────────────────
test("version 4: buildings keep the path they wore at its researched rank; unworn research is refunded", () => {
  const s = fixture("wizardTower", 2); s.settings.devMode = false; s.defend.owned.wizardTower = 3;
  const [a] = uids(s, "wizardTower"), raw: any = JSON.parse(JSON.stringify(s));
  raw.version = 4; raw.knowledge = 100;
  raw.pathResearch = {
    pyromancy: { rank: 2, spent: 4008 }, // worn by a tower: kept on it at II
    rime: { rank: 1, spent: 4 }, // worn by nobody: refunded
    storm: { rank: 3, spent: 175015, crowned: true }, // crown with keeps owned: its crown stays spent
    starfall: { rank: 1, spent: 6 }, // a spell: still researched
  };
  raw.defend.owned.darkKeep = 1;
  raw.defend.layout.structures[0].path = "pyromancy";
  raw.researchJob = { kind: "path", id: "crusaders", rank: 0, left: 1000, paid: 4 };
  const loaded = decode(JSON.stringify(raw));
  assert.equal(loaded.version, 5);
  assert.deepEqual(specialtyOf(loaded.defend.layout, { uid: a }), { path: "pyromancy", rank: 2 });
  assert.equal(loaded.defend.layout.structures[1].path, undefined);
  assert.deepEqual(Object.keys(loaded.pathResearch), ["starfall"]);
  assert.equal(loaded.knowledge, 100 + 4 + (175015 - 150000) + 4, "rime, storm's ranks and the research in progress");
  assert.equal(loaded.researchJob, null);
  assert.deepEqual(loaded.defend.owned.darkKeep, 1, "evolved buildings stay");
  const again = decode(JSON.stringify(loaded));
  assert.equal(again.knowledge, loaded.knowledge, "migrates once");
  assert.deepEqual(again.defend.layout, loaded.defend.layout);
});

test("version 3 cards and version 2 topic paths still reach the buildings standing in the city", () => {
  const s = fixture("wizardTower", 2); s.defend.owned.wizardTower = 3;
  const raw: any = JSON.parse(JSON.stringify(s));
  delete raw.pathResearch; raw.version = 2;
  raw.paths = { wizardTower: { path: "rime", rank: 2, spent: 4008 } };
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => [st.path, st.rank]), [["rime", 2], ["rime", 2]]);
  assert.equal(available(loaded.defend, "wizardTower"), 1);
  const v3: any = JSON.parse(JSON.stringify(s)), [a] = uids(s, "wizardTower");
  v3.version = 3; v3.pathResearch = { pyromancy: { rank: 1, spent: 4 } };
  v3.defend.cards = [{ id: 1, kind: "wizardTower", path: "pyromancy", rank: 1, placement: `structure:${a}` }, { id: 2, kind: "wizardTower", path: "rime", rank: 1 }];
  const three = decode(JSON.stringify(v3));
  assert.deepEqual(specialtyOf(three.defend.layout, { uid: a }), { path: "pyromancy", rank: 1 });
  assert.equal((three.defend as any).cards, undefined);
});

test("malformed paths and ranks are dropped from the saved city", () => {
  const s = fixture("wizardTower", 2);
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.layout.structures[0].path = "assassins"; raw.defend.layout.structures[0].rank = 1;
  raw.defend.layout.structures[1].path = "rime"; raw.defend.layout.structures[1].rank = 7;
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), [undefined, undefined]);
  assert.equal(loaded.defend.layout.structures.length, 2, "the buildings stand");
});

// ── The guilds' troops ──────────────────────────────────────────────────
test("the guilds train brawlers and stone throwers; their branches snipers and explosive musketmen", () => {
  for (const [kind, troop, def] of [["meleeGuild", "brawler", BRAWLER], ["rangedGuild", "slinger", SLINGER], ["sniperLodge", "sniper", SNIPER], ["musketHall", "musketeer", MUSKETEER]] as const) {
    const s = fixture(kind, 1), sim = simulation(s);
    new Barracks().step(sim, 0.01);
    assert.equal(sim.soldiers.length, 1, kind);
    assert.deepEqual([sim.soldiers[0].kind, sim.soldiers[0].maxHp, sim.soldiers[0].damage], [troop, def.hp, def.damage], kind);
  }
});

test("brawlers punch in reach; stone throwers, snipers and musketmen shoot their own shots", () => {
  const m = fixture("meleeGuild", 1), sim = simulation(m);
  new Barracks().step(sim, 0.01);
  const brawler = sim.soldiers[0], e = enemy(sim, brawler.x + 0.5, brawler.y);
  brawler.target = e.id; brawler.cd = 0;
  stepSwordsman(sim, brawler, 0.01);
  assert.equal(e.maxHp - e.hp, BRAWLER.damage);
  assert.equal(brawler.cd, BRAWLER.cooldown);
  for (const [kind, shot, reach] of [["rangedGuild", "stone", SLINGER.range], ["sniperLodge", "bullet", SNIPER.range]] as const) {
    const s = fixture(kind, 1), r = simulation(s);
    new Barracks().step(r, 0.01);
    const u = r.soldiers[0];
    const far = enemy(r, u.x + reach + 1, u.y);
    stepArcher(r, u, 0.01);
    assert.equal(r.arrows.length, 0, `${kind}: out of reach`);
    r.enemies = []; enemy(r, u.x + reach - 0.5, u.y); u.cd = 0;
    stepArcher(r, u, 0.01);
    assert.equal(r.arrows[0]?.shot, shot, kind);
    assert.ok(far);
  }
  const g = fixture("musketHall", 1), gs = simulation(g);
  new Barracks().step(gs, 0.01);
  const u = gs.soldiers[0], a = enemy(gs, u.x + 2, u.y), b = enemy(gs, u.x + 2.4, u.y);
  stepArcher(gs, u, 0.01);
  assert.equal(gs.arrows[0].blast, MUSKETEER.blast);
  for (let i = 0; i < 30; i++) stepArrows(gs, 1 / 30);
  assert.ok(a.hp < a.maxHp && b.hp < b.maxHp, "the ball bursts over both");
  assert.ok(u.hp === u.maxHp, "never hurting its own");
});

// ── Paths in battle ─────────────────────────────────────────────────────
test("three Wizard towers cast Fire, Ice and Storm together, beside a plain one, from a persisted save", () => {
  const s = fixture("wizardTower", 4), [a, b, c] = uids(s, "wizardTower");
  wear(s, a, "pyromancy"); wear(s, b, "rime"); wear(s, c, "storm");
  const loaded = decode(JSON.stringify(s));
  assert.deepEqual(loaded.defend.layout.structures.map(st => st.path), ["pyromancy", "rime", "storm", undefined]);
  const sim = simulation(loaded), w = new Wizards();
  for (const b of sim.map.buildings.filter(b => b.kind === "wizardTower")) { const at = center(b.rect); enemy(sim, at.x, at.y - 2); }
  w.step(sim, 0.01);
  assert.equal(sim.flames.length, 2, "Pyromancy's flame and the plain tower's"); assert.equal(sim.frosts.length, 1); assert.ok(sim.bolts.length > 0);
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

test("Fire arrows and Sharpshooters on separate towers keep their own projectiles", () => {
  const s = fixture("archerTower", 2), [a, b2] = uids(s, "archerTower");
  wear(s, a, "fireArrows"); wear(s, b2, "sharpshooters");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "archerTower");
  for (const tower of b) { const at = center(tower.rect); enemy(sim, at.x, at.y - 2); }
  new Towers().step(sim, 0.01);
  const fire = sim.arrows.filter(a => a.origin?.building === b[0].id), sharp = sim.arrows.filter(a => a.origin?.building === b[1].id);
  assert.ok(fire.every(a => a.burn)); assert.equal(sharp.length, 1); assert.equal(sharp[0].burn, undefined);
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
});

test("oil-soaked bait and fortified bait retain separate hit reactions and health", () => {
  const s = fixture("monsterBait", 2), [first, second] = uids(s, "monsterBait");
  wear(s, first, "oilSoaked"); wear(s, second, "fortified");
  const sim = simulation(s), b = sim.map.buildings.filter(b => b.kind === "monsterBait");
  const a = enemy(sim, 1, 1), other = enemy(sim, 2, 1);
  baitBitten(sim, a, 5, b[0]); baitBitten(sim, other, 5, b[1]);
  assert.ok(a.burn); assert.equal(other.burn, undefined);
  assert.ok(sim.maxHp[b[1].id] > sim.maxHp[b[0].id]);
});

test("spells are still researched once in the Study", () => {
  const s = defaults(); s.knowledge = 1e6;
  assert.ok(learnPath(s, "starfall"));
  assert.equal(learnPath(s, "pyromancy"), false);
});
