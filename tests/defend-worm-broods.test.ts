import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ENEMIES, UPGRADES, type EnemyKind } from "../src/defend/catalog.ts";
import { DefendSim, type Levels } from "../src/defend/sim.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { cellIndex } from "../src/defend/grid.ts";
import { BLIGHT_WORM, wormTuning, isBlightWorm, type BlightWormKind } from "../src/defend/blight-worm-tuning.ts";
import { wormTrailAt } from "../src/defend/blight-worm.ts";
import { stepEnemy } from "../src/defend/enemies.ts";
import { buildWave, WORM_WAVES, slots, waveCap, waveDifficulty } from "../src/defend/waves.ts";
import { groundBody } from "../src/defend/enemy-crowd.ts";
import { onFoot } from "../src/defend/wall-defenses.ts";
import { nearest } from "../src/defend/pathing.ts";
import { damageModifier } from "../src/defend/enemy-abilities.ts";
import { chillByMage } from "../src/defend/mage-attunements.ts";
import { wormBodyVisible } from "../src/defend/blight-worm-art.ts";
import { basicName, basicUnitPieces } from "../src/defend/basic-unit-art.ts";
import { journalHTML } from "../src/defend/journal.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
function fixture() {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, 4);
  sim.beginManualWave(40, 4800, 3); sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
  sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.rocks.fill(0);
  sim.map.type.fill(CellType.OUT); sim.map.owner.fill(-1); sim.map.wall.fill(0);
  sim.hp.fill(0); sim.built.fill(0); sim.soldiers = []; sim.civilians = [];
  return sim;
}
function worm(sim: DefendSim, kind: BlightWormKind, x = 20.5, y = 40) {
  const count = sim.enemies.length; assert.ok(sim.releaseEnemy(kind, { x, y }));
  return sim.enemies.slice(count);
}
function tick(sim: DefendSim, dt = 1 / 120) {
  sim.time += dt;
  for (const e of sim.enemies) if (e.hp > 0) stepEnemy(sim, e, dt);
}
const sweep = (sim: DefendSim) => (sim as any).sweepAway();
function treeHP(kind: EnemyKind): number {
  const d = ENEMIES[kind];
  return (d.chainLength ?? 1) * (d.hp + (d.splits ? d.splits.count * treeHP(d.splits.into) : 0));
}
function wall(sim: DefendSim, x = 20, y = 42) {
  const b = sim.map.buildings.find(b => b.kind === "wall")!;
  b.rect = { x, y, w: 1, h: 1 }; b.cells = [cellIndex(x, y)];
  const i = b.cells[0]; sim.map.owner[i] = b.id; sim.map.wall[i] = 1;
  sim.solid[i] = sim.foeSolid[i] = sim.ownSolid[i] = sim.built[b.id] = 1;
  sim.hp[b.id] = sim.maxHp[b.id] = 1e6;
  return b;
}

for (const [kind, count, pixels, bodies, child] of [
  ["smallBlightWorm", 7, 2, 70, "darkling"],
  ["mediumBlightWorm", 14, 3, 308, "largeDarkling"],
] as const) {
  test(`${kind}: native segment count, exact size/spacing, fourfold surface timers and complete offspring tree`, () => {
    const sim = fixture(), segments = worm(sim, kind), tuning = wormTuning(kind);
    assert.equal(segments.length, count); assert.equal(ENEMIES[kind].darkPixels, pixels);
    assert.ok(ENEMIES[kind].scriptedOnly && ENEMIES[kind].unyielding && !ENEMIES[kind].boss);
    assert.equal(ENEMIES[kind].size, pixels / 8); assert.equal(slots(ENEMIES[kind]), bodies);
    assert.deepEqual(ENEMIES[kind].splits, { into: child, count: 3 });
    for (let i = 1; i < count; i++) { close(segments[i - 1].y - segments[i].y, pixels / 8); assert.equal(segments[i].leader, segments[i - 1].id); }
    const h = segments[0].worm!.head!;
    assert.ok(h.surfaceT >= 40 && h.surfaceT < 72);
    assert.equal(tuning.surfaceMin, BLIGHT_WORM.surfaceMin * 4); assert.equal(tuning.surfaceRange, BLIGHT_WORM.surfaceRange * 4);
    const piece = basicUnitPieces().find(p => p.name === basicName(kind, true))!;
    assert.equal(piece.w, pixels); assert.ok(piece.pixels().every(p => p === 0xff000000));
    assert.match(journalHTML([kind]), new RegExp(ENEMIES[kind].name));
    for (let n = 0; n < 7 && sim.enemies.length; n++) { sim.enemies.forEach(e => e.hp = 0); sweep(sim); }
    assert.equal(sim.enemies.length, 0); assert.equal(sim.slain[kind], count);
    assert.equal(Object.values(sim.slain).reduce((a, b) => a + b, 0), bodies);
  });

  test(`${kind}: a native spawn has only its head on board and unspools the body`, () => {
    const sim = fixture(); (sim as any).spawnEnemy(kind);
    const segments = sim.enemies, head = segments[0], tuning = wormTuning(kind);
    close(head.y, tuning.entryY); assert.equal(head.untargetable, undefined);
    assert.ok(segments.slice(1).every(e => e.y < 0 && e.untargetable));
    head.worm!.head!.turnT = 1e6;
    for (let n = 0; n < 15; n++) tick(sim);
    assert.ok(segments[1].y > 0 && !segments[1].untargetable);
  });

  test(`${kind}: trail corners and all ${count} native wall hits use its own body geometry and damage`, () => {
    const sim = fixture(), b = wall(sim), segments = worm(sim, kind), head = segments[0];
    const h = head.worm!.head!, tuning = wormTuning(kind); h.surfaceT = h.turnT = 1e6;
    const touched = new Set<number>();
    // Each segment records its own hit ledger when native contact runs.
    let bounce: { x: number; y: number } | undefined;
    const passed = Array(count).fill(Infinity);
    for (let i = 0; i < 1400; i++) {
      tick(sim);
      if (!bounce && h.dy !== 1) { bounce = { x: head.x, y: head.y }; assert.ok(h.dy <= Math.SQRT1_2 + 1e-8); }
      for (let n = 0; n < count; n++) {
        if (segments[n].worm!.surfaceHits.has(b.id)) touched.add(segments[n].id);
        if (bounce) passed[n] = Math.min(passed[n], Math.hypot(segments[n].x - bounce.x, segments[n].y - bounce.y));
      }
      if (touched.size === count && passed.every(d => d < .04)) break;
    }
    assert.ok(bounce); assert.equal(touched.size, count); assert.ok(passed.every(d => d < .04));
    close(1e6 - sim.hp[b.id], count * tuning.contactDamage);
    for (let n = 1; n < count; n++) {
      close(segments[n - 1].worm!.s - segments[n].worm!.s, tuning.spacing);
      const p = wormTrailAt(head.worm!.trail, segments[n].worm!.s);
      close(segments[n].x, p.x); close(segments[n].y, p.y);
    }
  });

  test(`${kind}: underground immunity, targeting, scaled damage and native chill rules`, () => {
    const sim = fixture(), b = wall(sim), segments = worm(sim, kind), head = segments[0], body = segments[1], tuning = wormTuning(kind);
    assert.equal(groundBody(head), false);
    sim.hurtEnemy(head, 1); sim.hurtEnemy(body, 1);
    close(head.hp, tuning.hp - 4); close(body.hp, tuning.hp - 1);
    head.freeze = head.stagger = 10;
    const y = head.y; tick(sim, .1); close(head.y - y, tuning.surfaceSpeed * .1);
    chillByMage(head, .25, 5, 2);
    const cy = head.y; tick(sim, .1); close(head.y - cy, tuning.surfaceSpeed * .25 * .1);
    head.worm!.head!.surfaceT = 0; sim.rand = () => .5;
    tick(sim);
    assert.ok(head.burrow); assert.equal(head.untargetable, true); assert.equal(wormBodyVisible(head), false);
    assert.equal(onFoot(head), false); assert.equal(damageModifier(sim, head, undefined, "ranged", true), 0);
    const hp = head.hp; sim.hurtEnemy(head, 1000, true, "ranged", undefined, true, "explosion", 1); assert.equal(head.hp, hp);
    assert.notEqual(nearest(sim.enemies, head.x, head.y, 1), head);
    for (let n = 0; n < 1800 && (head.burrow || segments.some(e => e.burrow)); n++) tick(sim);
    assert.ok(!head.burrow && segments.every(e => !e.burrow));
    close(1e6 - sim.hp[b.id], count * tuning.burrowDamage);
    assert.ok(head.worm!.head!.surfaceT > 39 && head.worm!.head!.surfaceT <= 72, 'new surface spell also uses the long timer');
  });
}

for (const kind of ["smallBlightWorm", "mediumBlightWorm", "blightWorm"] as const) {
  for (const piece of [1, 2, 3]) for (const side of ["front", "back"] as const) {
    test(`${kind}: ${piece}-segment ${side} piece dies with ordinary offspring and no duplicate splits`, () => {
      const sim = fixture(), segments = worm(sim, kind), length = segments.length;
      const index = side === "front" ? piece : length - piece - 1;
      segments[index].hp = 0;
      // Reverse order to catch accidental dependence on the native head-first array.
      sim.enemies.reverse(); sweep(sim);
      const remaining = segments.filter(e => e.hp > 0), expected = length - piece - 1;
      const survivorCount = expected >= 4 ? expected : 0;
      assert.equal(remaining.length, survivorCount);
      assert.equal(sim.slain[kind], length - survivorCount);
      const child = ENEMIES[kind].splits!.into;
      assert.equal(sim.enemies.filter(e => e.kind === child).length, (length - survivorCount) * 3);
      const hash = JSON.stringify(sim.slain); sweep(sim); assert.equal(JSON.stringify(sim.slain), hash);
      if (survivorCount) { const head = remaining.find(e => e.leader === undefined)!; assert.ok(head.worm!.head); }
    });
  }
  test(`${kind}: four-segment pieces survive and newly exposed heads take 4× damage`, () => {
    const sim = fixture(), segments = worm(sim, kind), cut = segments.length - 5;
    segments[cut].hp = 0; sweep(sim);
    const tail = segments.slice(cut + 1); assert.equal(tail.length, 4); assert.ok(tail.every(e => e.hp > 0));
    const h = tail[0]; assert.equal(h.leader, undefined);
    const hp = h.hp; sim.hurtEnemy(h, 1); close(hp - h.hp, 4);
    const before = h.x; h.worm!.head!.dx = 1; h.worm!.head!.dy = 0; tick(sim, .1); assert.ok(h.x > before);
  });
}

test("an underground short piece releases surfaced young on open cells, without harming another worm", () => {
  const sim = fixture(), a = worm(sim, "smallBlightWorm", 20.5, 40.5), other = worm(sim, "smallBlightWorm", 25, 40), b = wall(sim, 20, 40);
  for (const e of a) { e.x = 20.5; e.y = 40.5; e.burrow = 1; }
  a[3].hp = 0; sweep(sim);
  assert.ok(a.every(e => e.hp <= 0)); assert.ok(other.every(e => e.hp > 0));
  assert.equal(sim.slain.smallBlightWorm, 7);
  const children = sim.enemies.filter(e => e.kind === "darkling"); assert.equal(children.length, 21);
  for (const child of children) {
    assert.equal(child.burrow, undefined);
    assert.equal(sim.foeSolid[cellIndex(Math.floor(child.x), Math.floor(child.y))], 0);
  }
  assert.ok(sim.hp[b.id] > 0);
});

test("waves 21–39 have exact escalating worm rosters, no RNG, interleaving, full-tree accounting and unchanged global caps", () => {
  let hp = 0, bodies = 0;
  for (let n = 21; n <= 39; n++) {
    const q = buildWave(n, () => { throw Error("authored wave rolled"); });
    assert.ok(q.every(k => k === "smallBlightWorm" || k === "mediumBlightWorm"));
    for (const [kind, count] of WORM_WAVES[n]) {
      assert.equal(q.filter(k => k === kind).length, count);
      const bands = Math.min(4, count);
      for (let i = 0; i < bands; i++) assert.ok(q.slice(Math.floor(q.length * i / bands), Math.floor(q.length * (i + 1) / bands)).includes(kind));
    }
    const nextHP = q.reduce((sum, k) => sum + treeHP(k), 0), nextBodies = q.reduce((sum, k) => sum + slots(ENEMIES[k]), 0);
    assert.ok(nextHP > hp); assert.ok(nextBodies > bodies && nextBodies <= 5000); hp = nextHP; bodies = nextBodies;
    assert.equal(waveDifficulty(n), q.reduce((sum, k) => sum + ENEMIES[k].cost, 0));
    q.pop(); assert.notEqual(q.length, buildWave(n, () => 0).length);
  }
  assert.equal(hp, 63000); assert.equal(bodies, 4760);
  assert.equal(waveCap(20), 7000); assert.equal(waveCap(40), 21000);
  for (const n of [19, 21, 39, 41, 181, 200, 201]) assert.equal(waveCap(n), 5000);
  for (const n of [41, 181, 201]) assert.ok(buildWave(n, () => .5).every(k => !ENEMIES[k].scriptedOnly));
});

test("wave 40 releases three independent boss worms and the entire 20400-body tree fits and spawns", () => {
  const q = buildWave(40, () => { throw Error("boss wave rolled"); });
  assert.deepEqual(q, ["blightWorm", "blightWorm", "blightWorm"]); assert.equal(waveDifficulty(40), 4800);
  assert.equal(q.reduce((sum, k) => sum + slots(ENEMIES[k]), 0), 20400);
  const sim = fixture(); for (const [n, k] of q.entries()) worm(sim, k as BlightWormKind, 15 + n * 15, .5);
  assert.equal(sim.enemies.length, 150);
  assert.equal(sim.enemies.filter(e => e.leader === undefined).length, 3);
  assert.equal(new Set(sim.enemies.map(e => e.worm!.trail)).size, 3);
  for (let n = 0; n < 7 && sim.enemies.length; n++) { sim.enemies.forEach(e => e.hp = 0); sweep(sim); }
  assert.equal(sim.enemies.length, 0); assert.equal(sim.slain.blightWorm, 150); assert.equal(sim.slain.significantDarkling, 450);
  assert.equal(Object.values(sim.slain).reduce((a, b) => a + b, 0), 20400);
});

test("mixed worm sizes, cuts and dive state are deterministic with the same seed", () => {
  const run = () => {
    const sim = fixture(), a = worm(sim, "smallBlightWorm"), b = worm(sim, "mediumBlightWorm", 28), c = worm(sim, "blightWorm", 35);
    for (let i = 0; i < 120; i++) {
      tick(sim);
      if (i === 20) a[3].hp = 0;
      if (i === 40) b[5].hp = 0;
      if (i === 60) c[3].hp = 0;
      sweep(sim);
    }
    return createHash("sha256").update(JSON.stringify(sim.enemies)).digest("hex");
  };
  assert.equal(run(), run()); assert.ok(isBlightWorm("mediumBlightWorm"));
});
