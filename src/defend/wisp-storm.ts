import { ordersOf } from "./building-orders.ts";
/** The Wisp tower's arrow storm. The tower gathers ordinary archer-tower
 * arrows into a quiver of up to `WISP_STORM.capacity`, each circling the
 * tower on its own wandering path, pulled toward a ring round its middle
 * like an electron round an atom but never on a clean ellipse. When an
 * enemy comes in range every stored arrow is loosed at once in a
 * `WISP_STORM.spread`-degree spray, each flying straight from where it was
 * circling. Wandering comes from per-arrow hashed frequencies and phases,
 * never the battle's random stream. */
import { WISP_STORM } from "../knowledge-paths.ts";
import { archerCooldown, archerDamage, archerRange } from "./catalog.ts";
import { center } from "./pathing.ts";
import type { Building } from "./citygen.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** One stored arrow: where it is and where it is heading, in cells. */
export type QuiverArrow = { x: number; y: number; vx: number; vy: number; age: number; serial: number;
  /** Which way round it prefers to circle (1 or -1), its own ring radius and
   * its wander's frequencies and phases. */
  spin: number; ring: number; f: [number, number]; phase: [number, number] };
export type Quiver = { arrows: QuiverArrow[]; capacity: number; every: number; timer: number; serial: number };

/** A small integer hash to [0, 1), so every arrow wanders its own way. */
export function quiverHash(a: number, b: number, salt: number) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(salt, 0x27d4eb2f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export const newQuiver = (rank: number): Quiver => ({ arrows: [], capacity: WISP_STORM.capacity[rank ? 1 : 0],
  every: WISP_STORM.every[rank ? 1 : 0], timer: 0, serial: 0 });

/** Seconds between stored arrows: the rank's pace, sped like an archer
 * tower's reload by the Forge's rate levels and the tower reload bonus. */
export const quiverEvery = (sim: Pick<DefendSim, "levels" | "bonuses">, q: Pick<Quiver, "every">) =>
  q.every * archerCooldown(sim.levels.archerRate) / archerCooldown(0) * sim.bonuses.towerReload;

function store(q: Quiver, b: Building) {
  const c = center(b.rect), n = q.serial++, h = (salt: number) => quiverHash(b.id, n, salt);
  const angle = h(1) * Math.PI * 2, spin = h(2) < .5 ? -1 : 1, ux = Math.cos(angle), uy = Math.sin(angle);
  const s = WISP_STORM.speed * .7;
  q.arrows.push({ x: c.x + ux * .4, y: c.y + uy * .4, vx: (ux - spin * uy) * s, vy: (uy + spin * ux) * s, age: 0, serial: n, spin,
    ring: WISP_STORM.orbit * (1 + WISP_STORM.band * (h(3) - .5)),
    f: [.7 + h(4) * 1.3, .7 + h(5) * 1.3], phase: [h(6) * Math.PI * 2, h(7) * Math.PI * 2] });
}

/** Moves one stored arrow `dt` seconds round the tower's middle `c`. */
export function orbit(a: QuiverArrow, c: { x: number; y: number }, dt: number) {
  const S = WISP_STORM, steps = Math.max(1, Math.ceil(dt / S.step - 1e-9)), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    const px = a.x - c.x, py = a.y - c.y, r = Math.max(.05, Math.sqrt(px * px + py * py)), ux = px / r, uy = py / r;
    const v = Math.max(.05, Math.sqrt(a.vx * a.vx + a.vy * a.vy));
    // Pulled to its ring, kept circling its own way at about its speed, and
    // pushed about by a slowly turning wander, so no two loops repeat.
    let ax = -S.pull * (r - a.ring) * ux - a.spin * uy * S.spin, ay = -S.pull * (r - a.ring) * uy + a.spin * ux * S.spin;
    ax += S.keep * (S.speed - v) * a.vx / v; ay += S.keep * (S.speed - v) * a.vy / v;
    ax += S.wander * Math.sin(a.f[0] * a.age + a.phase[0]); ay += S.wander * Math.cos(a.f[1] * a.age + a.phase[1]);
    a.vx += ax * h; a.vy += ay * h; a.x += a.vx * h; a.y += a.vy * h; a.age += h;
  }
}

/** Stores, circles and, with an enemy in range, looses the tower's arrows. */
export function stepQuiver(sim: DefendSim, b: Building, q: Quiver, candidates: Enemy[], dt: number) {
  const c = center(b.rect), every = quiverEvery(sim, q);
  if (q.arrows.length >= q.capacity) q.timer = 0;
  else {
    q.timer += dt;
    while (q.timer >= every - 1e-9 && q.arrows.length < q.capacity) { q.timer -= every; store(q, b); }
    if (q.arrows.length >= q.capacity) q.timer = 0;
  }
  for (const a of q.arrows) orbit(a, c, dt);
  if (!q.arrows.length) return;
  let target: Enemy | undefined, best = Infinity;
  for (const e of candidates) {
    if (e.untargetable || e.hp <= 0) continue;
    const d = (e.x - c.x) * (e.x - c.x) + (e.y - c.y) * (e.y - c.y);
    if (d < best || (d === best && target && e.id < target.id)) { target = e; best = d; }
  }
  if(ordersOf(sim,b).targetMode||sim.crosshairs.has(b.id))target=candidates.find(e=>e.hp>0&&!e.untargetable);
  if (target) loose(sim, b, q, target);
}

/** Every stored arrow at once, spread evenly over the spray in the order
 * they stand across the line of fire, so their paths never cross. */
export function loose(sim: DefendSim, b: Building, q: Quiver, target: Enemy) {
  const c = center(b.rect), aim = Math.atan2(target.y - c.y, target.x - c.x), nx = -Math.sin(aim), ny = Math.cos(aim);
  const spread = WISP_STORM.spread * Math.PI / 180, left = archerRange(sim.levels.archerRange) * WISP_STORM.reach;
  const damage = archerDamage(sim.levels.archerDamage) * sim.bonuses.towerDamage;
  const order = q.arrows.map((a) => ({ a, side: (a.x - c.x) * nx + (a.y - c.y) * ny })).sort((u, v) => u.side - v.side || u.a.serial - v.a.serial);
  order.forEach(({ a }, i) => {
    const angle = aim + (order.length > 1 ? i / (order.length - 1) - .5 : 0) * spread, dx = Math.cos(angle), dy = Math.sin(angle);
    sim.arrows.push({ x: a.x, y: a.y, target: -1, damage, tx: a.x + dx * left, ty: a.y + dy * left, life: 2 + left / 8,
      origin: { x: c.x, y: c.y, building: b.id }, chronoReleased: true, release: { dx, dy, left, hit: [] } });
  });
  q.arrows = [];
}
