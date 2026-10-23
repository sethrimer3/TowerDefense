// The Shadow, the assassins' ultimate: three Assassins' dens merged into
// one, its shade's knives looping out through crowds, each hit sharpening
// the next, and its shared upgrades (more knives, armor piercing, bleeding,
// faster compounding).
import { test } from "node:test";
import assert from "node:assert/strict";
import { decode, defaults } from "../src/save.ts";
import { allocated, buildingTree, fullTree, nextSteps, rootOf, specialtyOf, stepName, upgradeBuilding, upgradedFrom } from "../src/specializations.ts";
import { pathById } from "../src/knowledge-paths.ts";
import { SHADOW_BLEED, SHADOW_EDGE, SHADOW_KNIVES, SHADOW_PATHS, SHADOW_PIERCE, decodeShadowRanks, respecShadow, shadowAllocated, upgradeShadow } from "../src/shadow-upgrades.ts";
import { bonuses } from "../src/progression.ts";
import { placeStructure, placeCityTile, defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Soldier } from "../src/defend/sim.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { Barracks } from "../src/defend/troops.ts";
import { ENEMIES, SHADE, STRUCTURES, type EnemyKind } from "../src/defend/catalog.ts";
import { BLADE_LIFE, bleeds, loopAt, stepBlades, stepBleed, stepShade, throwKnife } from "../src/defend/shadow.ts";
import { structurePixels } from "../src/defend/tower-art.ts";
import { graftedGraph, kindStats } from "../src/ui/specialty.ts";

type S = ReturnType<typeof defaults>;

/** A Shadow beside the keep, its shared tree at `ranks`. */
function shrine(ranks: S["defend"]["shadowRanks"] = undefined) {
  const s = defaults(); s.settings.devMode = true; s.knowledge = 1e6;
  s.defend.owned.shadow = 1;
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "shadow", l.keep.tx, l.keep.ty - 1) ?? assert.fail("placement");
  s.defend.layout = l;
  if (ranks) s.defend.shadowRanks = ranks;
  return s;
}
function battle(s: S) {
  const fit = fitLayout(s.defend.layout);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 4), { ...s.defend.levels }, 1, bonuses(s));
  new Barracks().step(sim, 0.01);
  const shades = sim.soldiers.filter((u) => u.kind === "shade");
  assert.equal(shades.length, 1, "one shade");
  return { sim, h: shades[0] };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6, kind: EnemyKind = "orc") {
  const e: Enemy = { id: sim.newId(), kind, x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
const hurt = (e: Enemy) => e.maxHp - e.hp;
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
function knife(sim: DefendSim, h: Soldier, e: Enemy) {
  (sim as any).indexEnemies();
  throwKnife(sim, h, e);
}

// ── The tree ───────────────────────────────────────────────────────────
test("the Shadow is the assassins' ultimate, merged from three dens maxed on different branches", () => {
  assert.deepEqual(nextSteps("poisonDen", { path: "venom", rank: 3 }).map(stepName), ["Shadow"]);
  assert.deepEqual(nextSteps("shadow"), [], "its upgrades are a shared tree, not paths");
  assert.equal(upgradedFrom("shadow"), "assassinDen");
  assert.equal(rootOf("shadow"), "meleeGuild");
  const full = (p: "bloodletters" | "shadowcloak" | "venom") => pathById(p).ranks.reduce((n, r) => n + r.cost, 0);
  assert.equal(allocated("shadow"), 3 * (6 + 4) + full("bloodletters") + full("shadowcloak") + full("venom"));
  const ids = buildingTree("shadow").map((n) => n.id);
  for (const id of ["k:meleeGuild", "k:assassinDen", "k:bloodHall", "k:veilHouse", "k:poisonDen", "p:bloodletters:3", "p:shadowcloak:3", "p:venom:3", "k:shadow"]) assert.ok(ids.includes(id), id);
  assert.ok(fullTree("meleeGuild").some((n) => n.id === "k:shadow"), "on the line's upgrade map");
  assert.equal(STRUCTURES.shadow.w * STRUCTURES.shadow.h, STRUCTURES.assassinDen.w * STRUCTURES.assassinDen.h, "it stands where its den stood");
});

test("three maxed dens merge into the Shadow, which keeps its place; the save keeps it", () => {
  const s = defaults(); s.settings.devMode = true;
  Object.assign(s.defend.owned, { bloodHall: 1, veilHouse: 1, poisonDen: 1 });
  let l = defaultLayout();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy)!;
  l = placeStructure(l, "bloodHall", l.keep.tx, l.keep.ty - 1)!;
  const uid = l.structures.find((o) => o.kind === "bloodHall")!.uid;
  l.structures.find((o) => o.uid === uid)!.path = "bloodletters";
  l.structures.find((o) => o.uid === uid)!.rank = 3;
  s.defend.layout = l;
  s.defend.kept.push({ kind: "veilHouse", path: "shadowcloak", rank: 3 }, { kind: "poisonDen", path: "venom", rank: 3 });
  const merge = nextSteps("bloodHall", specialtyOf(s.defend.layout, { uid })).find((o) => o.type === "merge")!;
  const r = upgradeBuilding(s, { uid }, merge);
  assert.ok(r.ok && !r.waiting);
  assert.equal(s.defend.layout.structures.find((o) => o.uid === uid)?.kind, "shadow");
  assert.equal(s.defend.owned.shadow, 1);
  assert.deepEqual(s.defend.kept, [], "the other two are used up");
  assert.equal(decode(JSON.stringify(s)).defend.layout.structures.find((o) => o.uid === uid)?.kind, "shadow");
});

test("its shared tree: four branches climbed side by side, grafted onto its node, saved, respecced", () => {
  assert.deepEqual(SHADOW_PATHS.map((p) => p.id), ["knives", "pierce", "bleed", "edge"]);
  const s = shrine();
  for (const id of ["knives", "pierce", "bleed", "edge"] as const) assert.ok(upgradeShadow(s, id).ok);
  assert.ok(upgradeShadow(s, "knives").ok);
  assert.deepEqual(s.defend.shadowRanks, { knives: 2, pierce: 1, bleed: 1, edge: 1 });
  assert.deepEqual(decode(JSON.stringify(s)).defend.shadowRanks, s.defend.shadowRanks);
  assert.equal(decodeShadowRanks({ knives: 9, bogus: 1 }), undefined, "nonsense is dropped");
  assert.deepEqual(bonuses(s).shadow, s.defend.shadowRanks);
  const ids = graftedGraph(s, "shadow").map((n) => n.id);
  for (const id of ["k:shadow", "q:knives:1", "q:knives:2", "q:pierce:1", "q:bleed:1", "q:edge:1"]) assert.ok(ids.includes(id), id);
  s.settings.devMode = false;
  const before = s.knowledge, spent = shadowAllocated(s.defend.shadowRanks);
  assert.ok(respecShadow(s).ok);
  assert.equal(s.defend.shadowRanks, undefined);
  assert.equal(s.knowledge, before + spent);
  assert.match(kindStats(shrine(), "shadow"), /^One shade: .* 3 knives, one out every 0\.33s within 3\.5 cells .* \+0\.1% to the next, compounding/);
  assert.match(kindStats(shrine({ knives: 4, pierce: 3, bleed: 3, edge: 3 }), "shadow"), /8 knives.*\+0\.5% to the next.*pierces 75% of armor.*bleeds 35% of a hit a second for 5s/);
});

test("the shrine has its own art", () => {
  const shrineArt = structurePixels("shadow", 4, 4, 0, 1).join();
  assert.notEqual(shrineArt, structurePixels("assassinDen", 4, 4, 0, 1).join());
  assert.notEqual(shrineArt, structurePixels("shadow", 4, 4, 2, 1).join(), "it takes damage");
});

// ── In battle ──────────────────────────────────────────────────────────
test("one shade, slow to rise again", () => {
  const { sim, h } = battle(shrine());
  assert.equal(h.maxHp, SHADE.hp);
  const b = new Barracks();
  for (let i = 0; i < 300; i++) b.step(sim, 0.1);
  assert.equal(sim.soldiers.filter((u) => u.kind === "shade").length, 1);
  assert.equal(h.edge, undefined, "nothing gathered yet");
});

test("a knife loops out through its enemy, past it and back, cutting everything in its way", () => {
  const { sim, h } = battle(shrine());
  const target = enemy(sim, h.x + 2, h.y);
  knife(sim, h, target);
  const [b] = sim.blades;
  assert.ok(b, "a loop to draw");
  const through = loopAt(b, 0.2);
  assert.ok(Math.abs(through.x - target.x) < 1e-9 && Math.abs(through.y - target.y) < 1e-9, "it passes right through its enemy");
  const tip = loopAt(b, 0.5);
  assert.ok(Math.hypot(tip.x - h.x, tip.y - h.y) > 2.5, "and on past it");
  assert.ok(Math.hypot(loopAt(b, 1).x - h.x, loopAt(b, 1).y - h.y) < 1e-9, "back to the shade");
  assert.equal(hurt(target), h.damage);
  // Enemies along the loop's other points are cut too; one well away is not.
  const on = loopAt(b, 0.8);
  const s3 = battle(shrine());
  const t3 = enemy(s3.sim, s3.h.x + 2, s3.h.y), onLoop = enemy(s3.sim, s3.h.x + (on.x - h.x), s3.h.y + (on.y - h.y)), away = enemy(s3.sim, s3.h.x - 3, s3.h.y + 3);
  knife(s3.sim, s3.h, t3);
  assert.ok(hurt(onLoop) > 0, "cut on the way back");
  assert.equal(hurt(away), 0);
  // Alternate knives bow to alternate sides.
  knife(s3.sim, s3.h, t3);
  assert.equal(Math.sign(s3.sim.blades[0].wide), -Math.sign(s3.sim.blades[1].wide));
  // The loops come round and are gone.
  stepBlades(s3.sim, BLADE_LIFE);
  assert.equal(s3.sim.blades.length, 0);
});

test("each enemy hit makes every later hit 0.1% harder, compounding", () => {
  const { sim, h } = battle(shrine());
  const a = enemy(sim, h.x + 2, h.y), base = h.damage;
  knife(sim, h, a);
  assert.ok(near(h.edge!, 1 + SHADOW_EDGE.rate[0]));
  knife(sim, h, a);
  assert.ok(near(hurt(a), base + base * (1 + SHADOW_EDGE.rate[0])));
  assert.ok(near(h.edge!, (1 + SHADOW_EDGE.rate[0]) * (1 + SHADOW_EDGE.rate[0])), "compounding");
  for (let i = 0; i < 1000; i++) knife(sim, h, a);
  assert.ok(near(h.edge!, Math.pow(1 + SHADOW_EDGE.rate[0], 1002)));
  // Gathering dark compounds faster.
  const fast = battle(shrine({ edge: 3 }));
  const f = enemy(fast.sim, fast.h.x + 2, fast.h.y);
  knife(fast.sim, fast.h, f);
  assert.ok(near(fast.h.edge!, 1 + SHADOW_EDGE.rate[3]));
  // And it never runs away past its cap.
  fast.h.edge = SHADE.cap;
  knife(fast.sim, fast.h, f);
  assert.equal(fast.h.edge, SHADE.cap);
});

test("more knives throw sooner; it holds its ground with an enemy in reach", () => {
  for (const rank of [0, 4]) {
    const { sim, h } = battle(shrine(rank ? { knives: rank } : undefined));
    enemy(sim, h.x + 2, h.y);
    const x = h.x, y = h.y;
    h.cd = 0;
    stepShade(sim, h, 0.01);
    assert.ok(near(h.cd, SHADE.cooldown / SHADOW_KNIVES.knives[rank]));
    assert.equal(sim.blades.length, 1);
    assert.equal(h.x, x); assert.equal(h.y, y);
  }
});

test("Sundering edge cuts through armor", () => {
  const plain = battle(shrine());
  const t = enemy(plain.sim, plain.h.x + 2, plain.h.y, 1e6, "duneTortoise");
  assert.equal(ENEMIES.duneTortoise.damageScale?.physical, 0.5);
  knife(plain.sim, plain.h, t);
  assert.ok(near(hurt(t), plain.h.damage * 0.5), "its shell halves a plain cut");
  const sharp = battle(shrine({ pierce: 3 }));
  const t2 = enemy(sharp.sim, sharp.h.x + 2, sharp.h.y, 1e6, "duneTortoise");
  knife(sharp.sim, sharp.h, t2);
  assert.ok(near(hurt(t2), sharp.h.damage * (0.5 + 0.5 * SHADOW_PIERCE.pierce[3])));
});

test("Hemorrhage bleeds enemies with blood in them, never stone or engines", () => {
  assert.ok(bleeds("orc") && bleeds("dragon"));
  assert.ok(!bleeds("slagGolem") && !bleeds("skeleton") && !bleeds("crystalSentinel"));
  for (const kind of Object.keys(ENEMIES) as EnemyKind[]) if (ENEMIES[kind].siege || ENEMIES[kind].boat || ENEMIES[kind].fortress) assert.ok(!bleeds(kind), kind);
  const { sim, h } = battle(shrine({ bleed: 2 }));
  const orc = enemy(sim, h.x + 2, h.y), golem = enemy(sim, h.x - 2, h.y, 1e6, "slagGolem");
  knife(sim, h, orc);
  knife(sim, h, golem);
  assert.deepEqual(orc.bleed, { dps: h.damage * SHADOW_BLEED.share[2], t: SHADOW_BLEED.time[2] });
  assert.equal(golem.bleed, undefined);
  const before = hurt(orc);
  for (let i = 0; i < 50; i++) stepBleed(sim, 0.1);
  assert.ok(hurt(orc) - before > 0, "it bleeds");
  assert.equal(orc.bleed, undefined, "until it runs dry");
  // Without Hemorrhage nothing bleeds.
  const dry = battle(shrine());
  const o2 = enemy(dry.sim, dry.h.x + 2, dry.h.y);
  knife(dry.sim, dry.h, o2);
  assert.equal(o2.bleed, undefined);
});
