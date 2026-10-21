// The Barracks' paths besides Crusaders (src/defend/troops.ts): Berserkers'
// quicker strokes, healing kills and cleaving blows; Halberdiers' reach,
// hooking blows and heavy blows on big enemies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { buildingTree, nextSteps, specialtyOf, stepName, upgradeBuilding } from "../src/specializations.ts";
import { BERSERK, HALBERD, pathById, type PathId } from "../src/knowledge-paths.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type EnemyKind } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks, stepSwordsman } from "../src/defend/troops.ts";
import { ENEMIES, SOLDIER } from "../src/defend/catalog.ts";
import { kindStats } from "../src/ui/specialty.ts";
import { PATH_LOOKS, structurePixels } from "../src/defend/tower-art.ts";

/** A Barracks beside the keep climbing `path` to `rank`, in battle with its first swordsman. */
function barracks(path?: PathId, rank = 3) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.barracks = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "barracks", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  const uid = l.structures.find((st) => st.kind === "barracks")!.uid;
  for (let r = 0; path && r < rank; r++) {
    const step = nextSteps("barracks", specialtyOf(s.defend.layout, { uid })).find((st) => st.type === "path" && st.path === path)!;
    assert.ok(upgradeBuilding(s, { uid }, step).ok);
  }
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  const m = sim.soldiers.find((u) => u.kind === "sword") ?? assert.fail("a swordsman");
  return { s, sim, m };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6, kind: EnemyKind = "orc") {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
/** One blow from `m` at `e`. */
function blow(sim: DefendSim, m: { cd: number; target: number }, e: Enemy) {
  m.cd = 0;
  m.target = e.id;
  stepSwordsman(sim, m as any, 1 / 30);
}

test("a Barracks has three paths and becomes the Hero; the Crusaders lost their crown", () => {
  assert.deepEqual(nextSteps("barracks").map(stepName), ["Hero", "Crusaders I", "Berserkers I", "Halberdiers I"]);
  for (const p of ["berserkers", "halberdiers"] as const) assert.equal(pathById(p).topic, "barracks");
  assert.equal(pathById("berserkers").evolves, undefined);
  const climbed = buildingTree("barracks", { path: "halberdiers", rank: 1 });
  assert.equal(climbed.find((n) => n.id === "k:barracks")!.closed!.length, 3, "the Hero and the other two paths");
  assert.match(kindStats(barracks().s, "barracks", "halberdiers", 3), /2.5x on big enemies/);
  assert.deepEqual(PATH_LOOKS.barracks, ["crusaders", "berserkers", "halberdiers"]);
  const art = ["", ...PATH_LOOKS.barracks!].map((look) => structurePixels("barracks", 3, 3, 0, 1, look).join());
  assert.equal(new Set(art).size, art.length);
});

test("a plain swordsman strikes one enemy at its own pace", () => {
  const { sim, m } = barracks();
  const e = enemy(sim, m.x + 0.5, m.y), side = enemy(sim, m.x + 0.5, m.y + 0.6);
  blow(sim, m, e);
  assert.equal(e.maxHp - e.hp, m.damage);
  assert.equal(side.hp, side.maxHp);
  assert.equal(m.cd, SOLDIER.cooldown);
});

test("Berserkers strike faster, heal on a kill from II and cleave at III", () => {
  const rage = barracks("berserkers", 1);
  blow(rage.sim, rage.m, enemy(rage.sim, rage.m.x + 0.5, rage.m.y));
  assert.equal(rage.m.cd, SOLDIER.cooldown * BERSERK.cooldown);

  const lust = barracks("berserkers", 2);
  lust.m.hp = lust.m.maxHp / 2;
  blow(lust.sim, lust.m, enemy(lust.sim, lust.m.x + 0.5, lust.m.y, 1));
  assert.equal(lust.m.hp, lust.m.maxHp * (0.5 + BERSERK.heal));

  const cleave = barracks("berserkers", 3);
  const e = enemy(cleave.sim, cleave.m.x + 0.5, cleave.m.y), side = enemy(cleave.sim, cleave.m.x + 0.5, cleave.m.y + 0.6), far = enemy(cleave.sim, cleave.m.x + 3, cleave.m.y);
  blow(cleave.sim, cleave.m, e);
  assert.equal(side.maxHp - side.hp, (e.maxHp - e.hp) * BERSERK.share);
  assert.equal(far.hp, far.maxHp);
});

test("Halberdiers reach further and hit harder, slow from II and fell big enemies at III", () => {
  const plain = barracks(), reach = barracks("halberdiers", 1);
  assert.equal(reach.m.damage, plain.m.damage * HALBERD.damage);
  const out = SOLDIER.reach + ENEMIES.orc.size / 2 + HALBERD.reach / 2;
  const e = enemy(reach.sim, reach.m.x + out, reach.m.y), p = enemy(plain.sim, plain.m.x + out, plain.m.y);
  blow(reach.sim, reach.m, e);
  blow(plain.sim, plain.m, p);
  assert.ok(e.hp < e.maxHp, "the halberd reaches it");
  assert.equal(p.hp, p.maxHp, "a sword does not");
  assert.equal(e.chill, undefined);

  const hook = barracks("halberdiers", 2);
  const h = enemy(hook.sim, hook.m.x + 0.5, hook.m.y);
  blow(hook.sim, hook.m, h);
  assert.equal(h.chill, HALBERD.chill);

  const set = barracks("halberdiers", 3);
  const bigKind = (Object.keys(ENEMIES) as EnemyKind[]).find((k) => ENEMIES[k].size >= HALBERD.big && !ENEMIES[k].flying && !ENEMIES[k].fortress)!;
  const small = enemy(set.sim, set.m.x + 0.5, set.m.y);
  blow(set.sim, set.m, small);
  const big = enemy(set.sim, set.m.x + 0.5, set.m.y - 0.2, 1e6, bigKind);
  set.sim.enemies = set.sim.enemies.filter((o) => o !== small);
  (set.sim as any).indexEnemies();
  blow(set.sim, set.m, big);
  assert.equal(Number(((big.maxHp - big.hp) / (small.maxHp - small.hp)).toFixed(6)), Number((HALBERD.bigDamage * (ENEMIES[bigKind].damageScale?.physical ?? 1)).toFixed(6)));
});
