/** The wall's own defenses as pixel art at `ART` pixels a cell, in black
 * outlines like the rest of the city. Wall spikes are a row of iron-shod
 * oak stakes on a beam along the wall's outer face, pointing out of the
 * city, painted per wall stone and turned to its side. The wall ballista
 * is a crenellated stone bastion at the wall's corner (in the city layer,
 * with damage and rubble) carrying a great crossbow that turns to aim
 * (drawn live by the renderer, baked per heading and string): an oak stock
 * with a winch at its tail, a bow of iron-banded horn and its string,
 * drawn back with a bolt laid on, or slack once loosed. */
import { SPRING_STAKES } from "../knowledge-paths.ts";
import { BALLISTA } from "./catalog.ts";
import type { CityMap } from "./citygen.ts";
import { CELLS_W, hash } from "./grid.ts";
import type { Side } from "./layout.ts";
import type { DefendSim } from "./sim.ts";
import { OUTLINE, STONE, damage, drawSprite, pixels, rgba, rubblePixels, shade, sprite } from "./damage-art.ts";

/** Art pixels a cell. */
const ART = 8;

const TONE = {
  iron: [0x2c2c32, 0x4a4a52, 0x7a7a84],
  rust: 0x7a4026,
  oak: [0x4e321c, 0x6e4a2a, 0x8c6238],
  beam: [0x3e2817, 0x5a3b22, 0x734d2c],
  stone: [0x6b665c, 0x8f897d, 0xa8a193],
  merlon: [0x8f897d, 0xb7b0a2, 0xcdc6b6],
  crenel: 0x47433c,
  flag: [0x5c574e, 0x6f6a60, 0x7d786c],
  moss: [0x46542b, 0x5b6a35, 0x71803f],
  horn: [0x5a3f26, 0x8a6a42, 0xb08c58],
  string: 0xd8cfb4,
  shaft: [0x7a5a34, 0xa07a48],
  head: [0x3a3a40, 0x9a9aa2],
};

// ── Wall spikes ──────────────────────────────────────────────────────────

/** How far out past the wall's face the stakes reach, in art pixels (the
 * rest of the sprite lies on the stone). */
export const SPIKE_REACH = 5;

/** One stone's stakes, from the tips (row 0, outside) in to the beam on
 * the stone: K outline, h lit iron, s shaded iron, w and W the beam. */
const STAKES = [
  ".K...K..",
  "KhK.KhK.",
  "KhsKKhsK",
  "KhsKKhsK",
  "KosKKosK",
  "KKKKKKKK",
  "wWwWwWwW",
  "KKKKKKKK",
];

/** One wall stone's spikes pointing out of `side`, as `ART × ART` RGBA
 * pixels, seeded by the stone: the rows run from the tips (outside) in. */
export function spikePixels(side: Side, seed = 0): Uint32Array {
  const out = new Uint32Array(ART * ART);
  for (let v = 0; v < ART; v++)
    for (let u = 0; u < ART; u++) {
      const k = STAKES[v][u];
      if (k === ".") continue;
      const g = hash(seed, u, v, 41) % 7;
      const c =
        k === "K" ? OUTLINE
        : k === "h" ? (g === 0 ? TONE.rust : TONE.iron[2])
        : k === "s" ? (g < 2 ? TONE.rust : TONE.iron[1])
        : k === "o" ? (g < 3 ? TONE.oak[1] : TONE.oak[0])
        : k === "W" ? TONE.beam[g === 0 ? 2 : 1]
        : TONE.beam[g === 0 ? 1 : 0];
      const [x, y] = turn(side, u, v);
      out[y * ART + x] = rgba(c);
    }
  return out;
}

/** Where (u along the stone, v from the tips in) lands for `side`. */
function turn(side: Side, u: number, v: number): [number, number] {
  const L = ART - 1;
  if (side === "n") return [u, v];
  if (side === "s") return [L - u, L - v];
  if (side === "w") return [v, L - u];
  return [L - v, u];
}

/** Spring stakes shooting out of a row: on each standing stone, two long
 * iron pikes thrust out past the stakes' tips and drawn back, outlined, in
 * art pixels snapped to whole screen pixels. `c` is in board space. */
export function drawSpikeThrusts(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null) {
  if (!sim?.spikeThrusts.length || !map.spikes) return;
  const p = Math.max(1, Math.round(px / ART));
  const dot = (x: number, y: number, grow = 0) =>
    c.fillRect(Math.round((x * px) / p) * p - grow * p, Math.round((y * px) / p) * p - grow * p, p * (1 + 2 * grow), p * (1 + 2 * grow));
  for (const t of sim.spikeThrusts) {
    const row = map.spikes[t.row];
    if (!row) continue;
    const [dx, dy] = SPIKE_OUT[row.side];
    // Out fast, back slower.
    const f = t.t / SPRING_STAKES.show, out = f < 0.3 ? f / 0.3 : 1 - (f - 0.3) / 0.7;
    const len = Math.round(out * t.reach * ART);
    if (len <= 0) continue;
    for (const cell of row.cells) {
      if (!sim.solid[cell]) continue;
      const x0 = (cell % CELLS_W) + 0.5, y0 = Math.floor(cell / CELLS_W) + 0.5;
      for (const u of [-2, 2]) {
        // Along the wall `u` art pixels from the stone's middle; out from its face.
        const at = (a: number): [number, number] => [x0 + (dy ? u : 0) / ART + (dx * (ART / 2 + a)) / ART, y0 + (dx ? u : 0) / ART + (dy * (ART / 2 + a)) / ART];
        c.fillStyle = "#0b0907";
        for (let a = 0; a <= len + 1; a++) dot(...at(a), 1);
        for (let a = 0; a <= len + 1; a++) {
          c.fillStyle = a >= len - 1 ? "#cfcfd6" : a % 3 === 0 ? "#4a4a52" : "#7a7a84";
          dot(...at(a));
        }
      }
    }
  }
}

const SPIKE_OUT: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

// ── The ballista's bastion ───────────────────────────────────────────────

const N = BALLISTA.size * ART;
const NONE = 0, LINE = 1, STONE_M = 2, MERLON = 3, CRENEL = 4, FLAG = 5, MOSS = 6, PLATE = 7, BOLT = 8;

/** The bastion at damage `stage`, seeded by its lot, as `N × N` RGBA
 * pixels: an outlined parapet of merlons and crenels round a flagged floor
 * with the turntable the ballista stands on. */
export function bastionPixels(stage = 0, seed = 0): Uint32Array {
  const m = new Uint8Array(N * N);
  const c = (N - 1) / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const edge = x === 0 || y === 0 || x === N - 1 || y === N - 1;
      const ring = x === 1 || y === 1 || x === N - 2 || y === N - 2;
      const r = Math.sqrt((x - c) * (x - c) + (y - c) * (y - c));
      let k: number;
      if (edge) k = LINE;
      else if (ring) k = (x + y) % 3 === 0 ? CRENEL : hash(seed, x, y, 5) % 7 === 0 ? MOSS : MERLON;
      else if (x === 2 || y === 2 || x === N - 3 || y === N - 3) k = STONE_M;
      else if (r < 3.2) k = r > 2.3 ? LINE : PLATE;
      else k = FLAG;
      // Iron bolts on the turntable.
      if (k === PLATE && (x + y) % 2 === 0 && r > 1.4) k = BOLT;
      m[y * N + x] = k;
    }
  const out = new Uint32Array(N * N);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= N || y >= N ? NONE : m[y * N + x]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const k = m[y * N + x];
      const lit = at(x - 1, y) === LINE || at(x, y - 1) === LINE ? 2 : at(x + 1, y) === LINE || at(x, y + 1) === LINE ? 0 : 1;
      const grain = hash(seed, x, y, 9) % 5;
      let col: number;
      switch (k) {
        case LINE: col = OUTLINE; break;
        case STONE_M: col = TONE.stone[Math.max(0, lit - (grain === 0 ? 1 : 0))]; break;
        case MERLON: col = TONE.merlon[lit]; break;
        case CRENEL: col = TONE.crenel; break;
        case MOSS: col = TONE.moss[lit]; break;
        case PLATE: col = TONE.oak[lit]; break;
        case BOLT: col = TONE.iron[1]; break;
        default: col = TONE.flag[(x >> 1) % 2 === (y >> 1) % 2 ? 1 : grain === 0 ? 0 : 2];
      }
      // The parapet casts its shadow down and right onto the floor.
      if (k === FLAG && (x === 3 || y === 3)) col = shade(col, 0.72);
      out[y * N + x] = rgba(col);
    }
  damage(pixels(out, N, N), stage, hash(seed, 0xba1), { tones: STONE, roofed: false });
  return out;
}

/** A fallen bastion: a heap of stone and splintered timber. */
export function bastionRubblePixels(seed = 0): Uint32Array {
  return rubblePixels(N, N, hash(seed, 0xba2), { x0: 0, y0: 0, x1: N - 1, y1: N - 1, stone: STONE, top: TONE.oak, beams: true });
}

// ── The ballista ─────────────────────────────────────────────────────────

/** Headings the ballista is baked at, a full turn. */
export const BALLISTA_DIRS = 32;
/** Its sprite's size in art pixels (it overhangs its bastion a little). */
export const BALLISTA_ART = 22;

const WOOD = 1, WOOD_D = 2, HORN = 3, IRON = 4, STRING = 5, SHAFT = 6, HEAD = 7, INK = 8;

/** The ballista facing heading `dir` (0 east, turning clockwise), its
 * string drawn back with a bolt on (`loaded`) or slack. */
export function ballistaPixels(dir: number, loaded: boolean): Uint32Array {
  const S = BALLISTA_ART, c = S / 2;
  const a = (dir / BALLISTA_DIRS) * Math.PI * 2;
  const fx = Math.cos(a), fy = Math.sin(a);
  const m = new Uint8Array(S * S);
  const bow = (b: number) => 3.5 - 0.055 * b * b;
  const tip = 7.5, tipA = bow(tip);
  const nock = loaded ? -2.8 : tipA;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = x + 0.5 - c, py = y + 0.5 - c;
      // Along the stock (forward) and across it.
      const al = px * fx + py * fy, ac = -px * fy + py * fx;
      let k = 0;
      if (Math.abs(ac) <= 1.25 && al >= -7.5 && al <= 6.5) k = ac < 0 ? WOOD : WOOD_D;
      if (al >= -8 && al <= -6 && Math.abs(ac) <= 2.6) k = IRON;
      if (Math.abs(ac) <= tip && Math.abs(al - bow(ac)) <= 0.85) k = Math.abs(ac) > tip - 1.2 || Math.abs(Math.abs(ac) - 3) < 0.5 ? IRON : HORN;
      // The string, from each tip back to the nock.
      for (const side of [-1, 1]) {
        const sx = tipA - nock, sy = side * tip;
        const len = Math.sqrt(sx * sx + sy * sy);
        const t = Math.max(0, Math.min(1, ((al - nock) * sx + ac * sy) / (len * len)));
        const ox = al - (nock + sx * t), oy = ac - sy * t;
        if (ox * ox + oy * oy <= 0.3 && !k) k = STRING;
      }
      if (loaded && Math.abs(ac) <= 0.55 && al >= -3 && al <= 9) k = al >= 7 ? HEAD : SHAFT;
      if (loaded && al >= 7 && al <= 8.5 && Math.abs(ac) <= 1.3 - (al - 7) * 0.6) k = HEAD;
      if (Math.sqrt(px * px + py * py) <= 1.1) k = INK;
      m[y * S + x] = k;
    }
  const out = new Uint32Array(S * S);
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : m[y * S + x]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const k = m[y * S + x];
      if (!k) {
        // The outline: every empty pixel beside the ballista (the string
        // excepted, which stays a fine line).
        const near = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n && n !== STRING);
        if (near) out[y * S + x] = rgba(OUTLINE);
        continue;
      }
      // Lit from the upper left: a pixel with empty space up or left of it
      // catches the light, one with space down or right falls into shade.
      const lit = !at(x - 1, y) || !at(x, y - 1) ? 2 : !at(x + 1, y) || !at(x, y + 1) ? 0 : 1;
      const col =
        k === WOOD ? TONE.oak[Math.min(2, lit + 1)]
        : k === WOOD_D ? TONE.oak[Math.max(0, lit - 1)]
        : k === HORN ? TONE.horn[lit]
        : k === IRON ? TONE.iron[lit]
        : k === STRING ? TONE.string
        : k === SHAFT ? TONE.shaft[lit === 0 ? 0 : 1]
        : k === HEAD ? TONE.head[lit === 0 ? 0 : 1]
        : OUTLINE;
      out[y * S + x] = rgba(col);
    }
  return out;
}

/** The nearest baked heading to the unit vector (x, y). */
export function ballistaDir(x: number, y: number) {
  const a = Math.atan2(y, x);
  return ((Math.round((a / (Math.PI * 2)) * BALLISTA_DIRS) % BALLISTA_DIRS) + BALLISTA_DIRS) % BALLISTA_DIRS;
}

/** Seconds after loosing before the ballista is drawn back and loaded. */
const RELOAD_LOOK = 0.45;

/** Every standing ballista on its bastion, turned to where it last shot
 * (out of the city before then), slack for a moment after each shot; and
 * the bolts in flight. `c` is in board space, `px` canvas pixels a cell. */
export function drawBallistas(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null) {
  const flown = BALLISTA.speed * RELOAD_LOOK;
  for (const b of map.buildings) {
    if (b.kind !== "wallBallista" || !b.corner || (sim && !sim.intact(b))) continue;
    const aim = sim?.ballistaAim.get(b.id) ?? b.corner.out;
    const dir = ballistaDir(aim.x, aim.y);
    const loaded = !sim?.ballistaBolts.some((t) => t.building === b.id && BALLISTA.range + 1 - t.left < flown);
    const art = sprite(`ballista:${dir}:${loaded ? 1 : 0}`, BALLISTA_ART, BALLISTA_ART, () => ballistaPixels(dir, loaded));
    const size = (BALLISTA_ART / ART) * px;
    const cx = (b.rect.x + b.rect.w / 2) * px, cy = (b.rect.y + b.rect.h / 2) * px;
    drawSprite(c, art, Math.round(cx - size / 2), Math.round(cy - size / 2), Math.round(size), Math.round(size));
  }
  if (sim) for (const t of sim.ballistaBolts) drawBolt(c, px, t.x, t.y, t.dx, t.dy);
}

/** A bolt in flight: an outlined oak shaft with an iron head and fletching,
 * in art pixels snapped to whole screen pixels. */
function drawBolt(c: CanvasRenderingContext2D, px: number, x: number, y: number, dx: number, dy: number) {
  const p = Math.max(1, Math.round(px / ART));
  const dot = (along: number, col: string, grow = 0) => {
    const ax = (x + (dx * along) / ART) * px, ay = (y + (dy * along) / ART) * px;
    c.fillRect(Math.round(ax / p) * p - grow * p, Math.round(ay / p) * p - grow * p, p * (1 + 2 * grow), p * (1 + 2 * grow));
  };
  c.fillStyle = "#0b0907";
  for (let a = -9; a <= 4; a++) dot(a, "", 1);
  for (let a = -9; a <= 4; a++) {
    c.fillStyle = a >= 2 ? "#9a9aa2" : a <= -7 ? "#d8cfb4" : "#a07a48";
    dot(a, "");
  }
}
