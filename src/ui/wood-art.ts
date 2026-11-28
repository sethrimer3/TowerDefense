// Pixel-art oak, drawn to any size: grain in long horizontal streaks over
// slow light and dark bands, the darker lines of growth rings, and knots the
// grain parts around, in five browns. Pure: the same size and seed always give
// the same pixels. `wood-painter.ts` paints each oak panel and button its own
// board from this; `scripts/pixel-wood/build.ts` draws theme.css's tiling
// fallback (`wrap`, so its edges meet).

/** Darkest grain line to brightest sheen. */
export const WOOD_PALETTE = ["#463626", "#604c37", "#725b42", "#82684b", "#947756"] as const;

/** Screen (CSS) pixels to an art pixel. */
export const WOOD_SCALE = 2;

/** A small seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A string's seed (FNV-1a). */
export function woodSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const mod = (v: number, n: number) => ((v % n) + n) % n;

/** Rows between the band's control points. */
const BAND_STEP = 8;
/** Art pixels of board per knot, on average. */
const KNOT_AREA = 4600;

/**
 * A board `w` × `h` art pixels as palette indexes, row by row (`y * w + x`).
 * `wrap` makes every edge meet its opposite, for a tile; otherwise the grain
 * simply runs off the edges.
 */
export function drawWood(w: number, h: number, seed: number, wrap = false): Uint8Array {
  const r = rng(seed);
  const px = new Uint8Array(w * h);
  const xAt = (x: number) => (wrap ? mod(x, w) : x);
  const yAt = (y: number) => (wrap ? mod(y, h) : Math.min(h - 1, Math.max(0, y)));

  // Slow light and dark bands down the board: smoothed noise, a control point
  // every few rows.
  const points = Math.max(1, Math.ceil(h / BAND_STEP) + (wrap ? 0 : 1));
  const ctrl = Array.from({ length: points }, () => r() * 2 - 1);
  for (let y = 0; y < h; y++) {
    const f = y / BAND_STEP, i = Math.floor(f), t = (1 - Math.cos((f - i) * Math.PI)) / 2;
    const a = ctrl[mod(i, points)], b = ctrl[wrap ? mod(i + 1, points) : Math.min(points - 1, i + 1)];
    const v = a + (b - a) * t;
    px.fill(v > 0.45 ? 3 : v < -0.45 ? 1 : 2, y * w, y * w + w);
  }

  // Grain streaks: long runs a shade off their row, tapering at both ends.
  const streak = (x0: number, y: number, len: number, shade: number) => {
    const row = yAt(y) * w;
    for (let i = 0; i < len; i++) {
      const x = xAt(x0 + i);
      if (x < 0 || x >= w) continue;
      const edge = Math.min(i, len - 1 - i);
      px[row + x] = edge < 2 && len > 6 ? Math.round((px[row + x] + shade) / 2) : shade;
    }
  };
  const longest = Math.max(8, Math.min(90, Math.round(w * 0.9)));
  const streaks = Math.round((w * h) / 84);
  for (let n = 0; n < streaks; n++) {
    const y = Math.floor(r() * h);
    const len = 6 + Math.floor(r() * r() * longest);
    const roll = r();
    const base = px[y * w];
    const shade = roll < 0.5 ? Math.max(0, base - 1) : roll < 0.8 ? Math.min(4, base + 1) : base <= 1 ? 0 : 1;
    streak(Math.floor(r() * (w + 20)) - 10, y, len, shade);
  }
  // Growth rings: long dark lines most of the way across.
  const rings = Math.max(1, Math.round(h / 10));
  for (let n = 0; n < rings; n++) {
    const y = Math.floor(((n + 0.2 + r() * 0.6) * h) / rings);
    const len = Math.round(w * (0.45 + r() * 0.5));
    streak(Math.floor(r() * w) - Math.floor(len / 3), y, len, 0);
  }

  // Knots: the grain parts round each one, rows above bowing up and rows
  // below bowing down, then a dark oval heart ringed a shade lighter.
  const count = Math.floor((w * h) / KNOT_AREA + r());
  const knots = Array.from({ length: count }, () => {
    const rx = 4 + Math.floor(r() * 3), ry = 2;
    return { x: Math.floor(r() * w), y: ry + 1 + Math.floor(r() * Math.max(1, h - 2 * ry - 2)), rx, ry };
  });
  if (knots.length) {
    const flat = px.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let shift = 0;
        for (const k of knots) {
          const dx = wrap ? mod(x - k.x + w / 2, w) - w / 2 : x - k.x;
          const dy = wrap ? mod(y - k.y + h / 2, h) - h / 2 : y - k.y;
          const reach = Math.max(0, 1 - Math.abs(dy) / 9) * Math.exp(-((dx / (k.rx * 2.6)) ** 2));
          shift += Math.sign(dy || 1) * (k.ry + 2) * reach;
        }
        px[y * w + x] = flat[yAt(y - Math.round(shift)) * w + x];
      }
    }
    for (const k of knots) {
      for (let dy = -k.ry - 1; dy <= k.ry + 1; dy++) {
        for (let dx = -k.rx - 2; dx <= k.rx + 2; dx++) {
          const x = xAt(k.x + dx), y = wrap ? mod(k.y + dy, h) : k.y + dy;
          if (x < 0 || x >= w || y < 0 || y >= h) continue;
          const d = (dx / (k.rx + 0.5)) ** 2 + (dy / (k.ry + 0.5)) ** 2;
          if (d <= 0.35) px[y * w + x] = 0;
          else if (d <= 1) px[y * w + x] = 1;
          else if (d <= 1.6) px[y * w + x] = 3;
        }
      }
    }
  }

  // No lone pixels: one unlike both its left and right neighbours, when they
  // agree, takes theirs, so the grain reads as clean runs.
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const lx = wrap ? mod(x - 1, w) : x - 1, rx = wrap ? mod(x + 1, w) : x + 1;
      if (lx < 0 || rx >= w) continue;
      const a = px[row + lx];
      if (px[row + x] !== a && a === px[row + rx]) px[row + x] = a;
    }
  }
  return px;
}
