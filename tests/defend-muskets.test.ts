// The Musket hall's paths (src/defend/muskets.ts): Grenadiers' burning
// ground, bomblets and clinging fire; Volley fire's extra balls and quicker
// reloads in ranks; Bayonets' thrust at close quarters, citywide charge and
// stagger.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { allocated, buildingTree, nextSteps, specialtyOf, stepName, upgradeBuilding } from "../src/specializations.ts";
import { BAYONET, GRENADIERS, VOLLEY, pathById, type PathId } from "../src/knowledge-paths.ts";
import { studyPathCost } from "../src/economy.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepArcher } from "../src/defend/troops.ts";
import { stepArrows } from "../src/defend/towers.ts";
import { MUSKETEER } from "../src/defend/catalog.ts";
import { cellX, cellY } from "../src/defend/grid.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";

type S = ReturnType<typeof defaults>;

/** A Ranged Guild beside the keep made a Musket hall on `path` at `rank`. */
function hall(path?: PathId, rank = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.rangedGuild = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "rangedGuild", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  const uid = l.structures.find((st) => st.kind === "rangedGuild")!.uid;
  assert.ok(upgradeBuilding(s, { uid }, { type: "become", to: "musketHall", cost: 0 }).ok);
  for (let r = 0; path && r < rank; r++) {
    const step = nextSteps("musketHall", specialtyOf(s.defend.layout, { uid })).find((st) => st.type === "path" && st.path === path)!;
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  const m = sim.soldiers.find((u) => u.kind === "musketeer") ?? assert.fail("a musketman");
  return { sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One shot from `m`, flown home. */
function fire(sim: DefendSim, m: Soldier) {
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  for (let i = 0; i < 60 && sim.arrows.length; i++) { (sim as any).indexEnemies(); stepArrows(sim, 1 / 30); }
}

// ── The tree ───────────────────────────────────────────────────────────
test("a Musket hall has three paths, climbed and respecced like any building's", () => {
  assert.deepEqual(nextSteps("musketHall").map(stepName), ["Grenadiers I", "Volley fire I", "Bayonets I"]);
  for (const p of ["grenadiers", "volleyFire", "bayonets"] as const) assert.equal(pathById(p).topic, "musketHall");
  const climbed = buildingTree("musketHall", { path: "bayonets", rank: 1 });
  assert.deepEqual(climbed.map((n) => n.id).slice(-3), ["p:bayonets:1", "p:bayonets:2", "p:bayonets:3"]);
  assert.equal(climbed.find((n) => n.id === "k:musketHall")!.closed, 2, "the other two paths are closed off");
  assert.equal(allocated("musketHall", { path: "volleyFire", rank: 2 }) - allocated("musketHall"), studyPathCost(4, 0) + studyPathCost(4, 1));
  assert.match(kindStats(hall(), "musketHall"), /bursts 0.9 cells wide$/);
  assert.match(kindStats(hall(), "musketHall", "grenadiers", 2), /4 bomblets/);
});

test("each path has its own look on the board", () => {
  assert.deepEqual(PATH_LOOKS.musketHall, ["grenadiers", "volleyFire", "bayonets"]);
  const art = ["", ...PATH_LOOKS.musketHall!].map((look) => structurePixels("musketHall", 3, 3, 0, 1, look).join());
  assert.equal(new Set(art).size, art.length);
});

// ── In battle ──────────────────────────────────────────────────────────
test("a plain musketman's ball bursts and leaves nothing behind", () => {
  const { sim, m } = battle(hall());
  const e = enemy(sim, m.x + 2, m.y), hp = e.hp;
  fire(sim, m);
  assert.ok(e.hp < hp);
  assert.equal(sim.blazes.length, 0);
  assert.equal(m.cd > MUSKETEER.cooldown - 0.1, true);
});

test("Grenadiers leave the ground burning, throw bomblets from II, and their fire clings at III", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, m } = battle(hall("grenadiers", rank));
    const e = enemy(sim, m.x + 2, m.y);
    const booms = () => sim.effects.filter((f) => f.kind === "boom").length;
    const before = booms();
    fire(sim, m);
    assert.equal(booms() - before, 1 + GRENADIERS.bomblets[rank], `rank ${rank} bursts`);
    assert.equal(sim.blazes.length, 1);
    const [b] = sim.blazes;
    assert.equal(b.life, GRENADIERS.burn[rank]);
    assert.equal(b.dps, m.damage * GRENADIERS.share);
    assert.equal(!!b.cling, rank >= 3);
    assert.ok(e);
  }
});

test("Volley fire looses extra balls at the next nearest, and reloads faster in ranks at III", () => {
  for (const rank of [1, 2]) {
    const { sim, m } = battle(hall("volleyFire", rank));
    const e = enemy(sim, m.x + 1.5, m.y);
    enemy(sim, m.x + 2, m.y + 0.5); enemy(sim, m.x + 2.5, m.y - 0.5);
    m.cd = 0;
    stepArcher(sim, m, 1 / 30);
    assert.equal(sim.arrows.length, 1 + VOLLEY.extra[rank], `rank ${rank}`);
    assert.equal(sim.arrows[0].target, e.id);
    assert.deepEqual(sim.arrows.slice(1).map((a) => a.damage), Array(VOLLEY.extra[rank]).fill(m.damage * VOLLEY.share));
  }
  const { sim, m } = battle(hall("volleyFire", 3));
  enemy(sim, m.x + 1.5, m.y);
  const comrade = (dx: number): Soldier => ({ ...m, id: sim.newId(), x: m.x + dx, path: [] });
  sim.soldiers.push(comrade(1), comrade(-1), comrade(20));
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(Number(m.cd.toFixed(6)), Number((MUSKETEER.cooldown * (1 - 2 * VOLLEY.drill)).toFixed(6)), "two comrades within reach");
});

test("Bayonets run through an enemy at close quarters, charge from II and stagger at III", () => {
  const { sim, m } = battle(hall("bayonets", 1));
  const e = enemy(sim, m.x + 0.5, m.y), hp = e.hp;
  m.cd = 0;
  stepArcher(sim, m, 1 / 30);
  assert.equal(sim.arrows.length, 0, "no shot at close quarters");
  assert.equal(hp - e.hp, m.damage * BAYONET.damage);
  assert.equal(m.cd, BAYONET.cooldown);
  assert.equal(e.stagger, undefined);

  // Charge: hunting what is in the city beyond their sights.
  const charge = battle(hall("bayonets", 2));
  const street = charge.sim.streets.map((i) => ({ x: cellX(i) + 0.5, y: cellY(i) + 0.5 })).sort((a, b) => Math.hypot(b.x - charge.m.x, b.y - charge.m.y) - Math.hypot(a.x - charge.m.x, a.y - charge.m.y))[0];
  const far = enemy(charge.sim, street.x, street.y);
  assert.ok(Math.hypot(far.x - charge.m.x, far.y - charge.m.y) > MUSKETEER.range, "out of its sights");
  charge.m.thinkT = 0;
  stepArcher(charge.sim, charge.m, 1 / 30);
  assert.equal(charge.m.target, far.id, "it charges");

  const shock = battle(hall("bayonets", 3));
  const s = enemy(shock.sim, shock.m.x + 0.5, shock.m.y);
  shock.m.cd = 0;
  stepArcher(shock.sim, shock.m, 1 / 30);
  assert.equal(s.stagger, BAYONET.stagger);

  // Plain musketmen keep shooting whatever is close.
  const plain = battle(hall());
  enemy(plain.sim, plain.m.x + 0.5, plain.m.y);
  plain.m.cd = 0;
  stepArcher(plain.sim, plain.m, 1 / 30);
  assert.equal(plain.sim.arrows.length, 1);
});
