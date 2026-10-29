/** Pixel-art icons for the Ambush and Siege combat modes, drawn in code like
 * the Tiles tab's city tile: shapes laid on a `N × N` grid of art pixels by
 * material, each material shaded light on its upper left edges and dark on
 * its lower right, then ringed in a black outline. Presentation only. */

/** Art pixels across an icon. */
export const MODE_ICON_SIZE = 24;
const N = MODE_ICON_SIZE;
const OUTLINE = 0x0c0a0a;

/** A material's tones: light, mid, dark; `flat` paints mid only. */
type Material = { tones: [number, number, number]; flat?: boolean };
const WOOD: Material = { tones: [0xd39b5c, 0x9a6638, 0x5f3c20] };
const DARK_WOOD: Material = { tones: [0x8f613b, 0x6a4529, 0x432b18] };
const IRON: Material = { tones: [0xc3ccd4, 0x7f8b96, 0x4b545e] };
const STONE: Material = { tones: [0x9a9384, 0x6a645a, 0x433f39] };
const STRING: Material = { tones: [0xeee2c4, 0xeee2c4, 0xeee2c4], flat: true };
const FEATHER: Material = { tones: [0xe0695a, 0xb83c30, 0x7c2420] };
const LEAF: Material = { tones: [0x7fbd52, 0x4a8a36, 0x2a5a26] };
const SHADOW: Material = { tones: [0x1d2a16, 0x1d2a16, 0x1d2a16], flat: true };
const SPRIG: Material = { tones: [0xa9d877, 0xa9d877, 0xa9d877], flat: true };
const DUST: Material = { tones: [0xcfc3a6, 0xcfc3a6, 0xcfc3a6], flat: true };
const EYES: Material = { tones: [0xf2d36b, 0xf2d36b, 0xf2d36b], flat: true };
const BRASS: Material = { tones: [0xf0d58a, 0xc99a3e, 0x8a6220] };

/** A grid of materials, painted with simple shapes. */
class Grid {
  cells: (Material | null)[] = new Array(N * N).fill(null);
  set(x: number, y: number, m: Material | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.cells[y * N + x] = m;
  }
  at(x: number, y: number) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.cells[y * N + x] : null;
  }
  rect(x: number, y: number, w: number, h: number, m: Material) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, m);
  }
  disc(cx: number, cy: number, r: number, m: Material | null) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, m);
  }
  /** A line `width` pixels thick (1 or 2), stepped along its longer axis. */
  line(x0: number, y0: number, x1: number, y1: number, m: Material, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps;
      const y = y0 + ((y1 - y0) * s) / steps;
      this.set(x, y, m);
      if (width > 1) this.set(x + 1, y, m);
    }
  }
  /** A quadratic curve through control point (cx, cy). */
  curve(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number, m: Material, width = 1) {
    let px = x0,
      py = y0;
    for (let s = 1; s <= 12; s++) {
      const t = s / 12;
      const x = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1;
      const y = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1;
      this.line(px, py, x, y, m, width);
      px = x;
      py = y;
    }
  }
}

/** Ambush: a bow drawn from the cover of a bush, arrow aimed up and out of
 * it, and a pair of eyes watching from the leaves. */
function ambush(g: Grid) {
  // The bow, bulging toward the upper right, its string drawn back to the nock.
  g.curve(4, 5, 19, 3, 19, 19, WOOD, 2);
  g.line(4, 5, 8, 15, STRING);
  g.line(8, 15, 18, 19, STRING);
  g.rect(15, 7, 2, 3, DARK_WOOD);
  // The arrow, from its fletching at the nock to its head past the grip.
  g.line(8, 15, 19, 4, DARK_WOOD);
  g.rect(19, 2, 3, 1, IRON);
  g.rect(21, 2, 1, 3, IRON);
  g.set(20, 3, IRON);
  g.set(19, 4, IRON);
  g.set(6, 15, FEATHER);
  g.set(7, 16, FEATHER);
  g.set(7, 14, FEATHER);
  g.set(6, 17, FEATHER);
  g.set(5, 16, FEATHER);
  g.set(8, 17, FEATHER);
  // The bush, in front of all of it, with a dark gap and eyes in it.
  for (const [x, y, r] of [[2.5, 21.5, 3.4], [7.5, 20.5, 3.4], [12.5, 21.5, 3.4], [17, 21, 3.2], [21.5, 21.5, 2.8], [10, 24, 3]] as const)
    g.disc(x, y, r, LEAF);
  g.rect(4, 20, 5, 2, SHADOW);
  g.set(5, 20, EYES);
  g.set(7, 20, EYES);
  for (const [x, y] of [[11, 20], [14, 21], [17, 19], [20, 21], [2, 22], [13, 23], [19, 23]]) g.set(x, y, SHADOW);
  for (const [x, y] of [[10, 19], [16, 19], [21, 20], [1, 20], [12, 22]]) g.set(x, y, SPRIG);
}

/** Siege: a trebuchet, its arm cocked back with a stone in the sling. */
function siege(g: Grid) {
  // The base on its wheels.
  g.rect(2, 18, 20, 2, WOOD);
  // The A-frame.
  g.line(5, 17, 11, 7, DARK_WOOD, 2);
  g.line(18, 17, 12, 7, DARK_WOOD, 2);
  g.rect(8, 13, 9, 1, DARK_WOOD);
  // The arm: long end up to the left, short end down to the counterweight.
  g.line(2, 2, 16, 11, WOOD, 2);
  g.disc(11.5, 8, 1.2, BRASS);
  // The counterweight, hung under the short end.
  g.line(16, 12, 16, 12, IRON);
  g.rect(14, 13, 6, 4, IRON);
  g.set(15, 14, BRASS);
  g.set(18, 14, BRASS);
  // The sling and its stone, swinging under the long end.
  g.line(2, 3, 3, 7, STRING);
  g.disc(4, 8.5, 1.8, STONE);
  // A stone already on its way, trailing dust.
  g.disc(20, 4, 1.8, STONE);
  g.set(17, 4, DUST);
  g.set(15, 5, DUST);
  // Wheels.
  g.disc(5.5, 20.5, 2.4, DARK_WOOD);
  g.disc(17.5, 20.5, 2.4, DARK_WOOD);
  g.set(5.5, 20.5, BRASS);
  g.set(17.5, 20.5, BRASS);
}

const DRAW = { ambush, siege };
export type ModeIcon = keyof typeof DRAW;

/** The icon as `N × N` RGB pixels, 0 where empty. */
export function modeIconPixels(mode: ModeIcon): Uint32Array {
  const g = new Grid();
  DRAW[mode](g);
  const out = new Uint32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const m = g.at(x, y);
      if (m) {
        const tone = m.flat ? 1 : g.at(x - 1, y) !== m || g.at(x, y - 1) !== m ? 0 : g.at(x + 1, y) !== m || g.at(x, y + 1) !== m ? 2 : 1;
        out[y * N + x] = m.tones[tone] | 0xff000000;
      } else if (g.at(x - 1, y) || g.at(x + 1, y) || g.at(x, y - 1) || g.at(x, y + 1)) out[y * N + x] = OUTLINE | 0xff000000;
    }
  return out;
}

const urls = new Map<ModeIcon, string>();
/** The icon as a data URL, `scale` screen pixels an art pixel, made once. */
export function modeIconUrl(mode: ModeIcon, scale = 2): string {
  const cached = urls.get(mode);
  if (cached) return cached;
  const px = modeIconPixels(mode);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N * scale;
  const c = canvas.getContext("2d")!;
  for (let i = 0; i < px.length; i++) {
    if (!px[i]) continue;
    const v = px[i];
    c.fillStyle = `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
    c.fillRect((i % N) * scale, Math.floor(i / N) * scale, scale, scale);
  }
  const url = canvas.toDataURL();
  urls.set(mode, url);
  return url;
}
