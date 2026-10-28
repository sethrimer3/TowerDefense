import test from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { SiegeMana, SIEGE_MANA, SPELL_MANA, manaFor } from "../src/campaign/siege-mana.ts";
import { generateCastle } from "../src/campaign/castles.ts";
import { castleAtForge, castleSnapshot } from "../src/campaign/castle-model.ts";
import { placeStructure } from "../src/defend/layout.ts";
import { buildNativeCopy } from "../src/campaign/native-build.ts";
import { center } from "../src/defend/pathing.ts";
import type { Enemy, ScenarioSpell, Soldier } from "../src/defend/sim.ts";

function battle(hero = false) {
  const game = defaults(),
    castle = generateCastle(45, 100);
  if (hero) {
    const scratch = castleAtForge(45, 0);
    buildNativeCopy(scratch, "heroHall", { path: "legend", rank: 3 });
    scratch.defend.layout = placeStructure(scratch.defend.layout, "heroHall", 3, 3)!;
    Object.assign(scratch.defend.layout.structures[0], { path: "legend", rank: 3 });
    castle.castle = castleSnapshot(scratch, 0);
  }
  const mode = new CampaignSim("siege", 0, [], game.defend.owned, game.defend.levels, castle, game);
  mode.start();
  mode.step(1 / 30);
  assert.ok(mode.mana);
  return mode;
}
function enemy(mode: CampaignSim, unit: Soldier): Enemy {
  return mode.raid.attack.enemies.find((e) => e.id === unit.id)!;
}
function kill(mode: CampaignSim, unit: Soldier) {
  const proxy = enemy(mode, unit);
  assert.ok(proxy);
  mode.engine.hurtEnemy(proxy, proxy.hp * 1000);
  return proxy;
}
test("Siege mana starts at one, caps at eight and safely refuses unaffordable spending", () => {
  const mana = new SiegeMana();
  assert.equal(mana.value, 1);
  assert.deepEqual(SPELL_MANA, { frostNova: 1, necromancy: 1, meteor: 2, reinforcements: 3 });
  assert.equal(mana.spend("meteor"), false);
  assert.equal(mana.value, 1);
  mana.gain(99);
  assert.equal(mana.value, SIEGE_MANA.cap);
  mana.gain(-10);
  mana.gain(NaN);
  assert.equal(mana.value, 8);
  for (const spell of ["reinforcements", "meteor", "frostNova", "necromancy", "frostNova"] as ScenarioSpell[]) assert.equal(mana.spend(spell), true);
  assert.equal(mana.value, 0);
  assert.equal(mana.spend("necromancy"), false);
});
test("Each defending soldier or summon pays once; buildings, civilians and attacker deaths pay nothing", () => {
  const mode = battle(),
    r = mode.raid,
    mana = mode.mana!;
  const unit = r.defense.soldiers[0],
    proxy = kill(mode, unit);
  assert.equal(manaFor(unit), 1);
  assert.equal(mana.value, 2);
  r.attack.hurtEnemy(proxy, 99999);
  mode.step(1 / 30);
  r.attack.hurtEnemy(proxy, 99999);
  assert.equal(mana.value, 2);
  const building = r.attack.enemies.find((e) => e.raidBuilding && e.id !== 10000000 + r.field.defenderKeep)!;
  r.attack.hurtEnemy(building, building.maxHp * 1000);
  assert.equal(mana.value, 2);
  mode.step(1 / 30); // Native builders leave their homes only after rubble creates a job.
  const civilian = r.defense.civilians[0];
  assert.ok(civilian);
  r.attack.hurtEnemy(r.attack.enemies.find((e) => e.id === civilian.id)!, civilian.maxHp * 1000);
  assert.equal(mana.value, 2);
  const attacker = r.attack.soldiers[0];
  r.defense.hurtEnemy(r.defense.enemies.find((e) => e.id === attacker.id)!, attacker.hp * 1000);
  assert.equal(mana.value, 2);
  r.defense.graves.push({ x: 36.5, y: 46.5, difficulty: 4, life: 10 });
  assert.equal(r.defense.castNecromancy({ x: 36.5, y: 46.5 }), 1);
  mode.step(1 / 30);
  const summoned = r.defense.soldiers.find((s) => s.kind === "undead")!;
  assert.ok(summoned);
  kill(mode, summoned);
  assert.equal(mana.value, 3);
});
test("A native Hero's Legend revival pays only after its final death", () => {
  const mode = battle(true),
    hero = mode.raid.defense.soldiers.find((s) => s.kind === "hero")!;
  assert.ok(hero);
  kill(mode, hero);
  assert.ok(hero.hp > 0);
  assert.equal(mode.mana!.value, 1);
  assert.ok(hero.rallied);
  hero.guard = 0;
  kill(mode, hero);
  assert.ok(hero.hp <= 0);
  assert.equal(mode.mana!.value, 2);
});
test("A native summon expiring on its own grants no mana or enemy grave", () => {
  const mode = battle(),
    defender = mode.raid.defense;
  defender.graves.push({ x: 36.5, y: 46.5, difficulty: 4, life: 10 });
  assert.equal(defender.castNecromancy({ x: 36.5, y: 46.5 }), 1);
  mode.step(1 / 30);
  const summon = defender.soldiers.find((s) => s.kind === "undead")!;
  assert.ok(summon);
  summon.risen!.life = 1 / 60;
  mode.step(1 / 30);
  mode.step(1 / 30);
  assert.ok(summon.hp <= 0);
  assert.equal(mode.mana!.value, 1);
  assert.equal(mode.engine.graves.length, 0);
});
test("Mana casts preserve native effects, spend exact costs, and never read or start cooldowns", () => {
  const mode = battle(),
    sim = mode.engine,
    mana = mode.mana!,
    at = center(mode.raid.defense.keep.rect);
  assert.equal(sim.castMeteor(at), 0);
  assert.equal(mana.value, 1);
  assert.equal(sim.meteors.length, 0);
  assert.equal(sim.castReinforcements({ x: 36, y: 46 }), false);
  assert.equal(mana.value, 1);
  for (const key of ["meteorRemaining", "frostRemaining", "necroRemaining", "reinforceRemaining"])
    Object.defineProperty(sim, key, {
      get() {
        throw Error("Siege must not read cooldown clocks");
      },
    });
  const clocks = [sim.meteorReadyAt, sim.frostReadyAt, sim.necroReadyAt, sim.reinforceReadyAt];
  mana.gain(99);
  assert.ok(sim.castMeteor(at) > 0);
  assert.equal(mana.value, 6);
  assert.ok(sim.castMeteor(at) > 0);
  assert.equal(mana.value, 4);
  assert.equal(sim.castFrostNova(at), true);
  assert.equal(mana.value, 3);
  assert.equal(sim.castReinforcements({ x: 36, y: 46 }), true);
  assert.equal(mana.value, 0);
  assert.equal(sim.castNecromancy({ x: 2, y: 2 }), -1);
  assert.equal(mana.value, 0);
  mana.gain();
  assert.equal(sim.castNecromancy({ x: 2, y: 2 }), 0);
  assert.equal(mana.value, 0);
  assert.deepEqual([sim.meteorReadyAt, sim.frostReadyAt, sim.necroReadyAt, sim.reinforceReadyAt], clocks);
  assert.ok(sim.meteors.length && sim.frostBursts.length && sim.drops.length && sim.raisings.length);
  assert.equal(mode.raid.defense.scenario?.spellGate, undefined);
});
test("Externally killed proxies retain native graves and frost/nano death effects exactly once", () => {
  const mode = battle(),
    sim = mode.engine,
    unit = mode.raid.defense.soldiers[0],
    proxy = enemy(mode, unit);
  unit.x = 36.5;
  unit.y = 46.5;
  (sim.bonuses as any).frostNova = { path: "shatter", rank: 3 };
  proxy.freeze = 1;
  proxy.nano = { r: 1, damage: 1, chance: 0, origin: -1 };
  kill(mode, unit);
  assert.equal(sim.graves.length, 0);
  mode.step(1 / 30);
  assert.equal(sim.graves.filter((g) => g.x === unit.x && g.y === unit.y).length, 1);
  assert.equal(sim.frostBursts.length, 1);
  assert.equal(sim.nanoBursts.length, 1);
  mode.step(1 / 30);
  assert.equal(sim.frostBursts.length, 1);
  assert.equal(sim.nanoBursts.length, 0);
  assert.equal(sim.castNecromancy({ x: unit.x, y: unit.y }), 1);
  assert.equal(sim.graves.filter((g) => g.x === unit.x && g.y === unit.y).length, 0);
  assert.ok(sim.soldiers.some((s) => s.kind === "undead"));
  assert.equal(mode.mana!.value, 1);
});
