/** A wooden fence gate as pixel art at `ART` pixels a cell: two stout posts
 * on the fence line with a plank door leaf hung on each, braced and banded,
 * swinging inward (`frame` 0 shut to `GATE_FRAMES - 1` wide open). Drawn
 * over a box `WOOD_GATE.long` cells along the fence and `WOOD_GATE.deep`
 * across it, centred on the gate's one-cell line, so the leaves have room
 * to swing. Painted along the fence in one orientation, then turned to the
 * gate's side like the stone gate (`gate-art.ts`). */
import { GATE } from "./catalog.ts";
import type { Building } from "./citygen.ts";
import { hash, type Rect } from "./grid.ts";
import type { Side } from "./layout.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, damage, pixels, rgba, rubblePixels } from "./damage-art.ts";
import { GATE_FRAMES } from "./gate-art.ts";

/** The art's box in cells: along the fence and across it. */
export const WOOD_GATE = { long: 4, deep: 3 };

/** Art pixels along the fence and across it, and the fence line's middle. */
const U = WOOD_GATE.long * ART, V = WOOD_GATE.deep * ART, MID = V / 2;

const NONE = 0, LINE = 1, POST = 2, CAP = 3, PLANK = 4, SEAM = 5, BRACE = 6, IRON = 7;

const TONE = {
  post: [0x4a2f19, 0x5e3d22, 0x76502e],
  cap: [0x6b4a2b, 0x87613a, 0xa07648],
  plank: [0x6e4a2a, 0x8a6038, 0xa37446],
  seam: 0x3f2916,
  brace: [0x5a3b20, 0x76502e],
  iron: [0x26262b, 0x3a3a40, 0x56565e],
};

/** The posts' width and depth, and the leaves' thickness. */
export const WOOD_POST = 5;
const POST_W = WOOD_POST, POST_D = 6, LEAF = 4;

/** The wooden gate on `side` with its doors at `frame`, at damage `stage`,
 * as RGBA pixels the size of its art box; at `frame` -1, its posts alone
 * (the city layer's, the renderer drawing the leaves over the open way
 * each frame, so a shut pair never shows under an open one). */
export function woodGatePixels(side: Side, frame = 0, stage = 0, seed = 0): Uint32Array {
  const m = new Uint8Array(U * V);
  const set = (u: number, v: number, k: number) => {
    if (u >= 0 && v >= 0 && u < U && v < V) m[v * U + u] = k;
  };
  if (frame >= 0) leaves(set, frame);
  // The posts, over the leaves' hinged ends, each with a lit cap.
  for (const u0 of [0, U - POST_W])
    for (let v = MID - POST_D / 2; v < MID + POST_D / 2; v++)
      for (let u = u0; u < u0 + POST_W; u++) {
        const edge = u === u0 || u === u0 + POST_W - 1 || v === MID - POST_D / 2 || v === MID + POST_D / 2 - 1;
        const cap = u > u0 && u < u0 + POST_W - 1 && v > MID - POST_D / 2 && v < MID - POST_D / 2 + 3;
        set(u, v, edge ? LINE : cap ? CAP : POST);
      }
  const { w, h, at } = turn(side);
  const screen = new Uint8Array(w * h);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const [x, y] = at(u, v);
    screen[y * w + x] = m[v * U + u];
  }
  const out = colour(screen, w, h, seed);
  damage(pixels(out, w, h), stage, hash(seed, 0x70d), { tones: TONE.plank, roofed: false });
  return out;
}

/** A fallen wooden gate: a heap of broken planks along the fence line. */
export function woodGateRubblePixels(side: Side, seed = 0): Uint32Array {
  const { w, h } = turn(side);
  const across = side === "e" || side === "w";
  const x0 = across ? MID - 4 : 0, y0 = across ? 0 : MID - 4, x1 = across ? MID + 3 : w - 1, y1 = across ? h - 1 : MID + 3;
  return rubblePixels(w, h, hash(seed, 0x70e), { x0, y0, x1, y1, stone: TONE.post, top: TONE.plank, beams: true });
}

/** How (u along the fence, v from outside in) lands on screen for `side`. */
function turn(side: Side): { w: number; h: number; at: (u: number, v: number) => [number, number] } {
  if (side === "n") return { w: U, h: V, at: (u, v) => [u, v] };
  if (side === "s") return { w: U, h: V, at: (u, v) => [u, V - 1 - v] };
  if (side === "w") return { w: V, h: U, at: (u, v) => [v, u] };
  return { w: V, h: U, at: (u, v) => [V - 1 - v, u] };
}

/** The two plank leaves, hinged at the posts' inner faces on the fence
 * line and swung inward by `frame`. */
function leaves(set: (u: number, v: number, k: number) => void, frame: number) {
  const open = Math.max(0, Math.min(1, frame / (GATE_FRAMES - 1)));
  const a = (open * Math.PI) / 2;
  const half = (U - 2 * POST_W) / 2;
  const hinge = MID - LEAF / 2;
  for (const [hu, dirU] of [[POST_W, 1], [U - POST_W, -1]] as const) {
    // The leaf runs along (cos a · dirU, sin a) from its hinge, its
    // thickness inward along (−sin a · dirU, cos a).
    const lx = Math.cos(a) * dirU, ly = Math.sin(a);
    const tx = -Math.sin(a) * dirU, ty = Math.cos(a);
    for (let v = 0; v < V; v++)
      for (let u = 0; u < U; u++) {
        const px = u + 0.5 - hu, py = v + 0.5 - hinge;
        const along = px * lx + py * ly, across = px * tx + py * ty;
        if (along < 0 || along >= half || across < 0 || across >= LEAF) continue;
        const rim = along < 1 || along >= half - 1 || across < 1 || across >= LEAF - 1;
        const s = Math.floor(along);
        const band = s === 2 || s === half - 3;
        const brace = Math.abs(along - half / 2) < 1;
        set(u, v, rim ? LINE : band ? IRON : brace ? BRACE : s % 3 === 0 ? SEAM : PLANK);
      }
  }
}

/** Colours the materials, lit from the upper left. */
function colour(m: Uint8Array, w: number, h: number, seed: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? NONE : m[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = m[y * w + x];
      if (k === NONE) continue;
      const lit = at(x - 1, y) === LINE || at(x, y - 1) === LINE ? 2 : at(x + 1, y) === LINE || at(x, y + 1) === LINE ? 0 : 1;
      const grain = hash(seed, x, y, 13) % 5;
      let c: number;
      switch (k) {
        case POST: c = TONE.post[Math.max(0, lit - (grain === 0 ? 1 : 0))]; break;
        case CAP: c = TONE.cap[lit]; break;
        case PLANK: c = TONE.plank[lit === 0 ? 0 : grain === 0 ? 2 : 1]; break;
        case SEAM: c = TONE.seam; break;
        case BRACE: c = TONE.brace[lit === 2 ? 1 : 0]; break;
        case IRON: c = TONE.iron[lit]; break;
        default: c = OUTLINE;
      }
      out[y * w + x] = rgba(c);
    }
  return out;
}

/** Where gate `b`'s art is drawn, in cells: its own rect, or, for a gate
 * set in a wall a cell deep (an Ambush outpost's), a box centred on that
 * line as deep as its art, so a stone gatehouse straddles the wall and a
 * wooden gate's leaves have room to swing. */
export function gateArtRect(b: Building): Rect {
  const r = b.rect, across = b.gate?.side === "e" || b.gate?.side === "w";
  const depth = across ? r.w : r.h, deep = b.woodGate ? WOOD_GATE.deep : GATE.deep;
  if (depth === deep) return r;
  const off = (deep - depth) / 2;
  return across ? { x: r.x - off, y: r.y, w: deep, h: r.h } : { x: r.x, y: r.y - off, w: r.w, h: deep };
}
