/** The Hero's cape as a chain of points hung from its shoulders, stepped
 * each time the Hero is drawn: each point keeps its own momentum (Verlet),
 * is pulled gently down the screen, blown by a wandering breeze and, through
 * a spin, flung round the Hero, then is put back exactly one link from the
 * point before it (follow the leader), so the cape never stretches. As the
 * Hero walks or dashes the points lag behind, and the cape streams out
 * behind it. Board cells and battle seconds. Presentation only (`hero-art.ts`
 * draws it): nothing here touches the battle or a random stream, so drawing
 * may use `Math` freely. */

/** Points in the chain, the length of a link in cells, and the step. */
export const CAPE = { points: 9, link: 0.16, step: 1 / 60, damping: 0.9, gravity: 3, breeze: 1.6, whirl: 60 };

export type Cape = { x: Float64Array; y: Float64Array; px: Float64Array; py: Float64Array; time: number; phase: number };

/** A cape hanging straight down from (x, y). */
export function newCape(x: number, y: number, time: number, phase = 0): Cape {
  const n = CAPE.points, c: Cape = { x: new Float64Array(n), y: new Float64Array(n), px: new Float64Array(n), py: new Float64Array(n), time, phase };
  for (let i = 0; i < n; i++) {
    c.x[i] = c.px[i] = x;
    c.y[i] = c.py[i] = y + i * CAPE.link;
  }
  return c;
}

/** Steps the cape to battle time `time`, its shoulders at (x, y). `spin` is
 * -1 or 1 through a spin (the way it turns) and 0 otherwise. A long gap (a
 * new battle, a pause skipped) hangs it afresh. */
export function stepCape(c: Cape, x: number, y: number, time: number, spin = 0) {
  const gap = time - c.time;
  if (gap < 0 || gap > 0.5) {
    Object.assign(c, newCape(x, y, time, c.phase));
    return c;
  }
  const steps = Math.min(8, Math.ceil(gap / CAPE.step - 1e-9));
  if (steps <= 0) return c;
  const dt = gap / steps, n = CAPE.points;
  for (let k = 1; k <= steps; k++) {
    const now = c.time + dt * k;
    // The shoulders move evenly across the gap.
    const ax = c.x[0] + (x - c.x[0]) / (steps - k + 1), ay = c.y[0] + (y - c.y[0]) / (steps - k + 1);
    c.px[0] = c.x[0];
    c.py[0] = c.y[0];
    c.x[0] = ax;
    c.y[0] = ay;
    for (let i = 1; i < n; i++) {
      const f = i / (n - 1);
      // A breeze that wanders and gusts, rippling down the cape.
      const wind = CAPE.breeze * (Math.sin(now * 1.3 + c.phase) * 0.7 + Math.sin(now * 3.7 + c.phase * 2.1 - f * 2.5) * 0.5) * f;
      let fx = wind, fy = CAPE.gravity + Math.sin(now * 5.3 + c.phase - f * 4) * 0.8 * f;
      if (spin) {
        // Whirled round: pushed along the turn and out from the Hero.
        const dx = c.x[i] - ax, dy = c.y[i] - ay, d = Math.sqrt(dx * dx + dy * dy) || 1;
        fx += (CAPE.whirl * (-dy * spin + dx * 0.5)) / d;
        fy += (CAPE.whirl * (dx * spin + dy * 0.5)) / d;
      }
      const vx = (c.x[i] - c.px[i]) * CAPE.damping, vy = (c.y[i] - c.py[i]) * CAPE.damping;
      c.px[i] = c.x[i];
      c.py[i] = c.y[i];
      c.x[i] += vx + fx * dt * dt;
      c.y[i] += vy + fy * dt * dt;
    }
    // Each point back to one link from the one before it. Moving the
    // previous position along keeps only part of the pull as momentum, so
    // the tip doesn't whip about.
    for (let i = 1; i < n; i++) {
      const dx = c.x[i] - c.x[i - 1], dy = c.y[i] - c.y[i - 1], d = Math.sqrt(dx * dx + dy * dy);
      const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 1;
      const nx = c.x[i - 1] + ux * CAPE.link, ny = c.y[i - 1] + uy * CAPE.link;
      c.px[i] += (nx - c.x[i]) * 0.6;
      c.py[i] += (ny - c.y[i]) * 0.6;
      c.x[i] = nx;
      c.y[i] = ny;
    }
  }
  c.time = time;
  return c;
}

/** The cape's half width in pixels at the shoulders and at the hem, and how
 * far back the swallowtail's notch cuts. */
export const CUT = { shoulder: 3.5, hem: 6, notch: 2.5 };
/** What each pixel of the cape is: 1 its colour, then its lit folds, shaded
 * folds, shaded underside, trimmed hem and outline. */
export const CAPE_LIT = 2, CAPE_SHADE = 3, CAPE_DEEP = 4, CAPE_TRIM = 5, CAPE_EDGE = 6;

/** The cape rasterized on a pixel grid `per` pixels a cell whose corner is
 * at (ox, oy) cells: a tone a pixel (0 for none) over the box from (x0, y0)
 * pixels, `w` by `h`. Folds ripple down it with `time`; its edges and folds
 * are lit from the upper left. */
export function capePixels(c: Cape, ox: number, oy: number, per: number, time: number) {
  const n = CAPE.points, xs: number[] = [], ys: number[] = [];
  for (let i = 0; i < n; i++) {
    xs.push((c.x[i] - ox) * per);
    ys.push((c.y[i] - oy) * per);
  }
  const link = CAPE.link * per, length = link * (n - 1), pad = CUT.hem + 2;
  const x0 = Math.floor(Math.min(...xs) - pad), y0 = Math.floor(Math.min(...ys) - pad);
  const w = Math.ceil(Math.max(...xs) + pad) - x0, h = Math.ceil(Math.max(...ys) + pad) - y0;
  const tone = new Uint8Array(w * h);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const qx = x0 + i + 0.5, qy = y0 + j + 0.5;
      // The nearest link: how far down the cape and how far to one side.
      let best = Infinity, along = 0, side = 0, nx = 0, ny = 0;
      for (let s = 0; s < n - 1; s++) {
        const dx = xs[s + 1] - xs[s], dy = ys[s + 1] - ys[s], d = Math.sqrt(dx * dx + dy * dy) || 1;
        const t = ((qx - xs[s]) * dx + (qy - ys[s]) * dy) / (d * d);
        const tt = Math.max(0, Math.min(1, t)), ex = qx - xs[s] - dx * tt, ey = qy - ys[s] - dy * tt, e = ex * ex + ey * ey;
        if (e < best) {
          best = e;
          // Past either end it is no part of the cape.
          along = (s === 0 && t < 0) || (s === n - 2 && t > 1) ? -1 : (s + tt) * link;
          side = (dx * (qy - ys[s]) - dy * (qx - xs[s])) / d;
          nx = -dy / d;
          ny = dx / d;
        }
      }
      if (along < 0) continue;
      const half = CUT.shoulder + ((CUT.hem - CUT.shoulder) * along) / length, a = Math.abs(side);
      if (a > half) continue;
      const hem = length - CUT.notch + (CUT.notch * a) / half;
      if (along > hem) continue;
      const l = side / half;
      const fold = Math.sin(l * 4.7 + along * 0.45 - time * 5 + c.phase);
      const toLight = (nx + ny) * Math.sign(side) < 0;
      tone[j * w + i] = along > hem - 0.9 ? CAPE_TRIM : a > half - 1 ? (toLight ? CAPE_LIT : CAPE_DEEP) : fold > 0.55 ? CAPE_LIT : fold < -0.6 ? CAPE_SHADE : 1;
    }
  // The outline round it.
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (tone[j * w + i]) continue;
      const on = (a: number, b: number) => a >= 0 && b >= 0 && a < w && b < h && tone[b * w + a] && tone[b * w + a] !== CAPE_EDGE;
      if (on(i - 1, j) || on(i + 1, j) || on(i, j - 1) || on(i, j + 1)) tone[j * w + i] = CAPE_EDGE;
    }
  return { x0, y0, w, h, tone };
}
