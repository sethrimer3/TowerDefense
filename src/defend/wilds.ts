/** The wilds: impassable scenery past the battlefield's edge. The field is a
 * square (`grid.ts`); whatever of the view the square doesn't fill (above
 * and below it on a tall screen, beside it on a wide one) shows country no
 * one can enter, so the view is never dark. Near the field it is the area's
 * open ground with scattered stones; farther out the stones crowd and grow
 * until they close into hills: grey rocks and mountains round the Mossbound
 * Ruins, red sandstone fins and buttes in the Amber Desert, and the same in
 * each other area's own stone.
 *
 * Presentation only: nothing in the battle reads it, and its randomness is
 * a fixed hash, so it is the same every time. It is painted once per area as
 * pixel art at `ART` pixels a cell into a canvas reaching `MARGIN` cells
 * past every edge, and drawn under the board with the camera. */

import type { AreaId } from "./areas.ts";
import { CELLS_H, CELLS_W, hash01 } from "./grid.ts";

/** Cells of scenery past each edge of the field: enough to fill an
 * ultra-wide or very tall view around the square at its unzoomed fit. */
export const MARGIN = 72;

type RGB = readonly [number, number, number];
type Palette = {
  /** Open ground: base and its darker and lighter flecks. */
  ground: RGB; groundDark: RGB; groundLight: RGB;
  /** Stone: shadowed, mid and lit faces, its outline, and a top tint (moss,
   * snow, dust) laid on the most upward-facing stone, if any. */
  shade: RGB; mid: RGB; lit: RGB; line: RGB; top?: RGB;
  /** Horizontal bands of darker stone, as in layered sandstone. */
  strata?: number;
  /** Rare glints in the stone (crystals, embers). */
  glint?: RGB;
};

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const pal = (g: string, gd: string, gl: string, s: string, m: string, l: string, line: string, extra: Partial<Palette> = {}): Palette => ({
  ground: hex(g), groundDark: hex(gd), groundLight: hex(gl), shade: hex(s), mid: hex(m), lit: hex(l), line: hex(line), ...extra,
});

const PALETTES: Partial<Record<AreaId, Palette>> & { moss: Palette } = {
  moss: pal("#3f5a2a", "#33491f", "#4d6a33", "#4f5357", "#6f7478", "#9a9fa2", "#121314", { top: hex("#5d7a3a") }),
  desert: pal("#d9a45f", "#c48d4c", "#e6b674", "#8e3a1c", "#bd5a2c", "#df8547", "#2e130a", { strata: 0.55, top: hex("#e8a25c") }),
  drowned: pal("#232b37", "#1b222c", "#2c3644", "#2f3a4a", "#465670", "#6a7f9c", "#0b0e14", { glint: hex("#9fe6ff") }),
  ember: pal("#3a2621", "#2e1d19", "#47302a", "#2a2324", "#433838", "#615150", "#0c0909", { glint: hex("#ff8a3a") }),
  fungal: pal("#3a2833", "#2e1f29", "#46313e", "#4a3743", "#664e5e", "#8a6c80", "#120b10", { top: hex("#a8668e") }),
  frozen: pal("#dbe9f2", "#c3d6e3", "#eef6fb", "#5f7f9a", "#86a7c1", "#b7d2e6", "#1a2633", { top: hex("#f4fbff") }),
  crystal: pal("#2c2238", "#22192c", "#382c46", "#4a3762", "#6a5089", "#9478b8", "#100a18", { glint: hex("#e9c8ff") }),
  obsidian: pal("#352d31", "#2a2327", "#40373c", "#1c171b", "#2f272d", "#4b4049", "#060506"),
  astral: pal("#27324a", "#1f283c", "#323f5a", "#706a58", "#9a927a", "#cfc6a4", "#14161e", { glint: hex("#fff3c4") }),
  nadir: pal("#16121e", "#110e17", "#1d1827", "#231d2e", "#342b44", "#4b3f60", "#050408"),
  magic: pal("#2c4a36", "#223a2a", "#376044", "#4a5a5c", "#68807f", "#93b3ac", "#0e1414", { top: hex("#5fae7e"), glint: hex("#b6ffd8") }),
};

export function wildsPalette(area: AreaId): Palette {
  return PALETTES[area] ?? PALETTES.moss;
}

/** How crowded the stone is `d` cells out from the field: none at the edge,
 * filling to solid hills some forty cells out. */
export const crowding = (d: number) => {
  const t = Math.max(0, Math.min(1, (d - 0.5) / 36));
  return t * (1.35 - 0.35 * t);
};

/** One stone: centre and radii in cells, the lumps of its outline, and
 * whether it is a hill (drawn smoother and taller). */
export type Boulder = { x: number; y: number; rx: number; ry: number; lump: [number, number, number, number]; seed: number };

/** How far a boulder's outline swells at the angle whose cosine and sine
 * are `c`, `s`: two lumps (3 and 5 a turn) at hashed phases. */
function swell(b: Boulder, c: number, s: number) {
  const c3 = 4 * c * c * c - 3 * c, s3 = 3 * s - 4 * s * s * s;
  const c5 = 16 * c ** 5 - 20 * c * c * c + 5 * c, s5 = 16 * s ** 5 - 20 * s * s * s + 5 * s;
  return 1 + b.lump[2] * (s3 * Math.cos(b.lump[0]) + c3 * Math.sin(b.lump[0])) + b.lump[3] * (s5 * Math.cos(b.lump[1]) + c5 * Math.sin(b.lump[1]));
}

/** Sizes of stone, from pebbles to hills: the grid each is scattered on
 * (cells), its radius range, and the crowding it starts to appear at. */
const SIZES = [
  { grid: 2.5, r0: 0.3, r1: 0.9, from: 0, salt: 11 },
  { grid: 5, r0: 0.9, r1: 2.6, from: 0.18, salt: 23 },
  { grid: 9, r0: 2.4, r1: 5.5, from: 0.42, salt: 37 },
  { grid: 16, r0: 5, r1: 11, from: 0.66, salt: 53 },
] as const;

/** Every stone in the wilds, seeded and sized by how crowded it is where it
 * stands, back to front (by its lowest edge) so nearer stones overlap. */
export function boulders(desert = false): Boulder[] {
  const out: Boulder[] = [];
  const lo = -MARGIN, hiX = CELLS_W + MARGIN, hiY = CELLS_H + MARGIN;
  for (const size of SIZES)
    for (let gy = Math.floor(lo / size.grid); gy * size.grid < hiY; gy++)
      for (let gx = Math.floor(lo / size.grid); gx * size.grid < hiX; gx++) {
        const x = (gx + 0.1 + 0.8 * hash01(gx, gy, size.salt)) * size.grid, y = (gy + 0.1 + 0.8 * hash01(gx, gy, size.salt + 1)) * size.grid;
        const d = beyond(x, y);
        if (d < 0.6) continue;
        const c = crowding(d), over = (c - size.from) / (1 - size.from);
        if (over <= 0 || hash01(gx, gy, size.salt + 2) > Math.min(1, 0.15 + 1.1 * over)) continue;
        const r = size.r0 + (size.r1 - size.r0) * Math.min(1, over * (0.6 + 0.6 * hash01(gx, gy, size.salt + 3)));
        // A stone near the field stays clear of it.
        const room = Math.max(0.3, d - 0.4);
        const rr = Math.min(r, room);
        const tall = desert ? 1.25 + 0.3 * hash01(gx, gy, size.salt + 4) : 0.85 + 0.2 * hash01(gx, gy, size.salt + 4);
        out.push({
          x, y, rx: rr, ry: rr * tall,
          lump: [hash01(gx, gy, size.salt + 5) * 6.283, hash01(gx, gy, size.salt + 6) * 6.283, 0.08 + 0.1 * hash01(gx, gy, size.salt + 7), 0.05 + 0.08 * hash01(gx, gy, size.salt + 8)],
          seed: (hash01(gx, gy, size.salt + 9) * 1e9) | 0,
        });
      }
  return out.sort((a, b) => a.y + a.ry - (b.y + b.ry));
}

/** Cells beyond the field's nearest edge (0 inside it). */
export function beyond(x: number, y: number) {
  const dx = Math.max(0, -x, x - CELLS_W), dy = Math.max(0, -y, y - CELLS_H);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Light from the upper left and above, as on the city's roofs. */
const LX = -0.48, LY = -0.56, LZ = 0.68;

/** Paints the wilds round the field into `data` (RGBA), `width` × `height`
 * pixels at `art` pixels a cell, its top left `MARGIN` cells up and left of
 * the field's. The field itself is left transparent. */
export function paintWilds(data: Uint8ClampedArray, width: number, height: number, art: number, area: AreaId) {
  const p = wildsPalette(area);
  const set = (o: number, c: RGB) => { data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255; };
  // Open ground, speckled; the field left clear.
  for (let j = 0; j < height; j++) {
    const y = (j + 0.5) / art - MARGIN;
    for (let i = 0; i < width; i++) {
      const x = (i + 0.5) / art - MARGIN, o = (j * width + i) * 4;
      if (x >= 0 && x < CELLS_W && y >= 0 && y < CELLS_H) { data[o + 3] = 0; continue; }
      const n = speck(i, j, 5);
      set(o, n < 0.12 ? p.groundDark : n > 0.93 ? p.groundLight : p.ground);
    }
  }
  const stones = boulders(!!p.strata);
  const px = (x: number) => Math.round((x + MARGIN) * art);
  // Shadows first, cast down and to the right onto the ground.
  for (const b of stones) {
    // Far out the stone covers all the ground: no shadow shows.
    if (beyond(b.x, b.y) > 34) continue;
    const ox = b.rx * 0.35, oy = b.ry * 0.3;
    for (let j = px(b.y - b.ry + oy); j < px(b.y + b.ry + oy); j++)
      for (let i = px(b.x - b.rx + ox); i < px(b.x + b.rx + ox); i++) {
        if (i < 0 || j < 0 || i >= width || j >= height) continue;
        const o = (j * width + i) * 4;
        if (!data[o + 3]) continue;
        const u = ((i + 0.5) / art - MARGIN - b.x - ox) / b.rx, v = ((j + 0.5) / art - MARGIN - b.y - oy) / b.ry;
        if (u * u + v * v < 1 && (i + j) % 2 === 0) set(o, mix([data[o], data[o + 1], data[o + 2]], p.groundDark, 0.7));
      }
  }
  // Then each stone, front to back, each pixel taken by the nearest stone
  // over it alone (so deep piles cost no more than one layer).
  const taken = new Uint8Array(width * height);
  for (let n = stones.length - 1; n >= 0; n--) {
    const b = stones[n];
    const edge = 1.2 / (art * Math.min(b.rx, b.ry));
    for (let j = px(b.y - b.ry * 1.25); j < px(b.y + b.ry * 1.25); j++)
      for (let i = px(b.x - b.rx * 1.25); i < px(b.x + b.rx * 1.25); i++) {
        if (i < 0 || j < 0 || i >= width || j >= height) continue;
        const k = j * width + i, o = k * 4;
        if (taken[k] || !data[o + 3]) continue;
        const u = ((i + 0.5) / art - MARGIN - b.x) / b.rx, v = ((j + 0.5) / art - MARGIN - b.y) / b.ry;
        const len = Math.sqrt(u * u + v * v);
        if (len >= 1.25) continue;
        const lumpy = len > 1e-6 ? swell(b, u / len, v / len) : 1;
        const q = len / lumpy;
        if (q >= 1) continue;
        taken[k] = 1;
        if (q > 1 - edge) { set(o, p.line); continue; }
        // A dome: its slope toward the light picks the tone.
        const z = Math.sqrt(Math.max(0, 1 - q * q)), nx = u / lumpy, ny = v / lumpy;
        let light = (nx * LX + ny * LY + z * LZ) / Math.sqrt(nx * nx + ny * ny + z * z);
        light += (speck(i >> 1, j >> 1, b.seed & 1023) - 0.5) * 0.12;
        let c: RGB = light > 0.78 ? mix(p.lit, [255, 255, 255], 0.12) : light > 0.55 ? p.lit : light > 0.25 ? p.mid : p.shade;
        if (p.strata) {
          const band = Math.floor(((j + 0.5) / art - MARGIN) * 1.4 + b.seed % 3);
          if (band % 3 === 0) c = mix(c, p.shade, p.strata * 0.55);
          else if (band % 3 === 1 && light > 0.25) c = mix(c, p.lit, 0.25);
        }
        if (p.top && light > 0.55 && z > 0.6 && speck(i >> 1, j >> 1, 9) < 0.22) c = mix(c, p.top, 0.6);
        if (p.glint && speck(i, j, 13) < 0.003) c = p.glint;
        set(o, c);
      }
  }
}

/** A cheap per-pixel hash in [0, 1). */
function speck(i: number, j: number, salt: number) {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(salt, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The wilds' canvas per area, painted on first use, and drawn under the
 * board through the camera. */
export class Wilds {
  private canvases = new Map<AreaId, HTMLCanvasElement>();

  private canvas(area: AreaId, art: number) {
    let c = this.canvases.get(area);
    if (c) return c;
    c = document.createElement("canvas");
    c.width = (CELLS_W + 2 * MARGIN) * art;
    c.height = (CELLS_H + 2 * MARGIN) * art;
    const ctx = c.getContext("2d")!;
    const img = ctx.createImageData(c.width, c.height);
    paintWilds(img.data, c.width, c.height, art, area);
    ctx.putImageData(img, 0, 0);
    this.canvases.set(area, c);
    return c;
  }

  /** Draws the wilds for `area` under a board drawn at `px` canvas pixels a
   * cell through camera `cam`, darkened by `night` (0 to 1). */
  draw(ctx: CanvasRenderingContext2D, area: AreaId, art: number, px: number, cam: { s: number; x: number; y: number }, night: number) {
    const c = this.canvas(area, art), k = (px * cam.s) / art;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const x = cam.x - MARGIN * px * cam.s, y = cam.y - MARGIN * px * cam.s;
    ctx.drawImage(c, Math.round(x), Math.round(y), Math.round(c.width * k), Math.round(c.height * k));
    if (night > 0.001) {
      ctx.fillStyle = `rgba(6,8,18,${Math.min(0.82, night * 0.78).toFixed(3)})`;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    ctx.restore();
  }
}
