import { drawRallyFlag } from "./structure-art.ts";

/** How the rally flag comes and goes, on the wall clock (presentation
 * only): it drops in fading up and lands with a little shockwave from its
 * foot, and when taken away or replaced it flies up, fading out quickly. */
export const RALLY_ANIM = {
  /** Milliseconds falling in. */
  drop: 200,
  /** Cells above its spot it falls from. */
  from: 2.5,
  /** Milliseconds the landing ring spreads. */
  ring: 360,
  /** Cells across the ring spreads to. */
  ringReach: 1.3,
  /** Milliseconds flying off. */
  lift: 280,
  /** Cells it climbs as it goes. */
  climb: 3,
};

export type FlagPose = { alpha: number; rise: number; scale: number };

/** The flag `ms` after it was planted: falling, then standing. */
export function dropPose(ms: number): FlagPose {
  const p = Math.min(1, Math.max(0, ms / RALLY_ANIM.drop));
  const fall = 1 - p * p; // still high at first, quickening as it lands
  return { alpha: p, rise: fall * RALLY_ANIM.from, scale: 1 + fall * 0.35 };
}

/** The flag `ms` after it was taken away, or null once gone. */
export function liftPose(ms: number): FlagPose | null {
  const p = ms / RALLY_ANIM.lift;
  if (p >= 1) return null;
  const q = Math.max(0, p);
  return { alpha: (1 - q) * (1 - q), rise: q * q * RALLY_ANIM.climb, scale: 1 + q * 0.35 };
}

/** The landing ring `ms` after the flag was planted: its radius in cells
 * and opacity, or null before it lands and after it fades. */
export function ringPose(ms: number): { r: number; alpha: number } | null {
  const p = (ms - RALLY_ANIM.drop) / RALLY_ANIM.ring;
  if (p < 0 || p >= 1) return null;
  const out = 1 - (1 - p) * (1 - p);
  return { r: 0.2 + out * (RALLY_ANIM.ringReach - 0.2), alpha: 1 - p };
}

type Spot = { x: number; y: number };

/** Keeps the flag shown and the ones flying off, noticing changes by the
 * banner object the sim holds. */
export class RallyFlagArt {
  private shown: Spot | null = null;
  private since = 0;
  private leaving: { at: Spot; since: number }[] = [];
  private sim: unknown = null;

  draw(c: CanvasRenderingContext2D, px: number, sim: object | null, flag: Spot | null, opts: { now: number; reduceMotion: boolean }) {
    const t = opts.now / 1000;
    if (sim !== this.sim) {
      // A new battle (or none): whatever stood before just goes.
      this.sim = sim;
      this.shown = flag;
      this.since = -Infinity;
      this.leaving = [];
    }
    if (flag !== this.shown) {
      if (this.shown && !opts.reduceMotion) this.leaving.push({ at: this.shown, since: opts.now });
      this.shown = flag;
      this.since = opts.reduceMotion ? -Infinity : opts.now;
    }
    if (opts.reduceMotion) this.leaving = [];
    this.leaving = this.leaving.filter((l) => {
      const pose = liftPose(opts.now - l.since);
      if (pose) drawRallyFlag(c, px, l.at, { t, reduceMotion: false, ...pose });
      return !!pose;
    });
    if (!flag) return;
    const age = opts.now - this.since;
    const ring = ringPose(age);
    if (ring) drawRing(c, px, flag, ring);
    drawRallyFlag(c, px, flag, { t, reduceMotion: opts.reduceMotion, ...dropPose(age) });
  }
}

/** A thin pale ring, black-edged, spreading from the flag's foot. */
function drawRing(c: CanvasRenderingContext2D, px: number, at: Spot, ring: { r: number; alpha: number }) {
  const x = at.x * px, y = at.y * px, r = ring.r * px;
  c.save();
  c.globalAlpha = ring.alpha;
  c.lineWidth = Math.max(1, Math.round(px / 8));
  c.strokeStyle = "#000";
  c.beginPath();
  c.arc(x, y, r + c.lineWidth, 0, Math.PI * 2);
  c.stroke();
  c.strokeStyle = "#dfe9f6";
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.stroke();
  c.restore();
}
