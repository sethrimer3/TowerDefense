// Draws the pixel-art oak that dresses the page's buttons and panels
// (theme.css's --wood): a tile of art pixels in five browns, grain running
// in long horizontal streaks with a knot or two, wrapping on every side so
// it tiles without a seam. The pixels are written as square SVG paths with
// crisp edges, so the tile stays sharp at any zoom or screen density.
//
//   node --experimental-transform-types scripts/pixel-wood/build.ts
//
// writes assets/theme/wood-pixel.svg. The older noise-grained wood.svg stays
// as the fallback layer underneath it, and the Pixel-art wood setting off
// shows it alone.

import { writeFileSync } from "node:fs";

/** The tile, in art pixels. */
export const W = 192, H = 48;

/** Darkest grain line to brightest sheen. */
export const PALETTE = ["#463626", "#604c37", "#725b42", "#82684b", "#947756"] as const;

/** A small seeded generator (mulberry32), so the tile is the same every build. */
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

const wrap = (v: number, n: number) => ((v % n) + n) % n;

/** The tile's shades, row by row, as palette indexes. */
export function drawWood(seed = 7): number[][] {
  const r = rng(seed);
  // Boards of grain: each row takes a base shade from slow light and dark
  // bands running down the tile.
  const band: number[] = [];
  for (let y = 0; y < H; y++) {
    const t = (y / H) * Math.PI * 2;
    band.push(Math.sin(t * 2 + 0.6) * 0.55 + Math.sin(t * 5 + 2.1) * 0.35 + Math.sin(t * 9) * 0.15);
  }
  const px: number[][] = [];
  for (let y = 0; y < H; y++) {
    const b = band[y];
    px.push(new Array(W).fill(b > 0.45 ? 3 : b < -0.45 ? 1 : 2));
  }

  // Grain streaks: long horizontal runs, lighter or darker than their row,
  // tapering at both ends a shade at a time.
  const streak = (x0: number, y: number, len: number, shade: number) => {
    const row = px[wrap(y, H)];
    for (let i = 0; i < len; i++) {
      const x = wrap(x0 + i, W);
      const edge = Math.min(i, len - 1 - i);
      const base = row[x];
      const target = edge < 2 && len > 6 ? Math.round((base + shade) / 2) : shade;
      row[x] = target;
    }
  };
  for (let n = 0; n < 110; n++) {
    const y = Math.floor(r() * H);
    const len = 6 + Math.floor(r() * r() * 90);
    const roll = r();
    const base = px[y][0];
    const shade = roll < 0.5 ? Math.max(0, base - 1) : roll < 0.8 ? Math.min(4, base + 1) : base <= 1 ? 0 : 1;
    streak(Math.floor(r() * W), y, len, shade);
  }
  // A few long dark lines, the grain's growth rings, the full width or near it.
  for (const y of [5, 17, 26, 38, 45]) streak(Math.floor(r() * W), y, W - 30 - Math.floor(r() * 60), 0);

  // Knots: the grain parts around each one, rows above it bowing up and
  // rows below bowing down, then a dark oval heart ringed a shade lighter.
  const knots = [{ x: 34, y: 12, rx: 6, ry: 2 }, { x: 134, y: 34, rx: 5, ry: 2 }];
  const flat = px.map((row) => row.slice());
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let shift = 0;
      for (const k of knots) {
        const dx = wrap(x - k.x + W / 2, W) - W / 2, dy = wrap(y - k.y + H / 2, H) - H / 2;
        const reach = Math.max(0, 1 - Math.abs(dy) / 9) * Math.exp(-((dx / (k.rx * 2.6)) ** 2));
        shift += Math.sign(dy || 1) * (k.ry + 2) * reach;
      }
      px[y][x] = flat[wrap(y - Math.round(shift), H)][x];
    }
  }
  for (const k of knots) {
    for (let dy = -k.ry - 1; dy <= k.ry + 1; dy++) {
      for (let dx = -k.rx - 2; dx <= k.rx + 2; dx++) {
        const d = (dx / (k.rx + 0.5)) ** 2 + (dy / (k.ry + 0.5)) ** 2;
        const x = wrap(k.x + dx, W), y = wrap(k.y + dy, H);
        if (d <= 0.35) px[y][x] = 0;
        else if (d <= 1) px[y][x] = 1;
        else if (d <= 1.6) px[y][x] = 3;
      }
    }
  }

  // No lone pixels: a pixel unlike both its left and right neighbours
  // takes theirs when they agree, so the grain reads as clean runs.
  for (let y = 0; y < H; y++) {
    const row = px[y];
    for (let x = 0; x < W; x++) {
      const a = row[wrap(x - 1, W)], c = row[wrap(x + 1, W)];
      if (row[x] !== a && a === c) row[x] = a;
    }
  }
  return px;
}

/** The tile as an SVG: one crisp-edged path per shade, a rectangle per run. */
export function woodSvg(px = drawWood()): string {
  const paths = PALETTE.map(() => [] as string[]);
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const s = px[y][x];
      let end = x + 1;
      while (end < W && px[y][end] === s) end++;
      if (s !== 2) paths[s].push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  }
  const body = paths
    .map((d, s) => (d.length ? `<path fill="${PALETTE[s]}" d="${d.join("")}"/>` : ""))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges"><rect width="${W}" height="${H}" fill="${PALETTE[2]}"/>${body}</svg>\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  writeFileSync(new URL("../../assets/theme/wood-pixel.svg", import.meta.url), woodSvg());
}
