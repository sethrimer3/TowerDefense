import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults, decode } from "../src/save.ts";
import { bonuses, buySkill, skillPurchase } from "../src/progression.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { DefendSim, type Soldier } from "../src/defend/sim.ts";
import { UPGRADES, NO_BONUSES } from "../src/defend/catalog.ts";
import { answerBanner, bannerDamage, bannerInfluence, stepBannerLife } from "../src/defend/war-banner.ts";
import { stepSwordsman, stepArcher } from "../src/defend/troops.ts";
import { stepMage } from "../src/defend/mages.ts";
import { stepDarkWizard } from "../src/defend/dark-wizards.ts";
import { charge } from "../src/defend/valkyries.ts";
import { hostileBurst } from "../src/defend/hostile-attacks.ts";

function fixture(upgraded = true) {
  const save = defaults();
  if (upgraded) for (const id of ["bannerDefense", "bannerReach", "bannerDamage", "bannerMarch", "bannerLife", "bannerRegen"] as const) save.skills[id] = 1;
  const fit = fitLayout(defaultLayout()); assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as DefendSim["levels"], 1, upgraded ? bonuses(save) : NO_BONUSES);
  // Open isolated ground so tests exercise combat without unrelated structures.
  sim.ownSolid.fill(0);
  const unit: Soldier = { id: 1, home: sim.keepId, kind: "sword", x: 20, y: 20, hp: 40, maxHp: 40, damage: 8, cd: 0, target: -1, path: [], thinkT: 0, flash: 0 };
  sim.soldiers = [unit];
  return { sim, unit };
}

test("banner cooldown research gates the shared stem and all three independent branches, and survives saves", () => {
  const s = defaults(); s.knowledge = 1000; s.skills.warBanner = 1;
  assert.equal(bonuses(s).banner?.cooldown ?? 10, 10);
  for (const seconds of [7, 4, 1]) {
    assert.ok(buySkill(s, "bannerCooldown"));
    assert.equal(bonuses(s).banner!.cooldown, seconds);
    assert.equal(skillPurchase(s, "bannerDefense").available, seconds === 1);
  }
  assert.equal(buySkill(s, "bannerDamage"), false);
  assert.ok(buySkill(s, "bannerDefense")); assert.ok(buySkill(s, "bannerReach"));
  assert.equal(buySkill(s, "bannerRegen"), false);
  for (const id of ["bannerDamage", "bannerMarch", "bannerLife", "bannerRegen"] as const) assert.ok(buySkill(s, id));
  assert.deepEqual(bonuses(decode(JSON.stringify(s))), bonuses(s));
  const old = decode(JSON.stringify({ ...s, skills: { warBanner: 2 } }));
  assert.equal(old.skills.warBanner, 2); assert.equal(old.skills.bannerRegen, 0);
  assert.equal(bonuses(old).troopDamage, 1.3);
});

test("first placement is immediate; relocation and lifting cannot bypass the battle-time cooldown", () => {
  for (const cooldown of [10, 7, 4, 1]) {
    const { sim } = fixture(false);
    const s = defaults(); s.skills.bannerCooldown = (10 - cooldown) / 3;
    const other = new DefendSim(sim.map, sim.levels, 1, bonuses(s));
    assert.ok(other.plantBanner({ x: 20, y: 20 }));
    assert.equal(other.bannerRemaining, cooldown);
    assert.equal(other.plantBanner({ x: 22, y: 20 }), false);
    assert.ok(other.plantBanner(null));
    assert.equal(other.plantBanner({ x: 22, y: 20 }), false);
    other.time += cooldown;
    assert.ok(other.plantBanner({ x: 22, y: 20 }));
  }
});

test("all troop kinds receive local damage, life, absolute defense and 5% maximum-life regeneration", () => {
  for (const kind of ["sword", "archer", "mage", "valkyrie", "darkWizard"] as Soldier["kind"][]) {
    const { sim, unit } = fixture(); unit.kind = kind; unit.hp = 20;
    sim.plantBanner({ x: 20, y: 20 });
    assert.equal(unit.maxHp, 50); assert.equal(unit.hp, 25);
    assert.equal(bannerDamage(sim, unit), 10);
    hostileBurst(sim, 20, 20, 1, 10); assert.equal(unit.hp, 16);
    stepBannerLife(sim, unit, 1); assert.equal(unit.hp, 18.5);
    unit.x = 27; assert.equal(bannerInfluence(sim, unit), true);
    unit.x = 27.01; stepBannerLife(sim, unit, 0);
    assert.equal(unit.maxHp, 40); assert.equal(unit.hp, 14.8);
    assert.equal(bannerDamage(sim, unit), 8);
    stepBannerLife(sim, unit, 1); assert.equal(unit.hp, 14.8);
    for (let i = 0; i < 5; i++) { unit.x = 20; stepBannerLife(sim, unit, 0); unit.x = 28; stepBannerLife(sim, unit, 0); }
    assert.equal(unit.hp, 14.8, "crossing the edge cannot restore life");
    unit.x = 20; unit.hp = 0; stepBannerLife(sim, unit, 1); assert.equal(unit.hp, 0);
  }
});

test("marching speed applies outside influence only while routing toward the banner", () => {
  const { sim, unit } = fixture(); unit.x = 5; unit.y = 20;
  sim.plantBanner({ x: 20, y: 20 }); sim.warBanner!.refresh(sim);
  let speed = 0; sim.followPath = (_s, _foe, v) => { speed = v; };
  answerBanner(sim, sim.warBanner!, unit, 2, .1);
  assert.equal(bannerInfluence(sim, unit), false); assert.equal(speed, 3);
  unit.x = 20; unit.thinkT = 0;
  answerBanner(sim, sim.warBanner!, unit, 2, .1); assert.equal(speed, 2);
  sim.spawnEnemy("orc"); const enemy = sim.enemies.at(-1)!; enemy.x = 21; enemy.y = 20;
  unit.thinkT = 0;
  answerBanner(sim, sim.warBanner!, unit, 2, .1, 3); assert.equal(speed, 2, "no bonus chasing an enemy");
});

test("banner damage reaches melee, arrows, mage fireballs, valkyrie charges and wizard lightning", () => {
  for (const kind of ["sword", "archer", "mage", "valkyrie", "darkWizard"] as Soldier["kind"][]) {
    const { sim, unit } = fixture(); unit.kind = kind;
    sim.plantBanner({ x: 20, y: 20 });
    sim.spawnEnemy("orc"); const enemy = sim.enemies.at(-1)!;
    enemy.x = 20.5; enemy.y = 20; enemy.hp = enemy.maxHp = 100; enemy.marked = false;
    (sim as unknown as { indexEnemies(): void }).indexEnemies();
    if (kind === "sword") { stepSwordsman(sim, unit, .1); assert.equal(enemy.hp, 90); }
    if (kind === "archer") { stepArcher(sim, unit, .1); assert.equal(sim.arrows.at(-1)!.damage, 10); }
    if (kind === "mage") { stepMage(sim, unit, .1); assert.equal(sim.fireballs.at(-1)!.damage, 10); }
    if (kind === "valkyrie") { charge(sim, unit, enemy, 1); assert.equal(enemy.hp, 90); }
    if (kind === "darkWizard") { stepDarkWizard(sim, unit, .1); assert.equal(enemy.hp, 90); }
  }
});
