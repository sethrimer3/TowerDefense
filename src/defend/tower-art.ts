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
 * - Mage Guild: a stone hall under a dark wine-red roof, a fire well
 *   burning in a brass ring at its heart, ember runes on the slopes and two
 *   red swallowtail banners hung over its south wall.
 * - Valkyrie palace: a heavenly palace of white marble on a stepped
 *   plinth, ringed by a colonnade, a gilded terrace round a great ribbed
 *   dome with a golden lantern, and a pair of gold wings over its south
 *   steps. It fills a whole tile, or half once its halls are folded.
 * - Dark wizard keep: black obsidian on a stepped plinth, curtain walls of
 *   glassy black blocks set in crimson mortar, a round turret at each
 *   corner crowned with a great faceted ruby (where its black lightning
 *   leaves from), a courtyard of dark flags ringed by a glowing crimson
 *   rune circle round an eight-sided obsidian spire tipped with a ruby, and
 *   a ruby-arched gate between two crimson banners on its south wall. Its
 *   wounds glow: crimson fissures open in the obsidian as it is hurt.
 * - Monster bait: a stack of iron-bound crates, one open and heaped with
 *   raw meat, another crate stacked on top with a haunch lashed to it and
 *   green slime seeping from the seams.
 *
 * Pure; the city layer and palette draw the cached canvases. */
import { TURRET_INSET, type StructureKind } from "./catalog.ts";
import { hash, hash01 } from "./grid.ts";
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
  /** The Pyromancy wizard tower's fired red tiles, dark to light. */
  kiln: [0x4e0f0c, 0x80201a, 0xb23a22, 0xdc6a32],
  straw: [0x9c7a34, 0xc9a24e, 0xe0c070],
  target: [0xe8dcc0, 0xb3372f, 0xe9c46a],
  fire: [0xc8542a, 0xf0a040, 0xf2d27a, 0xfff4c8],
  rune: 0x9fe3ff,
  gold: [0xb08a3e, 0xe9c46a, 0xfff4c8],
  shield: [0x2f5592, 0x5b8fd9, 0x9fc1f0],
  dirt: [0x5a4a36, 0x6e5c44, 0x80704f],
  wine: [0x3a1f28, 0x4e2a36, 0x6e3a48],
  banner: [0x8e2620, 0xb3372f, 0xd8553f],
  ember: 0xff7a2e,
  marble: [0x8a8c9a, 0xb9bac6, 0xdcdce4, 0xf4f3f6, 0xffffff],
  vein: 0xa7aec4,
  sky: [0x7d9cc8, 0xa9c4e6, 0xd6e6f8],
  obsidian: [0x060508, 0x0f0d13, 0x1c1922, 0x2c2834, 0x463f52],
  sheen: 0x7a7090,
  mortar: [0x2a060c, 0x4e0b16, 0x7a1222],
  ruby: [0x3d0410, 0x7e0a1c, 0xc0182e, 0xf0425a, 0xffc4cc],
  flag: [0x1e1c22, 0x2a272f, 0x34313a],
  crate: [0x4a3018, 0x6e4a26, 0x8c6232, 0xab7c42, 0xc89a5a],
  meat: [0x5e1414, 0x8e2222, 0xb83a32, 0xd8685a],
  bone: [0xb8ae94, 0xe8e0c8],
  slime: [0x3e6a1c, 0x6aa82a, 0xa8e050],
};

/** What each structure's damage throws down and its rubble is made of. */
const MATERIAL: Record<PlacedKind, { m: Material; ruin: Pick<Ruin, "stone" | "top" | "beams" | "round"> }> = {
  barracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x6e2a22, C.red, 0xc25a48], beams: true } },
  archerBarracks: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: [0x4a3826, C.timber, 0x8e7048], beams: true } },
  archerTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  cannonTower: { m: { tones: STONE, roofed: false }, ruin: { stone: STONE, top: C.iron.slice(1), beams: false, round: true } },
  watchTower: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.plank.slice(0, 3), beams: true } },
  wizardTower: { m: { tones: C.pale.slice(0, 3), roofed: true }, ruin: { stone: C.pale.slice(0, 3), top: C.slate.slice(0, 3), beams: true, round: true } },
  mageGuild: { m: { tones: STONE, roofed: true }, ruin: { stone: STONE, top: C.wine.slice(0, 3), beams: true } },
  valkyriePalace: { m: { tones: C.marble.slice(1, 4), roofed: true }, ruin: { stone: C.marble.slice(1, 4), top: [C.gold[0], C.marble[2], C.marble[3]], beams: false } },
  darkKeep: { m: { tones: C.obsidian.slice(2, 5), roofed: false }, ruin: { stone: C.obsidian.slice(2, 5), top: C.mortar, beams: false } },
  monsterBait: { m: { tones: [C.crate[0], C.crate[2], C.crate[3]], roofed: false }, ruin: { stone: [C.crate[0], C.crate[1], C.crate[3]], top: [C.meat[0], C.meat[1], C.slime[1]], beams: true } },
};

/** The body's corners: one pixel in from its cells, two on the lower right
 * (where its shadow falls), like the houses. */
const frame = (w: number, h: number) => ({ x0: 1, y0: 1, x1: w - 3, y1: h - 3 });

/** The Knowledge paths that give a structure its own look, by kind. A card
 * on one of them is drawn (on the board and on its card) in that look; every
 * other path keeps the base art. Add a path here and handle it in the kind's
 * painter to give it a sprite. */
export const PATH_LOOKS: Partial<Record<PlacedKind, readonly string[]>> = {
  wizardTower: ["pyromancy"],
};
/** The look `kind` takes on `path`: the path when it has art, else "" (the
 * base art), so cache keys stay shared between looks that draw the same. */
export const artLook = (kind: string, path?: string): string =>
  path && PATH_LOOKS[kind as PlacedKind]?.includes(path) ? path : "";

/** A structure of `cw × ch` cells at damage `stage` (0 to 3), seeded by its
 * lot, as `(cw·ART) × (ch·ART)` RGBA pixels, in its path's `look` (see
 * `PATH_LOOKS`; "" for the base art). */
export function structurePixels(kind: PlacedKind, cw: number, ch: number, stage = 0, seed = 0, look = ""): Uint32Array {
  const w = cw * ART, h = ch * ART, out = new Uint32Array(w * h), p = pixels(out, w, h);
  PAINT[kind](p, artLook(kind, look));
  damage(p, stage, hash(seed, KINDS.indexOf(kind)), MATERIAL[kind].m);
  if (kind === "darkKeep") fissures(p, stage, hash(seed, 0xd4));
  return out;
}

/** What a fallen structure leaves, as `(cw·ART) × (ch·ART)` RGBA pixels. */
export function structureRubblePixels(kind: PlacedKind, cw: number, ch: number, seed = 0): Uint32Array {
  const w = cw * ART, h = ch * ART;
  return rubblePixels(w, h, hash(seed, KINDS.indexOf(kind), 3), { ...frame(w, h), ...MATERIAL[kind].ruin });
}

const KINDS: PlacedKind[] = ["barracks", "archerBarracks", "archerTower", "cannonTower", "watchTower", "wizardTower", "mageGuild", "valkyriePalace", "darkKeep", "monsterBait"];

const PAINT: Record<PlacedKind, (p: Pix, look: string) => void> = {
  barracks: paintBarracks,
  archerBarracks: paintArcherBarracks,
  archerTower: paintArcherTower,
  cannonTower: paintCannonTower,
  watchTower: paintWatchTower,
  wizardTower: paintWizardTower,
  mageGuild: paintMageGuild,
  valkyriePalace: paintValkyriePalace,
  darkKeep: paintDarkKeep,
  monsterBait: paintMonsterBait,
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

function paintWizardTower(p: Pix, look: string) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (x1 - x0 + 1) / 2;
  const roof = r - 2.2;
  // Pyromancy fires the roof red and cuts it to six slopes, a hexagon, with
  // ember runes in the rim; otherwise eight slate slopes, nearly round.
  const pyro = look === "pyromancy", sides = pyro ? 6 : 8, tiles = pyro ? C.kiln : C.slate, rune = pyro ? C.ember : C.rune;
  // How far out a point is in the roof's own shape: its distance on the
  // round roof, its furthest reach toward a side on the hexagon.
  const reach = (d: number, dx: number, dy: number) => !pyro ? d
    : Math.max(Math.abs(dx), Math.abs(dx * 0.5 + dy * 0.866), Math.abs(dx * 0.5 - dy * 0.866)) / 0.866;
  disc(p, cx, cy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    const e = reach(d, dx, dy);
    if (e > roof + 1) {
      // The rim of pale stone, a rune glowing every so often round it.
      const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 24);
      return a % 4 === 1 ? rune : C.pale[1 + Math.min(2, lit(x, y, dx, dy, d))];
    }
    if (e > roof) return OUTLINE;
    // The slopes rising to the finial, shaded by which way they face, the
    // seams between them dark.
    const ang = Math.atan2(dy, dx) + Math.PI, k = Math.floor((ang / (2 * Math.PI)) * sides + 0.5) % sides;
    const mid = (k / sides) * 2 * Math.PI - Math.PI;
    const seam = Math.abs(((ang / (2 * Math.PI)) * sides + 0.5) % 1 - 0.5) > 0.44 && d > 1.2;
    if (seam) return tiles[0];
    const t = (-(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2) * 1.5 + 1.5;
    return tiles[Math.max(0, Math.min(3, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25))))];
  });
  // The finial: gold, lit at its upper left (a flame's colours on Pyromancy).
  const fx = Math.floor(cx), fy = Math.floor(cy), tip = pyro ? [C.fire[1], C.fire[2], C.fire[3]] : C.gold;
  p.set(fx - 1, fy - 1, tip[2]);
  p.set(fx, fy - 1, tip[1]);
  p.set(fx - 1, fy, tip[1]);
  p.set(fx, fy, tip[0]);
}

function paintMageGuild(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  hall(p, x0, y0, x1, y1, C.wine[1]);
  // Ember runes glowing on the four slopes, each a lit pixel and its dimmer
  // tail.
  for (const [rx, ry, tx] of [[x0 + 6, y0 + 6, 1], [x1 - 6, y0 + 6, -1], [x0 + 6, y1 - 6, 1], [x1 - 6, y1 - 6, -1]]) {
    p.set(rx, ry, C.ember);
    p.set(rx + tx, ry + 1, C.fire[0]);
  }
  // The fire well at the hall's heart: an outlined brass ring lit to the
  // upper left round a fire white-hot in the middle.
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  disc(p, cx, cy, 4.2, (x, y, d, dx, dy) => {
    if (d > 3.4) return OUTLINE;
    if (d > 2.4) return C.gold[Math.min(2, lit(x, y, dx, dy, d) >> 1)];
    if (d > 2) return OUTLINE;
    return d < 0.8 ? C.fire[3] : d < 1.5 ? C.fire[2] : (x + y) % 2 ? C.fire[1] : C.fire[0];
  });
  // Two swallowtail banners hung over the south wall, red (lit on the west)
  // with a gold flame, their tails notched.
  for (const bx of [x0 + 4, x1 - 6]) {
    for (let y = y1 - 4; y <= y1 + 1; y++) {
      p.set(bx - 1, y, OUTLINE);
      p.set(bx + 3, y, OUTLINE);
      for (let x = bx; x <= bx + 2; x++) p.set(x, y, y === y1 - 4 ? OUTLINE : C.banner[x === bx ? 2 : x === bx + 2 ? 0 : 1]);
    }
    p.set(bx + 1, y1 - 2, C.gold[1]);
    p.set(bx + 1, y1 - 1, C.fire[2]);
    p.set(bx + 1, y1 + 1, OUTLINE);
    for (let x = bx - 1; x <= bx + 3; x++) p.set(x, y1 + 2, OUTLINE);
  }
}

/** Gold wings spread over the palace's south steps: `Y` gold, `y` lit. */
const WINGS = ["00.......00", "0yY0...0Yy0", ".0yYY0YYy0.", "..00yYy00..", "....000...."];

function paintValkyriePalace(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const short = Math.min(x1 - x0, y1 - y0) + 1;
  const marble = (x: number, y: number, tone: number) => (hash(x, y, 51) % 13 === 0 ? C.vein : C.marble[tone]);
  // Rings in from the outline: the marble steps (two on a whole palace,
  // one on a folded one), the edge of the porch, the colonnade, then the
  // cella's wall.
  const steps = short >= 32 ? 2 : 1, edge = steps + 1, cols = edge + 1, wall = cols + 2;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      if (ring > wall) continue;
      // Lit on the faces toward the upper left, shaded on the others.
      const sunny = x - x0 === ring || y - y0 === ring;
      if (ring === 0 || ring === wall) p.set(x, y, OUTLINE);
      else if (ring <= steps) p.set(x, y, marble(x, y, sunny ? 4 - (ring - 1) : 2 - (ring - 1)));
      else if (ring === edge) p.set(x, y, sunny ? C.marble[2] : C.marble[0]);
      else {
        // Columns two pixels square in a row round the porch, a shadowed
        // gap between each, lit on their upper left pixel.
        const along = y - y0 === ring || y1 - y === ring ? x : y;
        const k = (along - (x0 + y0)) % 3;
        const top = ring === cols;
        p.set(x, y, k === 2 ? C.marble[0] : top && k === 0 ? C.marble[4] : top || k === 0 ? C.marble[3] : C.marble[2]);
      }
    }
  // The cella inside, edged in gold.
  const tx0 = x0 + wall + 1, ty0 = y0 + wall + 1, tx1 = x1 - wall - 1, ty1 = y1 - wall - 1;
  for (let y = ty0; y <= ty1; y++)
    for (let x = tx0; x <= tx1; x++) {
      const rim = x === tx0 || y === ty0 || x === tx1 || y === ty1;
      p.set(x, y, rim ? (x === tx0 || y === ty0 ? C.gold[2] : C.gold[0]) : marble(x, y, 3));
    }
  const cw = tx1 - tx0 + 1, ch = ty1 - ty0 + 1;
  const dcx = (tx0 + tx1 + 1) / 2, dcy = (ty0 + ty1 + 1) / 2;
  let r = Math.min(cw, ch) / 2 - 0.5;
  if (Math.max(cw, ch) > Math.min(cw, ch) * 1.4) {
    // A folded palace: a long marble roof with a gold ridge over the
    // cella, and a small dome at its heart.
    gable(p, tx0 + 1, ty0 + 1, tx1 - 1, ty1 - 1, C.marble[3]);
    const along = cw >= ch;
    for (let k = along ? tx0 + 1 : ty0 + 1; k <= (along ? tx1 - 1 : ty1 - 1); k++)
      if (along) p.set(k, Math.floor(dcy), k % 2 ? C.gold[1] : C.gold[0]);
      else p.set(Math.floor(dcx), k, k % 2 ? C.gold[1] : C.gold[0]);
    r = Math.min(cw, ch) / 2 + 0.5;
  }
  // The dome: white marble shaded as a sphere, gold ribs, and a gold
  // lantern at its crown.
  disc(p, dcx, dcy, r, (x, y, d, dx, dy) => {
    if (d > r - 1) return OUTLINE;
    const ang = Math.atan2(dy, dx) + Math.PI;
    if (r > 6 && Math.abs(((ang / (2 * Math.PI)) * 8) % 1 - 0.5) > 0.42 && d > 1.6) return d < r * 0.6 ? C.gold[1] : C.gold[0];
    return C.marble[Math.min(4, 1 + lit(x, y, dx, dy, d) + (d < r * 0.45 ? 1 : 0))];
  });
  disc(p, dcx, dcy, 1.6, (x, y, d) => (d > 1.1 ? C.gold[0] : (x + y) % 2 ? C.gold[2] : C.gold[1]));
  // Gold wings over the south steps.
  const wx = Math.round((x0 + x1) / 2) - 5, wy = y1 - WINGS.length + 1;
  WINGS.forEach((row, j) =>
    [...row].forEach((ch, i) => {
      if (ch !== ".") p.set(wx + i, wy + j, ch === "0" ? OUTLINE : ch === "y" ? C.gold[2] : C.gold[1]);
    }),
  );
}

/** The dark wizard keep. Its parts scale with its size, so the folded keep
 * (5 cells) is the great one (12) in small. */
function paintDarkKeep(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  const S = Math.min(x1 - x0, y1 - y0) + 1;
  const ob = (x: number, y: number, tone: number) => (hash(x, y, 61) % 23 === 0 && tone >= 2 ? C.sheen : C.obsidian[tone]);
  // Rings in from the outline: the plinth's steps, the curtain wall (its
  // outer and inner faces outlined) and the courtyard inside.
  const steps = S >= 60 ? 2 : 1, wa = steps + 1, wb = wa + Math.max(2, Math.round(S * 0.07)) + 1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const ring = Math.min(x - x0, y - y0, x1 - x, y1 - y);
      const sunny = x - x0 === ring || y - y0 === ring;
      if (ring === 0 || ring === wa || ring === wb) p.set(x, y, OUTLINE);
      else if (ring < wa) p.set(x, y, ob(x, y, sunny ? 4 - ring : 2 - ring + 1));
      else if (ring < wb) {
        // Glassy black blocks in crimson mortar, merlons along the outer edge.
        const along = y - y0 === ring || y1 - y === ring ? x : y;
        const depth = ring - wa - 1;
        const seam = (along + depth * 2) % 5 === 0 || (depth > 0 && depth % 3 === 0);
        const merlon = depth === 0 && Math.floor(along / 2) % 2 === 0;
        p.set(x, y, seam ? C.mortar[sunny ? 2 : 1] : ob(x, y, merlon ? (sunny ? 4 : 2) : sunny ? 3 : 1));
      } else {
        // Dark flagstones in a grid, each its own shade.
        const fx = Math.floor((x - x0) / 4), fy = Math.floor((y - y0) / 4);
        const edge = (x - x0) % 4 === 0 || (y - y0) % 4 === 0;
        p.set(x, y, edge ? C.obsidian[1] : C.flag[hash(fx, fy, 62) % 3]);
      }
    }
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
  // The rune circle round the spire: a glowing crimson ring, a rune mark
  // every so often, dithered embers just inside it.
  const rr = S * 0.31;
  disc(p, cx, cy, rr, (x, y, d, dx, dy) => {
    if (d < rr - 1.2) return d > rr - 2.2 && (x + y) % 3 === 0 ? C.ruby[1] : null;
    const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 16);
    return a % 2 ? C.ruby[2] : C.ruby[3];
  });
  // The spire: eight obsidian slopes rising to a ruby, shaded by which way
  // they face, crimson seams between them.
  const sr = Math.max(4, S * 0.21);
  disc(p, cx, cy, sr, (x, y, d, dx, dy) => {
    if (d > sr - 1) return OUTLINE;
    const ang = Math.atan2(dy, dx) + Math.PI, f = (ang / (2 * Math.PI)) * 8 + 0.5;
    if (Math.abs((f % 1) - 0.5) > 0.42 && d > 1.5) return C.mortar[2];
    const mid = (Math.floor(f) % 8 / 8) * 2 * Math.PI - Math.PI;
    const t = (-(Math.cos(mid) + Math.sin(mid)) / Math.SQRT2) * 1.6 + 2;
    return ob(x, y, Math.max(1, Math.min(4, Math.floor(t + ((x + y) % 2 ? 0.25 : -0.25)))));
  });
  ruby(p, cx, cy, Math.max(1.6, S * 0.075));
  // The gate in the south wall: a black arch edged in rubies, between two
  // crimson banners.
  const gw = Math.max(2, Math.round(S * 0.08)), gx = Math.round(cx) - gw;
  for (let y = y1 - wb + 1; y <= y1 - 1; y++)
    for (let x = gx - 1; x <= gx + gw * 2; x++) {
      const rim = x === gx - 1 || x === gx + gw * 2;
      p.set(x, y, rim ? (y % 2 ? C.ruby[2] : C.ruby[1]) : y === y1 - wb + 1 ? C.ruby[3] : C.obsidian[0]);
    }
  if (S >= 30)
    for (const bx of [gx - Math.max(4, Math.round(S * 0.12)), gx + gw * 2 + Math.max(2, Math.round(S * 0.12)) - 1]) {
      const len = Math.max(4, Math.round(S * 0.09));
      for (let y = y1 - wb + 1; y <= y1 - wb + len; y++) {
        p.set(bx - 1, y, OUTLINE);
        p.set(bx + 3, y, OUTLINE);
        for (let x = bx; x <= bx + 2; x++) p.set(x, y, y === y1 - wb + 1 ? OUTLINE : C.mortar[x === bx ? 2 : x === bx + 2 ? 0 : 1]);
      }
      p.set(bx + 1, y1 - wb + 3, C.ruby[3]);
      p.set(bx + 1, y1 - wb + len, OUTLINE);
      p.set(bx + 1, y1 - wb + len + 1, OUTLINE);
    }
  // Rubies set in the wall tops, midway along each side.
  const wm = Math.round((wa + wb) / 2);
  for (const [x, y] of [[cx, y0 + wm], [x0 + wm, cy], [x1 - wm, cy]]) if (S >= 30) ruby(p, x, y, 1.6);
  // The corner turrets, where the lightning leaves from: obsidian drums,
  // crenellated round the rim, a great ruby at the heart of each.
  const ix = p.w * TURRET_INSET, iy = p.h * TURRET_INSET, tr = Math.max(3.4, Math.min(p.w, p.h) * 0.115);
  for (const [tx, ty] of [[ix, iy], [p.w - ix, iy], [ix, p.h - iy], [p.w - ix, p.h - iy]]) {
    disc(p, tx, ty, tr, (x, y, d, dx, dy) => {
      if (d > tr - 1) return OUTLINE;
      if (d > tr * 0.62) {
        const a = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 12);
        return ob(x, y, a % 2 ? 1 : 1 + lit(x, y, dx, dy, d));
      }
      return d > tr * 0.62 - 1 ? OUTLINE : C.obsidian[0];
    });
    ruby(p, tx, ty, Math.max(1.4, tr * 0.5));
  }
}

/** A faceted ruby of radius `r` at (cx, cy): dark at the rim, its facets
 * lit to the upper left, a white-hot glint. */
function ruby(p: Pix, cx: number, cy: number, r: number) {
  disc(p, cx, cy, r + 1, (x, y, d, dx, dy) => {
    if (d > r) return OUTLINE;
    const facet = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 6);
    const t = lit(x, y, dx, dy, d) + (d < r * 0.5 ? 1 : 0) - (facet % 2 ? 1 : 0);
    return C.ruby[Math.max(0, Math.min(3, t))];
  });
  p.set(Math.floor(cx - r * 0.4), Math.floor(cy - r * 0.4), C.ruby[4]);
}

/** Crimson fissures glowing through the hurt obsidian: more and longer at
 * each stage, only over what is drawn. */
function fissures(p: Pix, stage: number, seed: number) {
  const many = Math.max(1, Math.round((p.w * p.h) / 900));
  for (let s = 1; s <= stage; s++)
    for (let k = 0; k < many * s; k++) {
      let x = Math.floor(hash01(seed, s, k, 1) * p.w), y = Math.floor(hash01(seed, s, k, 2) * p.h);
      const dx = hash01(seed, s, k, 3) < 0.5 ? 1 : -1, dy = hash01(seed, s, k, 4) < 0.5 ? 1 : -1;
      for (let i = 0; i < 3 + s * 2; i++) {
        const c = p.get(x, y);
        if (c < 0 || c === OUTLINE) break;
        p.set(x, y, i % 3 === 1 ? C.ruby[3] : C.ruby[2]);
        if (hash01(seed, s, k, i) < 0.5) x += dx;
        else y += dy;
      }
    }
}

/** One crate seen from above in `x0..x1, y0..y1` (outline included): boards
 * running `across` or down, lit to the upper left, the seams between them
 * a shade darker, an iron corner catching the sun; `lift` lightens a crate
 * stacked higher. */
function crate(p: Pix, x0: number, y0: number, x1: number, y1: number, across: boolean, lift = 0) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (x === x0 || y === y0 || x === x1 || y === y1) {
        p.set(x, y, OUTLINE);
        continue;
      }
      const u = across ? y - y0 - 1 : x - x0 - 1;
      const edge = x === x0 + 1 || y === y0 + 1 ? 1 : x === x1 - 1 || y === y1 - 1 ? -1 : 0;
      const seam = u % 3 === 2 && edge === 0;
      const grain = hash(x, y, 77) % 9 === 0 ? -1 : 0;
      p.set(x, y, C.crate[Math.max(0, Math.min(4, 2 + lift + edge + grain - (seam ? 1 : 0)))]);
    }
  p.set(x0 + 1, y0 + 1, C.iron[3]);
  p.set(x1 - 1, y1 - 1, C.iron[1]);
}

/** Darkens the drawn, non-outline pixels in a box: a shadow cast by
 * what is stacked above. */
function shadow(p: Pix, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const c = p.get(x, y);
      if (c >= 0 && c !== OUTLINE) p.set(x, y, shade(c, 0.6));
    }
}

function paintMonsterBait(p: Pix) {
  const { x0, y0, x1, y1 } = frame(p.w, p.h);
  // On the ground: a long crate along the south, boards across, and an open
  // one to the north-east heaped with raw meat.
  crate(p, x0, y0 + 6, x1, y1, true);
  crate(p, x0 + 5, y0, x1, y0 + 6, false);
  for (let y = y0 + 2; y <= y0 + 4; y++)
    for (let x = x0 + 8; x <= x1 - 2; x++) {
      const k = hash(x, y, 91) % 4;
      p.set(x, y, k === 0 ? C.meat[3] : (x + y) % 2 ? C.meat[2] : C.meat[1]);
    }
  p.set(x1 - 2, y0 + 2, C.bone[1]);
  p.set(x1 - 1, y0 + 1, C.bone[1]);
  // Slime seeping from the long crate's seams and pooling below.
  for (const [x, y, t] of [[x1 - 3, y1 - 1, 2], [x1 - 3, y1, 1], [x1 - 2, y1 + 1, 0], [x1 - 4, y1 + 1, 1], [x1 - 1, y0 + 9, 1]] as const) p.set(x, y, C.slime[t]);
  // A crate stacked on top to the west, throwing its shadow to the lower
  // right, a haunch of meat lashed across it with rope.
  const tx0 = x0, ty0 = y0 + 1, tx1 = x0 + 7, ty1 = y0 + 8;
  shadow(p, tx1 + 1, ty0 + 1, tx1 + 2, ty1 + 1);
  shadow(p, tx0 + 1, ty1 + 1, tx1 + 2, ty1 + 2);
  crate(p, tx0, ty0, tx1, ty1, false, 1);
  for (let y = ty0 + 1; y < ty1; y++) p.set(tx0 + 5, y, C.straw[0]);
  for (const [dx, dy, c] of [
    [1, 3, C.meat[3]], [2, 3, C.meat[3]], [3, 3, C.meat[2]], [4, 3, C.meat[2]],
    [1, 4, C.meat[2]], [2, 4, C.meat[2]], [3, 4, C.meat[1]], [4, 4, C.meat[1]],
    [2, 5, C.meat[1]], [3, 5, C.meat[0]],
    [5, 3, C.bone[1]], [6, 2, C.bone[1]], [6, 1, C.bone[0]],
  ] as const) p.set(tx0 + dx, ty0 + dy, c);
  // Slime dribbling down the top crate's side.
  p.set(tx0 + 1, ty1 - 1, C.slime[2]);
  p.set(tx0 + 1, ty1, C.slime[1]);
}
