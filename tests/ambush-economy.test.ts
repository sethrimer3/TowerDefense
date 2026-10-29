import { routeToBuilding } from "../src/defend/enemies.ts";
import { buildingContactPoint } from "../src/defend/contact.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { ambushPrice, startingGold } from "../src/campaign/economy.ts";
import { ambushWave } from "../src/campaign/ambush-waves.ts";
import { AMBUSH_LEVELS } from "../src/campaign/levels.ts";
import { AmbushSim, AMBUSH_PALETTE } from "../src/campaign/ambush-sim.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { defaults } from "../src/save.ts";
import { freeSpot, build } from "./ambush-helpers.ts";
test("The five native base buildings have finite DPS estimates and prices rounded to tens", () => {
  const s = defaults();
  for (const kind of AMBUSH_PALETTE) {
    const p = ambushPrice(kind);
    assert.ok(p.cost > 0 && Number.isFinite(p.dps));
    assert.equal(p.cost % 10, 0);
  }
  assert.equal(startingGold(0), 800);
  for (let order = 1; order < 30; order++) {
    assert.ok(startingGold(order) > startingGold(order - 1));
    assert.equal(startingGold(order) % 10, 0);
  }
});
test("Purchases debit level gold, refunds cannot create profit and retries start a new wallet", () => {
  const save = defaults(),
    s = new AmbushSim(0, save),
    price = s.price("meleeGuild"),
    before = JSON.stringify(save);
  const b = build(s, "meleeGuild");
  assert.equal(s.gold, startingGold(0) - price);
  assert.ok(s.remove(b.id));
  assert.equal(s.gold, startingGold(0));
  assert.equal(s.remove(b.id), false);
  assert.equal(s.gold, startingGold(0));
  s.gold = 0;
  const p = freeSpot(s, "archerTower");
  assert.equal(s.placeAt("archerTower", p.qx, p.qy), false);
  assert.equal(s.buildings.length, 0);
  assert.equal(new AmbushSim(0, save).gold, startingGold(0));
  assert.equal(JSON.stringify(save), before);
});
test("Battle sales withdraw only the sold native home and end states refuse transactions", () => {
  const s = new AmbushSim(0, defaults());
  s.gold = 10000;
  const a = build(s, "meleeGuild"),
    b = build(s, "rangedGuild");
  s.start();
  s.step(1 / 30);
  const gold = s.gold,
    refund = s.refund(a.id);
  assert.equal(refund, a.paid);
  assert.ok(s.remove(a.id));
  assert.equal(s.gold, gold + refund);
  assert.ok(!s.engine.soldiers.some((u) => u.home === a.id));
  assert.ok(s.engine.soldiers.some((u) => u.home === b.id));
  const c = build(s, "archerTower");
  assert.notEqual(c.id, a.id);
  s.phase = "lost";
  const end = s.gold;
  assert.equal(s.remove(c.id), false);
  assert.equal(s.gold, end);
});
test("Native deaths pay once and damaging the keep pays no bounty", () => {
  const s = new AmbushSim(0, defaults());
  build(s, "meleeGuild");
  s.start();
  const p = s.field.path[0],
    e = s.engine.spawnAuxiliary("roach", p.x + 0.5, p.y)!;
  const gold = s.gold,
    bounty = s.waves[0].bounty;
  s.engine.hurtEnemy(e, e.hp * 2);
  s.engine.step(1 / 30);
  assert.equal(s.gold, gold + bounty);
  assert.equal(s.kills, 1);
  s.engine.step(1 / 30);
  assert.equal(s.kills, 1);
  const end = s.field.track.keep,
    attacker = s.engine.spawnAuxiliary("roach", end.x, end.y)!;
  Object.assign(attacker, buildingContactPoint(s.engine, attacker, s.engine.keep));
  const after = s.gold,
    keep = s.engine.keepHp();
  // Isolate native contact damage from the outpost route and nearby guards.
  routeToBuilding(s.engine, attacker, s.engine.keepId, 1 / 30, s.engine.field);
  assert.ok(attacker.hp > 0);
  assert.ok(s.engine.keepHp() < keep);
  assert.equal(s.gold, after);
});
test("Later waves and levels pay more; Ambush gold never leaks into Siege or the player save", () => {
  const paid = (level: number, wave: number) => {
    const w = ambushWave(AMBUSH_LEVELS[level], wave);
    return w.bounty * w.entries.length;
  };
  for (let level = 0; level < 30; level++) {
    for (let wave = 2; wave <= 20; wave++) assert.ok(paid(level, wave) >= paid(level, wave - 1));
    if (level) assert.ok(paid(level, 1) >= paid(level - 1, 1));
  }
  const save = defaults(),
    before = JSON.stringify(save),
    s = new AmbushSim(0, save);
  s.gold = 9999;
  const d = save.defend;
  const siege = new CampaignSim("siege", 0, [], d.owned, d.levels);
  siege.start();
  siege.step(0.1);
  assert.equal(siege.gold, 0);
  assert.equal(JSON.stringify(save), before);
});
test("Native kill gold funds an additional free-grid purchase during a wave", () => {
  const s = new AmbushSim(0, defaults());
  build(s, "meleeGuild");
  s.start();
  s.gold = 0;
  const price = s.price("archerTower");
  for (let i = 0; i < 1000 && s.gold < price; i++) {
    const e = s.engine.spawnAuxiliary("ogre", 30, 5)!;
    s.engine.hurtEnemy(e, e.hp * 2);
    s.engine.step(1 / 30);
  }
  const before = s.gold;
  build(s, "archerTower");
  assert.equal(s.gold, before - price);
});
