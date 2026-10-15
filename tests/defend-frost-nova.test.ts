import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels, type Soldier } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type Bonuses, type EnemyKind } from "../src/defend/catalog.ts";
import { BURST_SHOW, FROST_NOVA, frostReach } from "../src/defend/frost-nova.ts";
import { BLIZZARD, RIME_WARD, SHATTER, equipSpell, learnPath, spellPath, unlearnPath } from "../src/knowledge-paths.ts";
import { bonuses, settleTraining, startTraining } from "../src/progression.ts";
import { decode, defaults } from "../src/save.ts";
import { CONSUMABLES, shopOffer, tileStack, tileTopic } from "../src/tiles.ts";
import { ledgerSubjects } from "../src/ui/ledger.ts";
import { cellAt } from "../src/defend/pathing.ts";
import { dist } from "../src/exact.ts";

/** One Smithy rank, worked through to the end by a smith. */
function train(s: ReturnType<typeof defaults>, id: Parameters<typeof startTraining>[1]) {
  assert.ok(startTraining(s, id, "Ada"));
  s.trainingClock = 1;
  settleTraining(s, 1e15);
}

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
  for (let y = 4; y < 12; y++) for (let x = 6; x < 30; x++) if (!sim.solid[cellAt(x + 0.5, y + 0.5)]) return { x: x + 0.5, y: y + 0.5 };
  return assert.fail("no open ground");
}

function foe(sim: DefendSim, kind: EnemyKind, x: number, y: number, hp = 1e6): Enemy {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  return e;
}

/** Steps the attacks (where the nova works) and the frost's thawing, `seconds` long. */
function run(sim: DefendSim, seconds: number) {
  const s = sim as unknown as { stepAttacks(dt: number): void; indexEnemies(): void; tick(dt: number): void };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
    s.indexEnemies();
    sim.time += 1 / 30;
    s.stepAttacks(1 / 30);
    s.tick(1 / 30);
  }
}

test("the nova freezes the enemies in reach, lays rime that chills and bites, and cools down", () => {
  const sim = battle(), at = field(sim);
  const near = foe(sim, "orc", at.x, at.y), far = foe(sim, "orc", at.x + FROST_NOVA.radius + 2, at.y);
  assert.equal(sim.castFrostNova(at), true);
  assert.equal(sim.castFrostNova(at), false, "cooling down");
  assert.equal(sim.frostRemaining, FROST_NOVA.cooldown);
  run(sim, 1 / 30);
  assert.ok(Math.abs(near.freeze! - FROST_NOVA.freeze) < 0.05, "frozen on the next step");
  assert.equal(far.freeze, undefined);
  assert.equal(sim.rime.length, 1);
  assert.equal(sim.frostBursts.length, 1);
  run(sim, 1 - 1 / 30);
  assert.ok(near.chill !== undefined, "chilled in the rime");
  assert.ok(Math.abs(1e6 - near.hp - FROST_NOVA.dps) < 0.5, `the rime bites (${1e6 - near.hp})`);
  assert.equal(far.hp, 1e6);
  run(sim, FROST_NOVA.life);
  assert.equal(sim.rime.length, 0, "melted");
  assert.equal(sim.frostBursts.length, 0);
});

test("the unyielding are not frozen", () => {
  const sim = battle(), at = field(sim);
  const boss = foe(sim, "darkKnight", at.x, at.y);
  sim.castFrostNova(at);
  run(sim, 1 / 30);
  assert.equal(boss.freeze, undefined);
});

test("the Smithy's rows make it last longer and reach farther", () => {
  const s = defaults();
  s.settings.devMode = true;
  for (let i = 0; i < 4; i++) {
    train(s, "frostTime");
    train(s, "frostRadius");
  }
  const b = bonuses(s);
  assert.equal(b.frostTime, 1.2);
  assert.ok(Math.abs(b.frostRadius - 1.12) < 1e-9);
  const sim = battle({ frostTime: b.frostTime, frostRadius: b.frostRadius }), at = field(sim);
  const rim = foe(sim, "orc", at.x + FROST_NOVA.radius * 1.08, at.y);
  sim.castFrostNova(at);
  run(sim, 1 / 30);
  assert.ok(rim.freeze! > FROST_NOVA.freeze * 1.17, "frozen longer, and the wider reach takes the rim");
  assert.ok(Math.abs(sim.rime[0].life - FROST_NOVA.life * 1.2) < 1e-9);
  assert.ok(Math.abs(frostReach(sim) - FROST_NOVA.radius * 1.12) < 1e-9);
});

test("Shatter: the frozen are brittle, burst as they thaw from II, and burst when killed at III", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ frostNova: { path: "shatter", rank } }), at = field(sim);
    const e = foe(sim, "orc", at.x, at.y);
    sim.castFrostNova(at);
    sim.rime = [];
    run(sim, 1 / 30);
    // One that walks up after the nova: not frozen, but in reach of the shards.
    const beside = foe(sim, "orc", at.x + 1, at.y);
    assert.equal(e.brittle, true);
    assert.equal(beside.brittle, undefined);
    const was = e.hp;
    sim.hurtEnemy(e, 10);
    assert.equal(was - e.hp, 10 * SHATTER.brittle[1], "brittle");
    let shards = 0, before = beside.hp;
    for (let t = 0; t < FROST_NOVA.freeze + 0.3; t += 1 / 30) {
      run(sim, 1 / 30);
      shards += sim.frostBursts.filter((b) => !b.nova && b.t < 1 / 60).length;
    }
    assert.equal(e.brittle, undefined, "thawed");
    assert.equal(sim.brittle.length, 0);
    assert.equal(shards, rank >= 2 ? 1 : 0, `one burst at ${rank}`);
    if (rank >= 2) assert.ok(before - beside.hp >= SHATTER.damage[rank], "the shards hurt the one beside");
    if (rank >= 3) assert.ok(beside.freeze !== undefined && !beside.brittle, "the shards freeze, but leave it unmarked");
    run(sim, 3);
    assert.equal(sim.frostBursts.length, 0, "no endless chain");
  }
  // III: one killed while frozen bursts.
  const sim = battle({ frostNova: { path: "shatter", rank: 3 } }), at = field(sim);
  const weak = foe(sim, "orc", at.x, at.y, 5), next = foe(sim, "orc", at.x + 1, at.y);
  sim.castFrostNova(at);
  run(sim, 1 / 30);
  next.freeze = undefined;
  sim.hurtEnemy(weak, 100);
  run(sim, 1 / 30);
  assert.ok(sim.frostBursts.some((b) => !b.nova), "it burst as it died");
});

test("Wandering blizzard: the rime lasts longer and hunts; II grows and refreezes; III bites harder", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ frostNova: { path: "blizzard", rank } }), at = field(sim);
    const prey = foe(sim, "orc", at.x + 6, at.y);
    sim.castFrostNova(at);
    const f = sim.rime[0];
    assert.equal(f.life, BLIZZARD.life[rank]);
    assert.ok(Math.abs(f.r - FROST_NOVA.radius * (rank >= 2 ? BLIZZARD.grow : 1)) < 1e-9);
    const from = f.x;
    run(sim, 1);
    assert.ok(Math.abs(f.x - from - BLIZZARD.speed[rank]) < 0.05, `drifts toward the enemy (${f.x - from})`);
    prey.x = f.x; prey.y = f.y;
    const hp = prey.hp;
    run(sim, BLIZZARD.pulse);
    assert.equal(prey.freeze !== undefined, rank >= 2, "refrozen by the pulse");
    assert.ok(hp - prey.hp > FROST_NOVA.dps * (rank >= 3 ? BLIZZARD.bite : 1) * (BLIZZARD.pulse - 0.5));
  }
});

test("Rime ward shelters the city's people, then its buildings, and heals at III", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ frostNova: { path: "rimeWard", rank } });
    const keep = sim.map.buildings[sim.keepId].rect, at = { x: keep.x + keep.w / 2, y: keep.y + keep.h + 1.5 };
    const s: Soldier = { id: sim.newId(), home: sim.keepId, kind: "sword", ...at, hp: 40, maxHp: 40, damage: 8, cd: 0, target: -1, path: [], thinkT: 0, flash: 0 };
    sim.soldiers = [s];
    sim.castFrostNova(at);
    s.hp = s.maxHp * 0.5;
    const hp = s.hp;
    sim.hurtDefender(s, 10);
    assert.ok(Math.abs(hp - s.hp - 10 * (1 - RIME_WARD.guard)) < 1e-6, "less damage");
    const b = sim.map.buildings.findIndex((x, i) => sim.hp[i] > 0 && dist(x.rect.x + x.rect.w / 2 - at.x, x.rect.y + x.rect.h / 2 - at.y) < FROST_NOVA.radius);
    if (b >= 0) {
      const was = sim.hp[b];
      sim.damageBuilding(b, 4);
      assert.ok(Math.abs(was - sim.hp[b] - 4 * (rank >= 2 ? 1 - RIME_WARD.walls : 1)) < 1e-4, `building at ${rank}`);
    }
    const before = s.hp;
    (sim as unknown as { indexEnemies(): void }).indexEnemies();
    (sim as unknown as { stepAttacks(dt: number): void }).stepAttacks(0.5);
    if (rank >= 3) assert.ok(Math.abs(s.hp - before - s.maxHp * RIME_WARD.heal * 0.5) < 1e-6, "healed");
    else assert.equal(s.hp, before);
  }
});

test("a run where nobody casts has no rime and draws nothing for it", () => {
  const sim = battle();
  run(sim, 2);
  assert.deepEqual([sim.rime, sim.frostBursts, sim.brittle, sim.frostReadyAt], [[], [], [], 0]);
});

test("the spell's research, its chosen path and the save", () => {
  const s = defaults();
  s.settings.devMode = true;
  assert.equal(spellPath(s, "frostNova"), undefined);
  assert.ok(learnPath(s, "blizzard"));
  assert.deepEqual(spellPath(s, "frostNova"), { path: "blizzard", rank: 1 });
  assert.ok(learnPath(s, "shatter"));
  assert.ok(equipSpell(s, "frostNova", "shatter"));
  assert.deepEqual(bonuses(s).frostNova, { path: "shatter", rank: 1 });
  assert.equal(equipSpell(s, "frostNova", "rimeWard"), false, "unresearched");
  assert.equal(equipSpell(s, "frostNova", "frostComet"), false, "the meteor's path");
  assert.deepEqual(decode(JSON.stringify(s)).spellPaths, { frostNova: "shatter" });
  unlearnPath(s, "frostNova");
  assert.equal(spellPath(s, "frostNova"), undefined);
});

test("the spell is a lasting Skills tile, filed under Spells in both chambers", () => {
  const s = defaults();
  assert.ok(CONSUMABLES.includes("frostNova"));
  assert.deepEqual(tileStack(s, "frostNova"), { id: "frostNova", type: "consumables", count: 1, placed: 0, ready: 1, lasting: true });
  assert.ok("reason" in shopOffer(s, "frostNova"));
  assert.equal(tileTopic("frostNova").topic.id, "frostNova");
  for (const kind of ["smithy", "study"] as const)
    assert.ok(ledgerSubjects(kind).find((x) => x.id === "spells")?.topics.some((t) => t.id === "frostNova"), kind);
  assert.ok(BURST_SHOW > 0);
});
