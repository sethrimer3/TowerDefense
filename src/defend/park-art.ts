import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { outlinePixels, spriteCanvas } from "./damage-art.ts";
import { onPixelArt } from "./pixel-sprites.ts";
import { ART } from "./art-scale.ts";
/** The parks' ponds and trees as pixel art: painted pixel by pixel at `ART`
 * pixels a cell (as the park grass's blades are), then drawn into the city
 * layer scaled up with smoothing off, so they sit with the blocky roofs,
 * grass and flagstones instead of looking smooth and painterly beside them.
 *
 * - **Ponds:** the smooth union of each water cell's disc (`pondField`,
 *   over the discs `pondDisc` describes), so a pond is one rounded body of
 *   water, in bands by the distance in from its shore: a black outline, a
 *   muddy bank, reedy shallows, open water and a darker deep heart, the
 *   band edges broken with a checker dither; flat glints and lily pads,
 *   some in flower.
 * - **Trees:** lumpy round canopies with a one-pixel outline and four
 *   shades lit from the upper left, dithered where shades meet. They stand
 *   over the walkers, so each is baked as its own sprite (`trees`) the
 *   renderer draws after the units (`park-trees.ts`); their shadows are cast
 *   with the buildings' (`shadow-art.ts`).
 *
 * An Ambush river is painted here too, but as the forest's lakes are
 * (`river-art.ts`), and is no pond: no ducks, ripples or reflections.
 *
 * Baked once per city (`parkArt`), with the open-water mask the ripples,
 * reflections and ducks keep to. Presentation only. */
import { CELLS_H, CELLS_W, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import { POND_BLEND, hasTree, pondDisc, pondField, treeCanopy } from "./park-geometry.ts";
import { paintRiver, riverBed, riverCanvas, riverCell, riverShape } from "./river-art.ts";

/** Art pixels a cell. */
export { ART } from "./art-scale.ts";
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

let cache = new WeakMap<CityMap, ParkArt>();
onPixelArt(()=>{cache=new WeakMap();});

/** Whether art pixel (x, y) is open water. */
export const openAt = (art: ParkArt, x: number, y: number) =>
  x >= 0 && y >= 0 && x < W && y < H && art.open[y * W + x] === 1;

/** `map`'s park art, baked on first use. */
export function parkArt(map: CityMap): ParkArt {
  let art = cache.get(map);
  if (!art) cache.set(map, (art = bake(map)));
  return art;
}

/** Pond bands, darkest edge first, each from its distance in from the
 * shore (art pixels; 1 on the shore's own pixels). */
const BANDS = [
  { from: 0, color: 0x354943 },
  { from: 1.5, color: 0x45665e },
  { from: 2.5, color: 0x397481 },
  { from: 3.5, color: 0x2b5d71 },
  { from: 6, color: 0x244f66 },
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
  // An Ambush river, as the forest's lakes are painted, its water running
  // on under the bridges; its live water is `RiverLife`'s, not the ponds'.
  const bed = riverBed(map);
  if (bed) paintRiver(px, riverShape(bed), riverCanvas(map, true), { x0: 0, y0: 0, x1: W, y1: H });
  const discs: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < map.type.length; i++) {
    // A bridge's water runs on under it; a river is painted as the lakes are.
    if ((map.type[i] !== CellType.WATER && map.bridges?.[i] !== 2) || riverCell(map, i)) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    discs.push(pondDisc(cx, cy, 1));
  }
  if (!discs.length) return;
  // The ponds' shape: every art pixel inside the smooth union of the discs.
  let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
  for (const d of discs) {
    bx0 = Math.min(bx0, Math.floor((d.x - d.r) * ART) - 2), by0 = Math.min(by0, Math.floor((d.y - d.r) * ART) - 2);
    bx1 = Math.max(bx1, Math.ceil((d.x + d.r) * ART) + 2), by1 = Math.max(by1, Math.ceil((d.y + d.r) * ART) + 2);
  }
  bx0 = Math.max(0, bx0), by0 = Math.max(0, by0), bx1 = Math.min(W - 1, bx1), by1 = Math.min(H - 1, by1);
  const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1, inside = new Uint8Array(bw * bh);
  for (const d of discs) {
    const reach = d.r + POND_BLEND;
    const x0 = Math.max(bx0, Math.floor((d.x - reach) * ART)), x1 = Math.min(bx1, Math.ceil((d.x + reach) * ART));
    const y0 = Math.max(by0, Math.floor((d.y - reach) * ART)), y1 = Math.min(by1, Math.ceil((d.y + reach) * ART));
    const near = discs.filter((o) => Math.abs(o.x - d.x) < 2.5 && Math.abs(o.y - d.y) < 2.5);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const k = (y - by0) * bw + x - bx0;
        if (!inside[k] && pondField(near, (x + 0.5) / ART, (y + 0.5) / ART) > 0) inside[k] = 1;
      }
  }
  // Bands follow the distance in from the shore, so they run round the
  // whole pond as one: a black outline, the bank, the shallows, the open
  // water and the deep, each edge dithered on odd pixels.
  const depth = shoreDistance(inside, bw, bh);
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const k = (y - by0) * bw + x - bx0;
      if (!inside[k]) continue;
      const v = depth[k] - ((x + y) & 1) * 0.4;
      let band = 0;
      while (band < BANDS.length - 1 && v >= BANDS[band + 1].from) band++;
      px[y * W + x] = rgba(BANDS[band].color);
      open[y * W + x] = band >= 3 ? 1 : 0;
    }
  // Nothing swims or ripples under a bridge.
  if (map.bridges)
    for (let i = 0; i < map.bridges.length; i++) {
      if (!map.bridges[i]) continue;
      const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
      for (let y = cy * ART; y < (cy + 1) * ART; y++) open.fill(0, y * W + cx * ART, y * W + (cx + 1) * ART);
    }
  // Glints and lily pads on the open water.
  for (let i = 0; i < map.type.length; i++) {
    if (map.type[i] !== CellType.WATER || riverCell(map, i)) continue;
    const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
    // Glints on about half the cells, anywhere in them, so they don't line
    // up into the cells' grid.
    const gx = cx * ART + Math.floor(hash01(cx, cy, 61) * 7), gy = cy * ART + Math.floor(hash01(cx, cy, 62) * 8);
    if (hash01(cx, cy, 72) < 0.55) for (let k = 0; k < 2 + (hash(cx, cy, 70) % 2); k++) put(px, open, gx + k, gy, GLINT);
    if (hash01(cx, cy, 63) >= 0.35) continue;
    const lx = cx * ART + 2 + Math.floor(hash01(cx, cy, 64) * 4), ly = cy * ART + 2 + Math.floor(hash01(cx, cy, 65) * 4);
    // A notched pad: three pixels wide, two tall, a darker underside.
    for (const [dx, dy, c] of [[0, 0, PAD], [1, 0, PAD], [-1, 1, PAD], [0, 1, PAD], [1, 1, PAD_DARK], [2, 1, PAD]] as const) put(px, open, lx + dx, ly + dy, c);
    if (hash01(cx, cy, 69) < 0.4) put(px, open, lx, ly, BLOSSOM[hash(cx, cy, 71) % 2]);
  }
}

/** Each pixel's distance in from the outside of `inside` (art pixels, 1 on
 * the shore's own pixels), by two chamfer passes. */
function shoreDistance(inside: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? 1e9 : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.4, at(x + 1, y - 1) + 1.4);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.4, at(x - 1, y + 1) + 1.4);
    }
  return d;
}

/** Paints over open water only, keeping glints and pads off the bank. */
function put(px: Uint32Array, open: Uint8Array, x: number, y: number, c: number) {
  if (x < 0 || y < 0 || x >= W || y >= H || open[y * W + x] !== 1) return;
  px[y * W + x] = rgba(c);
}

/** One park canopy's unpadded source box. Seeded shapes share a named
 * artist variant by palette and dimensions, as seeded roofs do. */
export function parkTreeSource(cx: number, cy: number) {
  const dark = hash01(cx,cy,22)<.5 ? 0 : 1, own: [number,number,number][]=[];
  treePixels(cx,cy,(x,y,part,light)=>{
    if(part === "edge") return;
    const v=light+((x+y)&1)*.12-.06;
    own.push([x,y,v>.55?TREE.top[dark]:v>.12?TREE.light[dark]:v>-.35?TREE.mid[dark]:TREE.dark[dark]]);
  });
  const x0=Math.min(...own.map(p=>p[0])),y0=Math.min(...own.map(p=>p[1]));
  const w=Math.max(...own.map(p=>p[0]))-x0+1,h=Math.max(...own.map(p=>p[1]))-y0+1;
  const data=new Uint32Array(w*h);
  for(const [x,y,c] of own)data[(y-y0)*w+x-x0]=rgba(c);
  const name=ART_NAMES.scenery(`park-tree-${dark}-${w}x${h}`);
  return {x:x0,y:y0,w,h,name,data:sourcePixels(name,w,h,()=>data)};
}
function paintTrees(map: CityMap, px: Uint32Array, open: Uint8Array): TreeSprite[] {
  const out: TreeSprite[]=[];
  for(let cy=0;cy<CELLS_H;cy++)for(let cx=0;cx<CELLS_W;cx++){
    if(!hasTree(map,cx,cy))continue;
    const p=parkTreeSource(cx,cy), art=outlinePixels(p.data,p.w,p.h),t=treeCanopy(cx,cy);
    for(let y=0;y<art.h;y++)for(let x=0;x<art.w;x++){
      const X=p.x+x-1,Y=p.y+y-1,v=art.data[y*art.w+x];
      if(v&&X>=0&&Y>=0&&X<W&&Y<H){px[Y*W+X]=v;open[Y*W+X]=0;}
    }
    out.push({x:p.x,y:p.y,w:p.w,h:p.h,canvas:typeof document === "undefined" ? null : spriteCanvas(p.data,p.w,p.h),cx:t.x,cy:t.y,r:t.r});
  }
  return out;
}
export function parkTreePieces(): ArtPiece[] {
  const out: ArtPiece[]=[],seen=new Set<string>();
  for(let cy=1;cy<CELLS_H-1;cy++)for(let cx=1;cx<CELLS_W-1;cx++){
    const p=parkTreeSource(cx,cy);if(seen.has(p.name))continue;seen.add(p.name);
    out.push({name:p.name,w:p.w,h:p.h,about:`Park canopy ${p.w} × ${p.h}`,pixels:()=>parkTreeSource(cx,cy).data});
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
