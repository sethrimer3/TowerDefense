import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { ENEMIES, UPGRADES, type EnemyKind } from "../src/defend/catalog.ts";
import { DefendSim, type Levels, type Soldier, type Civilian } from "../src/defend/sim.ts";
import { generateCity, CellType } from "../src/defend/citygen.ts";
import { defaultLayout, fitLayout } from "../src/defend/layout.ts";
import { CELLS_W, cellIndex } from "../src/defend/grid.ts";
import { stepEnemy } from "../src/defend/enemies.ts";
import { BLIGHT_WORM as W, wormTrailAt, wormOpenPoint, wormOnTowerTile } from "../src/defend/blight-worm.ts";
import { groundBody } from "../src/defend/enemy-crowd.ts";
import { onFoot } from "../src/defend/wall-defenses.ts";
import { nearest } from "../src/defend/pathing.ts";
import { damageModifier } from "../src/defend/enemy-abilities.ts";
import { healthbarEnemies } from "../src/defend/healthbars.ts";
import { buildingContactPoint } from "../src/defend/contact.ts";
import { buildWave, slots, waveCap, waveDifficulty, DARKLING_WAVES } from "../src/defend/waves.ts";
import { basicName, basicUnitPieces } from "../src/defend/basic-unit-art.ts";
import { chillByMage } from "../src/defend/mage-attunements.ts";
import { wormBodyVisible, drawWormShadow, WORM_BURROW_ART } from "../src/defend/blight-worm-art.ts";
import { journalHTML } from "../src/defend/journal.ts";

const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const fixture = (seed = 4) => {
  const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Levels, seed);
  sim.beginManualWave(20, 1600, 1);
  sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
  sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.rocks.fill(0);
  sim.map.type.fill(CellType.OUT); sim.map.owner.fill(-1); sim.map.wall.fill(0);
  sim.hp.fill(0); sim.built.fill(0); sim.civilians = []; sim.soldiers = [];
  return sim;
};
function structure(sim: DefendSim, id: number, x: number, y: number, w = 1, h = 1) {
  const b = sim.map.buildings[id]; b.rect = { x, y, w, h }; b.cells = [];
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) {
    const cell = cellIndex(cx, cy); b.cells.push(cell); sim.map.owner[cell] = id;
    sim.foeSolid[cell] = sim.solid[cell] = sim.ownSolid[cell] = 1;
    if (b.kind === "wall") sim.map.wall[cell] = 1;
  }
  sim.hp[id] = sim.maxHp[id] = 100000; sim.built[id] = b.cells.length;
  return b;
}
function worm(sim: DefendSim, x = 20.5, y = 40) {
  assert.ok(sim.releaseEnemy("blightWorm", { x, y }));
  const segments = sim.enemies.filter(e => e.kind === "blightWorm");
  segments[0].worm!.head!.surfaceT = 1e6;
  segments[0].worm!.head!.turnT = 1e6;
  return segments;
}
function tick(sim: DefendSim, dt = 1 / 120) {
  sim.time += dt;
  for (const e of sim.enemies) if (e.hp > 0) stepEnemy(sim, e, dt);
}
const sweep = (sim: DefendSim) => (sim as any).sweepAway();
const treeHP = (kind: EnemyKind): number => {
  const d = ENEMIES[kind];
  return (d.chainLength ?? 1) * (d.hp + (d.splits ? d.splits.count * treeHP(d.splits.into) : 0));
};

test("Significant Darkling is five art pixels, releases two majors and descends through exactly 45 bodies", () => {
  const sim = fixture(), def = ENEMIES.significantDarkling;
  assert.deepEqual(def.splits, { into: "majorDarkling", count: 2 });
  assert.equal(slots(def), 45); assert.equal(def.darkPixels, 5); assert.equal(def.size, 5 / 8);
  assert.ok(def.portalOutline && def.scriptedOnly && def.faction === "darkOne");
  const e = sim.spawnAuxiliary("significantDarkling", 20, 20)!;
  e.hp = 0; sweep(sim);
  assert.deepEqual(sim.enemies.map(e => e.kind), ["majorDarkling", "majorDarkling"]);
  while (sim.enemies.length) { for (const e of sim.enemies) e.hp = 0; sweep(sim); }
  assert.equal(Object.values(sim.slain).reduce((a, b) => a + b, 0), 45);
  for (const kind of ["significantDarkling", "blightWorm"] as const) {
    const piece = basicUnitPieces().find(p => p.name === basicName(kind, true))!;
    assert.equal(piece.name, `enemies/${kind}-body`); assert.equal(piece.w, 5); assert.equal(piece.h, 5);
    assert.ok(piece.pixels().every(p => p === 0xff000000));
    assert.match(journalHTML([kind]), new RegExp(ENEMIES[kind].name));
  }
});

test("waves 11–19 use exact, interleaved darkling rosters, increasing split-tree HP, no RNG, and bounded slots", () => {
  const all = new Set<EnemyKind>(); let hp = treeHP("majorDarkling") * 50;
  const bodies = [1330, 2080, 2650, 3280, 3350, 4500, 4410, 4790, 4940];
  for (let n = 11; n <= 19; n++) {
    const q = buildWave(n, () => { throw Error("authored wave rolled"); });
    for (const [kind, count] of DARKLING_WAVES[n]) {
      assert.equal(q.filter(k => k === kind).length, count); all.add(kind);
      // Each quarter of the five-second release contains this kind.
      for (let i = 0; i < 4; i++) assert.ok(q.slice(Math.floor(q.length * i / 4), Math.floor(q.length * (i + 1) / 4)).includes(kind));
    }
    assert.ok(q.every(k => k.endsWith("Darkling") || k === "darkling"));
    const reserved = q.reduce((s, k) => s + slots(ENEMIES[k]), 0), nextHP = q.reduce((s, k) => s + treeHP(k), 0);
    assert.equal(reserved, bodies[n - 11]); assert.ok(reserved <= waveCap(n)); assert.ok(nextHP > hp); hp = nextHP;
    assert.equal(waveDifficulty(n), q.reduce((s, k) => s + ENEMIES[k].cost, 0));
  }
  assert.equal(all.size, 5);
  assert.equal(waveCap(19), 5000); assert.equal(waveCap(20), 7000); assert.equal(waveCap(21), 5000); assert.equal(waveCap(181), 5000);
});

test("wave 20 is one 50-segment worm and every body in its 6800-body tree spawns", () => {
  assert.deepEqual(buildWave(20, () => { throw Error("boss rolled"); }), ["blightWorm"]);
  assert.equal(slots(ENEMIES.blightWorm), 6800); assert.ok(6800 <= waveCap(20));
  const sim = fixture(), segments = worm(sim, 20.5, .5);
  assert.equal(segments.length, 50);
  close(segments[49].y, .5 - 49 * W.spacing);
  assert.ok(segments.slice(1).every(e => e.y < 0 && e.untargetable));
  const head = segments[0]; head.worm!.head!.turnT = 1e6;
  for (let i = 0; i < 15; i++) tick(sim, 1 / 30);
  assert.ok(segments[1].y > 0 && !segments[1].untargetable);
  assert.ok(segments[49].y < 0);
  let rounds = 0;
  while (sim.enemies.length) { for (const e of sim.enemies) e.hp = 0; sweep(sim); assert.ok(++rounds <= 6); }
  assert.equal(Object.values(sim.slain).reduce((a, b) => a + b, 0), 6800);
  assert.equal(sim.slain.blightWorm, 50); assert.equal(sim.slain.significantDarkling, 150);
  assert.equal(sim.slain.majorDarkling, 300); assert.equal(sim.slain.miniDarkling, 3600);
  assert.equal((sim as any).waveSpawned, 6800);
});

test("a head lost at the spawn edge promotes a tail segment that continues unspooling", () => {
  const sim = fixture(), segments = worm(sim, 20, .5);
  segments[0].hp = 0; sweep(sim);
  const head = segments[1];
  assert.equal(head.leader, undefined); assert.ok(head.y < 0);
  for (let i = 0; i < 30; i++) tick(sim, 1 / 30);
  assert.ok(head.y > 2 && !head.untargetable);
  close(head.x, 20);
});

test("followers traverse a head's exact turn with constant arc spacing and bounded trail storage", () => {
  const sim = fixture(), segments = worm(sim), head = segments[0];
  for (let i = 0; i < 240; i++) tick(sim);
  const turn = { x: head.x, y: head.y }, seen = segments.map(() => Infinity);
  head.worm!.head!.dx = 1; head.worm!.head!.dy = 0;
  for (let i = 0; i < 1300; i++) {
    tick(sim);
    for (let n = 1; n < segments.length; n++) {
      const e = segments[n]; seen[n] = Math.min(seen[n], Math.hypot(e.x - turn.x, e.y - turn.y));
      close(segments[n - 1].worm!.s - e.worm!.s, W.spacing);
      const p = wormTrailAt(head.worm!.trail, e.worm!.s);
      close(e.x, p.x); close(e.y, p.y);
    }
  }
  for (let n = 1; n < seen.length; n++) assert.ok(seen[n] < .03, `segment ${n} missed turn: ${seen[n]}`);
  assert.ok(head.worm!.trail.count <= W.trailCapacity);
  const t = head.worm!.trail, first = t.points[t.start];
  assert.ok(head.worm!.s - first.s <= W.trailLength + 1e-6);
});

for (const dt of [1 / 30, 1 / 120]) test(`wall bounce at ${1 / dt} Hz stops at contact, turns ≥45°, and all 50 segments strike the stone once`, () => {
  const sim = fixture(), wallId = sim.map.buildings.find(b => b.kind === "wall")!.id;
  const wall = structure(sim, wallId, 20, 48), segments = worm(sim), head = segments[0];
  const hits = new Map<number, number>(), original = sim.damageBuilding.bind(sim);
  sim.damageBuilding = (id, damage) => { if (id === wallId) hits.set(id, (hits.get(id) ?? 0) + 1); original(id, damage); };
  let bounced = false;
  for (let i = 0; i < 16 / dt; i++) {
    const incoming = { x: head.worm!.head!.dx, y: head.worm!.head!.dy };
    tick(sim, dt);
    if (!bounced && hits.size) {
      const h = head.worm!.head!;
      assert.ok(incoming.x * h.dx + incoming.y * h.dy <= Math.SQRT1_2 + 1e-8);
      const contact = buildingContactPoint(sim, head, wall); close(head.x, contact.x); close(head.y, contact.y);
      bounced = true;
      h.turnT = 1e6;
    }
  }
  assert.ok(bounced); assert.equal(hits.get(wallId), 50);
  assert.equal(100000 - sim.hp[wallId], W.contactDamage * 50);
});

test("surface wandering ignores keep/flow, freeze/stagger, body packing; chill slows only the head", () => {
  const a = fixture(), b = fixture(), aa = worm(a), bb = worm(b);
  a.keep.rect = { x: 5, y: 60, w: 4, h: 4 }; b.keep.rect = { x: 60, y: 10, w: 4, h: 4 };
  a.field.fill(1); b.field.fill(10000);
  aa[0].worm!.head!.turnT = bb[0].worm!.head!.turnT = 0;
  for (let i = 0; i < 600; i++) { aa[0].freeze = 100; aa[0].stagger = 100; tick(a); tick(b); }
  for (let i = 0; i < aa.length; i++) { close(aa[i].x, bb[i].x); close(aa[i].y, bb[i].y); assert.equal(groundBody(aa[i]), false); }
  const h = aa[0], before = { x: h.x, y: h.y };
  h.worm!.head!.turnT = 1e6; chillByMage(h, .5, 10, 10); tick(a, .1);
  close(Math.hypot(h.x - before.x, h.y - before.y), W.surfaceSpeed * .5 * .1);
  close(aa[0].worm!.s - aa[1].worm!.s, W.spacing);
});

test("burrow is a straight, immune, untargetable shadow; each segment hits walls, structures and its target once at quarter damage", () => {
  const sim = fixture(), keep = structure(sim, sim.keepId, 20, 54, 4, 4);
  const wall = structure(sim, sim.map.buildings.find(b => b.kind === "wall")!.id, 21, 49);
  const house = structure(sim, sim.map.buildings.find(b => b.kind === "house")!.id, 21, 51);
  const segments = worm(sim, 21.5, 44), head = segments[0], start = { x: head.x, y: head.y };
  head.worm!.head!.surfaceT = 0;
  sim.rand = () => 0; // Pick the keep, the first standing building in stable ID order.
  assert.equal(W.burrowDamage, 5 / 4);
  const hits = new Map<number, number>(), damageBuilding = sim.damageBuilding.bind(sim);
  sim.damageBuilding = (id, amount) => { if (amount === W.burrowDamage) hits.set(id, (hits.get(id) ?? 0) + 1); damageBuilding(id, amount); };
  tick(sim);
  const h = head.worm!.head!, dx = h.dx, dy = h.dy;
  const center = { x: keep.rect.x + keep.rect.w / 2, y: keep.rect.y + keep.rect.h / 2 };
  close((center.x - start.x) * dy - (center.y - start.y) * dx, 0);
  assert.ok(head.burrow && segments[1].burrow === undefined, "segments dive in order");
  assert.equal(onFoot(head), false); assert.equal(wormBodyVisible(head), false);
  assert.equal(nearest([head], head), null); assert.equal(damageModifier(sim, head, undefined, "melee", false), 0);
  const hp = head.hp;
  for (const element of ["physical", "fire", "explosion"] as const) sim.hurtEnemy(head, 100, true, "ranged", undefined, true, element, 1);
  assert.equal(head.hp, hp); assert.ok(!healthbarEnemies(sim).includes(head));
  let surfaceY = 0, headSurfaced = false, lastSurfaced = false;
  for (let i = 0; i < 1900; i++) {
    tick(sim);
    if (head.burrow) close((head.x - start.x) * dy - (head.y - start.y) * dx, 0);
    else {
      if (!headSurfaced) { surfaceY = head.y; headSurfaced = true; }
      h.surfaceT = h.turnT = 1e6; h.dx = dx; h.dy = dy;
    }
    if (headSurfaced && segments.every(e => !e.burrow)) { lastSurfaced = true; break; }
  }
  assert.ok(headSurfaced && lastSurfaced); assert.ok(surfaceY >= keep.rect.y + keep.rect.h + W.burrowSpeed * W.burrowClearSeconds);
  for (const id of [wall.id, house.id, keep.id]) { assert.equal(hits.get(id), 50, `building ${id}`); close(100000 - sim.hp[id], 50 * 5 / 4); }
  assert.equal(head.untargetable, undefined); assert.ok(wormBodyVisible(head));
});

test("heads take 4× and a middle cut yields independent heads plus three surfaced Significant Darklings", () => {
  const sim = fixture(), segments = worm(sim), head = segments[0], body = segments[10];
  sim.hurtEnemy(head, 10); sim.hurtEnemy(body, 10);
  assert.equal(head.hp, W.hp - 40); assert.equal(body.hp, W.hp - 10);
  const cut = segments[24], behind = segments[25], spot = { x: cut.x, y: cut.y };
  cut.hp = 0; sweep(sim);
  assert.equal(behind.leader, undefined); assert.ok(behind.worm!.head);
  assert.equal(sim.enemies.filter(e => e.kind === "blightWorm" && e.leader === undefined).length, 2);
  assert.equal(healthbarEnemies(sim).filter(e => e.kind === "blightWorm").length, 1);
  assert.notEqual(head.worm!.trail, behind.worm!.trail);
  const children = sim.enemies.filter(e => e.kind === "significantDarkling"); assert.equal(children.length, 3);
  for (const e of children) { assert.ok(Math.hypot(e.x - spot.x, e.y - spot.y) < 1); assert.equal(e.burrow, undefined); }
  sim.hurtEnemy(behind, 10); assert.equal(behind.hp, W.hp - 40);
  behind.worm!.head!.dx = 1; behind.worm!.head!.dy = 0;
  behind.worm!.head!.surfaceT = behind.worm!.head!.turnT = 1e6;
  const before = { x: behind.x, y: head.y }; tick(sim, .1);
  assert.ok(behind.x > before.x && head.y > before.y);
  head.hp = 0; sweep(sim); assert.equal(segments[1].leader, undefined);
});

test("underground deaths hatch on nearest dry open ground, and late-wave caps stay 5000", () => {
  const sim = fixture(), keep = structure(sim, sim.keepId, 18, 18, 6, 6), e = sim.spawnAuxiliary("blightWorm", 21, 21)!;
  e.burrow = 1; e.hp = 0; sweep(sim);
  assert.equal(sim.enemies.length, 3);
  for (const child of sim.enemies) {
    assert.equal(sim.foeSolid[cellIndex(Math.floor(child.x), Math.floor(child.y))], 0);
    assert.equal(child.burrow, undefined);
  }
  assert.equal(wormOpenPoint(sim, { x: 21, y: 21 }).y < keep.rect.y || wormOpenPoint(sim, { x: 21, y: 21 }).x < keep.rect.x, true);
  sim.beginManualWave(181, 0, 0); (sim as any).waveSpawned = 5000;
  assert.equal(sim.spawnAuxiliary("significantDarkling", 1, 1), null);
  assert.equal(sim.releaseEnemy("blightWorm", { x: 1, y: .5 }), false);
});

test("an underground cut preserves its ray and the once-per-building pass ledger", () => {
  const sim = fixture(); structure(sim, sim.keepId, 20, 54, 4, 4);
  const segments = worm(sim, 22, 44), head = segments[0];
  head.worm!.head!.surfaceT = 0;
  for (let i = 0; i < 480; i++) tick(sim);
  const cut = segments[8], behind = segments[9];
  assert.ok(behind.burrow);
  const before = wormTrailAt(behind.worm!.trail, behind.worm!.s - .01);
  const tangent = { x: behind.x - before.x, y: behind.y - before.y };
  const pass = behind.worm!.pass;
  behind.worm!.burrowHits.add(sim.keepId);
  cut.hp = 0; sweep(sim);
  assert.equal(behind.leader, undefined); assert.equal(behind.worm!.head!.pass, pass);
  tick(sim);
  assert.ok(behind.worm!.burrowHits.has(sim.keepId));
  const h = behind.worm!.head!;
  assert.ok(h.dx * tangent.x + h.dy * tangent.y > 0);
});

for (const terrain of ["water", "rock", "edge"] as const) test(`surface heads bounce off ${terrain}`, () => {
  const sim = fixture(), segments = worm(sim, 20.5, terrain === "edge" ? 100 : 40), head = segments[0];
  if (terrain !== "edge") for (let x = 18; x <= 22; x++) {
    const cell = cellIndex(x, 42);
    if (terrain === "water") sim.map.type[cell] = CellType.WATER; else sim.rocks[cell] = 1;
  }
  for (let i = 0; i < 90 && head.worm!.head!.dy === 1; i++) tick(sim, 1 / 30);
  assert.ok(head.worm!.head!.dy <= Math.SQRT1_2 + 1e-8);
  assert.ok(head.y <= (terrain === "edge" ? 104 : 42) - W.spacing / 2);
});

test("a fence bounce closes through its empty cell margin to the painted rail", () => {
  const sim = fixture(), wallId = sim.map.buildings.find(b => b.kind === "wall")!.id;
  const fence = structure(sim, wallId, 20, 42);
  fence.fence = { x1: 20, y1: 42.5, x2: 21, y2: 42.5 };
  const head = worm(sim)[0];
  for (let i = 0; i < 90 && head.worm!.head!.dy === 1; i++) tick(sim, 1 / 30);
  assert.ok(sim.hp[wallId] < 100000);
  const contact = buildingContactPoint(sim, head, fence);
  close(head.x, contact.x); close(head.y, contact.y);
  assert.ok(head.y > 42 - W.spacing / 2 - .5 / 8);
});

test("an underground edge bounce stays submerged and every segment follows its exact turn", () => {
  const sim = fixture(); structure(sim, sim.keepId, 20, 98, 4, 4);
  const segments = worm(sim, 22, 50), head = segments[0], h = head.worm!.head!;
  h.surfaceT = 0; sim.rand = () => 0;
  tick(sim, 1 / 30); assert.ok(head.burrow);
  let bounce: { x: number; y: number } | undefined, surfaced = false;
  const nearest = segments.map(() => Infinity);
  for (let ticks = 0; ticks < 3300; ticks++) {
    tick(sim, 1 / 120);
    if (!bounce && h.dy !== 1) {
      assert.ok(head.burrow, "a board edge must bounce instead of surfacing");
      bounce = { x: head.x, y: head.y };
      assert.ok(h.dy <= Math.SQRT1_2 + 1e-8);
      assert.ok(h.outsideT < 1);
    }
    if (bounce) for (let n = 1; n < segments.length; n++) nearest[n] = Math.min(nearest[n], Math.hypot(segments[n].x - bounce.x, segments[n].y - bounce.y));
    if (bounce && !head.burrow) { surfaced = true; h.surfaceT = h.turnT = 1e6; }
    assert.ok(head.x >= 0 && head.x < 72 && head.y >= 0 && head.y < 104);
    if (surfaced && segments.every(e => !e.burrow)) break;
  }
  assert.ok(bounce && surfaced);
  assert.equal(wormOnTowerTile(sim, head), false);
  for (let n = 1; n < segments.length; n++) assert.ok(nearest[n] < .06, `segment ${n}: ${nearest[n]}`);
});

for (const rubble of [false, true]) test(`surfacing waits an uninterrupted second outside tower tiles, including ${rubble ? "rubble" : "a second tower"}`, () => {
  const sim = fixture(); structure(sim, sim.keepId, 20, 40, 2, 4);
  const tower = structure(sim, sim.map.buildings.find(b => b.kind === "house")!.id, 24, 40, 2, 4);
  tower.kind = "archerTower"; tower.structureUid = 777;
  if (rubble) { sim.hp[tower.id] = 0; sim.built[tower.id] = 0; }
  const head = worm(sim, 18, 42)[0]; sim.rand = () => 0;
  head.worm!.head!.surfaceT = 0;
  let surfaced = false;
  for (let n = 0; n < 800; n++) {
    tick(sim);
    if (!head.burrow) { surfaced = true; break; }
    if (head.x < 30.4375 - .001) assert.ok(head.burrow);
    if (head.x >= 23.5625 && head.x <= 26.4375) close(head.worm!.head!.outsideT, 0);
  }
  assert.ok(surfaced); assert.ok(head.x >= 30.4375 - 1e-6 && head.x < 30.6);
  assert.equal(wormOnTowerTile(sim, head), false);
});

for (const roll of [0, .4, .99]) test(`a dive uniformly targets a standing building at roll ${roll} and cannot surface short of it`, () => {
  const sim = fixture(); structure(sim, sim.keepId, 20, 65, 4, 4);
  structure(sim, sim.map.buildings.find(b => b.kind === "wall")!.id, 5, 55);
  structure(sim, sim.map.buildings.find(b => b.kind === "house")!.id, 45, 60, 2, 2);
  const candidates = sim.map.buildings.filter(b => sim.hp[b.id] > 0 && sim.intact(b));
  const target = candidates[Math.floor(roll * candidates.length)], head = worm(sim, 20, 40)[0];
  head.worm!.head!.surfaceT = 0; sim.rand = () => roll;
  tick(sim);
  const h = head.worm!.head!, dx = target.rect.x + target.rect.w / 2 - head.x, dy = target.rect.y + target.rect.h / 2 - head.y;
  assert.equal(h.target, target.id); close(dx * h.dy - dy * h.dx, 0);
  for (let n = 0; n < 150; n++) tick(sim);
  assert.ok(head.burrow && !h.reached, "the empty approach must not trigger surfacing");
});

test("surface contact runs over troops and civilians without stopping or hitting every substep", () => {
  const sim = fixture(), head = worm(sim)[0], start = head.y;
  sim.enemies = [head];
  const soldier = { id: 10000, kind: "sword", hp: 100, maxHp: 100, home: -1, x: head.x, y: head.y + .2, flash: 0 } as Soldier;
  const civilian = { id: 10001, hp: 100, maxHp: 100, home: -1, x: head.x + .2, y: head.y + .2, flash: 0 } as Civilian;
  sim.soldiers.push(soldier); sim.civilians.push(civilian);
  tick(sim, .1);
  close(head.y - start, W.surfaceSpeed * .1);
  assert.equal(soldier.hp, 100 - W.contactDamage);
  assert.equal(civilian.hp, 100 - W.contactDamage);
});

test("burrow art has lighter shadows, dense head spray, sparse body dirt and motion/effects settings without sim draws", () => {
  const sim = fixture(), segments = worm(sim), head = segments[0], body = segments[1];
  head.burrow = body.burrow = 1;
  const state = JSON.stringify(segments);
  sim.rand = () => { throw Error("art must not roll the battle stream"); };
  function paint(e: typeof head, seconds: number, effects = true, reduceMotion = false) {
    const calls: unknown[] = [], c = { fillStyle: "", globalAlpha: 1, save() {}, restore() {},
      fillRect(...box: number[]) { calls.push([this.fillStyle, this.globalAlpha, ...box]); } };
    drawWormShadow({ c: c as unknown as CanvasRenderingContext2D, px: 16 }, e, seconds, effects, reduceMotion);
    return calls;
  }
  assert.equal(paint(head, 1).length, 3 + WORM_BURROW_ART.headClods);
  assert.equal(paint(body, 1).length, 3 + WORM_BURROW_ART.bodyClods);
  assert.equal(paint(head, 1, false).length, 3);
  assert.notDeepEqual(paint(head, 1), paint(head, 1.2));
  assert.deepEqual(paint(head, 1, true, true), paint(head, 9, true, true));
  const alpha = 1 - WORM_BURROW_ART.shadow.reduce((clear, [, a]) => clear * (1 - a), 1);
  assert.ok(alpha > .2 && alpha < .3, `shadow alpha ${alpha}`);
  assert.equal(JSON.stringify(segments), state);
});

test("same-seed worm motion, phase transitions, cuts and cooldowns hash identically", () => {
  function run(seed: number) {
    const sim = fixture(seed); structure(sim, sim.keepId, 20, 54, 4, 4); const segments = worm(sim);
    segments[0].worm!.head!.surfaceT = 2; segments[0].worm!.head!.turnT = 0;
    const hash = createHash("sha256");
    for (let i = 0; i < 2200; i++) {
      if (i === 400) { segments[20].hp = 0; sweep(sim); }
      tick(sim);
      if (i % 60 === 0) hash.update(JSON.stringify(sim.enemies.filter(e => e.worm), (_, value) => value instanceof Map || value instanceof Set ? [...value] : value));
    }
    return hash.digest("hex");
  }
  assert.equal(run(4), run(4)); assert.notEqual(run(4), run(5));
});
