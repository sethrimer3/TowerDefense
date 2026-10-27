import test from "node:test";
import assert from "node:assert/strict";
import { ambushPrice, enemyBounty, startingGold } from "../src/campaign/economy.ts";
import { AmbushSim, AMBUSH_PALETTE } from "../src/campaign/ambush-sim.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { defaults } from "../src/save.ts";
import { ENEMIES } from "../src/defend/catalog.ts";
import { freeSpot, build } from "./ambush-helpers.ts";
test("The five native base buildings have finite DPS estimates and prices rounded to tens", () => {
  const s = defaults();
  for (const kind of AMBUSH_PALETTE) {
    const p = ambushPrice(kind);
    assert.ok(p.cost > 0 && Number.isFinite(p.dps));
    assert.equal(p.cost % 10, 0);
  }
  assert.deepEqual([0, 1, 2].map(startingGold), [500, 600, 700]);
});
test("Purchases debit level gold, refunds cannot create profit and retries start a new wallet", () => {
  const save = defaults(),
    s = new AmbushSim(0, save),
    price = s.price("meleeGuild"),
    before = JSON.stringify(save);
  const b = build(s, "meleeGuild");
  assert.equal(s.gold, 500 - price);
  assert.ok(s.remove(b.id));
  assert.equal(s.gold, 500);
  assert.equal(s.remove(b.id), false);
  assert.equal(s.gold, 500);
  s.gold = 0;
  const p = freeSpot(s, "archerTower");
  assert.equal(s.placeAt("archerTower", p.qx, p.qy), false);
  assert.equal(s.buildings.length, 0);
  assert.equal(new AmbushSim(0, save).gold, 500);
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
  const d = ENEMIES[e.kind],
    gold = s.gold,
    bounty = enemyBounty({ maxHp: e.maxHp, damage: d.damage, cooldown: d.cooldown, speed: d.speed });
  s.engine.hurtEnemy(e, e.hp * 2);
  s.engine.step(1 / 30);
  assert.equal(s.gold, gold + bounty);
  assert.equal(s.kills, 1);
  s.engine.step(1 / 30);
  assert.equal(s.kills, 1);
  const end = s.field.track.keep,
    attacker = s.engine.spawnAuxiliary("roach", end.x, end.y)!;
  const after = s.gold,
    keep = s.engine.keepHp();
  s.engine.step(1 / 30);
  assert.ok(attacker.hp > 0);
  assert.ok(s.engine.keepHp() < keep);
  assert.equal(s.gold, after);
});
test("Tougher enemies pay more; Ambush gold never leaks into Siege or the player save", () => {
  assert.ok(enemyBounty({ maxHp: 48, damage: 6, cooldown: 1, speed: 2 }) > enemyBounty({ maxHp: 12, damage: 2, cooldown: 1.2, speed: 1.2 }));
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
  for (let i = 0; i < 20; i++) {
    const e = s.engine.spawnAuxiliary("ogre", 0.5, s.field.path[0].y)!;
    s.engine.hurtEnemy(e, e.hp * 2);
    s.engine.step(1 / 30);
  }
  const price = s.price("archerTower"),
    before = s.gold;
  build(s, "archerTower");
  assert.equal(s.gold, before - price);
});
