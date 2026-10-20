// The Assassins' den (src/defend/assassins.ts): a Melee Guild upgraded with
// Knowledge into a den of quick, frail assassins, and its four paths:
// Bloodletters' huge criticals, Shadowcloak's cloak and ambush, Venomblades'
// poison that makes an enemy take more from everything, and Headhunters
// going for the toughest prey. Also the retired Barracks Assassins path,
// whose Knowledge comes back on load.
import { CELLS_H, CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { buildingTree, nextSteps, specialtyOf, stepName, upgradeBuilding, rootOf, allocated, type UpgradeStep } from "../src/specializations.ts";
import { BLOODLETTERS, HEADHUNT, SHADOWCLOAK, VENOM, pathById, type PathId } from "../src/knowledge-paths.ts";
import { studyPathCost } from "../src/economy.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepSwordsman } from "../src/defend/troops.ts";
import { ASSASSIN_UNIT, type PaletteItem } from "../src/defend/catalog.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";

type S = ReturnType<typeof defaults>;

/** A save with `count` of `kind` standing beside the keep, Knowledge to spare. */
function fixture(kind: PaletteItem, count = 1) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned[kind] = count;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  for (let i = 0; i < count; i++) {
    const [dx, dy] = [[0, -1], [-1, 0], [1, 0]][i];
    l = placeStructure(l, kind as never, l.keep.tx + dx, l.keep.ty + dy) ?? assert.fail("placement");
  }
  s.defend.layout = l;
  return s;
}
const uids = (s: S, kind: PaletteItem) => s.defend.layout.structures.filter((st) => st.kind === kind).map((st) => st.uid);
/** A den of assassins on `path` at `rank` (plain without one). */
function den(path?: PathId, rank = 3) {
  const s = fixture("meleeGuild");
  const uid = uids(s, "meleeGuild")[0];
  assert.ok(upgradeBuilding(s, { uid }, { type: "become", to: "assassinDen", cost: 0 }).ok);
  for (let r = 0; path && r < rank; r++) {
    const step = nextSteps("assassinDen", specialtyOf(s.defend.layout, { uid })).find((st) => st.type === "path" && st.path === path)!;
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  const a = sim.soldiers.find((u) => u.kind === "assassin") ?? assert.fail("an assassin");
  return { sim, a };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** `n` strikes on `e`, each the damage it did. */
function strikes(sim: DefendSim, a: Soldier, e: Enemy, n: number, between = 0) {
  const hits: number[] = [];
  a.target = e.id;
  for (let k = 0; k < n; k++) {
    const hp = e.hp;
    a.cd = 0;
    stepSwordsman(sim, a, 1 / 30);
    hits.push(Number((hp - e.hp).toFixed(6)));
    if (between) stepSwordsman(sim, a, between);
  }
  return hits;
}

// ── The tree ───────────────────────────────────────────────────────────
test("a Melee Guild becomes a barracks, an assassins' den or a spearmen hall; the den has four paths", () => {
  assert.deepEqual(nextSteps("meleeGuild").map(stepName), ["Barracks", "Assassins' den", "Spearmen hall"]);
  assert.deepEqual(nextSteps("assassinDen").map(stepName), ["Bloodletters I", "Shadowcloak I", "Venomblades I", "Headhunters I"]);
  assert.deepEqual(nextSteps("barracks").map(stepName), ["Crusaders I", "Berserkers I", "Halberdiers I"], "the barracks' old Assassins path is retired");
  assert.equal(rootOf("assassinDen"), "meleeGuild");
  const tree = buildingTree("meleeGuild").map((n) => `${n.id}=${n.state}`);
  assert.deepEqual(tree, ["k:meleeGuild=owned", "k:barracks=next", "k:assassinDen=next", "k:spearHall=next"]);
  const climbed = buildingTree("assassinDen", { path: "venom", rank: 1 });
  assert.deepEqual(climbed.map((n) => n.id), ["k:meleeGuild", "k:assassinDen", "p:venom:1", "p:venom:2", "p:venom:3"]);
  assert.equal(climbed.find((n) => n.id === "k:assassinDen")!.closed!.length, 3, "the other three paths are closed off");
  assert.equal(allocated("assassinDen", { path: "venom", rank: 2 }), 6 + studyPathCost(4, 0) + studyPathCost(4, 1));
});

test("upgrading pays Knowledge, and the den trains assassins", () => {
  const s = fixture("meleeGuild");
  s.settings.devMode = false; s.knowledge = 6;
  const uid = uids(s, "meleeGuild")[0];
  const step: UpgradeStep = { type: "become", to: "assassinDen", cost: 0 };
  const done = upgradeBuilding(s, { uid }, step);
  assert.ok(done.ok);
  assert.equal(s.knowledge, 0, "at the catalog's price");
  assert.deepEqual([s.defend.owned.meleeGuild, s.defend.owned.assassinDen], [0, 1]);
  const { a } = battle(s);
  assert.deepEqual([a.maxHp, a.damage, a.cloak], [ASSASSIN_UNIT.hp, ASSASSIN_UNIT.damage, undefined]);
  assert.match(kindStats(s, "assassinDen"), /every 4th strike 2x/);
});

// ── In battle ──────────────────────────────────────────────────────────
test("a plain assassin's every 4th strike is critical", () => {
  const { sim, a } = battle(den());
  const e = enemy(sim, a.x + 0.5, a.y);
  assert.deepEqual(strikes(sim, a, e, 4), [a.damage, a.damage, a.damage, a.damage * 2]);
  assert.equal(a.cd, ASSASSIN_UNIT.cooldown);
});

test("Bloodletters trade HP for enormous criticals, more often by rank", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, a } = battle(den("bloodletters", rank));
    assert.equal(a.maxHp, ASSASSIN_UNIT.hp * BLOODLETTERS.hp[rank], `rank ${rank}`);
    const e = enemy(sim, a.x + 0.5, a.y), every = BLOODLETTERS.every[rank];
    const hits = strikes(sim, a, e, every);
    assert.deepEqual(hits, [...Array(every - 1).fill(a.damage), a.damage * BLOODLETTERS.crit[rank]], `rank ${rank}`);
  }
});

test("Shadowcloak: unseen until it strikes, ambushing from the cloak", () => {
  const { sim, a } = battle(den("shadowcloak", 1));
  assert.equal(a.cloak, 0, "recruited cloaked");
  assert.equal(sim.nearestDefender(a.x, a.y, 0.5), null, "no enemy picks it out");
  const e = enemy(sim, a.x + 0.5, a.y);
  const [ambush, next] = strikes(sim, a, e, 2);
  assert.equal(ambush, a.damage * SHADOWCLOAK.ambush[1]);
  assert.equal(next, a.damage, "unveiled after the first");
  assert.ok(a.cloak! > 0);
  assert.equal(sim.nearestDefender(a.x, a.y, 0.5), a, "seen while unveiled");
  a.target = -1; sim.enemies = [];
  for (let t = 0; t < SHADOWCLOAK.reveal[1] + 0.1; t += 1 / 30) stepSwordsman(sim, a, 1 / 30);
  assert.equal(a.cloak, 0, "it vanishes again");

  const vanish = battle(den("shadowcloak", 3));
  const weak = enemy(vanish.sim, vanish.a.x + 0.5, vanish.a.y, 1);
  strikes(vanish.sim, vanish.a, weak, 1);
  assert.ok(weak.hp <= 0);
  assert.equal(vanish.a.cloak, 0, "at III a kill cloaks it at once");
});

test("Venomblades: poisoned enemies take more damage from everything, and at III pass it on", () => {
  const { sim, a } = battle(den("venom", 2));
  const e = enemy(sim, a.x + 0.5, a.y);
  const [first] = strikes(sim, a, e, 1);
  assert.equal(first, a.damage * VENOM.more[2], "the blow itself bites harder");
  assert.deepEqual(e.venom, { t: VENOM.time[2], more: VENOM.more[2], dps: a.damage * VENOM.share });
  const hp = e.hp;
  sim.hurtEnemy(e, 10, true, "ranged");
  assert.equal(hp - e.hp, 10 * VENOM.more[2], "others' damage too");
  // The venom bites, then wears off.
  sim.enemies = [e];
  (sim as any).tick(VENOM.time[2] + 0.1);
  assert.equal(e.venom, undefined);
  assert.ok(e.hp < hp - 10 * VENOM.more[2]);

  const plague = battle(den("venom", 3));
  const dying = enemy(plague.sim, plague.a.x + 0.5, plague.a.y, 1);
  const near = enemy(plague.sim, dying.x + 1, dying.y), far = enemy(plague.sim, dying.x + 3, dying.y);
  strikes(plague.sim, plague.a, dying, 1);
  assert.ok(dying.hp <= 0);
  assert.equal(near.venom?.more, VENOM.more[3], "within reach catches it");
  assert.equal(near.venom?.spread, true, "and passes it on in turn");
  assert.equal(far.venom, undefined);
});

test("Headhunters go for the toughest prey they can reach, with a bounty of its HP", () => {
  const { sim, a } = battle(den("headhunters", 1));
  // On open street, with room east of it for both.
  const open = (x: number, y: number) => !sim.solid[cellIndex(x, y)];
  let best = Infinity;
  const ax = a.x, ay = a.y;
  for (let y = 0; y < CELLS_H; y++)
    for (let x = 0; x + 4 < CELLS_W; x++)
      if ([0, 1, 2, 3, 4].every((d) => open(x + d, y)) && Math.abs(x - ax) + Math.abs(y - ay) < best)
        (best = Math.abs(x - ax) + Math.abs(y - ay)), (a.x = x + 0.5), (a.y = y + 0.5);
  const close = enemy(sim, a.x + 1, a.y, 50), tough = enemy(sim, a.x + 3, a.y, 500);
  a.target = -1; a.thinkT = 0;
  stepSwordsman(sim, a, 1 / 30);
  assert.equal(a.target, tough.id, "not the nearest");
  assert.ok(close);
  const [hit] = strikes(sim, a, enemy(sim, a.x + 0.5, a.y, 1000), 1);
  assert.equal(hit, a.damage + 1000 * HEADHUNT.bounty[1]);
  const [capped] = strikes(sim, a, enemy(sim, a.x + 0.5, a.y, 1e9), 1);
  assert.equal(capped, a.damage + a.damage * HEADHUNT.cap, "the bounty is capped");
});

test("each path has its own look on the board", () => {
  assert.deepEqual(PATH_LOOKS.assassinDen, ["bloodletters", "shadowcloak", "venom", "headhunters"]);
  const art = ["", ...PATH_LOOKS.assassinDen!].map((look) => structurePixels("assassinDen", 3, 3, 0, 1, look).join());
  assert.equal(new Set(art).size, art.length);
  for (const p of ["bloodletters", "shadowcloak", "venom", "headhunters"] as const) assert.equal(pathById(p).topic, "assassinDen");
});

// ── The retired Barracks Assassins path ──────────────────────────────────
test("a barracks that wore the old Assassins path stands plain with its Knowledge back", () => {
  const s = fixture("barracks", 2);
  s.knowledge = 0;
  const raw: any = JSON.parse(JSON.stringify(s));
  raw.defend.layout.structures[0].path = "assassins"; raw.defend.layout.structures[0].rank = 2;
  raw.defend.kept = [{ kind: "barracks", path: "assassins", rank: 1 }];
  const loaded = decode(JSON.stringify(raw));
  assert.deepEqual(loaded.defend.layout.structures.map((st) => [st.kind, st.path]), [["barracks", undefined], ["barracks", undefined]]);
  assert.deepEqual(loaded.defend.kept, []);
  assert.equal(loaded.knowledge, studyPathCost(4, 0) * 2 + studyPathCost(4, 1));
  // Loaded again, nothing more comes back.
  assert.equal(decode(JSON.stringify(loaded)).knowledge, loaded.knowledge);
});
