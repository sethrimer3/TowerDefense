/** The Blight Slime: a living glob of Blight Essence that bounds along its
 * path in hops and splats where it lands. Blows and arrows sink into it
 * (its catalog `damageScale`); blasts tear it apart.
 *
 * The hop is presentation only, like the Darklings' gait (`blight-gait.ts`):
 * the simulation still moves the body smoothly, so pathing, contact, packing
 * and replays are unchanged. Each hop leaves from where the slime landed and
 * comes down where its body is when it takes off; a slime standing still
 * (biting a wall) hops in place, lower. */
import type { EnemyKind } from "./catalog.ts";
import type { Enemy } from "./sim.ts";

export const BLIGHT_SLIME = {
  /** Seconds from one take-off to the next. */
  period: 0.62,
  /** Share of each hop spent in the air. */
  air: 0.5,
  /** Peak height in art pixels of a travelling hop, and of a hop in place. */
  height: 5,
  idleHeight: 1.5,
  /** Cells moved in one period below which a hop counts as in place. */
  still: 0.06,
  /** Share of the ground time the landing splat lasts. */
  splat: 0.45,
} as const;

export const isBlightSlime = (kind: EnemyKind) => kind === "blightSlime";

/** Squash levels, from stretched tall (negative) to flattened (positive). */
export const SLIME_SQUASH_MIN = -3, SLIME_SQUASH_MAX = 4;
/** The body's scale at a squash level: wider and lower as it flattens. */
export const slimeScale = (level: number) => ({ sx: 1 + level * 0.09, sy: 1 - level * 0.1 });

export type SlimeHop = {
  /** Where its foot is on the ground, in cells (the body's centre when it sits). */
  x: number; y: number;
  /** Art pixels above the ground. */
  lift: number;
  /** A squash level, `SLIME_SQUASH_MIN`..`SLIME_SQUASH_MAX`. */
  squash: number;
  /** 0–1 through the splat after a travelling landing, or -1. */
  splat: number;
  landX: number; landY: number;
};

type State = { tick: number; fromX: number; fromY: number; toX: number; toY: number; moved: boolean; hop: SlimeHop };
const states = new WeakMap<Enemy, State>();

/** A fixed per-enemy offset in [0, 1), so a crowd doesn't hop in unison. */
const phase = (id: number) => ((Math.imul((id | 0) + 0x51ed, 0x9e3779b1) >>> 0) / 4294967296);

/** Where and how to draw a slime at battle time `time`. Without a time (a
 * portrait) it sits still on its body. The returned object is reused per
 * enemy: read it before the next call. */
export function slimeHop(e: Enemy, time: number | undefined): SlimeHop {
  if (time === undefined) return { x: e.x, y: e.y, lift: 0, squash: 0, splat: -1, landX: e.x, landY: e.y };
  const P = BLIGHT_SLIME.period, t = time / P + phase(e.id), tick = Math.floor(t);
  let s = states.get(e);
  if (!s) {
    s = { tick, fromX: e.x, fromY: e.y, toX: e.x, toY: e.y, moved: false, hop: { x: e.x, y: e.y, lift: 0, squash: 0, splat: -1, landX: e.x, landY: e.y } };
    states.set(e, s);
  }
  if (tick !== s.tick) {
    // Take off from where it landed toward where its body is now. A rewind
    // or a long gap (a new run, a burst of dropped frames) just lands.
    const jump = tick < s.tick || tick - s.tick > 2;
    s.fromX = jump ? e.x : s.toX; s.fromY = jump ? e.y : s.toY;
    s.toX = e.x; s.toY = e.y; s.tick = tick;
    s.moved = Math.hypot(s.toX - s.fromX, s.toY - s.fromY) > BLIGHT_SLIME.still;
  }
  const u = t - tick, h = s.hop, A = BLIGHT_SLIME.air;
  h.landX = s.toX; h.landY = s.toY; h.splat = -1;
  if (u < A) {
    const k = u / A, ease = k * k * (3 - 2 * k);
    h.x = s.fromX + (s.toX - s.fromX) * ease;
    h.y = s.fromY + (s.toY - s.fromY) * ease;
    h.lift = (s.moved ? BLIGHT_SLIME.height : BLIGHT_SLIME.idleHeight) * 4 * k * (1 - k);
    // Stretched as it leaves the ground, rounding out at the top, then
    // tapering a little toward the landing.
    h.squash = k < 0.2 ? (s.moved ? -3 : -1) : k < 0.4 ? -1 : k > 0.85 ? -1 : 0;
  } else {
    const g = (u - A) / (1 - A);
    h.x = s.toX; h.y = s.toY; h.lift = 0;
    // Flattened on impact, wobbling back up, then crouching for the next hop.
    const impact = s.moved ? 4 : 2;
    h.squash = g < 0.12 ? impact : g < 0.3 ? impact - 2 : g < 0.45 ? -1 : g < 0.75 ? 0 : 1 + (g > 0.9 ? 1 : 0);
    if (s.moved && g < BLIGHT_SLIME.splat) h.splat = g / BLIGHT_SLIME.splat;
  }
  return h;
}
