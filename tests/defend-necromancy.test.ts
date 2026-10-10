import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { ENEMIES, NO_BONUSES, UPGRADES, type Bonuses, type EnemyKind } from "../src/defend/catalog.ts";
import { NECRO, gravesNear } from "../src/defend/necromancy.ts";
import { AMALGAM, SOUL_WEIGHT, equipSpell, learnPath, pathState, spellPath, unlearnPath } from "../src/knowledge-paths.ts";
import { bonuses, startTraining, trainingStep } from "../src/progression.ts";
import { decode, defaults } from "../src/save.ts";
import { CONSUMABLES, shopOffer, tileStack, tileTopic } from "../src/tiles.ts";
import { ledgerSubjects } from "../src/ui/ledger.ts";
import { cellAt } from "../src/defend/pathing.ts";

const LEVELS = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;

/** A small walled city, with `bonus` added to the battle's bonuses. */
function battle(bonus: Partial<Bonuses> = {}) {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail("tile");
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...LEVELS }, 1, { ...NO_BONUSES, ...bonus });
}

/** An open spot on the field, a few cells down from the top. */
function field(sim: DefendSim) {
  for (let y = 3; y < 10; y++) for (let x = 3; x < 30; x++) if (!sim.solid[cellAt(x + 0.5, y + 0.5)]) return { x: x + 0.5, y: y + 0.5 };
  return assert.fail("no open ground");
}

/** Kills `kinds` at `at` and lets the sim bury them. */
function slay(sim: DefendSim, at: { x: number; y: number }, kinds: EnemyKind[]) {
  for (const kind of kinds) {
    const e: Enemy = { id: sim.newId(), kind, x: at.x, y: at.y, hp: 0, maxHp: 1, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
    sim.enemies.push(e);
  }
  (sim as unknown as { sweepAway(): void }).sweepAway();
}

const risen = (sim: DefendSim) => sim.soldiers.filter((s) => s.risen);

test("every enemy that dies leaves a grave, which ages away", () => {
  const sim = battle(), at = field(sim);
  slay(sim, at, ["orc", "ogre", "bat"]);
  assert.equal(gravesNear(sim, at).length, 3);
  (sim as unknown as { stepUnits(dt: number): void }).stepUnits(NECRO.graveLife + 1);
  assert.equal(sim.graves.length, 0);
});

test("a plain cast raises one warrior a fallen enemy in reach, then cools down", () => {
  const sim = battle(), at = field(sim);
  slay(sim, at, ["orc", "orc", "ogre"]);
  slay(sim, { x: at.x + NECRO.radius + 3, y: at.y }, ["orc"]);
  assert.equal(sim.castNecromancy(at), 3);
  const r = risen(sim);
  assert.equal(r.length, 3);
  for (const s of r) {
    assert.equal(s.kind, "undead");
    assert.equal(s.home, -1);
    assert.equal(s.maxHp, NECRO.hp);
    assert.equal(s.damage, NECRO.damage);
  }
  assert.equal(sim.graves.length, 1, "the grave out of reach is left");
  assert.equal(sim.castNecromancy(at), -1, "cooling down");
  assert.equal(sim.necroRemaining, NECRO.cooldown);
  assert.equal(sim.raisings.length, 1);
});

test("the Smithy's rows make the risen tougher and harder hitting", () => {
  const s = defaults();
  s.settings.devMode = true;
  s.settings.instantResearch = true;
  for (let i = 0; i < 4; i++) {
    assert.ok(startTraining(s, "undeadHp", ""));
    assert.ok(startTraining(s, "undeadDamage", ""));
  }
  assert.equal(trainingStep(s, "undeadHp").now, 20);
  const b = bonuses(s);
  assert.equal(b.undeadHp, 1.2);
  assert.equal(b.undeadDamage, 1.2);
  const sim = battle({ undeadHp: b.undeadHp, undeadDamage: b.undeadDamage }), at = field(sim);
  slay(sim, at, ["orc"]);
  sim.castNecromancy(at);
  assert.equal(risen(sim)[0].maxHp, NECRO.hp * 1.2);
  assert.equal(risen(sim)[0].damage, NECRO.damage * 1.2);
});

test("risen warriors fight the nearest enemy and crumble when their time is up", () => {
  const sim = battle(), at = field(sim);
  slay(sim, at, ["orc"]);
  sim.castNecromancy(at);
  const foe: Enemy = { id: sim.newId(), kind: "orc", x: at.x + 0.6, y: at.y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(foe);
  (sim as unknown as { indexEnemies(): void }).indexEnemies();
  const s = risen(sim)[0];
  const step = (sim as unknown as { stepAttacks(dt: number): void });
  for (let i = 0; i < 30; i++) step.stepAttacks(1 / 30);
  assert.ok(foe.hp < 1e6, "it struck the orc");
  s.risen!.life = 0.01;
  step.stepAttacks(1 / 30);
  assert.ok(s.hp <= 0, "it crumbled");
  (sim as unknown as { sweepAway(): void }).sweepAway();
  assert.equal(risen(sim).length, 0);
  assert.equal(sim.stats.current.troopsLost, 0, "crumbling is no loss");
});

test("Bone archers shoot from afar; II hits harder; III looses at two", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ necromancy: { path: "boneArchers", rank } }), at = field(sim);
    slay(sim, at, ["orc"]);
    sim.castNecromancy(at);
    const s = risen(sim)[0];
    assert.equal(s.risen!.look, "archer");
    assert.ok(s.risen!.range >= 4);
    assert.equal(s.damage, NECRO.damage * (rank >= 2 ? 1.5 : 1));
    for (const dx of [3, 3.4]) {
      sim.enemies.push({ id: sim.newId(), kind: "orc", x: at.x + dx, y: at.y, hp: 1e6, maxHp: 1e6, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 });
    }
    (sim as unknown as { indexEnemies(): void }).indexEnemies();
    (sim as unknown as { stepAttacks(dt: number): void }).stepAttacks(1 / 30);
    assert.equal(sim.arrows.length, rank >= 3 ? 2 : 1, `rank ${rank}`);
  }
});

test("Soul weighing raises each as strong as the enemy it was, within its caps", () => {
  const sim = battle({ necromancy: { path: "soulWeighing", rank: 1 } }), at = field(sim);
  slay(sim, at, ["bat", "orc", "slagGolem"]);
  sim.castNecromancy(at);
  const hp = risen(sim).map((s) => s.maxHp);
  const k = (kind: EnemyKind) => Math.min(SOUL_WEIGHT.cap[1], Math.max(SOUL_WEIGHT.floor, ENEMIES[kind].cost / NECRO.difficulty));
  assert.deepEqual(hp, [NECRO.hp * k("bat"), NECRO.hp * k("orc"), NECRO.hp * k("slagGolem")]);
  assert.ok(hp[0] < NECRO.hp && hp[2] > NECRO.hp, "weaker from weak enemies, stronger from tough ones");
});

test("Amalgam fuses all the fallen in reach into one giant", () => {
  const kinds: EnemyKind[] = ["orc", "orc", "ogre", "bat"];
  const sum = kinds.reduce((n, k) => n + ENEMIES[k].cost, 0);
  for (const rank of [1, 2, 3]) {
    const sim = battle({ necromancy: { path: "amalgam", rank } }), at = field(sim);
    slay(sim, at, kinds);
    assert.equal(sim.castNecromancy(at), 1);
    const [g] = risen(sim);
    assert.equal(risen(sim).length, 1);
    assert.equal(g.risen!.look, "amalgam");
    assert.equal(g.maxHp, NECRO.hp * ((sum / NECRO.difficulty) * AMALGAM.share[rank]));
    assert.equal(!!g.risen!.cleave, rank >= 2);
    assert.equal(g.risen!.life === undefined, rank >= 3, "the colossus never crumbles");
    assert.equal(sim.graves.length, 0);
  }
});

test("a cast where nobody fell raises nothing but still cools down", () => {
  const sim = battle(), at = field(sim);
  assert.equal(sim.castNecromancy(at), 0);
  assert.equal(sim.castNecromancy(at), -1);
});

test("the spell's research, its chosen path and the save", () => {
  const s = defaults();
  s.settings.devMode = true;
  assert.equal(spellPath(s, "necromancy"), undefined);
  assert.equal(bonuses(s).necromancy, undefined);
  assert.ok(learnPath(s, "amalgam"));
  assert.deepEqual(spellPath(s, "necromancy"), { path: "amalgam", rank: 1 }, "the first path researched is cast");
  assert.ok(learnPath(s, "boneArchers"));
  assert.ok(learnPath(s, "boneArchers"));
  assert.deepEqual(spellPath(s, "necromancy"), { path: "amalgam", rank: 1 }, "researching another keeps the choice");
  assert.ok(equipSpell(s, "necromancy", "boneArchers"));
  assert.deepEqual(bonuses(s).necromancy, { path: "boneArchers", rank: 2 });
  assert.equal(equipSpell(s, "necromancy", "soulWeighing"), false, "unresearched");
  assert.equal(equipSpell(s, "necromancy", "pyromancy"), false, "another topic's path");
  assert.deepEqual(decode(JSON.stringify(s)).spellPaths, { necromancy: "boneArchers" });
  assert.deepEqual(decode(JSON.stringify({ ...s, spellPaths: { necromancy: "pyromancy" } })).spellPaths, {});
  assert.ok(equipSpell(s, "necromancy"));
  assert.equal(bonuses(s).necromancy, undefined, "cast plain");
  equipSpell(s, "necromancy", "amalgam");
  unlearnPath(s, "necromancy");
  assert.equal(pathState(s, "amalgam").rank, 0);
  assert.equal(spellPath(s, "necromancy"), undefined);
});

test("the spell is a lasting Skills tile, filed under Spells in both chambers", () => {
  const s = defaults();
  assert.ok(CONSUMABLES.includes("necromancy"));
  assert.deepEqual(tileStack(s, "necromancy"), { id: "necromancy", type: "consumables", count: 1, placed: 0, ready: 1, lasting: true });
  assert.ok("reason" in shopOffer(s, "necromancy"));
  assert.equal(tileTopic("necromancy").topic.id, "necromancy");
  for (const kind of ["smithy", "study"] as const)
    assert.ok(ledgerSubjects(kind).find((x) => x.id === "spells")?.topics.some((t) => t.id === "necromancy"), kind);
});
