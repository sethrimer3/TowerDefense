/** The Magic Forest, a testing zone: the open ground outside the walls
 * carpeted in small clovers, a few large wispy trees standing on it and
 * lightning bugs drifting gently round them. Planned from the map alone
 * (each cell's own hashes), presentation only: nothing here blocks, slows
 * or draws from the battle's random stream. `magic-forest-art.ts` draws it. */
import { CELLS_H, CELLS_W, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type CityMap } from "./citygen.ts";
import type { AreaId } from "./areas.ts";
import { clearOf } from "./forest.ts";

/** The areas carpeted in the Magic Forest. */
export const MAGIC_FOREST_AREAS: readonly AreaId[] = ["magic"];
export const hasMagicForest = (area: AreaId) => MAGIC_FOREST_AREAS.includes(area);

/** How the forest is planned: at most `trees` wispy trees, each `radius`
 * cells across its canopy (smallest to largest), kept `apart` cells beyond
 * touching; `flies` lightning bugs a tree (fewest to most); `clovers` a
 * cell and the share of cells with a white clover blossom. */
export const MAGIC_FOREST = { trees: 10, radius: [4.2, 6.5], apart: 1, flies: [12, 20], clovers: 3, blossoms: 0.05 };

/** A wispy tree: its canopy's middle and radius in cells, its own seed and
 * sway phase. `id` is its place in `trees`. */
export type WispyTree = { id: number; x: number; y: number; r: number; seed: number; phase: number };
/** A lightning bug circling tree `tree`: `orbit` cells out, starting at
 * `angle`, turning `speed` radians a second (either way), wandering
 * `wander` cells off its circle, blinking every `blink` seconds from
 * `phase`. */
export type Firefly = { tree: number; orbit: number; angle: number; speed: number; wander: number; blink: number; phase: number };
/** The plan: `open` is 1 on each open-ground cell, which alone the clovers cover. */
export type MagicForestPlan = { open: Uint8Array; trees: WispyTree[]; flies: Firefly[] };

const plans = new WeakMap<CityMap, MagicForestPlan>();

/** `map`'s Magic Forest, planned on first use. */
export function magicForestPlan(map: CityMap): MagicForestPlan {
  let plan = plans.get(map);
  if (!plan) plans.set(map, (plan = plan_(map)));
  return plan;
}

function plan_(map: CityMap): MagicForestPlan {
  const open = Uint8Array.from(map.type, (t) => (t === CellType.OUT ? 1 : 0));
  const spots: [number, number, number][] = [];
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) if (open[cellIndex(cx, cy)]) spots.push([cx, cy, hash01(cx, cy, 701)]);
  spots.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  const trees: WispyTree[] = [];
  const [small, large] = MAGIC_FOREST.radius;
  for (const [cx, cy] of spots) {
    if (trees.length >= MAGIC_FOREST.trees) break;
    const r = small + hash01(cx, cy, 702) * (large - small), x = cx + 0.5, y = cy + 0.5;
    // The trunk's ground must be open; the wisps may hang a little over a wall.
    if (!clearOf(map, x, y, r * 0.45)) continue;
    if (trees.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < (t.r + r + MAGIC_FOREST.apart) ** 2)) continue;
    trees.push({ id: trees.length, x, y, r, seed: hash(cx, cy, 703), phase: hash01(cx, cy, 704) });
  }
  const flies: Firefly[] = [];
  const [few, most] = MAGIC_FOREST.flies;
  for (const t of trees) {
    const n = few + (hash(t.seed, 710) % (most - few + 1));
    for (let k = 0; k < n; k++) {
      const u = (salt: number) => hash01(t.seed, k, salt);
      flies.push({
        tree: t.id,
        orbit: t.r * (0.25 + u(711) * 0.95),
        angle: u(712) * Math.PI * 2,
        speed: (0.08 + u(713) * 0.18) * (u(714) < 0.5 ? -1 : 1),
        wander: 0.4 + u(715) * 0.9,
        blink: 2.4 + u(716) * 3.2,
        phase: u(717),
      });
    }
  }
  return { open, trees, flies };
}

/** Where lightning bug `f` is at `t` seconds (cells) and how brightly it
 * glows, 0..1: circling its tree slowly, wandering off the circle in slow
 * loops and bobbing, its light swelling and fading. */
export function fireflyAt(f: Firefly, tree: WispyTree, t: number) {
  const a = f.angle + f.speed * t;
  const p = f.phase * Math.PI * 2;
  const wx = Math.sin(t * 0.37 + p) + 0.5 * Math.sin(t * 0.91 + p * 2.3);
  const wy = Math.cos(t * 0.29 + p * 1.7) + 0.5 * Math.sin(t * 0.77 + p * 0.6);
  const x = tree.x + Math.cos(a) * f.orbit + wx * f.wander * 0.67;
  const y = tree.y + Math.sin(a) * f.orbit * 0.85 + wy * f.wander * 0.67;
  // Swells up, holds a moment and fades, then rests dim.
  const s = Math.sin((t / f.blink + f.phase) * Math.PI * 2);
  const glow = 0.2 + 0.8 * Math.max(0, s) ** 1.5;
  return { x, y, glow };
}
