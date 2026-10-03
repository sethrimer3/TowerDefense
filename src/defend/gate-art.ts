/** The city gate as pixel art at `ART` pixels a cell: a gatehouse set into
 * the wall, two crenellated stone towers either side of a passage with a
 * stone lintel on its outer arch, barred by two oak doors with iron bands
 * and studs. The doors swing inward (`frame` 0 shut to `GATE_FRAMES - 1`
 * wide open) to let the city's people through, which the renderer times
 * from who is near. Painted along the wall in one orientation, turned to
 * the gate's side, then shaded in screen space so every gate is lit from
 * the upper left like the roofs. */
import { GATE } from "./catalog.ts";
import { hash } from "./grid.ts";
import type { Side } from "./layout.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, damage, pixels, rubblePixels, rgba, shade, STONE } from "./damage-art.ts";

/** Door frames from shut to wide open. */
export const GATE_FRAMES = 5;

/** Art pixels along the wall and across it. */
const U = GATE.long * ART, V = GATE.deep * ART;

// Materials, painted first, coloured after turning.
const NONE = 0, LINE = 1, STONE_M = 2, MERLON = 3, CRENEL = 4, FLOOR = 5, WOOD = 6, SEAM = 7, IRON = 8, STUD = 9, MOSS = 10, LINTEL = 11, PAVE = 12;

const TONE = {
  stone: [0x6b665c, 0x8f897d, 0xa8a193],
  merlon: [0x8f897d, 0xb7b0a2, 0xcdc6b6],
  crenel: 0x47433c,
  pave: [0x5c574e, 0x6f6a60, 0x7d786c],
  floor: [0x4f4031, 0x62523f, 0x75644d],
  wood: [0x5e3d22, 0x7a5232, 0x936640],
  seam: 0x3f2916,
  iron: [0x26262b, 0x3a3a40, 0x56565e],
  stud: 0x9a9aa2,
  moss: [0x46542b, 0x5b6a35, 0x71803f],
};

/** The tower width, the passage between, and where the doors stand. */
const TOWER = 6;
const DOOR = { v0: 5, v1: 8 };

/** The gate on `side` with its doors at `frame`, at damage `stage`, seeded
 * by its lot, as RGBA pixels the size of its rect (`GATE.long` cells along
 * the wall, `GATE.deep` across it). */
export function gatePixels(side: Side, frame = 0, stage = 0, seed = 0): Uint32Array {
  const m = materials(frame, seed);
  const { w, h, at } = turn(side);
  const screen = new Uint8Array(w * h);
  for (let v = 0; v < V; v++) for (let u = 0; u < U; u++) {
    const [x, y] = at(u, v);
    screen[y * w + x] = m[v * U + u];
  }
  const out = colour(screen, w, h, seed);
  damage(pixels(out, w, h), stage, hash(seed, 0x6a7e), { tones: STONE, roofed: false });
  return out;
}

/** A fallen gate: its towers' stumps and a heap of stone and charred
 * timber from the doors. */
export function gateRubblePixels(side: Side, seed = 0): Uint32Array {
  const { w, h } = turn(side);
  return rubblePixels(w, h, hash(seed, 0x6a7f), { x0: 0, y0: 0, x1: w - 1, y1: h - 1, stone: STONE, top: TONE.wood, beams: true });
}

/** How (u along the wall, v from outside in) lands on screen for `side`. */
function turn(side: Side): { w: number; h: number; at: (u: number, v: number) => [number, number] } {
  if (side === "n") return { w: U, h: V, at: (u, v) => [u, v] };
  if (side === "s") return { w: U, h: V, at: (u, v) => [u, V - 1 - v] };
  if (side === "w") return { w: V, h: U, at: (u, v) => [v, u] };
  return { w: V, h: U, at: (u, v) => [V - 1 - v, u] };
}

/** The gate's materials, along the wall (u) and from outside in (v). */
function materials(frame: number, seed: number): Uint8Array {
  const m = new Uint8Array(U * V);
  const set = (u: number, v: number, k: number) => {
    if (u >= 0 && v >= 0 && u < U && v < V) m[v * U + u] = k;
  };
  // The passage: paving under the arch, packed dirt beyond.
  for (let v = 0; v < V; v++) for (let u = TOWER; u < U - TOWER; u++) set(u, v, v < 3 ? PAVE : FLOOR);
  // The two towers: an outline, a parapet ring of merlons and crenels, and
  // a flagged floor inside.
  for (const u0 of [0, U - TOWER]) {
    for (let v = 0; v < V; v++)
      for (let u = u0; u < u0 + TOWER; u++) {
        const edge = u === u0 || u === u0 + TOWER - 1 || v === 0 || v === V - 1;
        const ring = u === u0 + 1 || u === u0 + TOWER - 2 || v === 1 || v === V - 2;
        if (edge) set(u, v, LINE);
        else if (ring) set(u, v, (u + v + (u0 ? 1 : 0)) % 3 === 0 ? CRENEL : hash(seed, u, v, 5) % 7 === 0 ? MOSS : MERLON);
        else set(u, v, STONE_M);
      }
  }
  // The lintel over the outer arch, joining the towers.
  for (let v = 0; v <= 2; v++)
    for (let u = TOWER; u < U - TOWER; u++) set(u, v, v === 0 || v === 2 ? LINE : LINTEL);
  doors(set, frame);
  return m;
}

/** The two door leaves, hinged on the towers' inner corners and swung
 * inward by `frame`. */
function doors(set: (u: number, v: number, k: number) => void, frame: number) {
  const open = Math.max(0, Math.min(1, frame / (GATE_FRAMES - 1)));
  const a = (open * Math.PI) / 2;
  const half = (U - 2 * TOWER) / 2, thick = DOOR.v1 - DOOR.v0 + 1;
  // Hinge points: the leaves' inner back corners.
  const hinge = DOOR.v1 + 1;
  for (const [hu, dirU] of [[TOWER, 1], [U - TOWER, -1]] as const) {
    // The leaf's length runs along (cos a · dirU, sin a) from the hinge;
    // its thickness back toward the outside, along (sin a · dirU, -cos a).
    const lx = Math.cos(a) * dirU, ly = Math.sin(a);
    const tx = Math.sin(a) * dirU, ty = -Math.cos(a);
    for (let v = 0; v < V; v++)
      for (let u = TOWER; u < U - TOWER; u++) {
        const px = u + 0.5 - hu, py = v + 0.5 - hinge;
        const along = px * lx + py * ly, across = px * tx + py * ty;
        if (along < 0 || along >= half || across < 0 || across >= thick) continue;
        const rim = along < 1 || along >= half - 1 || across < 1 || across >= thick - 1;
        const band = Math.floor(along) === 1 || Math.floor(along) === half - 2;
        const k = rim ? LINE : band ? (Math.floor(across) === 1 ? STUD : IRON) : Math.floor(along) % 2 ? SEAM : WOOD;
        set(u, v, k);
      }
  }
}

/** Colours the materials, lit from the upper left: a surface beside an
 * outline above or to its left catches the light, one below or to its
 * right falls into shade. */
function colour(m: Uint8Array, w: number, h: number, seed: number): Uint32Array {
  const out = new Uint32Array(w * h);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? NONE : m[y * w + x]);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = m[y * w + x];
      if (k === NONE) continue;
      const lit = at(x - 1, y) === LINE || at(x, y - 1) === LINE ? 2 : at(x + 1, y) === LINE || at(x, y + 1) === LINE ? 0 : 1;
      const grain = hash(seed, x, y, 9) % 5;
      let c: number;
      switch (k) {
        case LINE: c = OUTLINE; break;
        case STONE_M: c = (x + (y >> 1)) % 3 === 0 && y % 2 === 0 ? TONE.stone[0] : TONE.stone[Math.max(0, Math.min(2, lit - (grain === 0 ? 1 : 0)))]; break;
        case MERLON: c = TONE.merlon[lit]; break;
        case MOSS: c = TONE.moss[lit]; break;
        case CRENEL: c = TONE.crenel; break;
        case LINTEL: c = (x + y) % 4 === 0 ? TONE.stone[0] : TONE.merlon[lit === 0 ? 0 : 1]; break;
        case PAVE: c = TONE.pave[(x >> 1) % 2 === (y >> 1) % 2 ? 1 : grain === 0 ? 0 : 2]; break;
        case FLOOR: c = TONE.floor[grain === 0 ? 0 : grain === 4 ? 2 : 1]; break;
        case WOOD: c = TONE.wood[lit === 0 ? 0 : grain === 0 ? 2 : 1]; break;
        case SEAM: c = TONE.seam; break;
        case IRON: c = TONE.iron[lit]; break;
        case STUD: c = TONE.stud; break;
        default: c = OUTLINE;
      }
      // The floor darkens in the towers' shadow (cast down and right).
      if ((k === FLOOR || k === PAVE) && (at(x - 1, y) === LINE || at(x, y - 1) === LINE)) c = shade(c, 0.7);
      out[y * w + x] = rgba(c);
    }
  return out;
}
