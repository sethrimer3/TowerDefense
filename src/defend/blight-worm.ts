/** Kinematic Blight Worms follow arc length, never a flow field or a leader's
 * straight-line shortcut. Only this kind allocates state or draws randomness. */
import { BLIGHT_WORM as W } from "./blight-worm-tuning.ts";
export { BLIGHT_WORM } from "./blight-worm-tuning.ts";
import { dist, sq } from "../exact.ts";
import { CELLS_W, CELLS_H, cellIndex } from "./grid.ts";
import { CellType } from "./citygen.ts";
import { cellAt, cellCenter, center, clampCell, type Point } from "./pathing.ts";
import { structureContactRect, fenceContactRects, CONTACT_OUTLINE, defenderInContact } from "./contact.ts";
import { CHILL_SPEED } from "./catalog.ts";
import { mageChillSpeed } from "./mage-attunements.ts";
import type { DefendSim, Enemy } from "./sim.ts";

type TrailPoint = Point & { s: number; under: boolean; pass: number; target?: number; reached?: boolean };
export type WormTrail = { points: TrailPoint[]; start: number; count: number };
type Head = {
  dx: number; dy: number; surfaceT: number; turnT: number;
  under: boolean; pass: number; outsideT: number; target?: number; reached: boolean;
};
export type WormState = {
  trail: WormTrail; s: number; head?: Head;
  surfaceHits: Map<number, number>; burrowHits: Set<number>; pass: number;
};
const abs = (n: number) => n < 0 ? -n : n;
const min = (a: number, b: number) => a < b ? a : b;
const EPS = 1e-8, HALF = W.spacing / 2;
const wrap = (i: number) => i >= W.trailCapacity ? i - W.trailCapacity : i;
const point = (t: WormTrail, n: number) => t.points[wrap(t.start + n)];
const trail = (): WormTrail => ({ points: [], start: 0, count: 0 });

function append(t: WormTrail, p: TrailPoint) {
  // Coalesce straight stretches, preserving every turn and phase boundary.
  if (t.count >= 2) {
    const a = point(t, t.count - 2), b = point(t, t.count - 1);
    if (a.under === p.under && b.under === p.under && a.pass === p.pass && b.pass === p.pass &&
        a.target === p.target && b.target === p.target && a.reached === p.reached && b.reached === p.reached &&
        b.s > a.s && p.s > b.s && abs((b.x - a.x) * (p.y - b.y) - (b.y - a.y) * (p.x - b.x)) < 1e-12 &&
        (b.x - a.x) * (p.x - b.x) + (b.y - a.y) * (p.y - b.y) > 0) {
      t.points[wrap(t.start + t.count - 1)] = p;
      trim(t, p.s); return;
    }
  }
  if (t.count === W.trailCapacity) { t.start = wrap(t.start + 1); t.count--; }
  t.points[wrap(t.start + t.count++)] = p;
  trim(t, p.s);
}
function trim(t: WormTrail, s: number) {
  const cutoff = s - W.trailLength;
  while (t.count > 2 && point(t, 1).s < cutoff) { t.start = wrap(t.start + 1); t.count--; }
  const a = point(t, 0), b = point(t, 1);
  if (a.s < cutoff && b.s > cutoff) {
    const f = (cutoff - a.s) / (b.s - a.s);
    t.points[t.start] = { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, s: cutoff, under: b.under, pass: b.pass, target: b.target, reached: b.reached };
  }
}

/** Position and phase at an exact distance behind the head. */
export function wormTrailAt(t: WormTrail, s: number): TrailPoint {
  for (let n = t.count - 1; n >= 0; n--) {
    const a = point(t, n);
    if (s < a.s && n > 0) continue;
    if (n === t.count - 1 || s <= a.s) return { ...a, s };
    const b = point(t, n + 1), f = (s - a.s) / (b.s - a.s);
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, s, under: b.under, pass: b.pass, target: b.target, reached: b.reached };
  }
  return { ...point(t, 0), s };
}

function randomHead(sim: DefendSim, dx: number, dy: number): Head {
  // Fixed draw order: surface duration, turn interval. Heading has its own draw.
  return { dx, dy, surfaceT: W.surfaceMin + sim.rand() * W.surfaceRange,
    turnT: W.turnMin + sim.rand() * W.turnRange, under: false, pass: 0, outsideT: 0, reached: false };
}
function randomHeading(sim: DefendSim): Point {
  const x = sim.rand() * 2 - 1, y = sim.rand() * 2 - 1, d = dist(x, y);
  return d > EPS ? { x: x / d, y: y / d } : { x: 0, y: 1 };
}

/** Spawn behind the edge, spaced on a real incoming trail, without clamping
 * the tail onto the first row. Followers become targetable on entering. */
export function initWorm(sim: DefendSim, segments: Enemy[]) {
  const first = segments[0], t = trail();
  append(t, { x: first.x, y: first.y - W.trailLength, s: -W.trailLength, under: false, pass: 0 });
  append(t, { x: first.x, y: first.y, s: 0, under: false, pass: 0 });
  for (let n = 0; n < segments.length; n++) {
    const e = segments[n];
    e.y = first.y - n * W.spacing;
    e.worm = { trail: t, s: -n * W.spacing, surfaceHits: new Map(), burrowHits: new Set(), pass: 0 };
    if (n === 0) e.worm.head = randomHead(sim, 0, 1);
    setPhase(e, false);
  }
}

function onBoard(p: Point, r = 0) { return p.x >= r && p.y >= r && p.x < CELLS_W - r && p.y < CELLS_H - r; }
function setPhase(e: Enemy, under: boolean) {
  if (under) e.burrow = 1; else delete e.burrow;
  if (under || !onBoard(e)) e.untargetable = true; else delete e.untargetable;
}

/** Promote at cuts, copying only the trail behind this segment. Its old
 * followers still find the same arc coordinates on the new private trail. */
export function promoteWorm(sim: DefendSim, e: Enemy) {
  delete e.leader;
  const w = e.worm!;
  if (w.head) return;
  const t = trail(), at = wormTrailAt(w.trail, w.s), before = wormTrailAt(w.trail, w.s - .01);
  for (let n = 0; n < w.trail.count; n++) {
    const p = point(w.trail, n);
    if (p.s < w.s) append(t, { ...p });
  }
  append(t, at);
  const d = dist(at.x - before.x, at.y - before.y);
  w.trail = t;
  w.head = randomHead(sim, d > EPS ? (at.x - before.x) / d : 0, d > EPS ? (at.y - before.y) / d : 1);
  w.head.pass = at.pass;
  if (at.under) dive(sim, e, at);
}

/** Nearby building IDs only; a large keep is still one hit per segment. */
function buildingsAt(sim: DefendSim, p: Point, radius: number, solidOnly = true): number[] {
  const ids = new Set<number>();
  for (let y = clampCell(p.y - radius - 1, CELLS_H); y <= clampCell(p.y + radius + 1, CELLS_H); y++)
    for (let x = clampCell(p.x - radius - 1, CELLS_W); x <= clampCell(p.x + radius + 1, CELLS_W); x++) {
      const id = sim.map.owner[cellIndex(x, y)];
      if (id >= 0 && (!solidOnly || sim.foeSolid[cellIndex(x, y)]) && sim.intact(sim.map.buildings[id])) ids.add(id);
    }
  return [...ids];
}
function touching(sim: DefendSim, p: Point, id: number, underground: boolean, epsilon = EPS) {
  const b = sim.map.buildings[id];
  const rects = underground ? [b.rect] : b.fence ? fenceContactRects(b) : [structureContactRect(sim, b)];
  const half = underground ? W.burrowWidth / 2 : HALF + CONTACT_OUTLINE + (b.kind === "wall" && !b.fence ? CONTACT_OUTLINE : 0);
  return rects.some(r => p.x >= r.x - half - epsilon && p.x <= r.x + r.w + half + epsilon &&
    p.y >= r.y - half - epsilon && p.y <= r.y + r.h + half + epsilon);
}

/** Negative epsilon permits sitting flush at the native contact perimeter. */
function obstacle(sim: DefendSim, p: Point): { building?: number } | null {
  const r = HALF + CONTACT_OUTLINE;
  if (!onBoard(p, r)) return {};
  for (const id of buildingsAt(sim, p, r)) if (touching(sim, p, id, false, -EPS)) return { building: id };
  for (let y = clampCell(p.y - r, CELLS_H); y <= clampCell(p.y + r, CELLS_H); y++)
    for (let x = clampCell(p.x - r, CELLS_W); x <= clampCell(p.x + r, CELLS_W); x++) {
      const cell = cellIndex(x, y);
      if (sim.rocks[cell] || sim.map.type[cell] === CellType.WATER || sim.foeSolid[cell] && sim.map.owner[cell] < 0) return {};
    }
  return null;
}

function contact(sim: DefendSim, e: Enemy) {
  if (!onBoard(e)) return;
  const w = e.worm!, under = !!e.burrow;
  for (const [id, until] of w.surfaceHits) if (until <= sim.time) w.surfaceHits.delete(id);
  for (const id of buildingsAt(sim, e, under ? W.burrowWidth / 2 : HALF + 2 * CONTACT_OUTLINE, !under)) {
    if (!touching(sim, e, id, under)) continue;
    if (under) {
      if (w.burrowHits.has(id)) continue;
      w.burrowHits.add(id); sim.damageBuilding(id, W.burrowDamage);
    } else if (!w.surfaceHits.has(id)) {
      w.surfaceHits.set(id, sim.time + W.contactCooldown); sim.damageBuilding(id, W.contactDamage);
    }
  }
  if (under) return;
  for (const u of [...sim.soldiers, ...sim.civilians]) {
    // Unit keys cannot collide with nonnegative building IDs.
    const key = -u.id - 1;
    if (u.hp <= 0 || w.surfaceHits.has(key) || !defenderInContact(e, u)) continue;
    w.surfaceHits.set(key, sim.time + W.contactCooldown);
    sim.hurtDefender(u, W.contactDamage);
  }
}

function pose(sim: DefendSim, e: Enemy, p: TrailPoint) {
  e.x = p.x; e.y = p.y;
  if (p.pass !== e.worm!.pass) { e.worm!.burrowHits.clear(); e.worm!.pass = p.pass; }
  setPhase(e, p.under); contact(sim, e);
}
function record(e: Enemy) {
  const w = e.worm!, h = w.head!;
  append(w.trail, { x: e.x, y: e.y, s: w.s, under: h.under, pass: h.pass,
    ...(h.under ? { target: h.target, reached: h.reached } : {}) });
}
function turn(h: Head, cosine: number, sine: number) {
  const x = h.dx * cosine - h.dy * sine, y = h.dx * sine + h.dy * cosine, d = dist(x, y);
  h.dx = x / d; h.dy = y / d;
}
function clearAhead(sim: DefendSim, e: Enemy, dx: number, dy: number) {
  for (let s = W.probeStep; s <= W.lookAhead + EPS; s += W.probeStep)
    if (e.worm!.head!.under ? !onBoard({ x: e.x + dx * s, y: e.y + dy * s }, HALF + CONTACT_OUTLINE)
      : obstacle(sim, { x: e.x + dx * s, y: e.y + dy * s })) return false;
  return true;
}
function bounce(sim: DefendSim, e: Enemy) {
  const h = e.worm!.head!, choices: (readonly [number, number])[] = [];
  let cosine = -2;
  for (const rotation of W.bounces) {
    if (choices.length && rotation[0] !== cosine) break;
    const [c, s] = rotation, dx = h.dx * c - h.dy * s, dy = h.dx * s + h.dy * c;
    if (!clearAhead(sim, e, dx, dy)) continue;
    choices.push(rotation); cosine = c;
  }
  if (!choices.length) { h.dx = -h.dx; h.dy = -h.dy; }
  else {
    const roll = sim.rand(); let i = 0;
    while (i + 1 < choices.length && roll >= (i + 1) / choices.length) i++;
    turn(h, ...choices[i]);
  }
  if (!h.under) h.turnT = W.turnMin + sim.rand() * W.turnRange;
}

/** Placed structure tiles stay reserved even while their building is rubble.
 * Include the keep and troop buildings, and the whole segment/contour body. */
export function wormOnTowerTile(sim: DefendSim, p: Point): boolean {
  const r = HALF + 2 * CONTACT_OUTLINE;
  // Owner cells persist through collapse, so rubble tiles need no separate
  // index. Probe only cells under the body instead of scanning the city.
  for (let y = clampCell(p.y - r - EPS, CELLS_H); y <= clampCell(p.y + r + EPS, CELLS_H); y++)
    for (let x = clampCell(p.x - r - EPS, CELLS_W); x <= clampCell(p.x + r + EPS, CELLS_W); x++) {
      const b = sim.map.buildings[sim.map.owner[cellIndex(x, y)]];
      if (b && !b.hidden && b.structureUid !== undefined &&
          p.x >= b.rect.x - r && p.x <= b.rect.x + b.rect.w + r &&
          p.y >= b.rect.y - r && p.y <= b.rect.y + b.rect.h + r) return true;
    }
  return false;
}

function dive(sim: DefendSim, e: Enemy, continuing?: TrailPoint) {
  const h = e.worm!.head!;
  if (continuing) {
    h.target = continuing.target; h.reached = continuing.reached ?? true;
  } else {
    const targets = sim.map.buildings.filter(b => sim.hp[b.id] > 0 && sim.intact(b) && !sim.aloft(b.id));
    if (targets.length) {
      // Exactly one draw, in stable building order, for a uniform live target.
      const roll = sim.rand(); let i = 0;
      while (i + 1 < targets.length && roll >= (i + 1) / targets.length) i++;
      const target = targets[i], goal = center(target.rect), d = dist(goal.x - e.x, goal.y - e.y);
      h.target = target.id;
      if (d > EPS) { h.dx = (goal.x - e.x) / d; h.dy = (goal.y - e.y) / d; }
      h.reached = touching(sim, e, target.id, true);
    } else { delete h.target; h.reached = true; }
    h.pass++;
  }
  h.under = true; h.outsideT = 0;
  setPhase(e, true); record(e);
}

function burrowStep(sim: DefendSim, e: Enemy, amount: number) {
  const w = e.worm!, h = w.head!;
  const wasClear = h.reached && !wormOnTowerTile(sim, e);
  e.x += h.dx * amount; e.y += h.dy * amount; w.s += amount;
  if (!h.reached && h.target !== undefined && touching(sim, e, h.target, true)) h.reached = true;
  // Count only intervals wholly outside tiles; never surface a substep early.
  if (!h.reached || !wasClear || wormOnTowerTile(sim, e)) h.outsideT = 0;
  else h.outsideT += amount / W.burrowSpeed;
  record(e); pose(sim, e, point(w.trail, w.trail.count - 1));
  if (h.outsideT >= W.burrowClearSeconds - EPS && !obstacle(sim, e)) surface(sim, e);
}
function surface(sim: DefendSim, e: Enemy) {
  const h = e.worm!.head!, heading = randomHeading(sim);
  h.under = false; h.dx = heading.x; h.dy = heading.y;
  h.surfaceT = W.surfaceMin + sim.rand() * W.surfaceRange;
  h.turnT = W.turnMin + sim.rand() * W.turnRange;
  setPhase(e, false); record(e);
}

/** Deterministic nearest dry open center for underground offspring.
 * Bounded by the fixed board, no random draws. */
export function wormOpenPoint(sim: DefendSim, from: Point): Point {
  if (!obstacle(sim, from)) return { x: from.x, y: from.y };
  let best: Point | undefined, distance = Infinity;
  for (let y = 0; y < CELLS_H; y++) for (let x = 0; x < CELLS_W; x++) {
    const p = { x: x + .5, y: y + .5 }, d = sq(p.x - from.x) + sq(p.y - from.y);
    if (d < distance && !obstacle(sim, p)) { best = p; distance = d; }
  }
  return best ?? cellCenter(cellAt(from.x, from.y));
}

export function stepBlightWorm(sim: DefendSim, e: Enemy, dt: number) {
  if (!e.worm) initWorm(sim, [e]);
  const w = e.worm!;
  if (e.leader !== undefined) {
    const leader = sim.enemies.find(o => o.id === e.leader && o.hp > 0);
    if (leader?.worm) {
      w.trail = leader.worm.trail;
      const target = leader.worm.s - W.spacing;
      // Visit crossed vertices exactly, so every follower hits the bounce.
      const stops: number[] = [];
      for (let n = 0; n < w.trail.count; n++) {
        const p = point(w.trail, n); if (p.s > w.s && p.s <= target) stops.push(p.s);
      }
      stops.push(target);
      for (const stop of stops) {
        while (w.s < stop - EPS) { w.s += min(W.probeStep, stop - w.s); pose(sim, e, wormTrailAt(w.trail, w.s)); }
      }
      return;
    }
    promoteWorm(sim, e);
  }
  const h = w.head!;
  if (!h.under && onBoard(e, HALF + CONTACT_OUTLINE)) {
    h.surfaceT -= dt; h.turnT -= dt;
    if (h.surfaceT <= 0 && onBoard(e, HALF)) dive(sim, e);
    else if (h.turnT <= 0) {
      const sine = (sim.rand() * 2 - 1) * W.wanderTurn;
      turn(h, Math.sqrt(1 - sine * sine), sine);
      h.turnT = W.turnMin + sim.rand() * W.turnRange;
    }
  }
  const slow = min(e.chill ? CHILL_SPEED : 1, mageChillSpeed(e));
  let left = (h.under ? W.burrowSpeed : W.surfaceSpeed * slow) * dt;
  while (left > EPS) {
    const amount = min(W.probeStep, left);
    const x = e.x + h.dx * amount, y = e.y + h.dy * amount;
    if (h.under) {
      if (!onBoard({ x, y }, HALF + CONTACT_OUTLINE)) {
        let lo = 0, hi = amount;
        for (let n = 0; n < 24; n++) {
          const middle = (lo + hi) / 2;
          if (!onBoard({ x: e.x + h.dx * middle, y: e.y + h.dy * middle }, HALF + CONTACT_OUTLINE)) hi = middle; else lo = middle;
        }
        burrowStep(sim, e, lo);
        if (!h.under) break;
        // Ignore buildings, water and rocks below ground; only the board edge
        // filters the same fixed rotations used by a surface wall bounce.
        bounce(sim, e); left -= lo;
        continue;
      }
      burrowStep(sim, e, amount);
      if (!h.under) break;
    } else {
      // A new head behind a cut can still be unspooling outside the top.
      // Continue its incoming trail until the whole body has entered.
      const entering = e.y < HALF + CONTACT_OUTLINE && h.dy > 0 && e.x > HALF && e.x < CELLS_W - HALF;
      const hit = entering ? null : obstacle(sim, { x: x + h.dx * EPS * 4, y: y + h.dy * EPS * 4 });
      if (hit) {
        let lo = 0, hi = amount;
        for (let n = 0; n < 24; n++) {
          const middle = (lo + hi) / 2;
          if (obstacle(sim, { x: e.x + h.dx * middle, y: e.y + h.dy * middle })) hi = middle; else lo = middle;
        }
        e.x += h.dx * lo; e.y += h.dy * lo; w.s += lo; record(e); contact(sim, e);
        bounce(sim, e); break;
      }
      e.x = x; e.y = y; w.s += amount; record(e); setPhase(e, false); contact(sim, e);
    }
    left -= amount;
  }
}
