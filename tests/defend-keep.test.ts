// The keep as a placeable city tile (layout.ts's `moveKeep`) and its own
// upgrade tree (src/keep-upgrades.ts): branches climbed side by side with
// Knowledge, respecced for Copper, saved, and fought with in battle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { cityTileSet, defaultLayout, fitLayout, moveKeep, placeCityTile, placeGate, placeStructure } from "../src/defend/layout.ts";
import { CELLS_W, SUB, tileKey } from "../src/defend/grid.ts";
import { legalLayouts } from "../src/defend/drag-rules.ts";
import { EditSession } from "../src/defend/edit-session.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy } from "../src/defend/sim.ts";
import { Towers } from "../src/defend/towers.ts";
import { center } from "../src/defend/pathing.ts";
import { bonuses } from "../src/progression.ts";
import { reachOf } from "../src/defend/inspect.ts";
import { ARROW_LOOPS, BASTIONS, BOILING_OIL, KEEP_PATHS, keepAllocated, respecKeep, undoKeep, upgradeKeep } from "../src/keep-upgrades.ts";
import { keepCardHtml, keepGraph, keepStep } from "../src/ui/specialty.ts";
import { NO_BONUSES } from "../src/defend/catalog.ts";

test("the keep carries its tile, with its wall's gates, onto open ground", () => {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  l = placeCityTile(l, tx + 1, ty)!;
  l = placeCityTile(l, tx, ty - 1)!;
  l = placeGate(l, { tx, ty, side: "w" })!;
  assert.ok(l, "a gate on the keep's own tile");
  l = placeStructure(l, "barracks", tx + 1, ty)!;
  const moved = moveKeep(l, tx - 2, ty - 2);
  assert.ok(moved, "onto open ground, apart from the rest of the city");
  assert.deepEqual(moved.keep, { tx: tx - 2, ty: ty - 2 });
  assert.deepEqual(moved.cityTiles, [tileKey(tx + 1, ty), tileKey(tx, ty - 1)], "the other tiles stay");
  assert.deepEqual(moved.structures.map((s) => [s.uid, s.tx, s.ty]), [[1, tx + 1, ty]], "the barracks on the other tile stays");
  assert.deepEqual(moved.gates, [{ tx: tx - 2, ty: ty - 2, side: "w" }], "and its gate");
  assert.ok(fitLayout(moved).ok);
  // Onto another city tile it still swaps.
  const swapped = moveKeep(l, tx, ty - 1)!;
  assert.deepEqual(swapped.keep, { tx, ty: ty - 1 });
  assert.ok(cityTileSet(swapped).has(tileKey(tx, ty)));
  assert.equal(moveKeep(l, tx, 0), null, "never onto the spawn row");
  // The drag offers open ground as well as city tiles.
  const legal = legalLayouts({ from: "keep" }, l);
  assert.ok(legal.has(tileKey(tx - 2, ty - 2)) && legal.has(tileKey(tx, ty - 1)));
});

test("a press on the keep's tile away from its buildings lifts the keep", () => {
  const l = defaultLayout();
  const map = generateCity(fitLayout(l) as never, 7);
  const { tx, ty } = l.keep;
  let at: [number, number] | null = null;
  for (let cy = ty * SUB; cy < (ty + 1) * SUB && !at; cy++)
    for (let cx = tx * SUB; cx < (tx + 1) * SUB && !at; cx++) if (map.owner[cy * CELLS_W + cx] < 0) at = [cx, cy];
  assert.ok(at, "open ground on the keep's tile");
  assert.deepEqual(EditSession.lift(map, l, at[0], at[1])?.drag, { from: "keep" });
});

test("the keep's branches are climbed side by side, paid in Knowledge, and respecced", () => {
  const s = defaults();
  s.knowledge = 1e6;
  assert.equal(keepAllocated(s.defend.keepRanks), 0);
  for (const p of KEEP_PATHS) assert.ok(upgradeKeep(s, p.id).ok, p.id);
  assert.ok(upgradeKeep(s, "bastions").ok);
  assert.deepEqual(s.defend.keepRanks, { bastions: 2, arrowLoops: 1, boilingOil: 1 }, "every branch at once");
  const spent = KEEP_PATHS.reduce((n, p) => n + p.ranks[0].cost, 0) + KEEP_PATHS[0].ranks[1].cost;
  assert.equal(s.knowledge, 1e6 - spent);
  assert.equal(keepAllocated(s.defend.keepRanks), spent);
  assert.ok(upgradeKeep(s, "bastions").ok);
  assert.equal(upgradeKeep(s, "bastions").ok, false, "three ranks a branch");
  // Too little Knowledge.
  const poor = defaults();
  poor.knowledge = 0;
  assert.deepEqual(upgradeKeep(poor, "arrowLoops"), { ok: false, reason: `Needs ${KEEP_PATHS[1].ranks[0].cost} Knowledge.` });
  // Undoing a rank takes it and those above it back, free.
  const ranks = { ...s.defend.keepRanks }, k0 = s.knowledge;
  assert.ok(undoKeep(s, "bastions", 2).ok);
  assert.equal(s.defend.keepRanks?.bastions, 1);
  assert.equal(s.knowledge, k0 + KEEP_PATHS[0].ranks[1].cost + KEEP_PATHS[0].ranks[2].cost);
  assert.equal(undoKeep(s, "bastions", 2).ok, false, "nothing there to undo");
  assert.ok(undoKeep(s, "bastions", 1).ok);
  assert.equal(s.defend.keepRanks?.bastions, undefined, "the branch is gone");
  s.defend.keepRanks = ranks;
  s.knowledge = k0;
  // A respec is free and gives every point back.
  s.smithy.copper = 0;
  const before = s.knowledge, all = keepAllocated(s.defend.keepRanks);
  assert.ok(respecKeep(s).ok);
  assert.equal(s.knowledge, before + all);
  assert.equal(s.defend.keepRanks, undefined);
  assert.equal(respecKeep(s).ok, false, "nothing left to respec");
});

test("the keep's ranks survive a save, and only well formed ones", () => {
  const s = defaults();
  s.defend.keepRanks = { bastions: 3, boilingOil: 1 };
  const back = decode(JSON.stringify(s));
  assert.deepEqual(back.defend.keepRanks, { bastions: 3, boilingOil: 1 });
  const raw = JSON.parse(JSON.stringify(s));
  raw.defend.keepRanks = { bastions: 9, arrowLoops: 1.5, moat: 2 };
  assert.equal(decode(JSON.stringify(raw)).defend.keepRanks, undefined);
  assert.equal(decode(JSON.stringify(defaults())).defend.keepRanks, undefined, "absent while it has none");
});

test("the tree shows each branch from the keep, and buys only the next rank", () => {
  const ranks = { arrowLoops: 1 };
  const g = keepGraph(ranks);
  assert.equal(g.length, 1 + KEEP_PATHS.length * 3);
  assert.equal(g.find((n) => n.id === "q:arrowLoops:1")!.state, "owned");
  assert.equal(g.find((n) => n.id === "q:arrowLoops:2")!.state, "next");
  assert.equal(g.find((n) => n.id === "q:bastions:1")!.parent, "k:keep");
  assert.equal(g.find((n) => n.id === "q:bastions:2")!.state, "locked");
  assert.equal(keepStep(ranks, "q:arrowLoops:2"), "arrowLoops");
  assert.equal(keepStep(ranks, "q:arrowLoops:3"), undefined);
  assert.equal(keepStep(ranks, "q:bastions:1"), "bastions");
  const s = defaults();
  s.knowledge = 1e6;
  assert.match(keepCardHtml(s, ranks, "q:arrowLoops:2"), /data-ug-buy="q:arrowLoops:2"/);
  assert.match(keepCardHtml(s, ranks, "k:keep"), /HP/);
});

/** A battle in the default city with the keep's `ranks`. */
function battle(keep?: typeof NO_BONUSES.keep) {
  const map = generateCity(fitLayout(defaultLayout()) as never, 3);
  const sim = new DefendSim(map, { ...defaults().defend.levels }, 1, { ...NO_BONUSES, ...(keep ? { keep } : {}) });
  return sim;
}
const enemyAt = (sim: DefendSim, x: number, y: number): Enemy => {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e); (sim as any).indexEnemies(); return e;
};

test("Bastions raise the keep's HP", () => {
  const plain = battle(), walled = battle({ bastions: 3 });
  assert.equal(walled.keepMaxHp(), plain.keepMaxHp() * BASTIONS.hp[3]);
});

test("arrow loops shoot from the keep; boiling oil scalds what reaches its walls", () => {
  const sim = battle({ arrowLoops: 1, boilingOil: 2 });
  const c = center(sim.keep.rect);
  const far = enemyAt(sim, c.x + 4, c.y), near = enemyAt(sim, sim.keep.rect.x + sim.keep.rect.w + 0.5, c.y);
  const hp = near.hp;
  const towers = new Towers();
  towers.step(sim, 0.05);
  assert.ok(sim.arrows.some((a) => a.origin?.building === sim.keepId), "an arrow from the keep");
  assert.ok(near.hp < hp, "the oil scalds the one at the walls");
  assert.equal(near.hp, hp - BOILING_OIL.damage[2]);
  assert.ok((near.burn ?? 0) > 0, "and leaves it burning from II");
  assert.equal(far.burn, undefined, "not the one further off");
  // In reach of the inspect circles.
  const circles = reachOf(sim.keep, sim);
  assert.equal(circles[0].r, ARROW_LOOPS.range[1]);
  // A plain keep does neither.
  const plain = battle();
  const e = enemyAt(plain, plain.keep.rect.x + plain.keep.rect.w + 0.5, center(plain.keep.rect).y), h = e.hp;
  new Towers().step(plain, 0.05);
  assert.equal(plain.arrows.length, 0);
  assert.equal(e.hp, h);
});

test("the battle snapshots the keep's ranks", () => {
  const s = defaults();
  assert.equal(bonuses(s).keep, undefined);
  s.defend.keepRanks = { boilingOil: 2 };
  assert.deepEqual(bonuses(s).keep, { boilingOil: 2 });
});
