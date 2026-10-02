/** The parks' ponds and trees as pixel art: painted pixel by pixel at `ART`
 * pixels a cell (as the park grass's blades are), then drawn into the city
 * layer scaled up with smoothing off, so they sit with the blocky roofs,
 * grass and flagstones instead of looking smooth and painterly beside them.
 *
 * - **Ponds:** the union of each water cell's disc (the same shore
 *   `pondDisc` describes), in bands: a black outline, a muddy bank, reedy
 *   shallows, open water and a darker deep heart, the band edges broken
 *   with a checker dither; flat glints and lily pads, some in flower.
 * - **Trees:** lumpy round canopies with a one-pixel outline and four
 *   shades lit from the upper left, dithered where shades meet. They stand
 *   over the walkers, so each is baked as its own sprite (`trees`) the
 *   renderer draws after the units (`park-trees.ts`); their shadows are cast
 *   with the buildings' (`shadow-art.ts`).
 *
 * Baked once per city (`parkArt`), with the open-water mask the ripples,
 * reflections and ducks keep to. Presentation only. */
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { POND, hasTree, pondDisc, treeCanopy } from "./park-geometry.ts";

/** Art pixels a cell. */
export const ART = 8;
const W = CELLS_W * ART, H = CELLS_H * ART;

/** One tree's sprite: its art-pixel box and canopy, centre and radius in cells. */
export type TreeSprite = { x: number; y: number; w: number; h: number; canvas: HTMLCanvasElement | null; cx: number; cy: number; r: number };

export type ParkArt = {
  /** Art pixels across (rows are this long in `open`). */
  width: number;
  /** The ponds, transparent elsewhere, `W × H` art pixels. */
  canvas: HTMLCanvasElement | null;
  /** Every tree in one `W × H` canvas (the ponds mirror them). */
  canopies: HTMLCanvasElement | null;
  /** Each tree on its own, in reading order. */
  trees: TreeSprite[];
  /** 1 on art pixels of open water (where ripples and ducks may be). */
  open: Uint8Array;
  /** The open water as a white-on-clear canvas, for masking. */
  mask: HTMLCanvasElement | null;
};

const cache = new WeakMap<CityMap, ParkArt>();

/** Whether art pixel (x, y) is open water. */
export const openAt = (art: ParkArt, x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && art.open[y * W + x] === 1;

/** `map`'s park art, baked on first use. */
export function parkArt(map: CityMap): ParkArt {
  let art = cache.get(map);
  if (!art) cache.set(map, (art = bake(map)));
  return art;
}

/** Pond bands, darkest edge first. */
const BANDS = [
  { scale: POND.outline, color: 0x0b0907 },
  { scale: POND.bank, color: 0x3a3524 },
  { scale: POND.shallows, color: 0x2a4f45 },
  { scale: POND.open, color: 0x2b5d71 },
  { scale: 0.42, color: 0x244f66 },
];
const GLINT = 0x9cc8d6, PAD = 0x4f7d3b, PAD_DARK = 0x3a5f2c, BLOSSOM = [0xe9d7e0, 0xf2eecb];
const TREE = { outline: 0x0b0907, dark: [0x223b1c, 0x284420], mid: [0x2f5224, 0x335a27], light: [0x45702f, 0x4a7a36], top: [0x679c4e, 0x6fa452] };

function bake(map: CityMap): ParkArt {
  const px = new Uint32Array(W * H), open = new Uint8Array(W * H), leaves = new Uint32Array(W * H);
  paintPonds(map, px, open);
  const trees = paintTrees(map, leaves, open);
  let canvas: HTMLCanvasElement | null = null, mask: HTMLCanvasElement | null = null, canopies: HTMLCanvasElement | null = null;
  if (typeof document !== "undefined") {
    canvas = toCanvas(px);
    canopies = toCanvas(leaves);
    const m = new Uint32Array(W * H);
    for (let i = 0; i < m.length; i++) if (open[i]) m[i] = 0xffffffff;
    mask = toCanvas(m);
  }
  return { width: W, canvas, canopies, trees, open, mask };
}

/** Opaque little-endian RGBA for 0xRRGGBB. */
const rgba = (c: number) => ((255 << 24) | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;

function toCanvas(px: Uint32Array, w = W, h = H) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const c = cv.getContext("2d")!;
  const img = c.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(px);
  c.putImageData(img, 0, 0);
  return cv;
}

function paintPonds(map: CityMap, px: Uint32Array, open: Uint8Array) {
  const discs: { x: number; y: number; f: number }[] = [];
  for (let i = 0; i < map.type.length; i++) {
    if (map.type[i] !== CellType.WATER) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W, d = pondDisc(cx, cy, 1);
    // The disc's own size factor, so each band is `scale × f` cells across.
    discs.push({ x: d.x, y: d.y, f: d.r });
  }
  if (!discs.length) return;
  const done = new Uint8Array(W * H);
  for (const d of discs) {
    const reach = POND.outline * d.f + 0.2;
    const x0 = Math.max(0, Math.floor((d.x - reach) * ART)), x1 = Math.min(W - 1, Math.ceil((d.x + reach) * ART));
    const y0 = Math.max(0, Math.floor((d.y - reach) * ART)), y1 = Math.min(H - 1, Math.ceil((d.y + reach) * ART));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        if (done[i]) continue;
        done[i] = 1;
        // How deep into the pond this pixel is: the deepest band of any disc.
        const band = deepest(discs, (x + 0.5) / ART, (y + 0.5) / ART, (x + y) & 1);
        if (band < 0) continue;
        px[i] = rgba(BANDS[band].color);
        open[i] = band >= 3 ? 1 : 0;
      }
  }
  // Glints and lily pads on the open water.
  for (let i = 0; i < map.type.length; i++) {
    if (map.type[i] !== CellType.WATER) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    const gx = cx * ART + 1 + Math.floor(hash01(cx, cy, 61) * 4), gy = cy * ART + 2 + Math.floor(hash01(cx, cy, 62) * 4);
    for (let k = 0; k < 2 + (hash(cx, cy, 70) % 2); k++) put(px, open, gx + k, gy, GLINT);
    if (hash01(cx, cy, 63) >= 0.35) continue;
    const lx = cx * ART + 2 + Math.floor(hash01(cx, cy, 64) * 4), ly = cy * ART + 2 + Math.floor(hash01(cx, cy, 65) * 4);
    // A notched pad: three pixels wide, two tall, a darker underside.
    for (const [dx, dy, c] of [[0, 0, PAD], [1, 0, PAD], [-1, 1, PAD], [0, 1, PAD], [1, 1, PAD_DARK], [2, 1, PAD]] as const) put(px, open, lx + dx, ly + dy, c);
    if (hash01(cx, cy, 69) < 0.4) put(px, open, lx, ly, BLOSSOM[hash(cx, cy, 71) % 2]);
  }
}

/** The deepest pond band at point (x, y) in cells, or -1 off the pond; on
 * odd pixels a band edge is pulled in a little, dithering it. */
function deepest(discs: { x: number; y: number; f: number }[], x: number, y: number, odd: number) {
  let best = -1;
  for (const d of discs) {
    const dx = x - d.x, dy = y - d.y, r = Math.sqrt(dx * dx + dy * dy) + odd * 0.035;
    for (let b = BANDS.length - 1; b > best; b--) if (r <= BANDS[b].scale * d.f) { best = b; break; }
    if (best === BANDS.length - 1) break;
  }
  return best;
}

/** Paints over open water only, keeping glints and pads off the bank. */
function put(px: Uint32Array, open: Uint8Array, x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= W || y >= H || open[y * W + x] !== 1) return;
  px[y * W + x] = rgba(c);
}

/** Paints every tree into `px` and returns each as its own sprite. */
function paintTrees(map: CityMap, px: Uint32Array, open: Uint8Array): TreeSprite[] {
  const out: TreeSprite[] = [];
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (!hasTree(map, cx, cy)) continue;
      const dark = hash01(cx, cy, 22) < 0.5 ? 0 : 1;
      const own: [number, number, number][] = [];
      treePixels(cx, cy, (x, y, part, light) => {
        // Water under a canopy is hidden: nothing swims or ripples there.
        open[y * W + x] = 0;
        if (part === "edge") return void own.push([x, y, TREE.outline]);
        // Four shades from the upper left, the boundaries dithered.
        const dither = ((x + y) & 1) * 0.12 - 0.06;
        const v = light + dither;
        own.push([x, y, v > 0.55 ? TREE.top[dark] : v > 0.12 ? TREE.light[dark] : v > -0.35 ? TREE.mid[dark] : TREE.dark[dark]]);
      });
      let x0 = W, y0 = H, x1 = 0, y1 = 0;
      for (const [x, y, c] of own) {
        px[y * W + x] = rgba(c);
        x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x), y1 = Math.max(y1, y);
      }
      const w = x1 - x0 + 1, h = y1 - y0 + 1, t = treeCanopy(cx, cy);
      let canvas: HTMLCanvasElement | null = null;
      if (typeof document !== "undefined") {
        const sprite = new Uint32Array(w * h);
        for (const [x, y, c] of own) sprite[(y - y0) * w + x - x0] = rgba(c);
        canvas = toCanvas(sprite, w, h);
      }
      out.push({ x: x0, y: y0, w, h, canvas, cx: t.x, cy: t.y, r: t.r });
    }
  return out;
}

/** Visits the art pixels of the tree on cell (cx, cy): "body" inside its
 * lumpy canopy, with how squarely it faces the light (-1..1), and "edge"
 * on the one-pixel outline round it. */
export function treePixels(cx: number, cy: number, visit: (x: number, y: number, part: "body" | "edge", light: number) => void) {
  const t = treeCanopy(cx, cy);
  const ox = t.x * ART, oy = t.y * ART, R = Math.max(2, t.r * ART);
  const phase = hash01(cx, cy, 26) * 6.28, lumps = 3 + (hash(cx, cy, 27) % 3);
  // A canopy of leaf clumps: its radius rises and falls round the rim.
  const rim = (a: number) => R * (1 + 0.13 * Math.sin(a * lumps + phase));
  const x0 = Math.max(0, Math.floor(ox - R * 1.2 - 1)), x1 = Math.min(W - 1, Math.ceil(ox + R * 1.2 + 1));
  const y0 = Math.max(0, Math.floor(oy - R * 1.2 - 1)), y1 = Math.min(H - 1, Math.ceil(oy + R * 1.2 + 1));
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - ox, dy = y + 0.5 - oy, d = Math.sqrt(dx * dx + dy * dy), r = rim(Math.atan2(dy, dx));
      if (d <= r) visit(x, y, "body", (-dx * 0.6 - dy * 0.8) / R);
      else if (d <= r + 1) visit(x, y, "edge", 0);
    }
}
