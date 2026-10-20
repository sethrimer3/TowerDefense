// The Sniper lodge's paths (src/defend/snipers.ts): Marksmen's reach,
// toughest-first aim and headshots; Ricochet's glancing bullets; Suppressing
// fire's slowing and staggering hits and quicker reloads; Deadeye's
// clear-sight shots; Piercing rounds through a whole file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { allocated, buildingTree, nextSteps, specialtyOf, stepName, upgradeBuilding } from "../src/specializations.ts";
import { DEADEYE, MARKSMEN, PIERCING, RICOCHET, SUPPRESS, pathById, type PathId } from "../src/knowledge-paths.ts";
import { studyPathCost } from "../src/economy.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { CellType, generateCity } from "../src/defend/citygen.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { Barracks, stepArcher } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { SNIPER } from "../src/defend/catalog.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";

type S = ReturnType<typeof defaults>;

/** A Sniper lodge beside the keep climbing `path` to `rank`. */
function lodge(path?: PathId, rank = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.sniperLodge = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "sniperLodge", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  const uid = l.structures.find((st) => st.kind === "sniperLodge")!.uid;
  for (let r = 0; path && r < rank; r++) {
    const step = nextSteps("sniperLodge", specialtyOf(s.defend.layout, { uid })).find((st) => st.type === "path" && st.path === path)!;
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  const m = sim.soldiers.find((u) => u.kind === "sniper") ?? assert.fail("a sniper");
  return { sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One shot from `m`, flown home with every glance. */
function fire(sim: DefendSim, m: Soldier) {
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  for (let i = 0; i < 300 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
}

// ── The tree ───────────────────────────────────────────────────────────
test("a Sniper lodge has five paths, climbed like any building's", () => {
  assert.deepEqual(nextSteps("sniperLodge").map(stepName), ["Revolutionary", "Marksmen I", "Ricochet I", "Suppressing fire I", "Deadeye I", "Piercing rounds I"]);
  for (const p of ["marksmen", "ricochet", "suppressors", "deadeye", "piercing"] as const) assert.equal(pathById(p).topic, "sniperLodge");
  const climbed = buildingTree("sniperLodge", { path: "ricochet", rank: 1 });
  assert.deepEqual(climbed.map((n) => n.id).slice(-3), ["p:ricochet:1", "p:ricochet:2", "p:ricochet:3"]);
  assert.equal(climbed.find((n) => n.id === "k:sniperLodge")!.closed!.length, 5, "the Revolutionary and the other four paths are closed off");
  assert.equal(allocated("sniperLodge", { path: "marksmen", rank: 2 }) - allocated("sniperLodge"), studyPathCost(4, 0) + studyPathCost(4, 1));
  assert.match(kindStats(lodge(), "sniperLodge", "marksmen", 1), new RegExp(`${SNIPER.range + MARKSMEN.range} range$`));
  assert.match(kindStats(lodge(), "sniperLodge", "ricochet", 3), /glances on 4x at 80%/);
});

test("each path has its own look on the board", () => {
  assert.deepEqual(PATH_LOOKS.sniperLodge, ["marksmen", "ricochet", "suppressors", "deadeye", "piercing"]);
  const art = ["", ...PATH_LOOKS.sniperLodge!].map((look) => structurePixels("sniperLodge", 3, 3, 0, 1, look).join());
  assert.equal(new Set(art).size, art.length);
});

// ── In battle ──────────────────────────────────────────────────────────
test("a plain sniper's bullet hits once and leaves its enemy as it was", () => {
  const { sim, m } = battle(lodge());
  const e = enemy(sim, m.x + 3, m.y), other = enemy(sim, m.x + 4, m.y);
  fire(sim, m);
  assert.equal(e.maxHp - e.hp, m.damage);
  assert.equal(other.hp, other.maxHp);
  assert.equal(e.chill, undefined);
  assert.equal(m.strikes, undefined);
  assert.equal(m.cd > SNIPER.cooldown - 0.1, true);
});

test("Marksmen reach further, aim at the toughest from II and headshot every 3rd shot at III", () => {
  const far = battle(lodge("marksmen", 1));
  const e = enemy(far.sim, far.m.x + SNIPER.range + 2, far.m.y);
  fire(far.sim, far.m);
  assert.ok(e.hp < e.maxHp, "hit from beyond a plain sniper's range");

  const big = battle(lodge("marksmen", 2));
  enemy(big.sim, big.m.x + 2, big.m.y, 100);
  const tough = enemy(big.sim, big.m.x + 6, big.m.y, 5000);
  big.m.cd = 0;
  stepArcher(big.sim, big.m, 1 / 30);
  assert.equal(big.sim.arrows[0].target, tough.id);

  const head = battle(lodge("marksmen", 3));
  const t = enemy(head.sim, head.m.x + 3, head.m.y);
  const hits: number[] = [];
  for (let i = 0; i < 3; i++) { const before = t.hp; fire(head.sim, head.m); hits.push(before - t.hp); }
  assert.deepEqual(hits, [head.m.damage, head.m.damage, head.m.damage * MARKSMEN.crit]);
});

test("Ricochet bullets glance on to the nearest enemies not struck yet", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, m } = battle(lodge("ricochet", rank));
    const chain = [0, 1, 2, 3, 4, 5].map((i) => enemy(sim, m.x + 3 + i * 1.5, m.y));
    fire(sim, m);
    const struck = chain.filter((e) => e.hp < e.maxHp).length;
    assert.equal(struck, 1 + RICOCHET.bounces[rank], `rank ${rank}`);
    assert.equal(Number((chain[1].maxHp - chain[1].hp).toFixed(6)), Number((m.damage * RICOCHET.share[rank]).toFixed(6)));
  }
  // Nothing within reach: the bullet stops.
  const { sim, m } = battle(lodge("ricochet", 3));
  const lone = enemy(sim, m.x + 3, m.y), away = enemy(sim, m.x + 3 + RICOCHET.jump + 1, m.y);
  fire(sim, m);
  assert.ok(lone.hp < lone.maxHp);
  assert.equal(away.hp, away.maxHp);
});

test("Suppressing fire slows its hits, staggers them from II and reloads faster at III", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, m } = battle(lodge("suppressors", rank));
    const e = enemy(sim, m.x + 3, m.y);
    fire(sim, m);
    assert.ok(e.chill! > SUPPRESS.chill - 0.5, `rank ${rank} slows`);
    assert.equal(e.stagger !== undefined, rank >= 2, `rank ${rank} staggers`);
    assert.equal(Number(m.cd.toFixed(6)), Number((SNIPER.cooldown * (rank >= 3 ? SUPPRESS.reload : 1)).toFixed(6)), `rank ${rank} reload`);
  }
});

/** Clears the row of cells from `m` east for `n` cells to open street. */
function openRow(sim: DefendSim, m: Soldier, n: number) {
  for (let i = 0; i <= n; i++) {
    const c = cellIndex(Math.floor(m.x) + i, Math.floor(m.y));
    sim.solid[c] = 0;
    sim.map.type[c] = CellType.ROAD;
  }
}

test("Deadeye shoots only what it sees clearly, over the wall but not through a house, and hits much harder", () => {
  const { sim, m } = battle(lodge("deadeye", 3));
  m.x = Math.floor(m.x) + 0.5; m.y = Math.floor(m.y) + 0.5;
  openRow(sim, m, 8);
  // A house two cells east hides the nearest enemy; one north-east is in clear sight.
  const house = cellIndex(Math.floor(m.x) + 2, Math.floor(m.y));
  sim.solid[house] = 1; sim.map.type[house] = CellType.HOUSE;
  const hidden = enemy(sim, m.x + 3, m.y);
  for (let i = 0; i <= 4; i++) for (const dy of [1, 2]) { const c = cellIndex(Math.floor(m.x) + i, Math.floor(m.y) - dy); sim.solid[c] = 0; sim.map.type[c] = CellType.ROAD; }
  const seen = enemy(sim, m.x + 4, m.y - 2);
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows.length, 1);
  assert.equal(sim.arrows[0].target, seen.id, "the clear shot, not the nearer hidden one");
  assert.equal(sim.arrows[0].damage, m.damage * DEADEYE.damage[3]);
  // Hidden alone: it holds its fire.
  seen.hp = 0; sim.arrows.length = 0; (sim as any).indexEnemies();
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows.length, 0, "no shot through the house");
  // The low city wall doesn't hide it.
  sim.map.type[house] = CellType.WALL;
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows[0]?.target, hidden.id);
  assert.match(kindStats(lodge(), "sniperLodge", "deadeye", 3), new RegExp(`${SNIPER.range + DEADEYE.range} range · clear sight only`));
});

test("Piercing rounds fly to the end of their reach through every enemy in line, each hit softer", () => {
  const { sim, m } = battle(lodge("piercing", 3));
  const file = [3, 4.5, 6, 9].map((dx) => enemy(sim, m.x + dx, m.y));
  const aside = enemy(sim, m.x + 4, m.y + 2);
  const hp = file.map((e) => e.hp);
  fire(sim, m);
  const hit = m.damage * PIERCING.damage[3];
  file.forEach((e, i) => assert.ok(Math.abs(hp[i] - e.hp - hit) < 1e-6, `enemy ${i + 1} in line`));
  assert.equal(aside.hp, aside.maxHp, "off the line, untouched");
  // It flew its whole reach, past the last enemy, and is gone.
  assert.equal(sim.arrows.length, 0);
  const s = battle(lodge("piercing", 1));
  s.m.cd = 0;
  enemy(s.sim, s.m.x + 2, s.m.y);
  stepArcher(s.sim, s.m, 1 / 30);
  assert.equal(s.sim.arrows[0].target, -1);
  assert.ok(Math.abs(s.sim.arrows[0].tx - (s.m.x + SNIPER.range)) < 1e-9);
});
