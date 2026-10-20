// The Revolutionary (src/defend/revolutionary.ts, src/revolutionary-upgrades.ts):
// a Sniper lodge becomes one; its shared branches climb side by side: the
// squad, the chain laser, critical chance and damage, and the burst at the
// last enemy; and the lasers it and every sniper draw.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { allocated, buildingTree, nextSteps, stepName, upgradeBuilding } from "../src/specializations.ts";
import { CHAIN, CRIT_DAMAGE, DETONATOR, REVOLUTIONARY_PATHS, SQUAD, decodeRevolutionaryRanks, respecRevolutionary, undoRevolutionary, upgradeRevolutionary, type RevolutionaryPathId } from "../src/revolutionary-upgrades.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepArcher } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { RAIL_SNIPER } from "../src/defend/catalog.ts";
import { chainTargets, squadSize } from "../src/defend/revolutionary.ts";
import { sniperAim } from "../src/defend/snipers.ts";
import { decodeDefendSave } from "../src/defend/progress.ts";
import { REVOLUTIONARY_UI, graftedGraph, revolutionaryStats } from "../src/ui/specialty.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { tileMarks } from "../src/tiles.ts";

type S = ReturnType<typeof defaults>;

/** A Revolutionary beside the keep, with its shared branches at `ranks`. */
function revolutionary(ranks: Partial<Record<RevolutionaryPathId, number>> = {}) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e7;
  s.defend.owned.revolutionary = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "revolutionary", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  for (const [id, n] of Object.entries(ranks)) for (let r = 0; r < n!; r++) assert.ok(upgradeRevolutionary(s, id as RevolutionaryPathId).ok);
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  const b = new Barracks();
  for (let i = 0; i < 400; i++) b.step(sim, 0.5);
  const m = sim.soldiers.find((u) => u.kind === "railSniper") ?? assert.fail("a laser sniper");
  return { sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One shot from `m`, flown home through its whole chain. */
function fire(sim: DefendSim, m: Soldier) {
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  for (let i = 0; i < 300 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
}
/** A file of enemies east of `m`, each `gap` cells further. */
const file = (sim: DefendSim, m: Soldier, n: number, gap = 1.5) => Array.from({ length: n }, (_, i) => enemy(sim, m.x + 2 + i * gap, m.y));

// ── The tree ───────────────────────────────────────────────────────────
test("a plain Sniper lodge becomes the Revolutionary, the gunner line's ultimate", () => {
  assert.equal(stepName(nextSteps("sniperLodge")[0]), "Revolutionary");
  const s = defaults(); s.settings.devMode = true;
  s.defend.owned.sniperLodge = 1;
  assert.ok(upgradeBuilding(s, { copy: "sniperLodge" }, nextSteps("sniperLodge")[0]).ok);
  assert.equal(s.defend.owned.revolutionary, 1);
  assert.equal(allocated("revolutionary") - allocated("sniperLodge"), 100000);
  assert.deepEqual(buildingTree("revolutionary").map((n) => n.id).slice(-2), ["k:sniperLodge", "k:revolutionary"]);
});

test("its five shared branches climb side by side, grafted onto its node, and undo and respec for free", () => {
  assert.deepEqual(REVOLUTIONARY_PATHS.map((p) => [p.id, p.ranks.length]), [["squad", 2], ["chain", 3], ["critChance", 4], ["critDamage", 5], ["splash", 3]]);
  const s = revolutionary({ squad: 2, chain: 1, critDamage: 5 });
  assert.deepEqual(s.defend.revolutionaryRanks, { squad: 2, chain: 1, critDamage: 5 });
  const g = graftedGraph(s, "revolutionary");
  assert.equal(g.filter((n) => n.id === "k:revolutionary").length, 1, "one root: the building's own node");
  assert.equal(g.find((n) => n.id === "q:squad:1")!.parent, "k:revolutionary");
  assert.equal(g.find((n) => n.id === "q:chain:2")!.state, "next");
  assert.equal(REVOLUTIONARY_UI.step(s, "q:critChance:1"), "critChance");
  assert.match(REVOLUTIONARY_UI.card(s, "q:chain:3"), /strikes 7 enemies/);
  s.settings.devMode = false;
  const before = s.knowledge;
  assert.ok(undoRevolutionary(s, "squad", 1).ok);
  assert.equal(s.defend.revolutionaryRanks!.squad, undefined);
  assert.ok(s.knowledge > before);
  assert.ok(respecRevolutionary(s).ok);
  assert.equal(s.defend.revolutionaryRanks, undefined);
  assert.deepEqual(decodeRevolutionaryRanks({ squad: 2, chain: 9, bogus: 1 }), { squad: 2 });
  const saved = { ...revolutionary({ splash: 2 }).defend };
  assert.deepEqual(decodeDefendSave(JSON.parse(JSON.stringify(saved))).revolutionaryRanks, { splash: 2 });
  assert.equal(tileMarks(revolutionary({ chain: 2 }), "revolutionary").filter((m) => m.type === "rank" && m.name === "Chain laser").length, 2);
  assert.match(revolutionaryStats(s, { critChance: 4, critDamage: 2 }), /10% critical chance for 10x/);
});

test("its building art stands apart from the lodge's", () => {
  assert.notEqual(structurePixels("revolutionary", 4, 4, 0, 1).join(), structurePixels("sniperLodge", 4, 4, 0, 1).join());
});

// ── In battle ──────────────────────────────────────────────────────────
test("the squad keeps one, two, then three laser snipers", () => {
  for (const squad of [0, 1, 2]) {
    const { sim } = battle(revolutionary({ squad }));
    assert.equal(squadSize(sim), SQUAD.snipers[squad]);
    assert.equal(sim.soldiers.filter((u) => u.kind === "railSniper").length, SQUAD.snipers[squad]);
  }
});

test("a plain laser sniper's bullet strikes once, for its damage", () => {
  const { sim, m } = battle(revolutionary());
  const es = file(sim, m, 3);
  fire(sim, m);
  assert.equal(es[0].maxHp - es[0].hp, m.damage);
  assert.equal(es[1].hp, es[1].maxHp);
  assert.ok(m.damage >= RAIL_SNIPER.damage * 0.99);
});

test("the chain laser's bullet zigzags on through 3, 5, then 7 enemies, in the order the laser shows", () => {
  for (const chain of [1, 2, 3]) {
    const { sim, m } = battle(revolutionary({ chain }));
    const es = file(sim, m, 9);
    const shown = chainTargets(sim, sniperAim(sim, m)!).map((e) => e.id);
    assert.equal(shown.length, CHAIN.hits[chain]);
    fire(sim, m);
    const struck = es.filter((e) => e.hp < e.maxHp).map((e) => e.id);
    assert.deepEqual(struck, shown, `rank ${chain}`);
  }
  // Too far to leap: the chain stops short.
  const { sim, m } = battle(revolutionary({ chain: 3 }));
  const es = file(sim, m, 3, CHAIN.jump + 1);
  fire(sim, m);
  assert.equal(es.filter((e) => e.hp < e.maxHp).length, 1);
});

test("critical hits come at Overclock's chance, for Hollow core's multiple", () => {
  const { sim, m } = battle(revolutionary({ critChance: 4, critDamage: 5 }));
  let crits = 0, hits = 0;
  for (let i = 0; i < 400; i++) {
    const e = enemy(sim, m.x + 3, m.y);
    fire(sim, m);
    const taken = e.maxHp - e.hp;
    hits++;
    if (taken > m.damage * 1.5) { crits++; assert.ok(Math.abs(taken - m.damage * CRIT_DAMAGE.times[5]) < 1e-6); }
    sim.enemies = sim.enemies.filter((o) => o !== e);
  }
  assert.ok(crits > hits * 0.04 && crits < hits * 0.18, `${crits} of ${hits} critical`);
  // No chance bought: never critical, and nothing rolled.
  const plain = battle(revolutionary({ critDamage: 5 }));
  const e = enemy(plain.sim, plain.m.x + 3, plain.m.y);
  const rand = plain.sim.rand;
  plain.sim.rand = () => assert.fail("no roll without a chance");
  fire(plain.sim, plain.m);
  plain.sim.rand = rand;
  assert.equal(e.maxHp - e.hp, plain.m.damage);
});

test("Detonator bursts round the last enemy only, sparing your own people", () => {
  for (const splash of [1, 2, 3]) {
    const { sim, m } = battle(revolutionary({ chain: 1, splash }));
    const es = file(sim, m, 3, 2.2);
    const beside = enemy(sim, es[2].x, es[2].y + DETONATOR.radius[splash] - 0.3);
    const far = enemy(sim, es[2].x, es[2].y + DETONATOR.radius[splash] + 1);
    const hp = m.hp;
    fire(sim, m);
    assert.ok(beside.hp < beside.maxHp, `rank ${splash}: the burst reaches`);
    assert.equal(far.hp, far.maxHp);
    assert.ok(es[2].maxHp - es[2].hp > m.damage, "the last takes the hit and the burst");
    assert.equal(es[0].maxHp - es[0].hp, m.damage, "the first only the hit");
    assert.equal(m.hp, hp);
  }
});
