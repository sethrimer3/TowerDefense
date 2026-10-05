/** Faint smoke from the houses' chimneys, seen from above: small pixel
 * puffs leaving each flue one after another, drifting off on a light breeze
 * that slowly veers, swelling and thinning to nothing about a cell and a
 * half downwind. A fallen house's chimney is cold.
 *
 * Each puff's place is worked out from the wall clock and its chimney's
 * seed, so nothing is stepped or stored per frame; `sync` finds the
 * chimneys once per city. Presentation only. */
import type { CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { hash01 } from "./grid.ts";
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import { chimneyFlue, roofSeed } from "./roof-art.ts";

/** A chimney: its house and its flue's middle, in art pixels on the board. */
type Chimney = { house: CityMap["buildings"][number]; x: number; y: number; seed: number };

/** Puffs in the air above each chimney at once, seconds each lives, how far
 * it drifts (art pixels), how wide it swells (art pixels from its middle)
 * and how dense it starts. */
const SMOKE = { puffs: 6, life: 5, drift: 14, swell: 2, alpha: 0.38 };
/** Pale wood smoke, its lighter core and thinner edge. */
const TONES = ["#d6d1c8", "#efebe4"];

/** A puff `r` art pixels from its middle: a square with its corners cut,
 * in rectangles that don't overlap, so its faint alpha stays even. */
function wisp(dot: ReturnType<typeof artPen>, x: number, y: number, r: number) {
  if (r <= 0) return dot(x, y);
  dot(x - r + 1, y - r, 2 * r - 1, 1);
  dot(x - r, y - r + 1, 2 * r + 1, 2 * r - 1);
  dot(x - r + 1, y + r, 2 * r - 1, 1);
}

export class ChimneySmoke {
  private map: CityMap | null = null;
  private chimneys: Chimney[] = [];

  sync(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.chimneys = [];
    for (const b of map.buildings) {
      if (b.kind !== "house") continue;
      const r = b.rect, seed = roofSeed(r.x, r.y, r.w, r.h);
      const flue = chimneyFlue(r.w, r.h, seed);
      if (flue) this.chimneys.push({ house: b, x: r.x * ART + flue.x, y: r.y * ART + flue.y, seed });
    }
  }

  /** Draws the smoke onto `c` (the camera applied), `px` canvas pixels a
   * cell, at wall time `now` (ms); `wind` stirs it harder, `dim` (0–1)
   * thins it into the dark of night. Under reduced motion it holds still. */
  draw(c: CanvasRenderingContext2D, px: number, o: { now: number; sim: DefendSim | null; reduceMotion: boolean; wind: number; dim: number }) {
    if (!this.chimneys.length) return;
    const t = o.reduceMotion ? 0 : o.now / 1000;
    // One breeze over the whole city, veering slowly about the south east.
    const heading = 0.6 + 0.5 * Math.sin(t / 23) + 0.25 * Math.sin(t / 9.7);
    const wx = Math.cos(heading), wy = Math.sin(heading);
    const drift = SMOKE.drift * (1 + o.wind);
    const dot = artPen(c, px);
    const alpha0 = c.globalAlpha;
    for (const ch of this.chimneys) {
      if (o.sim && !o.sim.intact(ch.house)) continue;
      const rate = 0.85 + hash01(ch.seed, 41) * 0.3;
      for (let k = 0; k < SMOKE.puffs; k++) {
        // How far through its life this puff is, 0 at the flue.
        const p = (((t * rate) / SMOKE.life + k / SMOKE.puffs + hash01(ch.seed, 43)) % 1 + 1) % 1;
        const n = Math.floor((t * rate) / SMOKE.life + k / SMOKE.puffs + hash01(ch.seed, 43));
        // Each puff wanders a little off the breeze, and curls as it goes.
        const side = (hash01(ch.seed, 47, k, n) - 0.5) * 0.9 + 0.35 * Math.sin(p * 5 + k);
        const d = drift * p * (0.6 + 0.4 * p);
        const x = Math.round(ch.x + wx * d - wy * side * d * 0.4);
        const y = Math.round(ch.y + wy * d + wx * side * d * 0.4);
        const r = Math.round(SMOKE.swell * Math.min(1, p * 1.6));
        // Thickest just off the flue, fading out as it spreads.
        const a = SMOKE.alpha * (1 - o.dim * 0.55) * Math.min(1, p * 6) * (1 - p) * (1 - p);
        if (a < 0.01) continue;
        c.globalAlpha = alpha0 * a;
        c.fillStyle = TONES[0];
        wisp(dot, x, y, r);
        if (r >= 2) {
          c.fillStyle = TONES[1];
          wisp(dot, x, y, r - 1);
        }
      }
    }
    c.globalAlpha = alpha0;
  }
}
