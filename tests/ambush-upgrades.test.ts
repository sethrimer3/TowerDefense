import test from "node:test";
import assert from "node:assert/strict";
import { AmbushSim } from "../src/campaign/ambush-sim.ts";
import { defaults } from "../src/save.ts";
import { build } from "./ambush-helpers.ts";
import { ignite } from "../src/defend/towers.ts";
import { envenom } from "../src/defend/assassins.ts";
import { ambushUpgradePrice } from "../src/campaign/ambush-upgrade-price.ts";
import { nextSteps } from "../src/specializations.ts";
test("Local gold upgrades follow native choices, retrain in place, retain damage and refund the whole investment until wave 2", () => {
  const s = new AmbushSim(0, defaults());
  s.gold = 10000;
  const b = build(s, "meleeGuild"),
    offer = s.upgrades(b.id).find((o) => o.step.type === "become" && o.step.to === "barracks")!;
  assert.ok(offer.ready);
  const price = offer.cost;
  s.engine.damageBuilding(b.id, s.engine.hp[b.id] / 2);
  const fraction = s.engine.hp[b.id] / s.engine.maxHp[b.id];
  assert.ok(s.upgrade(b.id, offer.step));
  assert.equal(b.kind, "barracks");
  assert.equal(s.engine.hp[b.id] / s.engine.maxHp[b.id], fraction);
  assert.equal(s.refund(b.id), b.paid);
  assert.ok(b.paid > price);
  assert.equal(s.upgrade(b.id, offer.step), false, "A stale or forged upgrade is rejected.");
  assert.ok(s.send());
  assert.equal(s.refund(b.id), b.paid);
  while (!s.canSend) {
    s.step(1 / 30);
    for (const e of s.engine.enemies) s.engine.hurtEnemy(e, 1e9);
  }
  assert.ok(s.send());
  assert.equal(s.refund(b.id), Math.floor((b.paid * 0.7) / 10) * 10);
  const gold = s.gold,
    refund = s.refund(b.id);
  s.remove(b.id);
  assert.equal(s.gold, gold + refund);
});
test("Native per-building paths change live attacks without global Knowledge or Smithy", () => {
  const game = defaults();
  game.defend.levels.archerDamage = 10;
  game.training.towerDamage = 30;
  game.spellPaths.meteor = "starfall";
  game.pathResearch.starfall = { rank: 3, spent: 1 };
  const s = new AmbushSim(0, game);
  s.gold = 10000;
  const b = build(s, "archerTower");
  assert.equal(s.engine.levels.archerDamage, 0);
  assert.equal(s.engine.bonuses.towerDamage, 1);
  assert.equal(s.engine.bonuses.meteor?.rank, 0);
  let offer = s.upgrades(b.id).find((o) => o.step.type === "become" && o.step.to === "brazierTower")!;
  assert.ok(s.upgrade(b.id, offer.step));
  offer = s.upgrades(b.id)[0];
  assert.ok(s.upgrade(b.id, offer.step));
  assert.equal(b.wear?.path, "fireArrows");
  assert.equal(b.wear?.rank, 1);
  const paths = s.engine.bonuses.structurePaths![b.id];
  assert.ok(Object.values(paths).some((p) => p.path === "fireArrows" && p.rank === 1));
  s.start();
  const r = s.map.buildings[b.id].rect,
    e = s.engine.spawnAuxiliary("ogre", r.x + 4, r.y + 1)!;
  e.hp = e.maxHp = 10000;
  for (let n = 0; n < 90; n++) s.step(1 / 30);
  assert.ok(s.tallies.get(b.id).damage > 0);
  assert.ok(e.burn || s.engine.arrows.some((a) => a.burn));
  assert.ok(s.cast("meteor", { x: e.x, y: e.y }));
  assert.equal(s.engine.meteors.length, 1);
  assert.equal(s.engine.meteors[0].damage, 120);
});
test("Native tally clamps splash overkill and attributes burns, venom and dead-shooter projectiles once", () => {
  const s = new AmbushSim(0, defaults()),
    b = build(s, "archerTower"),
    p = { x: 30, y: 5 },
    e = s.engine.spawnAuxiliary("orc", p.x, p.y)!;
  const hp = e.hp;
  s.engine.explode(e.x, e.y, { r: 2, damage: 1e6, friendlyFire: false, origin: { ...p, building: b.id } });
  s.engine.hurtEnemy(e, 100, true, "ranged", { ...p, building: b.id });
  assert.equal(s.tallies.get(b.id).kills, 1);
  assert.equal(s.tallies.get(b.id).damage, hp);
  const burn = s.engine.spawnAuxiliary("ogre", p.x, p.y)!;
  ignite(burn, 10, 2, s.engine.tallyOrigin({ ...p, building: b.id }));
  const before = s.tallies.get(b.id).damage;
  s.engine.step(0.1);
  assert.ok(s.tallies.get(b.id).damage > before);
  const venom = s.engine.spawnAuxiliary("ogre", p.x + 2, p.y)!;
  envenom(venom, 2, 1, 10, false, { ...p, building: b.id });
  const poisoned = s.tallies.get(b.id).damage;
  s.engine.step(0.1);
  assert.ok(s.tallies.get(b.id).damage > poisoned);
  s.engine.tallyHomes!.set(123456, b.id);
  s.engine.hurtEnemy(venom, 1, true, "ranged", { ...p, attacker: 123456 });
  assert.ok(s.tallies.get(b.id).damage > poisoned + 1);
});
test("All native next-step prices are finite tens and lack of gold leaves the live building untouched", () => {
  const s = new AmbushSim(0, defaults()),
    b = build(s, "archerTower");
  s.gold = 0;
  const before = JSON.stringify(b);
  assert.equal(s.upgrade(b.id, s.upgrades(b.id)[0].step), false);
  assert.equal(JSON.stringify(b), before);
  for (const kind of ["archerTower", "brazierTower", "barracks", "rangedGuild", "sniperLodge"] as const)
    for (const step of nextSteps(kind)) {
      const cost = ambushUpgradePrice(kind, step);
      assert.ok(Number.isFinite(cost) && cost > 0);
      assert.equal(cost % 10, 0);
    }
});
test("A native ultimate merge requires real maxed partners and conserves all three investments", () => {
  const s = new AmbushSim(0, defaults());
  s.gold = 1e6;
  const buildings = ["brazierTower", "hawkTower", "wispTower"].map((to) => {
    const b = build(s, "archerTower"),
      offer = s.upgrades(b.id).find((o) => o.step.type === "become" && o.step.to === to)!;
    assert.ok(s.upgrade(b.id, offer.step));
    for (let rank = 1; rank <= 3; rank++) assert.ok(s.upgrade(b.id, s.upgrades(b.id)[0].step));
    return b;
  });
  const b = buildings[0],
    merge = s.upgrades(b.id)[0],
    investment = buildings.reduce((n, o) => n + o.paid, 0);
  assert.equal(merge.step.type, "merge");
  assert.ok(merge.ready);
  assert.ok(s.upgrade(b.id, merge.step));
  assert.equal(s.buildings.length, 1);
  assert.equal(b.kind, "chronoTower");
  assert.equal(b.paid, investment + merge.cost);
  assert.equal(s.refund(b.id), b.paid);
});
test("Every strike spell is at hand in Ambush without any Study research, cast at base strength", () => {
  const s = new AmbushSim(0, defaults());
  build(s, "archerTower");
  assert.deepEqual([...s.spells].sort(), ["frostNova", "meteor", "necromancy", "reinforcements"]);
  s.start();
  s.step(1 / 30);
  assert.ok(s.cast("meteor", { x: 30, y: 20 }));
  assert.equal(s.engine.meteors[0].damage, 120);
  assert.ok(s.cast("frostNova", { x: 30, y: 20 }));
  assert.ok(s.cast("reinforcements", { x: 30, y: 30 }));
});
