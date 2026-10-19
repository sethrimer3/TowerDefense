// The wall ballistas' tree (src/ballista-upgrades.ts) in battle
// (src/defend/wall-defenses.ts): Heavy bolts, Fire bolts and Windlass; and
// the Smithy's ballista rows.
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaults } from "../src/save.ts";
import { bonuses } from "../src/progression.ts";
import { BALLISTA, NO_BONUSES, ballistaCooldown, ballistaDamage, ballistaRange, type Bonuses } from "../src/defend/catalog.ts";
import { generateCity } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout, placeBallista, placeCityTile } from "../src/defend/layout.ts";
import { DefendSim, type Enemy, type Levels } from "../src/defend/sim.ts";
import { shootBallista, stepBallistaBolts, wallBallistaRange, wallBallistaReload } from "../src/defend/wall-defenses.ts";
import { BALLISTA_PATHS, FIRE_BOLTS, HEAVY_BOLTS, WINDLASS, ballistaAllocated, decodeBallistaRanks, respecBallistas, upgradeBallistas, type BallistaRanks } from "../src/ballista-upgrades.ts";
import { SIDE_UI, ballistaStats } from "../src/ui/specialty.ts";
import { tileMarks } from "../src/tiles.ts";
import { reachOf } from "../src/defend/inspect.ts";

const LAYOUT = (() => {
  const l = defaultLayout();
  const t = placeCityTile(l, l.keep.tx, l.keep.ty - 1)!;
  return placeBallista(t, { vx: l.keep.tx + 1, vy: l.keep.ty - 1 })!;
})();
const levels = (over: Partial<Levels> = {}) => ({ ...defaults().defend.levels, ...over }) as Levels;
function battle(ranks?: BallistaRanks, over: Partial<Levels> = {}) {
  const fit = fitLayout(LAYOUT);
  assert.ok(fit.ok);
  const sim = new DefendSim(generateCity(fit, 11), levels(over), 3, { ...NO_BONUSES, ...(ranks ? { ballista: ranks } : {}) } as Bonuses);
  const b = sim.map.buildings.find((o) => o.kind === "wallBallista")!;
  return { sim, b, c: { x: b.rect.x + 1, y: b.rect.y + 1 } };
}
function enemy(sim: DefendSim, x: number, y: number, hp = 1e6) {
  const e: Enemy = { id: sim.newId(), kind: "orc", x, y, hp, maxHp: hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
  sim.enemies.push(e);
  (sim as any).indexEnemies();
  return e;
}
const fly = (sim: DefendSim) => { for (let i = 0; i < 120 && sim.ballistaBolts.length; i++) { (sim as any).indexEnemies(); stepBallistaBolts(sim, 1 / 30); } };
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test("the Smithy's rows set a ballista's damage, reload and reach", () => {
  const { sim, b, c } = battle(undefined, { ballistaDamage: 3, ballistaRate: 2, ballistaRange: 2 });
  assert.equal(wallBallistaRange(sim), ballistaRange(2));
  assert.equal(wallBallistaReload(sim), ballistaCooldown(2));
  assert.ok(ballistaDamage(3) > BALLISTA.damage && ballistaCooldown(2) < BALLISTA.cooldown && ballistaRange(2) > BALLISTA.range);
  const e = enemy(sim, c.x + ballistaRange(2) - 0.5, c.y - 0.5);
  assert.ok(shootBallista(sim, b), "reaches further");
  fly(sim);
  assert.ok(near(e.maxHp - e.hp, ballistaDamage(3)));
  assert.equal(reachOf(b, sim)[0].r, ballistaRange(2), "the pick shows its reach");
  const plain = battle();
  enemy(plain.sim, plain.c.x + ballistaRange(2) - 0.5, plain.c.y - 0.5);
  assert.equal(shootBallista(plain.sim, plain.b), false, "a plain one doesn't");
});

test("Heavy bolts hit harder, stagger from II and pierce eight at III", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, b, c } = battle({ heavyBolts: rank });
    const file = Array.from({ length: 9 }, (_, i) => enemy(sim, c.x + 2 + i * 0.6, c.y));
    assert.ok(shootBallista(sim, b));
    fly(sim);
    const struck = file.filter((e) => e.hp < e.maxHp);
    assert.equal(struck.length, rank >= 3 ? HEAVY_BOLTS.pierce[3] : BALLISTA.pierce, `rank ${rank}`);
    assert.ok(near(struck[0].maxHp - struck[0].hp, BALLISTA.damage * HEAVY_BOLTS.damage[rank]));
    assert.equal(struck.every((e) => e.stagger === HEAVY_BOLTS.stagger), rank >= 2);
  }
});

test("Fire bolts burn, leave burning ground from II and burst at III", () => {
  for (const rank of [1, 2, 3]) {
    const { sim, b, c } = battle({ fireBolts: rank });
    const e = enemy(sim, c.x + 3, c.y), beside = enemy(sim, c.x + 3, c.y + 1.2);
    assert.ok(shootBallista(sim, b));
    fly(sim);
    assert.equal(e.burn, FIRE_BOLTS.burn);
    assert.ok(near(e.burnDps!, BALLISTA.damage * FIRE_BOLTS.share));
    assert.equal(sim.blazes.length, rank >= 2 ? 1 : 0, `rank ${rank}: ground burning where it stopped`);
    assert.equal(beside.hp < beside.maxHp, rank >= 3, "the burst catches the one beside it");
  }
});

test("Windlass reloads faster, reaches further from II and fans three bolts at III", () => {
  const plain = battle();
  assert.ok(near(wallBallistaReload(battle({ windlass: 1 }).sim), wallBallistaReload(plain.sim) * WINDLASS.reload[1]));
  assert.equal(wallBallistaRange(battle({ windlass: 2 }).sim), BALLISTA.range + WINDLASS.range[2]);
  const { sim, b, c } = battle({ windlass: 3 });
  enemy(sim, c.x + 5, c.y);
  assert.ok(shootBallista(sim, b));
  assert.equal(sim.ballistaBolts.length, WINDLASS.fan);
  const [mid, left, right] = sim.ballistaBolts;
  for (const t of sim.ballistaBolts) assert.ok(near(t.dx * t.dx + t.dy * t.dy, 1), "unit headings");
  assert.ok(near(mid.dx * left.dx + mid.dy * left.dy, WINDLASS.cos) && near(mid.dx * right.dx + mid.dy * right.dy, WINDLASS.cos));
  assert.ok(left.dy !== right.dy, "one each side");
});

test("a run without ballista ranks shoots as before", () => {
  const { sim, b, c } = battle();
  const e = enemy(sim, c.x + 3, c.y);
  assert.ok(shootBallista(sim, b));
  const [t] = sim.ballistaBolts;
  assert.equal(sim.ballistaBolts.length, 1);
  assert.deepEqual([t.pierce, t.range, t.stagger, t.burn, t.blaze, t.burst, t.small], [BALLISTA.pierce, BALLISTA.range + 1, undefined, undefined, undefined, undefined, undefined]);
  fly(sim);
  assert.equal(e.maxHp - e.hp, BALLISTA.damage);
  assert.equal(e.burn, undefined);
});

test("the ballistas' tree is bought, snapshotted, respecced, saved and shown", () => {
  const s = defaults();
  s.knowledge = 1e6;
  const before = s.knowledge;
  assert.ok(upgradeBallistas(s, "fireBolts").ok && upgradeBallistas(s, "windlass").ok);
  assert.deepEqual(bonuses(s).ballista, { fireBolts: 1, windlass: 1 });
  assert.equal(before - s.knowledge, ballistaAllocated(s.defend.ballistaRanks));
  assert.deepEqual(tileMarks(s, "wallBallista").length, 2);
  const tree = SIDE_UI.ballistas;
  assert.equal(tree.graph(s)[0].id, "k:wallBallista");
  assert.match(ballistaStats(s, s.defend.ballistaRanks), /burn a second/);
  assert.match(tree.card(s, "q:heavyBolts:3"), /Siege bolts/);
  assert.ok(respecBallistas(s).ok);
  assert.equal(s.knowledge, before);
  assert.deepEqual(decodeBallistaRanks({ heavyBolts: 2, windlass: 4 }), { heavyBolts: 2 });
  for (const p of BALLISTA_PATHS) assert.equal(p.ranks.length, 3, p.name);
});
