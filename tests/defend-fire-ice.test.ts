import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultLayout, fitLayout, placeCityTile } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { NO_BONUSES, UPGRADES, type EnemyKind } from "../src/defend/catalog.ts";
import { FROST_NOVA, frostReach } from "../src/defend/frost-nova.ts";
import { quench } from "../src/defend/fire-ice.ts";
import { ignite } from "../src/defend/towers.ts";
import { cellAt } from "../src/defend/pathing.ts";

const LEVELS = Object.fromEntries(UPGRADES.map((u) => [u.id, 0])) as Levels;

function battle() {
  let l = defaultLayout();
  const { tx, ty } = l.keep;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, tx + dx, ty + dy) ?? assert.fail("tile");
  const fit = fitLayout(l);
  assert.ok(fit.ok);
  return new DefendSim(generateCity(fit, 4), { ...LEVELS }, 1, { ...NO_BONUSES });
}

function field(sim: DefendSim) {
  for (let y = 4; y < 12; y++) for (let x = 6; x < 30; x++) if (!sim.solid[cellAt(x + 0.5, y + 0.5)]) return { x: x + 0.5, y: y + 0.5 };
  return assert.fail("no open ground");
}

function foe(sim: DefendSim, kind: EnemyKind, x: number, y: number, hp = 1e6): Enemy {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  return e;
}

function run(sim: DefendSim, seconds: number) {
  const s = sim as unknown as { stepAttacks(dt: number): void; indexEnemies(): void; tick(dt: number): void };
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
    s.indexEnemies();
    sim.time += 1 / 30;
    s.stepAttacks(1 / 30);
    s.tick(1 / 30);
  }
}

test("a frost nova over a meteor's burning crater puts the fire out and leaves less rime", () => {
  const sim = battle(), at = field(sim);
  sim.blazes.push({ x: at.x, y: at.y, r: 1.5, t: 0, life: 12, dps: 16, seed: 1 });
  assert.ok(sim.castFrostNova(at));
  run(sim, 0.1);
  assert.equal(sim.blazes.length, 0, "the crater is out");
  assert.equal(sim.rime.length, 1);
  const r = frostReach(sim);
  assert.ok(Math.abs(sim.rime[0].r - Math.sqrt(r * r - 1.5 * 1.5)) < 1e-9, "the rime spent the crater's area");
  assert.ok(sim.effects.some((fx) => fx.kind === "steam"));
});

test("a great fire swallows a small patch of rime and shrinks", () => {
  const sim = battle(), at = field(sim);
  sim.blazes.push({ x: at.x, y: at.y, r: 5, t: 0, life: 12, dps: 16, seed: 1 });
  sim.rime.push({ x: at.x + 1, y: at.y, r: 3, t: 0, life: FROST_NOVA.life, seed: 2, pulse: 3 });
  quench(sim);
  assert.equal(sim.rime.length, 0);
  assert.equal(sim.blazes[0].r, 4);
});

test("fire and ice apart leave each other alone", () => {
  const sim = battle(), at = field(sim);
  sim.blazes.push({ x: at.x, y: at.y, r: 1, t: 0, life: 12, dps: 16, seed: 1 });
  sim.rime.push({ x: at.x + 5, y: at.y, r: 3, t: 0, life: FROST_NOVA.life, seed: 2, pulse: 3 });
  const far = foe(sim, "orc", at.x + 20, at.y);
  far.chill = 2;
  quench(sim);
  assert.equal(sim.blazes[0].r, 1);
  assert.equal(sim.rime[0].r, 3);
  assert.equal(far.chill, 2);
  assert.equal(sim.effects.length, 0);
});

test("an enemy burning and frozen at once has both put out", () => {
  const sim = battle(), at = field(sim);
  const e = foe(sim, "orc", at.x, at.y);
  ignite(e, 5, 4);
  e.freeze = 2;
  e.chill = 3;
  quench(sim);
  assert.equal(e.burn, undefined);
  assert.equal(e.burnDps, undefined);
  assert.equal(e.freeze, undefined);
  assert.equal(e.chill, undefined);
});

test("burning ground thaws the frozen, and the rime douses the burning", () => {
  const sim = battle(), at = field(sim);
  sim.blazes.push({ x: at.x, y: at.y, r: 1, t: 0, life: 12, dps: 1, seed: 1 });
  sim.rime.push({ x: at.x + 8, y: at.y, r: 1, t: 0, life: FROST_NOVA.life, seed: 2, pulse: 3 });
  const frozen = foe(sim, "orc", at.x, at.y), burning = foe(sim, "orc", at.x + 8, at.y);
  frozen.freeze = 2;
  ignite(burning, 5, 4);
  (sim as unknown as { indexEnemies(): void }).indexEnemies();
  quench(sim);
  assert.equal(frozen.freeze, undefined);
  assert.equal(burning.burn, undefined);
});
