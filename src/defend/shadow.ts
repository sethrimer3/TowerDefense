/** DEFEND's Shadow, the assassins' ultimate: one shade, trained at the
 * Shadow's shrine (three Assassins' dens merged), a see-through figure in a
 * billowing cloak with knives whirling round it. It hunts the city like the
 * Hero; with an enemy within `SHADE.reach` cells it holds its ground and
 * sends its knives out one after another (`SHADE.cooldown` shared among
 * them), each flying a wide loop: out on one side through its enemy, round
 * past it and back on the other, cutting every enemy within `SHADE.width`
 * of its line once. Every enemy a knife hits makes the shade's later hits
 * harder by `SHADOW_EDGE.rate`, compounding (`Soldier.edge`, up to
 * `SHADE.cap`), for as long as the shade lives.
 *
 * Its shared upgrades (`shadow-upgrades.ts`, `Bonuses.shadow`): more knives
 * (`SHADOW_KNIVES`, sooner throws), armor piercing (`SHADOW_PIERCE`, through
 * `hurtEnemy`'s `pierce`), bleeding for enemies with blood in them
 * (`SHADOW_BLEED`, `Enemy.bleed`, `stepBleed`) and faster compounding
 * (`SHADOW_EDGE`).
 *
 * Each loop is decided in full when it is thrown: `sim.blades` keeps it for
 * the renderer (`shade-art.ts`) and is not part of the replayed state. The
 * loop's frame is turned with unit vectors only, so every engine agrees.
 * `edge`, `bleed` and the blades stay absent or empty without a Shadow, and
 * nothing here draws from the random stream, so runs without one replay
 * unchanged. */
import { bannerFor } from "./deployment.ts";
import { dist, sq } from "../exact.ts";
import { SHADOW_BLEED, SHADOW_EDGE, SHADOW_KNIVES, SHADOW_PIERCE, shadowRank } from "../shadow-upgrades.ts";
import { ENEMIES, SHADE, enemySize, type EnemyKind } from "./catalog.ts";
import { nearest } from "./pathing.ts";
import type { DefendSim, Enemy, Soldier } from "./sim.ts";
import { seek } from "./valkyries.ts";
import { answerBanner, bannerDamage } from "./war-banner.ts";

/** A knife's loop, for the renderer: thrown from (x, y), its frame's axis
 * (ax, ay) and the side it bows to (bx, by), `long` cells
 * to its tip and `wide` across, `t` seconds into its `life`. A point `u` of
 * the way round is `loopAt`; `wide` is negative for a loop bowing the
 * other way. */
export type Blade = { shade: number; x: number; y: number; ax: number; ay: number; bx: number; by: number; long: number; wide: number; t: number; life: number };

/** How long a knife takes round its loop, in seconds. */
export const BLADE_LIFE = 0.5;
/** Points tested along a loop for enemies in its way. */
const SAMPLES = 28;
/** How far round the outward leg (0 to 1) the knife passes its enemy. */
const THROUGH = 0.4;

/** Kinds with no blood in them to bleed: stone, ice, crystal, spirits,
 * bones and engines (and every boat, siege engine and walking fortress). */
const BLOODLESS = new Set<EnemyKind>([
  "slagGolem", "iceGolem", "iceCube", "crystalSentinel", "shardling", "shardBrood", "graveWisp", "starWisp", "dustDjinn", "skeleton", "prismRay", "astralWarden",
  "shieldBearer", "poisonBearer", "shieldLesser", "shieldGreater", "aegis", "poisonLesser", "poisonGreater", "poisonSovereign",
]);
/** Whether enemy kind `kind` has blood in it, to bleed. */
export function bleeds(kind: EnemyKind) {
  const d = ENEMIES[kind];
  return !BLOODLESS.has(kind) && !d.siege && !d.boat && !d.fortress;
}

/** The Shadows' upgrades as numbers, from the battle's snapshot. */
export function shadowStats(sim: DefendSim) {
  const r = sim.bonuses.shadow;
  return {
    knives: SHADOW_KNIVES.knives[shadowRank(r, "knives")],
    pierce: SHADOW_PIERCE.pierce[shadowRank(r, "pierce")],
    bleed: shadowRank(r, "bleed"),
    rate: SHADOW_EDGE.rate[shadowRank(r, "edge")],
  };
}

/** A point `u` of the way round loop `b` (0 and 1 at the shade, ½ at the
 * tip): out along one side, back along the other. */
export function loopAt(b: Pick<Blade, "x" | "y" | "ax" | "ay" | "bx" | "by" | "long" | "wide">, u: number) {
  const out = u <= 0.5, v = out ? 2 * u : 2 * (1 - u);
  const along = v * b.long, across = (out ? 1 : -1) * b.wide * 4 * v * (1 - v);
  return { x: b.x + b.ax * along + b.bx * across, y: b.y + b.ay * along + b.by * across };
}

export function stepShade(sim: DefendSim, s: Soldier, dt: number) {
  s.cd -= dt;
  s.thinkT -= dt;
  const near = nearest(sim.enemiesNear(s.x, s.y, SHADE.reach + 1).filter((e) => e.hp > 0 && dist(e.x - s.x, e.y - s.y) <= SHADE.reach + enemySize(e) / 2), s, Infinity, true);
  if (near) {
    // In reach: it holds its ground, its knives flying out one by one.
    if (s.cd <= 0) {
      const st = shadowStats(sim);
      s.cd = SHADE.cooldown / st.knives;
      throwKnife(sim, s, near, st);
    }
    return;
  }
  const banner = bannerFor(sim, s);
  if (banner) return answerBanner(sim, banner, s, SHADE.speed, dt);
  if (s.thinkT <= 0) seek(sim, s);
  sim.followPath(s, null, SHADE.speed, dt);
}

/** One knife's loop through `e`, alternate knives bowing to alternate
 * sides: it cuts `e` and every enemy within `SHADE.width` of its line. */
export function throwKnife(sim: DefendSim, s: Soldier, e: Enemy, st = shadowStats(sim)) {
  const n = (s.strikes ?? 0) + 1;
  s.strikes = n;
  const side = n % 2 ? 1 : -1;
  const d = Math.max(0.3, dist(e.x - s.x, e.y - s.y));
  const ux = d > 0.3 ? (e.x - s.x) / d : 1, uy = d > 0.3 ? (e.y - s.y) / d : 0;
  // In the loop's own frame the knife passes its enemy THROUGH of the way
  // out, `bow` to the side; turn the frame so that point lands on `e`.
  const wide = Math.min(SHADE.wide, (0.8 * d) / (4 * THROUGH * (1 - THROUGH)));
  const bow = side * wide * 4 * THROUGH * (1 - THROUGH);
  const reach = Math.sqrt(d * d - bow * bow), long = reach / THROUGH;
  const qx = reach / d, qy = bow / d;
  const ax = ux * qx + uy * qy, ay = uy * qx - ux * qy;
  const blade: Blade = { shade: s.id, x: s.x, y: s.y, ax, ay, bx: -ay, by: ax, long, wide: wide * side, t: 0, life: BLADE_LIFE };
  sim.blades.push(blade);
  const struck = new Set<number>([e.id]);
  cut(sim, s, e, st);
  for (let k = 1; k < SAMPLES; k++) {
    const p = loopAt(blade, k / SAMPLES);
    for (const o of sim.enemiesNear(p.x, p.y, SHADE.width + 1)) {
      if (o.hp <= 0 || struck.has(o.id)) continue;
      const r = SHADE.width + enemySize(o) / 2;
      if (sq(o.x - p.x) + sq(o.y - p.y) > r * r) continue;
      struck.add(o.id);
      cut(sim, s, o, st);
    }
  }
}

/** A knife's cut: its damage times the shade's gathered edge, which every
 * enemy it lands on sharpens; enemies with blood in them bleed. */
function cut(sim: DefendSim, s: Soldier, e: Enemy, st: ReturnType<typeof shadowStats>) {
  const hit = bannerDamage(sim, s) * (s.edge ?? 1);
  if (!sim.hurtEnemy(e, hit, true, "melee", s, false, "physical", st.pierce)) return;
  s.edge = Math.min(SHADE.cap, (s.edge ?? 1) * (1 + st.rate));
  if (st.bleed && e.hp > 0 && bleeds(e.kind)) {
    const dps = hit * SHADOW_BLEED.share[st.bleed], time = SHADOW_BLEED.time[st.bleed];
    if (!e.bleed || e.bleed.dps * e.bleed.t < dps * time) e.bleed = { dps, t: time };
  }
}

/** Bleeding enemies lose blood every second until it runs out. */
export function stepBleed(sim: DefendSim, dt: number) {
  for (const e of sim.enemies) {
    const b = e.bleed;
    if (!b) continue;
    if (e.hp > 0) sim.hurtEnemy(e, b.dps * Math.min(dt, b.t), false, "melee");
    if ((b.t -= dt) <= 0) delete e.bleed;
  }
}

/** The knives' loops come round. */
export function stepBlades(sim: DefendSim, dt: number) {
  if (!sim.blades.length) return;
  for (const b of sim.blades) b.t += dt;
  sim.blades = sim.blades.filter((b) => b.t < b.life);
}
