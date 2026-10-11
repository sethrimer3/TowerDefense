import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type Bonuses, type EnemyKind } from "../src/defend/catalog.ts";
import { METEOR, meteorReach } from "../src/defend/meteor.ts";
import { FROST_COMET, MOLTEN_CORE, STARFALL, equipSpell, learnPath, spellPath, unlearnPath } from "../src/knowledge-paths.ts";
import { bonuses, startTraining } from "../src/progression.ts";
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
  for (let y = 4; y < 12; y++) for (let x = 6; x < 30; x++) if (!sim.solid[cellAt(x + 0.5, y + 0.5)]) return { x: x + 0.5, y: y + 0.5 };
  return assert.fail("no open ground");
}

function foe(sim: DefendSim, kind: EnemyKind, x: number, y: number, hp = 1e6): Enemy {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  return e;
}

/** Steps only the attacks (where meteors fall), `seconds` long. */
function fall(sim: DefendSim, seconds: number) {
  const s = sim as unknown as { stepAttacks(dt: number): void; indexEnemies(): void };
  for (let t = 0; t < seconds; t += 1 / 30) {
    s.indexEnemies();
    sim.time += 1 / 30;
    s.stepAttacks(1 / 30);
  }
}

test("a meteor falls where it is cast, blasts the enemies there, and the spell cools down", () => {
  const sim = battle(), at = field(sim);
  const near = foe(sim, "orc", at.x, at.y), far = foe(sim, "orc", at.x + METEOR.radius + 2, at.y);
  assert.equal(sim.castMeteor(at), 1);
  assert.equal(sim.meteors.length, 1);
  assert.equal(sim.castMeteor(at), 0, "cooling down");
  assert.equal(sim.meteorRemaining, METEOR.cooldown);
  fall(sim, METEOR.fall * 0.5);
  assert.equal(near.hp, 1e6, "still falling");
  fall(sim, METEOR.fall * 0.6);
  assert.equal(sim.meteors.length, 0);
  assert.equal(sim.impacts.length, 1);
  assert.ok(1e6 - near.hp >= METEOR.damage * 0.99, `the middle takes it all (${1e6 - near.hp})`);
  assert.equal(far.hp, 1e6, "out of reach");
  assert.ok(sim.effects.some((e) => e.kind === "boom"));
});

test("the meteor spares the city's own people", () => {
  const sim = battle(), at = field(sim);
  const s = sim.soldiers[0] ?? null;
  if (!s) return;
  s.x = at.x; s.y = at.y;
  const hp = s.hp;
  sim.castMeteor(at);
  fall(sim, METEOR.fall + 0.1);
  assert.equal(s.hp, hp);
});

test("the Smithy's rows make it hit harder and wider", () => {
  const s = defaults();
  s.settings.devMode = true;
  s.settings.instantResearch = true;
  for (let i = 0; i < 4; i++) {
    assert.ok(startTraining(s, "meteorDamage", ""));
    assert.ok(startTraining(s, "meteorRadius", ""));
  }
  const b = bonuses(s);
  assert.equal(b.meteorDamage, 1.2);
  assert.ok(Math.abs(b.meteorRadius - 1.12) < 1e-9);
  const sim = battle({ meteorDamage: b.meteorDamage, meteorRadius: b.meteorRadius }), at = field(sim);
  sim.castMeteor(at);
  assert.equal(sim.meteors[0].damage, METEOR.damage * 1.2);
  assert.ok(Math.abs(sim.meteors[0].r - METEOR.radius * 1.12) < 1e-9);
  assert.ok(Math.abs(meteorReach(sim) - METEOR.radius * 1.12) < 1e-9);
});

test("Starfall breaks it into a shower of fragments landing one after another", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ meteor: { path: "starfall", rank } }), at = field(sim);
    assert.equal(sim.castMeteor(at), STARFALL.count[rank]);
    const m = sim.meteors;
    assert.equal(m.length, STARFALL.count[rank]);
    for (const f of m) assert.equal(f.damage, METEOR.damage * STARFALL.damage[rank]);
    assert.ok(new Set(m.map((f) => `${f.x},${f.y}`)).size === m.length, "each lands somewhere else");
    assert.ok(m.every((f, i) => i === 0 || f.fall > m[i - 1].fall), "staggered");
    assert.ok(meteorReach(sim) > METEOR.radius, "the shower reaches farther");
    fall(sim, METEOR.fall + (STARFALL.count[rank] - 1) * METEOR.stagger + 0.04);
    assert.equal(sim.meteors.length, 0);
    assert.equal(sim.impacts.length, STARFALL.count[rank], "every fragment landed");
  }
});

test("Molten core leaves a burning crater; III's fire clings", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ meteor: { path: "moltenCore", rank } }), at = field(sim);
    sim.castMeteor(at);
    fall(sim, METEOR.fall + 0.05);
    assert.equal(sim.blazes.length, 1);
    const b = sim.blazes[0];
    assert.equal(b.life, MOLTEN_CORE.life[rank]);
    assert.equal(b.dps, MOLTEN_CORE.dps[rank]);
    assert.equal(!!b.cling, rank >= 3);
    const e = foe(sim, "orc", at.x, at.y);
    fall(sim, 1);
    assert.ok(e.hp < 1e6, "the crater burns");
  }
});

test("Frost comet chills what it hits; II reaches farther; III freezes first", () => {
  for (const rank of [1, 2, 3]) {
    const sim = battle({ meteor: { path: "frostComet", rank } }), at = field(sim);
    const edge = METEOR.radius * 1.1;
    const e = foe(sim, "orc", at.x, at.y), rim = foe(sim, "orc", at.x + edge, at.y);
    sim.castMeteor(at);
    assert.equal(sim.meteors[0].look, "ice");
    fall(sim, METEOR.fall + 0.05);
    assert.ok((e.chill ?? 0) > FROST_COMET.chill[rank] - 0.2, `chilled at ${rank}`);
    assert.equal(e.freeze !== undefined, rank >= 3);
    assert.equal(rim.chill !== undefined, rank >= 2, "the wider blast reaches the rim");
    assert.equal(sim.blazes.length, 0);
  }
});

test("a run where nobody casts has no meteors and draws nothing for them", () => {
  const sim = battle();
  fall(sim, 2);
  assert.deepEqual([sim.meteors, sim.impacts, sim.meteorReadyAt], [[], [], 0]);
});

test("the spell's research, its chosen path and the save", () => {
  const s = defaults();
  s.settings.devMode = true;
  assert.equal(spellPath(s, "meteor"), undefined);
  assert.equal(bonuses(s).meteor, undefined);
  assert.ok(learnPath(s, "moltenCore"));
  assert.deepEqual(spellPath(s, "meteor"), { path: "moltenCore", rank: 1 }, "the first path researched is cast");
  assert.ok(learnPath(s, "frostComet"));
  assert.ok(equipSpell(s, "meteor", "frostComet"));
  assert.deepEqual(bonuses(s).meteor, { path: "frostComet", rank: 1 });
  assert.equal(equipSpell(s, "meteor", "starfall"), false, "unresearched");
  assert.equal(equipSpell(s, "meteor", "amalgam"), false, "another spell's path");
  assert.deepEqual(decode(JSON.stringify(s)).spellPaths, { meteor: "frostComet" });
  unlearnPath(s, "meteor");
  assert.equal(spellPath(s, "meteor"), undefined);
});

test("the spell is a lasting Skills tile, filed under Spells in both chambers", () => {
  const s = defaults();
  assert.ok(CONSUMABLES.includes("meteor"));
  assert.deepEqual(tileStack(s, "meteor"), { id: "meteor", type: "consumables", count: 1, placed: 0, ready: 1, lasting: true });
  assert.ok("reason" in shopOffer(s, "meteor"));
  assert.equal(tileTopic("meteor").topic.id, "meteor");
  for (const kind of ["smithy", "study"] as const)
    assert.ok(ledgerSubjects(kind).find((x) => x.id === "spells")?.topics.some((t) => t.id === "meteor"), kind);
});
