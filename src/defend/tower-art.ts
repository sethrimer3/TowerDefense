/** The placeable structures (all but the keep) as pixel art at `ART`
 * pixels a cell, like the keep, roofs and parks: seen from above, lit from
 * the upper left, inside a crisp black outline, with damage stages and
 * rubble from `damage-art.ts`.
 *
 * - Barracks: a stone hall under a red tiled roof, the swordsmen's blue
 *   shield on its ridge.
 * - Archer barracks: a timber hall, and its yard with a straw target butt.
 * - Archer tower: a square crenellated tower over a plank floor, its hatch
 *   and a sheaf of arrows.
 * - Cannon tower: a round bastion, the gun on its carriage pointing north
 *   and a stack of shot.
 * - Watch tower: a square tower with a beacon burning in an iron brazier.
 * - Wizard tower: a round tower under an eight-sided violet roof, runes
 *   glowing round the eaves and a gold finial.
 *
 * Pure; the city layer and palette draw the cached canvases. */
import type { StructureKind } from "./catalog.ts";
import { hash } from "./grid.ts";
import { ART } from "./park-art.ts";
import { OUTLINE, STONE, damage, pixels, rubblePixels, shade, type Material, type Pix, type Ruin } from "./damage-art.ts";

export type PlacedKind = Exclude<StructureKind, "keep">;

/** Stone, dark to lit, and the fills used below (0xRRGGBB). */
const C = {
  stone: [0x5c574e, 0x8c8577, 0xa8a194, 0xc9c2b2],
  pale: [0x6e6a62, 0x9a958c, 0xb8b2a6, 0xd6d0c2],
  plank: [0x5a3d22, 0x7a5230, 0x8e6238, 0xa77a48],
  iron: [0x1e1e22, 0x34343a, 0x55555c, 0x8a8a92],
  red: 0xa03a2e,
  timber: 0x6e5236,
  slate: [0x46305e, 0x5e4078, 0x7a5694, 0x9a74b4],
  straw: [0x9c7a34, 0xc9a24e, 0xe0c070],
  target: [0xe8dcc0, 0xb3372f, 0xe9c46a],
  fire: [0xc8542a, 0xf0a040, 0xf2d27a, 0xfff4c8],
  rune: 0x9fe3ff,
  gold: [0xb08a3e, 0xe9c46a, 0xfff4c8],
  shield: [0x2f5592, 0x5b8fd9, 0x9fc1f0],
  dirt: [0x5a4a36, 0x6e5c44, 0x80704f],
};

/** What each structure's damage throws down and its rubble is made of. */
const MATERIAL: Record<PlacedKind, { m: Material; ruin: Pick<Ruin, "stone" | "top" | "beams" | "round"> }> = {
  barracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x6e2a22, C.red, 0xc25a48], beams: true } },
  archerBarracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x4a3826, C.timber, 0x8e7048], beams: true } },
  archerTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  cannonTower: { m: { tones: STONE, roofed: false }, ruin: { stone: STONE, top: C.iron.slice(1), beams: false, round: true } },
  watchTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  wizardTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.slate.slice(0, 3), beams: true, round: true } },
};

/** The body's corners: one pixel in from its cells, two on the lower right
 * (where its shadow falls), like the houses. */
const frame = (w: number, h: number) => ({ x0: 1, y0: 1, x1: w - 3, y1: h - 3 });

/** A structure of `cw × ch` cells at damage `stage` (0 to 3), seeded by its
 * lot, as `(cw·ART) × (ch·ART)` RGBA pixels. */
export function structurePixels(kind: PlacedKind, cw: number, ch: number, stage = 0, seed = 0): Uint32Array {
  const w = cw * ART, h = ch * ART, out = new Uint32Array(w * h), p = pixels(out, w, h);
  PAINT[kind](p);
  damage(p, stage, hash(seed, KINDS.indexOf(kind)), MATERIAL[kind].m);
  return out;
}

/** What a fallen structure leaves, as `(cw·ART) × (ch·ART)` RGBA pixels. */
export function structureRubblePixels(kind: PlacedKind, cw: number, ch: number, seed = 0): Uint32Array {
  const w = cw * ART, h = ch * ART;
  return rubblePixels(w, h, hash(seed, KINDS.indexOf(kind), 3), { ...frame(w, h), ...MATERIAL[kind].ruin });
}

const KINDS: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower"];

const PAINT: Record<PlacedKind, (p: Pix) => void> = {
  barracks: paintBarracks,
  archerBarracks: paintArcherBarracks,
  archerTower: paintArcherTower,
  cannonTower: paintCannonTower,
  watchTower: paintWatchTower,
  wizardTower: paintWizardTower,
};

function rect(p: Pix, x0: number, y0: number, x1: number, y1: number, c: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) p.set(x, y, c);
}

/** A pixel disc of radius `r` about (cx, cy), painted by `f(x, y, d, dx,
 * dy)`, where d is the distance from the centre. */
function disc(p: Pix, cx: number, cy: number, r: number, f: (x: number, y: number, d: number, dx: number, dy: number) => number | null) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > r) continue;
      const c = f(x, y, d, dx, dy);
      if (c !== null) p.set(x, y, c);
    }
}

/** 0 (lower right, in shade) to 3 (upper left, in the sun) for a point
 * (dx, dy) from a centre, dithered between steps. */
function lit(x: number, y: number, dx: number, dy: number, d: number) {
  const t = (-(dx + dy) / (Math.max(d, 0.01) * Math.SQRT2)) * 1.5 + 1.5;
  return Math.max(0, Math.min(3, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25))));
}

/** A square tower's walls: outline, a parapet of merlons and crenels (lit
 * to the upper left), and an inner outline; returns the floor's corners. */
function squareTower(p: Pix, crenels: boolean) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      if (ring === 0 || ring === 3) p.set(x, y, OUTLINE);
      else if (ring > 3) continue;
      else {
        const sunny = x - x0 < 3 || y - y0 < 3;
        const tone = sunny ? 3 : 1;
        const crenel = crenels && ring === 1 && (x + y) % 3 === 0;
        p.set(x, y, crenel ? C.stone[0] : ring === 2 ? C.stone[tone - 1] : C.stone[tone]);
      }
    }
  return { x0: x0 + 4, y0: y0 + 4, x1: x1 - 4, y1: y1 - 4 };
}

/** Plank flooring over a box, boards running across, with seams. */
function planks(p: Pix, { x0, y0, x1, y1 }: { x0: number; y0: number; x1: number; y1: number }) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const board = Math.floor((y - y0) / 2), seam = (x + board * 3) % 6 === 5;
      const tone = (y - y0) % 2 === 1 ? 0 : 1 + (hash(board, 7) % 2);
      p.set(x, y, seam ? C.plank[0] : y === y0 || x === x0 ? C.plank[0] : C.plank[tone]);
    }
}

/** A gabled roof over a box, ridge along its long axis: two slopes (the
 * sunny one lighter) in staggered courses of tiles, the ridge in outline. */
function gable(p: Pix, x0: number, y0: number, x1: number, y1: number, base: number) {
  const along = x1 - x0 >= y1 - y0;
  const U = along ? x1 - x0 + 1 : y1 - y0 + 1, V = along ? y1 - y0 + 1 : x1 - x0 + 1, ridge = Math.floor(V / 2);
  for (let v = 0; v < V; v++)
    for (let u = 0; u < U; u++) {
      const x = along ? x0 + u : x0 + v, y = along ? y0 + v : y0 + u;
      if (v === ridge) {
        p.set(x, y, OUTLINE);
        continue;
      }
      const side = v < ridge ? 0 : 1, d = side ? v - ridge - 1 : ridge - 1 - v;
      const course = d >> 1, off = (course * 2 + side) % 3;
      let c = shade(base, side ? 0.86 : 1.13);
      const t = hash(course, side, Math.floor((u + off) / 3), 41) % 9;
      c = shade(c, t < 2 ? 0.9 : t > 7 ? 1.08 : 1);
      if (d & 1) c = shade(c, 0.8);
      else if ((u + off) % 3 === 2) c = shade(c, 0.86);
      if (v === 0 || v === V - 1) c = shade(c, 0.9);
      p.set(x, y, c);
    }
  return { along, ridge: (along ? y0 : x0) + ridge };
}

/** Stone walls round the hall, two pixels thick and lit to the upper left,
 * then the roof inside; returns the roof's ridge. */
function hall(p: Pix, x0: number, y0: number, x1: number, y1: number, roof: number) {
  rect(p, x0, y0, x1, y1, OUTLINE);
  for (let y = y0 + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) p.set(x, y, x === x0 + 1 || y === y0 + 1 ? C.stone[3] : x === x1 - 1 || y === y1 - 1 ? C.stone[1] : C.stone[2]);
  rect(p, x0 + 2, y0 + 2, x1 - 2, y1 - 2, OUTLINE);
  return gable(p, x0 + 3, y0 + 3, x1 - 3, y1 - 3, roof);
}

function paintBarracks(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const { along, ridge } = hall(p, x0, y0, x1, y1, C.red);
  // A chimney near one gable end.
  const [chx, chy] = along ? [x0 + 5, ridge - 2] : [ridge - 2, y0 + 5];
  for (let dy = 0; dy < 4; dy++)
    for (let dx = 0; dx < 4; dx++) {
      const rim = dx === 0 || dy === 0 || dx === 3 || dy === 3;
      p.set(chx + dx, chy + dy, rim ? OUTLINE : dx === 1 && dy === 1 ? C.stone[3] : dx === 2 && dy === 2 ? 0x2a221c : C.stone[1]);
    }
  // The shield on the ridge, mid-roof: blue with a lit upper left and a
  // gold boss, pointed at the foot.
  const sx = Math.round((x0 + x1) / 2) - 2, sy = Math.round((y0 + y1) / 2) - 3;
  const shape = ["0000000", "0233110", "0231110", "0114110", "0111110", "0011100", "0001000"];
  shape.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (j === 6 && i !== 3) return;
      if (j === 5 && (i < 1 || i > 5)) return;
      const c = ch === "0" ? OUTLINE : ch === "4" ? C.gold[1] : C.shield[+ch - 1];
      p.set(sx - 1 + i, sy + j, c);
    }),
  );
}

function paintArcherBarracks(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const split = y0 + Math.round((y1 - y0) * 0.62);
  // The yard: packed earth inside a fence outline.
  rect(p, x0, split, x1, y1, OUTLINE);
  for (let y = split + 1; y < y1; y++)
    for (let x = x0 + 1; x < x1; x++) p.set(x, y, C.dirt[hash(x, y, 43) % 5 === 0 ? 0 : hash(x, y, 44) % 4 === 0 ? 2 : 1]);
  for (let x = x0 + 1; x < x1; x += 3) p.set(x, y1 - 1, C.plank[2]);
  hall(p, x0, y0, x1, split, C.timber);
  // The butt: straw bale under a painted target, toward the yard's east.
  const tx = x1 - 4.5, ty = (split + y1) / 2 + 0.5;
  disc(p, tx, ty, 3.4, (x, y, d, dx, dy) => (d > 2.5 ? OUTLINE : d > 1.6 ? C.straw[Math.min(2, lit(x, y, dx, dy, d))] : d > 0.9 ? C.target[1] : C.target[2]));
  // Two arrows in it, and a bow rack by the door.
  p.set(Math.round(tx) - 1, Math.round(ty) - 2, C.plank[3]);
  p.set(Math.round(tx), Math.round(ty) + 1, C.plank[3]);
  for (let x = x0 + 2; x < x0 + 7; x++) p.set(x, split + 2, x % 2 ? C.plank[3] : C.plank[1]);
}

function paintArcherTower(p: Pix) {
  const f = squareTower(p, true);
  planks(p, f);
  // The hatch in the floor's corner, and a sheaf of arrows.
  rect(p, f.x0, f.y0, f.x0 + 2, f.y0 + 2, OUTLINE);
  p.set(f.x0 + 1, f.y0 + 1, C.plank[0]);
  for (let k = 0; k < 3; k++) {
    p.set(f.x1 - k, f.y1 - 2 + (k % 2), C.plank[3]);
    p.set(f.x1 - k, f.y1 - 3 + (k % 2), 0xd04030);
  }
}

function paintCannonTower(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    if (d > r - 2.6) {
      const sector = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 14);
      return sector % 2 ? C.stone[1] : C.stone[Math.min(3, 2 + (lit(x, y, dx, dy, d) >> 1))];
    }
    if (d > r - 3.4) return OUTLINE;
    return hash(x, y, 45) % 6 === 0 ? C.stone[1] : hash(x, y, 46) % 5 === 0 ? C.stone[3] : C.stone[2];
  });
  // The carriage, then the barrel to the north over it: outlined iron with
  // a lit line down its west side and a dark muzzle.
  const gx = Math.round(cx), gy = Math.round(cy);
  rect(p, gx - 3, gy - 1, gx + 2, gy + 3, OUTLINE);
  rect(p, gx - 2, gy, gx + 1, gy + 2, C.plank[1]);
  p.set(gx - 2, gy, C.plank[3]);
  rect(p, gx - 2, gy - 5, gx + 1, gy + 2, OUTLINE);
  for (let y = gy - 4; y <= gy + 1; y++) {
    p.set(gx - 1, y, C.iron[3]);
    p.set(gx, y, C.iron[2]);
  }
  p.set(gx - 1, gy - 4, C.iron[0]);
  p.set(gx, gy - 4, C.iron[0]);
  // Shot stacked to the south-east.
  for (const [bx, by] of [[gx + 3, gy + 3], [gx + 4, gy + 2], [gx + 4, gy + 4]]) {
    p.set(bx, by, C.iron[1]);
    if (C.stone.includes(p.get(bx - 1, by - 1))) p.set(bx - 1, by - 1, OUTLINE);
  }
  p.set(gx + 4, gy + 2, C.iron[3]);
}

function paintWatchTower(p: Pix) {
  const f = squareTower(p, false);
  planks(p, f);
  // The brazier: an iron bowl in an outline, the beacon burning in it,
  // hottest at the heart.
  const cx = (f.x0 + f.x1 + 1) / 2, cy = (f.y0 + f.y1 + 1) / 2;
  disc(p, cx, cy, 2.9, (x, y, d, dx, dy) => (d > 2.1 ? OUTLINE : d > 1.5 ? C.iron[1 + Math.min(2, lit(x, y, dx, dy, d))] : null));
  disc(p, cx, cy, 1.5, (x, y, d) => (d < 0.75 ? C.fire[3] : (x + y) % 2 ? C.fire[2] : C.fire[1]));
  // Posts at the floor's corners.
  for (const [x, y] of [[f.x0, f.y0], [f.x1, f.y0], [f.x0, f.y1], [f.x1, f.y1]]) p.set(x, y, C.plank[0]);
}

function paintWizardTower(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
  const roof = r - 2.2;
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    if (d > roof + 1) {
      // The rim of pale stone, a rune glowing every so often round it.
      const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 24);
      return a % 4 === 1 ? C.rune : C.pale[1 + Math.min(2, lit(x, y, dx, dy, d))];
    }
    if (d > roof) return OUTLINE;
    // Eight slate slopes rising to the finial, shaded by which way they
    // face, the seams between them dark.
    const ang = Math.atan2(dy, dx) + Math.PI, k = Math.floor((ang / (2 * Math.PI)) * 8 + 0.5) % 8;
    const mid = (k / 8) * 2 * Math.PI - Math.PI;
    const seam = Math.abs(((ang / (2 * Math.PI)) * 8 + 0.5) % 1 - 0.5) > 0.44 && d > 1.2;
    if (seam) return C.slate[0];
    const t = (-(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2) * 1.5 + 1.5;
    return C.slate[Math.max(0, Math.min(3, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25))))];
  });
  // The finial: gold, lit at its upper left.
  const fx = Math.floor(cx), fy = Math.floor(cy);
  p.set(fx - 1, fy - 1, C.gold[2]);
  p.set(fx, fy - 1, C.gold[1]);
  p.set(fx - 1, fy, C.gold[1]);
  p.set(fx, fy, C.gold[0]);
}
