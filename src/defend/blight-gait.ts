/** Darklings are drawn moving in lurches: each holds still on the art-pixel
 * lattice, then hops a couple of art pixels to catch up with its body and
 * holds again. Presentation only: the simulation still moves them smoothly,
 * so pathing, contact, packing and replays are unchanged. Blight Worms keep
 * their smooth slither (their segments must stay joined along one trail). */
import { ENEMIES } from "./catalog.ts";
import { ART } from "./art-scale.ts";
import { isBlightWorm } from "./blight-worm-tuning.ts";
import { blightDrawnPixels } from "./blight-size.ts";
import { isBlightSlime, slimeHop } from "./blight-slime.ts";
import type { Enemy } from "./sim.ts";

export const BLIGHT_GAIT = {
  /** Art pixels covered by one lurch at catalog speed, per drawn art pixel of body. */
  stride: 0.5,
  /** Seconds between lurches, clamped so small Darklings don't buzz and big ones don't stall. */
  minPeriod: 0.18,
  maxPeriod: 0.5,
  /** Share of each period spent moving; the rest is the pause. */
  lurch: 0.4,
} as const;

type Gait = { tick: number; fromX: number; fromY: number; toX: number; toY: number; x: number; y: number };
const gaits = new WeakMap<Enemy, Gait>();

/** Whether this enemy is drawn with the lurching gait. */
export function lurches(e: Enemy) {
  return !!ENEMIES[e.kind].darkPixels && !isBlightWorm(e.kind);
}

/** Seconds between one Darkling's lurches. */
export function gaitPeriod(e: Enemy) {
  const def = ENEMIES[e.kind];
  const stride = blightDrawnPixels(e.kind)! * BLIGHT_GAIT.stride / ART;
  return Math.min(BLIGHT_GAIT.maxPeriod, Math.max(BLIGHT_GAIT.minPeriod, stride / Math.max(0.05, def.speed)));
}

/** A fixed per-enemy offset in [0, 1), so a crowd doesn't lurch in unison. */
const phase = (id: number) => ((Math.imul(id | 0, 0x9e3779b1) >>> 0) / 4294967296);

const snap = (v: number, n: number) => (Math.round(v * ART - n / 2) + n / 2) / ART;

/** Where to draw an enemy's centre at battle time `time`, in cells. Smooth
 * enemies (and any call without a time) get their body position. The
 * returned object is reused: read it before the next call for this enemy. */
export function gaitPosition(e: Enemy, time: number | undefined): { x: number; y: number } {
  if (time !== undefined && isBlightSlime(e.kind)) return slimeHop(e, time);
  if (time === undefined || !lurches(e)) return e;
  const n = blightDrawnPixels(e.kind)!;
  const period = gaitPeriod(e);
  const t = time / period + phase(e.id);
  const tick = Math.floor(t);
  let g = gaits.get(e);
  if (!g) {
    const x = snap(e.x, n), y = snap(e.y, n);
    g = { tick, fromX: x, fromY: y, toX: x, toY: y, x, y };
    gaits.set(e, g);
    return g;
  }
  if (tick !== g.tick) {
    // A new lurch starts from where it stands toward where its body is now.
    // A rewind or a long gap (a new run, a dropped frame burst) just lands.
    const jump = tick < g.tick || tick - g.tick > 2;
    g.fromX = jump ? e.x : g.x; g.fromY = jump ? e.y : g.y;
    g.toX = e.x; g.toY = e.y; g.tick = tick;
  }
  const u = Math.min(1, (t - tick) / BLIGHT_GAIT.lurch);
  const k = 1 - (1 - u) * (1 - u);
  g.x = snap(g.fromX + (g.toX - g.fromX) * k, n);
  g.y = snap(g.fromY + (g.toY - g.fromY) * k, n);
  return g;
}
