import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type Bonuses, type EnemyKind } from "../src/defend/catalog.ts";
import { dropSpots, LAND_SHOW, REINFORCE } from "../src/defend/reinforcements.ts";
import { HAMMERFALL, MUSTER, OATH, equipSpell, learnPath, spellPath, unlearnPath } from "../src/knowledge-paths.ts";
import { bonuses, startTraining } from "../src/progression.ts";
import { decode, defaults } from "../src/save.ts";
import { CONSUMABLES, shopOffer, tileStack, tileTopic } from "../src/tiles.ts";
import { ledgerSubjects } from "../src/ui/ledger.ts";
import { cellAt } from "../src/defend/pathing.ts";
import { chilled } from "../src/defend/wizard.ts";

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

/** An open 5 × 5 spot on the field, a few cells down from the top. */
function field(sim: DefendSim) {
  const open = (x: number, y: number) => {
    for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) if (sim.solid[cellAt(x + i, y + j)]) return false;
    return true;
  };
  for (let y = 5; y < 14; y++) for (let x = 6; x < 30; x++) if (open(x + 0.5, y + 0.5)) return { x: x + 0.5, y: y + 0.5 };
  return assert.fail("no open ground");
}

function foe(sim: DefendSim, kind: EnemyKind, x: number, y: number, hp = 1e6): Enemy {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  return e;
}

/** Steps the attacks (where the spell works), the frost's thawing and the
 * sweeping away of the fallen, `seconds` long. */
function run(sim: DefendSim, seconds: number) {
  const s = sim as unknown as { stepAttacks(dt: number): void; indexEnemies(): void; tick(dt: number): void; sweepAway(): void };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
    s.indexEnemies();
    sim.time += 1 / 30;
    s.stepAttacks(1 / 30);
    s.sweepAway();
    s.tick(1 / 30);
  }
}

const called = (sim: DefendSim) => sim.soldiers.filter((s) => s.called);

test("the squad drops round where it is cast, holds there, marches off and cools down", () => {
  const sim = battle(), at = field(sim);
  assert.equal(sim.castReinforcements(at), true);
  assert.equal(sim.castReinforcements(at), false, "cooling down");
  assert.equal(sim.reinforceRemaining, REINFORCE.cooldown);
  assert.equal(sim.drops.length, 4);
  assert.equal(called(sim).length, 0, "still falling");
  run(sim, REINFORCE.fall + 0.3);
  assert.equal(sim.drops.length, 0);
  const squad = called(sim);
  assert.equal(squad.length, 4, "landed");
  for (const s of squad) {
    assert.equal(s.kind, "reinforcement");
    assert.equal(s.hp, REINFORCE.hp);
    assert.ok(Math.hypot(s.x - at.x, s.y - at.y) < 2, "round the cast");
  }
  assert.ok(sim.landings.length > 0, "dust where they landed");
  // An enemy within the post's reach is fought; one far off is left alone.
  const near = foe(sim, "orc", at.x + 3, at.y), far = foe(sim, "orc", at.x + REINFORCE.leash + 6, at.y);
  run(sim, 3);
  assert.ok(near.hp < 1e6, "they fight what comes near the post");
  assert.equal(far.hp, 1e6, "and hold the ground rather than chase");
  sim.enemies = [];
  run(sim, REINFORCE.life);
  assert.equal(called(sim).length, 0, "marched off");
  assert.equal(sim.stats.current.troopsLost, 0, "not counted as lost");
  run(sim, LAND_SHOW);
  assert.equal(sim.landings.length, 0);
});

test("the Smithy's rows make them tougher, harder hitting and slower to leave", () => {
  const s = defaults();
  s.settings.devMode = true;
  s.settings.instantResearch = true;
  for (let i = 0; i < 4; i++)
    for (const id of ["reinforceHp", "reinforceDamage", "reinforceTime"] as const) assert.ok(startTraining(s, id, ""));
  const b = bonuses(s);
  assert.equal(b.reinforceHp, 1.2);
  assert.equal(b.reinforceDamage, 1.2);
  assert.equal(b.reinforceTime, 1.2);
  const sim = battle({ reinforceHp: b.reinforceHp, reinforceDamage: b.reinforceDamage, reinforceTime: b.reinforceTime }), at = field(sim);
  sim.castReinforcements(at);
  run(sim, REINFORCE.fall + 0.3);
  const one = called(sim)[0];
  assert.equal(one.maxHp, REINFORCE.hp * 1.2);
  assert.equal(one.damage, REINFORCE.damage * 1.2);
  assert.ok(one.called!.life > REINFORCE.life);
});

test("Hammerfall: landings hurt, stagger from II, and a champion quakes at III", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ reinforcements: { path: "hammerfall", rank } }), at = field(sim);
    const spot = dropSpots(sim, at)[0], under = foe(sim, "orc", spot.x, spot.y), mid = foe(sim, "orc", at.x, at.y + 2.4);
    sim.castReinforcements(at);
    run(sim, REINFORCE.fall + 0.3);
    assert.ok(1e6 - under.hp >= HAMMERFALL.damage[rank], `the shockwave hurts at ${rank}`);
    if (rank >= 2) assert.ok(under.stagger! > 0 && chilled(under) === 0, "staggered still");
    else assert.equal(under.stagger, undefined);
    const champion = called(sim).find((s) => s.called!.look === "champion");
    assert.equal(!!champion, rank >= 3, `a champion at ${rank}`);
    if (champion) {
      assert.equal(champion.maxHp, REINFORCE.hp * HAMMERFALL.hp);
      assert.ok(1e6 - mid.hp >= HAMMERFALL.quake, "the quake reaches farther");
    }
  }
  // The unyielding don't stagger.
  const sim = battle({ reinforcements: { path: "hammerfall", rank: 2 } }), at = field(sim);
  const spot = dropSpots(sim, at)[0], boss = foe(sim, "darkKnight", spot.x, spot.y);
  sim.castReinforcements(at);
  run(sim, REINFORCE.fall + 0.3);
  assert.equal(boss.stagger, undefined);
});

test("Muster the levy: more drop, bowmen from II, and the fallen are replaced once at III", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ reinforcements: { path: "muster", rank } }), at = field(sim);
    sim.castReinforcements(at);
    run(sim, REINFORCE.fall + 0.6);
    const squad = called(sim);
    assert.equal(squad.length, MUSTER.count[rank], `${MUSTER.count[rank]} at ${rank}`);
    const archers = squad.filter((s) => s.called!.look === "archer");
    assert.equal(archers.length, rank >= 2 ? MUSTER.count[rank] / MUSTER.archerEvery : 0);
    // One falls in battle.
    squad[0].hp = 0;
    run(sim, 1 / 30);
    assert.equal(sim.drops.length, rank >= 3 ? 1 : 0, "a fresh one drops in");
    run(sim, REINFORCE.fall + 0.3);
    const spare = called(sim).find((s) => s.called!.spare);
    assert.equal(!!spare, rank >= 3);
    if (spare) {
      spare.hp = 0;
      run(sim, 1 / 30);
      assert.equal(sim.drops.length, 0, "a replacement is not replaced");
    }
  }
});

test("Oathsworn: a shield wall, kills that keep them longer, and a last stand", () => {
  // I: less damage beside the rest of the squad.
  {
    const sim = battle({ reinforcements: { path: "oathsworn", rank: 1 } }), at = field(sim);
    sim.castReinforcements(at);
    run(sim, REINFORCE.fall + 0.3);
    const [a, b, c, d] = called(sim);
    for (const o of [b, c, d]) { o.x = a.x + 0.5; o.y = a.y; }
    const hp = a.hp;
    sim.hurtDefender(a, 10);
    assert.ok(Math.abs(hp - a.hp - 10 * (1 - OATH.wallMax)) < 1e-9, "three beside: the most");
    b.x = c.x = d.x = a.x + 10;
    const before = a.hp;
    sim.hurtDefender(a, 10);
    assert.equal(before - a.hp, 10, "alone: no wall");
  }
  // II: a kill keeps the squad longer and heals the slayer.
  {
    const sim = battle({ reinforcements: { path: "oathsworn", rank: 2 } }), at = field(sim);
    sim.castReinforcements(at);
    run(sim, REINFORCE.fall + 0.3);
    const squad = called(sim), slayer = squad[0], other = squad[1];
    slayer.hp = slayer.maxHp / 2;
    const life = other.called!.life;
    foe(sim, "orc", slayer.x + 0.4, slayer.y, 1);
    run(sim, 1 / 30);
    assert.ok(other.called!.life > life + OATH.time - 0.1, "the whole squad stays longer");
    assert.ok(slayer.hp >= slayer.maxHp * (0.5 + OATH.heal) - 1e-9, "healed");
  }
  // III: falling, or running out of time, makes a last stand.
  {
    const sim = battle({ reinforcements: { path: "oathsworn", rank: 3 } }), at = field(sim);
    sim.castReinforcements(at);
    run(sim, REINFORCE.fall + 0.3);
    const [a, b] = called(sim);
    a.hp = 0;
    run(sim, 1 / 30);
    assert.ok(a.hp > 0 && a.called!.stood && a.guard! > 0, "it fights on");
    assert.equal(sim.hurtDefender(a, 1000), 0, "unhurtable");
    b.called!.life = 0.01;
    run(sim, 2 / 30);
    assert.ok(b.hp > 0 && b.called!.stood, "its time ran out, but it stands");
    run(sim, OATH.stand + 0.2);
    assert.ok(!sim.soldiers.includes(a) && !sim.soldiers.includes(b), "then both are gone");
  }
});

test("spots inside buildings stay empty, and the cap holds", () => {
  const sim = battle(), keep = sim.map.buildings[sim.keepId].rect;
  const at = { x: keep.x + keep.w / 2, y: keep.y + keep.h / 2 };
  assert.ok(dropSpots(sim, at).every((p) => !sim.solid[cellAt(p.x, p.y)]));
  const open = battle({ reinforcements: { path: "muster", rank: 2 } }), f = field(open);
  for (let i = 0; i < 10; i++) {
    open.reinforceReadyAt = 0;
    open.castReinforcements(f);
  }
  assert.ok(open.drops.length <= REINFORCE.max);
});

test("a run where nobody casts has no reinforcements and draws nothing for them", () => {
  const sim = battle();
  run(sim, 2);
  assert.deepEqual([sim.drops, sim.landings, sim.squads, sim.reinforceReadyAt], [[], [], 0, 0]);
});

test("the spell's research, its chosen path and the save", () => {
  const s = defaults();
  s.settings.devMode = true;
  assert.equal(spellPath(s, "reinforcements"), undefined);
  assert.ok(learnPath(s, "muster"));
  assert.deepEqual(spellPath(s, "reinforcements"), { path: "muster", rank: 1 });
  assert.ok(learnPath(s, "oathsworn"));
  assert.ok(equipSpell(s, "reinforcements", "oathsworn"));
  assert.deepEqual(bonuses(s).reinforcements, { path: "oathsworn", rank: 1 });
  assert.equal(equipSpell(s, "reinforcements", "hammerfall"), false, "unresearched");
  assert.equal(equipSpell(s, "reinforcements", "shatter"), false, "the nova's path");
  assert.deepEqual(decode(JSON.stringify(s)).spellPaths, { reinforcements: "oathsworn" });
  unlearnPath(s, "reinforcements");
  assert.equal(spellPath(s, "reinforcements"), undefined);
});

test("the spell is a lasting Skills tile, filed under Spells in both chambers", () => {
  const s = defaults();
  assert.ok(CONSUMABLES.includes("reinforcements"));
  assert.deepEqual(tileStack(s, "reinforcements"), { id: "reinforcements", type: "consumables", count: 1, placed: 0, ready: 1, lasting: true });
  assert.ok("reason" in shopOffer(s, "reinforcements"));
  assert.equal(tileTopic("reinforcements").topic.id, "reinforcements");
  for (const kind of ["smithy", "study"] as const)
    assert.ok(ledgerSubjects(kind).find((x) => x.id === "spells")?.topics.some((t) => t.id === "reinforcements"), kind);
});
