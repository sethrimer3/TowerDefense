// The city gate in battle (src/defend/gates.ts) and its tree
// (src/gate-upgrades.ts): an open gate lets the enemy slip in until
// Portcullis bars it, murder holes, gate ballistas, mending and rising
// again; and the Smithy's gate rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { NO_BONUSES, ballistaDamage, gateHpScale, gateShut, type Bonuses } from "../src/defend/catalog.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { defaultLayout, fitLayout, gateRect, placeCityTile, placeGate, type GateSpot, type Layout } from "../src/defend/layout.ts";
import { findPath } from "../src/defend/pathing.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { gateTowerSpots, stepGates } from "../src/defend/gates.ts";
import { stepBallistaBolts } from "../src/defend/wall-defenses.ts";
import { GATE_PATHS, GATE_TOWERS, IRONBOUND, PORTCULLIS, decodeGateRanks, gateAllocated, respecGate, undoGate, upgradeGate, type GateRanks } from "../src/gate-upgrades.ts";
import { SIDE_UI, gateStats } from "../src/ui/specialty.ts";
import { tileMarks } from "../src/tiles.ts";
import { decodeDefendSave } from "../src/defend/progress.ts";

const L = (() => {
  const l = defaultLayout();
  return placeCityTile(l, l.keep.tx, l.keep.ty - 1)!;
})();
const { tx: KX, ty: KY } = L.keep;
const NORTH: GateSpot = { tx: KX, ty: KY - 1, side: "n" };
const GATED = placeGate(L, NORTH)!;
const R = gateRect(NORTH);
const map = (l: Layout) => {
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return generateCity(fit, 11);
};
const levels = (over: Partial<Levels> = {}) => ({ ...defaults().defend.levels, ...over }) as Levels;
const sim = (gate?: GateRanks, over: Partial<Levels> = {}, l = GATED) =>
  new DefendSim(map(l), levels(over), 3, { ...NO_BONUSES, ...(gate ? { gate } : {}) } as Bonuses);
const gateOf = (s: DefendSim) => s.gates[0];
function enemy(s: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: s.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  s.enemies.push(e);
  (s as any).indexEnemies();
  return e;
}
/** One of the city's people standing just inside the gate. */
const townsman = (s: DefendSim) => {
  const u = { x: R.x + 1.5, y: R.y + R.h + 0.5, hp: 10 };
  s.civilians.push(u as never);
  return u;
};
const run = (s: DefendSim, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 30) { (s as any).indexEnemies(); stepGates(s, 1 / 30); } };
const foeOpen = (s: DefendSim) => gateOf(s).cells.every((c) => s.foeSolid[c] === 0);

// ── Opening and shutting ───────────────────────────────────────────────
test("a gate opening for your people lets the enemy slip in, and shuts behind them", () => {
  const s = sim();
  const inside = { x: R.x + 1.5, y: R.y + R.h + 1.5 }, outside = { x: R.x + 1.5, y: R.y - 1.5 };
  assert.notEqual(s.foeSolid, s.solid, "the enemy walks its own mask while a gate can open");
  assert.equal(findPath(s.foeSolid, outside, inside, { maxCost: 40 }), null, "shut, it bars the enemy");
  const u = townsman(s);
  run(s, 0.1);
  assert.ok(s.gateOpen.has(gateOf(s).id) && foeOpen(s), "open to the enemy while your people pass");
  assert.ok(gateOf(s).cells.every((c) => s.solid[c] === 1), "still standing: blasts and arrows meet it as before");
  assert.ok(findPath(s.foeSolid, outside, inside, { maxCost: 40 }), "the enemy can walk in");
  // The enemy's flow field runs through the open gate.
  s.computeField();
  const open = s.field[cellIndex(Math.floor(outside.x), Math.floor(outside.y))];
  // An enemy caught in the gateway when it shuts is shoved out of it.
  const caught = enemy(s, R.x + 1.5, R.y + 0.5);
  u.hp = 0;
  run(s, gateShut(0) - 0.2);
  assert.ok(foeOpen(s), "it stays open a moment after the last has gone");
  run(s, 0.4);
  assert.ok(!s.gateOpen.size && gateOf(s).cells.every((c) => s.foeSolid[c] === 1), "shut again");
  assert.notEqual(s.map.owner[cellIndex(Math.floor(caught.x), Math.floor(caught.y))], gateOf(s).id, "shoved out of the gateway");
  s.computeField();
  assert.ok(s.field[cellIndex(Math.floor(outside.x), Math.floor(outside.y))] > open, "shut, the way in costs a battering");
});

test("Greased hinges shut the gate sooner", () => {
  assert.ok(gateShut(4) < gateShut(0));
  const s = sim(undefined, { gateHinges: 4 });
  const u = townsman(s);
  run(s, 0.1);
  u.hp = 0;
  run(s, gateShut(4) + 0.1);
  assert.ok(!s.gateOpen.size, "shut after the shorter time");
});

test("Portcullis I bars the enemy while the gate is open", () => {
  const s = sim({ portcullis: 1 });
  assert.equal(s.foeSolid, s.solid, "one mask: the enemy never passes");
  townsman(s);
  run(s, 0.5);
  assert.equal(s.gateOpen.size, 0);
  assert.ok(findPath(s.ownSolid, { x: R.x + 1.5, y: R.y + R.h + 1.5 }, { x: R.x + 1.5, y: R.y - 1.5 }, { maxCost: 40 }), "your people still go out");
});

test("a city without gates keeps one mask, so its replays don't move", () => {
  const s = sim(undefined, {}, L);
  assert.equal(s.foeSolid, s.solid);
  assert.equal(s.gates.length, 0);
});

// ── Murder holes ───────────────────────────────────────────────────────
test("murder holes drop on enemies at the gatehouse, and from III set them burning", () => {
  for (const rank of [2, 3]) {
    const s = sim({ portcullis: rank });
    const e = enemy(s, R.x + 1.5, R.y - 0.6), far = enemy(s, R.x + 1.5, R.y - 5);
    run(s, 1 / 30);
    assert.equal(e.maxHp - e.hp, PORTCULLIS.damage[rank], `rank ${rank}`);
    assert.equal(far.hp, far.maxHp, "out of reach");
    assert.equal(!!e.burn, rank >= 3);
    const after = e.hp;
    run(s, PORTCULLIS.every[rank] - 0.1);
    assert.equal(e.hp, after, "not again before it reloads");
  }
  const s = sim({ portcullis: 1 });
  const e = enemy(s, R.x + 1.5, R.y - 0.6);
  run(s, 2);
  assert.equal(e.hp, e.maxHp, "no holes at I");
});

// ── Gate towers ────────────────────────────────────────────────────────
test("gate towers put small ballistas on the gatehouse, two from II", () => {
  for (const rank of [1, 2, 3]) {
    const s = sim({ gateTowers: rank });
    const e = enemy(s, R.x + 1.5, R.y - 6);
    run(s, 1 / 30);
    const shots = rank >= GATE_TOWERS.twin ? 2 : 1;
    assert.equal(s.ballistaBolts.length, shots, `rank ${rank}`);
    assert.equal(gateTowerSpots(gateOf(s), rank >= 2).length, shots);
    for (const b of s.ballistaBolts) {
      assert.equal(b.small, true);
      assert.equal(b.pierce, GATE_TOWERS.pierce[rank]);
      assert.equal(b.damage, ballistaDamage(0) * GATE_TOWERS.share[rank]);
    }
    for (let i = 0; i < 60 && s.ballistaBolts.length; i++) { (s as any).indexEnemies(); stepBallistaBolts(s, 1 / 30); }
    assert.ok(Math.abs(e.maxHp - e.hp - shots * ballistaDamage(0) * GATE_TOWERS.share[rank]) < 1e-6, "every bolt strikes");
    assert.equal(s.ballistaAim.size, shots, "each turns on its own");
  }
  const s = sim({ gateTowers: 1 });
  enemy(s, R.x + 1.5, R.y - GATE_TOWERS.range[1] - 3);
  run(s, 1 / 30);
  assert.equal(s.ballistaBolts.length, 0, "out of reach");
});

// ── Ironbound ──────────────────────────────────────────────────────────
test("Ironbound and the Smithy's doors give the gate more HP; repairs still require workers", () => {
  const plain = sim(), iron = sim({ ironbound: 1 }, { gateStrength: 2 });
  const id = gateOf(plain).id;
  assert.ok(Math.abs(iron.maxHp[id] - plain.maxHp[id] * IRONBOUND.hp[1] * gateHpScale(2)) < 1e-3);
  const mend = sim({ ironbound: 2 });
  mend.hp[id] = mend.maxHp[id] / 2;
  run(mend, 1);
  assert.equal(mend.hp[id], mend.maxHp[id] / 2, "no passive gate repairs");
  for (const rank of [2, 3]) {
    const s = sim({ ironbound: rank });
    s.damageBuilding(id, 1e9);
    assert.ok(!s.intact(gateOf(s)));
    run(s, 30);
    assert.equal(s.intact(gateOf(s)), false, `rank ${rank} still needs repair workers`);
  }
});

// ── The tree ───────────────────────────────────────────────────────────
test("the gates' tree is bought with Knowledge, undone and respecced for free", () => {
  const s = defaults();
  s.knowledge = 0;
  assert.equal(upgradeGate(s, "portcullis").ok, false, "needs Knowledge");
  s.knowledge = 1e6;
  const before = s.knowledge;
  assert.ok(upgradeGate(s, "portcullis").ok && upgradeGate(s, "portcullis").ok && upgradeGate(s, "gateTowers").ok);
  assert.deepEqual(s.defend.gateRanks, { portcullis: 2, gateTowers: 1 });
  assert.equal(before - s.knowledge, gateAllocated(s.defend.gateRanks));
  assert.deepEqual(bonuses(s).gate, { portcullis: 2, gateTowers: 1 }, "snapshotted for the battle");
  assert.ok(undoGate(s, "portcullis", 2).ok);
  assert.deepEqual(s.defend.gateRanks, { portcullis: 1, gateTowers: 1 });
  assert.ok(respecGate(s).ok);
  assert.equal(s.defend.gateRanks, undefined);
  assert.equal(s.knowledge, before, "every point back");
  assert.equal(respecGate(s).ok, false);
  for (const p of GATE_PATHS) assert.equal(p.ranks.length, 3, p.name);
});

test("the gates' ranks save and decode, keeping only real ranks", () => {
  assert.deepEqual(decodeGateRanks({ portcullis: 3, gateTowers: 9, ironbound: 0, bogus: 2 }), { portcullis: 3 });
  assert.equal(decodeGateRanks("x"), undefined);
  const s = defaults();
  s.defend.gateRanks = { ironbound: 2 };
  assert.deepEqual(decodeDefendSave(JSON.parse(JSON.stringify(s.defend))).gateRanks, { ironbound: 2 });
  assert.deepEqual(tileMarks(s, "cityGate").map((m) => m.type === "rank" && `${m.name} ${m.rank}`), ["Ironbound 1", "Ironbound 2"]);
});

test("the gates' tree shows in Defend's panel with its numbers", () => {
  const s = defaults();
  s.knowledge = 1e6;
  const tree = SIDE_UI.gate;
  const nodes = tree.graph(s);
  assert.equal(nodes[0].id, "k:cityGate");
  assert.deepEqual(nodes.filter((n) => n.state === "next").map((n) => n.id), ["q:portcullis:1", "q:gateTowers:1", "q:ironbound:1"]);
  assert.equal(tree.step(s, "q:portcullis:1"), "portcullis");
  assert.match(gateStats(s, undefined), /enemies may slip in/);
  assert.match(gateStats(s, { portcullis: 3, gateTowers: 2, ironbound: 3 }), /can't slip in.*murder holes.*2 small ballistas.*mend gates.*rebuild fallen gates/);
  assert.match(tree.card(s, "q:gateTowers:2"), /Twin towers/);
  assert.ok(tree.buy(s, "gateTowers").ok);
  assert.equal(tree.allocated(s), gateAllocated(s.defend.gateRanks));
  assert.deepEqual(tree.undo(s, "q:gateTowers:1"), { id: "gateTowers", rank: 1 });
});
