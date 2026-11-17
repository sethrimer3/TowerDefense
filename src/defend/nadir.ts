/** Nadir (zone 10, area id `nadir`): the city stands on a slab of black
 * ground floating in a strange void, veined with dark red that beats like a
 * heart, and nothing on it makes sense. Rifts open in the ground onto the
 * void beneath; black pyramids cast their shadows toward the light; flights
 * of stairs climb to nowhere or sink into the ground; trapdoors lie in the
 * open with red light leaking round them; eyes in the ground watch whoever
 * is nearest and blink; stones and perfect cubes hover, bobbing and
 * turning, each throwing its shadow its own way. Planned from the map alone
 * (each cell's own hashes), presentation only: nothing here blocks, slows or
 * draws from the battle's random stream. `nadir-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas floored as the Nadir's void. */
export const NADIR_AREAS: readonly AreaId[] = ["nadir"];
export const hasNadir = (area: AreaId) => NADIR_AREAS.includes(area);

/** How the Nadir's ground is planned: at most so many of each feature, and
 * how many cells apart they keep. */
export const NADIR = {
  rifts: 5, pyramids: 6, stairs: 5, doors: 3, eyes: 7, floaters: 9,
  apart: 0.9,
  /** Motes drawn into a rift at once. */
  motes: 7,
  /** Cells within which an eye watches someone, and within which it shuts. */
  watch: 7, flinch: 0.7,
  /** Seconds a heartbeat of the veins takes. */
  beat: 1.6,
} as const;

/** A tear in the ground onto the void: `len` cells long at `angle`, `w` cells across its middle. */
export type Rift = { x: number; y: number; len: number; w: number; angle: number; seed: number };
/** A black pyramid seen from above, `r` cells from its middle to a side. */
export type Pyramid = { x: number; y: number; r: number; seed: number };
/** A flight of stairs `steps` long climbing toward `dir` (0 up, 1 right,
 * 2 down, 3 left) to nowhere, or (`sinks`) going down into the ground. */
export type Stair = { x: number; y: number; r: number; seed: number; dir: 0 | 1 | 2 | 3; steps: number; sinks: boolean };
/** A trapdoor lying in the open, ajar on one side. */
export type Trapdoor = { x: number; y: number; r: number; seed: number; turned: boolean };
/** An eye in the ground, `r` cells from its middle to a corner. */
export type GroundEye = { x: number; y: number; r: number; seed: number };
/** A stone or a cube hovering `lift` cells up, its shadow thrown `angle`. */
export type Floater = { x: number; y: number; r: number; seed: number; cube: boolean; lift: number; angle: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the ground covers. */
export type NadirPlan = {
  open: Uint8Array; rifts: Rift[]; pyramids: Pyramid[]; stairs: Stair[]; doors: Trapdoor[]; eyes: GroundEye[]; floaters: Floater[];
};

const plans = new WeakMap<CityMap, NadirPlan>();

/** `map`'s Nadir ground, planned on first use. */
export function nadirPlan(map: CityMap): NadirPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): NadirPlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  const spots = (salt: number) => {
    const out: [number, number, number][] = [];
    for (let cy = 0; cy < CELLS_H; cy++)
      for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) out.push([cx, cy, hash01(cx, cy, salt)]);
    return out.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  };
  const taken: { x: number; y: number; r: number }[] = [];
  // Nothing is cut off by the board's edge: the wilds carry their own.
  const free = (x: number, y: number, r: number) => x - r > 0.2 && y - r > 0.2 && x + r < CELLS_W - 0.2 && y + r < CELLS_H - 0.2
    && taken.every((t) => (t.x - x) ** 2 + (t.y - y) ** 2 >= (t.r + r + NADIR.apart) ** 2);
  const place = <T extends { x: number; y: number; r: number }>(salt: number, max: number, make: (cx: number, cy: number) => T | null, pad = 0) => {
    const out: T[] = [];
    for (const [cx, cy] of spots(salt)) {
      if (out.length >= max) break;
      const t = make(cx, cy);
      if (!t || !clearOf(map, t.x, t.y, t.r) || !free(t.x, t.y, t.r + pad)) continue;
      out.push(t);
      taken.push({ x: t.x, y: t.y, r: t.r });
    }
    return out;
  };
  const rifts = place(1501, NADIR.rifts, (cx, cy) => {
    const len = 2.2 + hash01(cx, cy, 1502) * 1.8;
    return Object.assign(riftAt(cx + 0.5, cy + 0.5, len, hash(cx, cy, 1503)), { r: len / 2 });
  }, 0.6);
  const pyramids = place(1511, NADIR.pyramids, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 0.95 + hash01(cx, cy, 1512) * 0.55, seed: hash(cx, cy, 1513) }), 1.2);
  const stairs = place(1521, NADIR.stairs, (cx, cy) => stairAt(cx + 0.5, cy + 0.5, hash(cx, cy, 1522)), 0.4);
  const doors = place(1531, NADIR.doors, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 1.1, seed: hash(cx, cy, 1532), turned: hash01(cx, cy, 1533) < 0.5 }), 0.5);
  const eyes = place(1541, NADIR.eyes, (cx, cy) => ({ x: cx + 0.5, y: cy + 0.5, r: 0.8 + hash01(cx, cy, 1542) * 0.45, seed: hash(cx, cy, 1543) }), 0.3);
  const floaters = place(1551, NADIR.floaters, (cx, cy) => floaterAt(cx + 0.5, cy + 0.5, hash(cx, cy, 1552)), 1);
  return { open, rifts, pyramids, stairs, doors, eyes, floaters };
}

/** A rift `len` cells long at (x, y) (the wilds lay theirs out this way too). */
export function riftAt(x: number, y: number, len: number, seed: number): Rift {
  return { x, y, len, w: 0.5 + hash01(seed, 1504) * 0.45, angle: hash01(seed, 1505) * Math.PI, seed };
}
/** A flight of stairs at (x, y) (the wilds lay theirs out this way too). */
export function stairAt(x: number, y: number, seed: number): Stair {
  const steps = 3 + (seed % 4);
  return { x, y, r: 0.45 + steps * 0.28, seed, dir: (hash(seed, 1523) % 4) as Stair["dir"], steps, sinks: hash01(seed, 1524) < 0.35 };
}
/** A floater at (x, y) (the wilds lay theirs out this way too). */
export function floaterAt(x: number, y: number, seed: number): Floater {
  const cube = hash01(seed, 1553) < 0.4;
  return { x, y, r: cube ? 0.6 + hash01(seed, 1554) * 0.3 : 0.65 + hash01(seed, 1554) * 0.5, seed, cube, lift: 0.8 + hash01(seed, 1555) * 1.2, angle: hash01(seed, 1556) * Math.PI * 2 };
}

/** Where floater `f` is at `t` seconds: how far it has bobbed up (cells),
 * how far it has drifted round its spot, and (a cube) how far it has turned. */
export function floatAt(f: Floater, t: number) {
  const u = (salt: number) => hash01(f.seed, salt);
  const bob = Math.sin(t * (0.7 + u(1557) * 0.6) + u(1558) * 6.28) * 0.12;
  const orbit = t * (0.15 + u(1559) * 0.2) * (u(1560) < 0.5 ? -1 : 1) + u(1561) * 6.28, wander = 0.08 + u(1562) * 0.1;
  return { x: f.x + Math.cos(orbit) * wander, y: f.y + Math.sin(orbit) * wander * 0.7, lift: f.lift + bob, turn: f.cube ? t * (0.3 + u(1563) * 0.5) * (u(1564) < 0.5 ? -1 : 1) + u(1565) * 6.28 : 0 };
}

/** How open eye `e` is at `t` seconds (0 shut, 1 wide): blinking now and
 * then, and shut tight while anyone stands within `NADIR.flinch` of it. */
export function eyeOpen(e: GroundEye, t: number, near: number) {
  if (near < NADIR.flinch) return 0;
  const period = 3 + hash01(e.seed, 1544) * 5, at = (t + hash01(e.seed, 1545) * period) % period;
  // A blink: shut over 0.12 s, open again over 0.2.
  if (at < 0.12) return 1 - at / 0.12;
  if (at < 0.32) return (at - 0.12) / 0.2;
  return 1;
}

/** Where eye `e` looks (-1..1 each way): at the nearest of `who` within
 * `NADIR.watch` cells, else drifting slowly about. */
export function eyeLook(e: GroundEye, t: number, who: readonly { x: number; y: number }[]) {
  let best = Infinity, bx = 0, by = 0;
  for (const w of who) {
    const d = (w.x - e.x) ** 2 + (w.y - e.y) ** 2;
    if (d < best) { best = d; bx = w.x; by = w.y; }
  }
  const near = Math.sqrt(best);
  if (near <= NADIR.watch && near > 1e-6) {
    const k = Math.min(1, near / 1.5);
    return { x: ((bx - e.x) / near) * k, y: ((by - e.y) / near) * k, near };
  }
  const a = t * (0.2 + hash01(e.seed, 1546) * 0.3) + hash01(e.seed, 1547) * 6.28;
  return { x: Math.cos(a) * 0.6, y: Math.sin(a * 1.3) * 0.5, near };
}

/** Mote `k` falling into rift `r` at `t` seconds: where it is (cells) and
 * how much it shows. They spiral in from round the rift and vanish into it. */
export function moteAt(r: Rift, k: number, t: number) {
  const u = (salt: number) => hash01(r.seed, k, salt);
  const life = 3 + u(1571) * 3, age = (t / life + u(1572)) % 1;
  const reach = r.len * 0.5 + 1 + u(1573) * 1.5, d = reach * (1 - age) ** 1.4;
  const a = u(1574) * 6.28 + age * (2 + u(1575) * 2) * (u(1576) < 0.5 ? -1 : 1);
  return { x: r.x + Math.cos(a) * d, y: r.y + Math.sin(a) * d * 0.8, show: Math.min(1, age * 5) * (1 - age ** 3) };
}

/** How strongly the veins glow at `t` seconds (0..1): a heartbeat, two
 * pulses close together, then a rest. */
export function heartbeat(t: number) {
  const p = (t / NADIR.beat) % 1, pulse = (c: number, w: number) => Math.exp(-(((p - c) / w) ** 2));
  return Math.min(1, pulse(0.08, 0.05) + 0.7 * pulse(0.26, 0.06));
}
