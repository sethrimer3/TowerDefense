/**
 * The currency sign's pixel art: Copper, Silver and Gold ingots, Knowledge's
 * open book, the Upgrade point's arrow, Blight Essence's living black glob,
 * and the hemp ropes the sign hangs from. Every piece is drawn without an
 * outline; `outlined` rings it with one art pixel afterwards, as the game
 * outlines its sprites. Presentation only: Essence's wobble is wall-clock
 * noise, never the game's random streams.
 */

/** Art pixels across an icon's body, before its outline. */
export const ICON_BODY = 12;
/** Art pixels across an icon, outline included. */
export const ICON_SIZE = ICON_BODY + 2;
export const OUTLINE_INK = 0x0c0a0a;

export type CurrencyIcon = "copper" | "silver" | "gold" | "knowledge" | "upgrade" | "essence";

/** Pixels in rows of `w`: an RGB colour, or -1 for clear. */
export type Pixels = { w: number; h: number; px: number[] };

/** Rings every painted pixel with `ink` on the clear pixels beside it (four
 * neighbours), growing the picture by one pixel each way. */
export function outlined(src: Pixels, ink = OUTLINE_INK): Pixels {
  const w = src.w + 2, h = src.h + 2, px = new Array<number>(w * h).fill(-1);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) px[(y + 1) * w + x + 1] = src.px[y * src.w + x];
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && px[y * w + x] >= 0;
  const ring: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) ring.push(y * w + x);
  for (const i of ring) px[i] = ink;
  return { w, h, px };
}

/** A picture from rows of letters, each letter a colour from `key` ("." clear). */
function rows(art: string[], key: Record<string, number>): Pixels {
  const w = art[0].length, h = art.length, px: number[] = [];
  for (const row of art) for (const ch of row) px.push(ch === "." ? -1 : key[ch]);
  return { w, h, px };
}

/** An ingot `w` wide and `h` tall, seen from the front and above: a lit
 * top face with a glint, the front's lit lip, a front face darkening toward
 * the bottom and a shaded end. */
function bar(w: number, h: number): string[] {
  return [
    "." + "w" + "T".repeat(w - 4) + "t" + ".",
    "h".repeat(w - 1) + "E",
    ...Array.from({ length: h - 3 }, () => "F".repeat(w - 1) + "E"),
    "f".repeat(w - 1) + "E",
  ];
}
/** Bars laid on a clear body at their top left corners. A clear pixel left
 * between two bars takes the outline's ink, so they read apart. */
function pile(bars: { x: number; y: number; w: number; h: number }[]): string[] {
  const grid = Array.from({ length: ICON_BODY }, () => Array<string>(ICON_BODY).fill("."));
  for (const b of bars) bar(b.w, b.h).forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== ".") grid[b.y + y][b.x + x] = ch; }));
  return grid.map(row => row.join(""));
}
/** The metals count up in bars, so they read apart without their colours:
 * Copper one, Silver two stacked, Gold three in a triangle. */
const INGOTS = {
  copper: pile([{ x: 1, y: 4, w: 10, h: 5 }]),
  silver: pile([{ x: 2, y: 2, w: 8, h: 4 }, { x: 2, y: 7, w: 8, h: 4 }]),
  gold: pile([{ x: 4, y: 2, w: 5, h: 4 }, { x: 1, y: 7, w: 5, h: 4 }, { x: 7, y: 7, w: 5, h: 4 }]),
};
/** A metal's tones: glint, top, top's far edge, the front's lit lip, front, front's foot, end. */
const METALS = {
  copper: { w: 0xffd8b4, T: 0xf0a272, t: 0xd8814e, h: 0xe08a56, F: 0xc0673a, f: 0x8e4524, E: 0x6a3018, s: 0xffe7c8 },
  silver: { w: 0xffffff, T: 0xe4e8f0, t: 0xc4cad6, h: 0xccd2de, F: 0xa8b0c0, f: 0x7a8396, E: 0x596274, s: 0xffffff },
  gold: { w: 0xfffbe0, T: 0xffe08a, t: 0xf2c25a, h: 0xf0c050, F: 0xd9a136, f: 0xa8741c, E: 0x7c5212, s: 0xfff4c0 },
};
/** Knowledge: an open book, violet covers, cream pages with lines of
 * script, and a rune glowing over its spine. */
const BOOK = [
  ".....g......",
  "....gRg.....",
  ".....g......",
  "............",
  ".PPPP..PPPP.",
  "CPllPPPPllpC",
  "CPPPPpPPPPpC",
  "CPllPpPllPpC",
  "CPPPPpPPPPpC",
  "CccccPcccccC",
  "..CCCCCCCC..",
  "............",
];
const BOOK_KEY = { g: 0xb07aff, R: 0xf2e2ff, P: 0xf4e8c8, p: 0xd6c49a, l: 0x9a8a6a, C: 0x6a3aa8, c: 0x8a5ac8 };
/** Upgrade: a brass arrow climbing out of a blue gem's glow. */
const ARROW = [
  ".....HH.....",
  "....HAAa....",
  "...HAAAAa...",
  "..HAAAAAAa..",
  ".HAAAAAAAAa.",
  "....HAAa....",
  "....HAAa....",
  "....HAAa....",
  "...bBBBBd...",
  "..bBGGBBBd..",
  "...dBBBBd...",
  ".....dd.....",
];
const ARROW_KEY = { H: 0xfff0c0, A: 0xe0b450, a: 0x9a6c20, b: 0x7ab8ff, B: 0x3a78d8, G: 0xd8ecff, d: 0x1e3c80 };

/** A still icon, outlined. Essence takes its frame at `seconds`. */
export function iconPixels(name: CurrencyIcon, seconds = 0): Pixels {
  if (name === "essence") return essencePixels(seconds);
  if (name === "knowledge") return outlined(rows(BOOK, BOOK_KEY));
  if (name === "upgrade") return outlined(rows(ARROW, ARROW_KEY));
  return outlined(rows(INGOTS[name], METALS[name]));
}

// ── Blight Essence ──

/** A fixed shuffle for the gradient noise, so the glob's wobble is the
 * same in every browser and never draws from the game's streams. */
const PERM = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = 0x9e3779b9;
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6b43a9b5) >>> 0;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  return [...p, ...p];
})();
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
function grad(h: number, x: number, y: number, z: number) {
  const u = h & 8 ? y : x, v = h & 12 ? (h === 12 || h === 14 ? x : z) : y;
  return (h & 1 ? -u : u) + (h & 2 ? -v : v);
}
/** Ken Perlin's improved 3D noise, about -1 to 1. */
export function perlin(x: number, y: number, z: number) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z), P = PERM;
  const A = P[X] + Y, AA = P[A] + Z, AB = P[A + 1] + Z, B = P[X + 1] + Y, BA = P[B] + Z, BB = P[B + 1] + Z;
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);
  return lerp(w,
    lerp(v, lerp(u, grad(P[AA], x, y, z), grad(P[BA], x - 1, y, z)), lerp(u, grad(P[AB], x, y - 1, z), grad(P[BB], x - 1, y - 1, z))),
    lerp(v, lerp(u, grad(P[AA + 1], x, y, z - 1), grad(P[BA + 1], x - 1, y, z - 1)), lerp(u, grad(P[AB + 1], x, y - 1, z - 1), grad(P[BB + 1], x - 1, y - 1, z - 1))));
}

/** The glob's black, a glossy sheen on its upper left, and the burning
 * dimension showing round its edge like a Dark One's outline. */
const ESSENCE = { body: 0x050407, deep: 0x120c18, sheen: 0x2c2238, glint: 0x7a6a8c };
const FIRE = [0x7a1c06, 0xc23a0a, 0xf07a18, 0xffc040];
/** The glob's mean radius in art pixels, and how far the noise pushes it. */
const GLOB = { radius: 4.3, wobble: 1.5, scale: 1.25, speed: 0.55 };

/** The glob at `seconds`: a black body whose edge is Perlin noise read
 * round a circle and moved through time, ringed in fire instead of ink.
 * Outlined, so `ICON_SIZE` across. */
export function essencePixels(seconds: number): Pixels {
  const n = ICON_BODY, c = (n - 1) / 2, t = seconds * GLOB.speed, px = new Array<number>(n * n).fill(-1);
  const edge = (a: number) => GLOB.radius + GLOB.wobble * perlin(Math.cos(a) * GLOB.scale + 7.3, Math.sin(a) * GLOB.scale + 3.1, t);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
      const reach = edge(Math.atan2(dy, dx));
      if (r > reach) continue;
      // Lit from the upper left: a soft sheen, a glint, the rest pitch black.
      const lit = (-dx - dy) / (Math.SQRT2 * Math.max(reach, 1));
      const rim = r > reach - 1.6;
      px[y * n + x] = lit > 0.72 && rim ? ESSENCE.glint : lit > 0.45 && rim ? ESSENCE.sheen : r > reach - 1 ? ESSENCE.deep : ESSENCE.body;
    }
  // The ring burns: each outline pixel's heat is noise moving with time.
  const out = outlined({ w: n, h: n, px }, -2);
  const w = out.w;
  for (let i = 0; i < out.px.length; i++) {
    if (out.px[i] !== -2) continue;
    const x = i % w, y = Math.floor(i / w);
    const heat = 0.5 + 0.5 * perlin(x * 0.55 + 11.7, y * 0.55 + 5.2, seconds * 1.4);
    out.px[i] = FIRE[Math.max(0, Math.min(FIRE.length - 1, Math.floor(heat * FIRE.length)))];
  }
  return out;
}

// ── Ropes ──

/** Hemp, light to dark, and the dark twist between strands. */
const HEMP = [0xe0c48a, 0xc4a26a, 0x9c7a48, 0x6e5230];
const TWIST = 0x3e2c18;
/** Art pixels across the rope's body. */
export const ROPE_BODY = 4;
/** One twist of rope (it tiles down): strands running diagonally, lit on
 * the left and shaded on the right like a cylinder, outlined. */
export function ropePixels(): Pixels {
  const w = ROPE_BODY, h = 4, px: number[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + y) % 4;
      px.push(u === 0 ? TWIST : HEMP[Math.min(3, (u === 1 ? 0 : 1) + (x >= w - 1 ? 2 : 0))]);
    }
  // Ink on the sides only, so the tile joins seamlessly top to bottom.
  const o = outlined({ w, h, px });
  return { w: o.w, h, px: o.px.slice(o.w, o.w * (h + 1)) };
}
/** Where the rope meets the sign: a knot, the hemp wound round itself. */
const KNOT = [
  ".hKKk.",
  "hKKKKk",
  "TTTTTT",
  "hKKKKk",
  "TTTTTT",
  ".hKKk.",
];
export function knotPixels(): Pixels {
  return outlined(rows(KNOT, { h: HEMP[0], K: HEMP[1], k: HEMP[2], T: TWIST }));
}

// ── Canvas ──

/** Paints `p` into `canvas`, sizing it to the art. */
export function paintPixels(canvas: HTMLCanvasElement, p: Pixels) {
  if (canvas.width !== p.w) canvas.width = p.w;
  if (canvas.height !== p.h) canvas.height = p.h;
  const c = canvas.getContext("2d");
  if (!c) return;
  const img = c.createImageData(p.w, p.h);
  p.px.forEach((rgb, i) => {
    if (rgb >= 0) img.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], i * 4);
  });
  c.putImageData(img, 0, 0);
}

/** The icons' canvases in the sign: `<canvas data-currency-icon="…">`. */
export const iconCanvas = (name: CurrencyIcon) =>
  `<canvas class="currency-icon" width="${ICON_SIZE}" height="${ICON_SIZE}" data-currency-icon="${name}" aria-hidden="true"></canvas>`;

function dataUrl(p: Pixels) {
  const cv = document.createElement("canvas");
  paintPixels(cv, p);
  return `url("${cv.toDataURL()}")`;
}

/** Paints every still icon in `root` and puts the ropes in `--rope-art`
 * and `--rope-knot` on the root, once. */
export function installCurrencyArt(root: ParentNode) {
  if (typeof document === "undefined") return;
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-currency-icon]").forEach((cv) => paintPixels(cv, iconPixels(cv.dataset.currencyIcon as CurrencyIcon)));
  const style = document.documentElement.style;
  if (!style.getPropertyValue("--rope-art")) {
    style.setProperty("--rope-art", dataUrl(ropePixels()));
    style.setProperty("--rope-knot", dataUrl(knotPixels()));
  }
}

/** Steps Essence's glob at about 10 frames a second; held still under
 * Reduce Motion. Call from the frame loop while the sign shows. */
export class EssenceGlob {
  private last = -1;
  constructor(private canvas: HTMLCanvasElement | null) {}
  draw(nowMs: number, still: boolean) {
    if (!this.canvas) return;
    const frame = still ? 0 : Math.floor(nowMs / 100);
    if (frame === this.last) return;
    this.last = frame;
    paintPixels(this.canvas, essencePixels(frame / 10));
  }
}
