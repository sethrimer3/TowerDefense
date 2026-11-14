/** Where two cities differ, for repainting only that: a building placed,
 * moved or taken up regenerates the whole city (`generateCity`), but the
 * new one matches the old everywhere but round the change, so the renderer
 * repaints the city layer and the lighting's masks in these boxes alone and
 * keeps every torch that still burns where it did (`DefendLighting.setMap`). */
import { CELL_COUNT, CELLS_H, CELLS_W } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import type { CellBox } from "./lighting.ts";

type Looks = Readonly<Record<number, string>> | undefined;

/** Everything the city layer draws of a building, as a string. */
function signature(b: Building, looks: Looks) {
  const look = b.structureUid !== undefined ? looks?.[b.structureUid] ?? "" : "";
  const gate = b.gate ? `${b.gate.tx},${b.gate.ty},${b.gate.side}` : "";
  const corner = b.corner ? `${b.corner.vx},${b.corner.vy},${b.corner.out.x},${b.corner.out.y}` : "";
  const fence = b.fence ? `${b.fence.x1},${b.fence.y1},${b.fence.x2},${b.fence.y2}` : "";
  const rails = b.rails ? b.rails.map((r) => `${r.x1},${r.y1},${r.x2},${r.y2}`).join("/") : "";
  return `${b.kind}|${b.rect.x},${b.rect.y},${b.rect.w},${b.rect.h}|${b.variant}|${look}|${b.piece ? 1 : 0}|${b.hidden ? 1 : 0}|${b.woodGate ? 1 : 0}|${gate}|${corner}|${fence}|${rails}`;
}

/** The cells whose look differs between `a` and `b` (1), or null when they
 * aren't comparable cell by cell. Everything the city layer paints from a
 * cell reaches only a cell or two round it (`DAMAGE_MARGIN` in render.ts). */
export function changedCells(a: CityMap, b: CityMap, looksA: Looks, looksB: Looks): Uint8Array | null {
  if (a.type.length !== CELL_COUNT || b.type.length !== CELL_COUNT) return null;
  const sigA = a.buildings.map((x) => signature(x, looksA)), sigB = b.buildings.map((x) => signature(x, looksB));
  const spikes = (m: CityMap) => {
    const s = new Array<string>(CELL_COUNT).fill("");
    for (const r of m.spikes ?? []) for (const c of r.cells) s[c] += r.side;
    return s;
  };
  const spA = spikes(a), spB = spikes(b);
  const out = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const oa = a.owner[i], ob = b.owner[i];
    const same =
      a.type[i] === b.type[i] && a.city[i] === b.city[i] && a.wall[i] === b.wall[i] && (a.bridges?.[i] ?? 0) === (b.bridges?.[i] ?? 0) && spA[i] === spB[i] &&
      (oa < 0 ? ob < 0 : ob >= 0 && sigA[oa] === sigB[ob]);
    if (same) continue;
    out[i] = 1;
  }
  return out;
}

/** Boxes (cells) round the marked cells, `margin` cells wider, merged where
 * they overlap so nothing is painted twice. */
export function changeBoxes(marked: Uint8Array, margin: number): CellBox[] {
  const boxes: CellBox[] = [];
  const seen = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    if (!marked[i] || seen[i]) continue;
    // Each group of marked cells touching (diagonals too) makes one box.
    const todo = [i];
    seen[i] = 1;
    let x0 = CELLS_W, y0 = CELLS_H, x1 = 0, y1 = 0;
    while (todo.length) {
      const c = todo.pop()!, x = c % CELLS_W, y = (c - x) / CELLS_W;
      x0 = Math.min(x0, x), y0 = Math.min(y0, y), x1 = Math.max(x1, x + 1), y1 = Math.max(y1, y + 1);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
          const n = ny * CELLS_W + nx;
          if (marked[n] && !seen[n]) seen[n] = 1, todo.push(n);
        }
    }
    boxes.push({ x0: Math.max(0, x0 - margin), y0: Math.max(0, y0 - margin), x1: Math.min(CELLS_W, x1 + margin), y1: Math.min(CELLS_H, y1 + margin) });
  }
  return mergeBoxes(boxes);
}

/** Merges overlapping boxes until none overlap. */
export function mergeBoxes(boxes: CellBox[]): CellBox[] {
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < boxes.length && !merged; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x0 > b.x1 || b.x0 > a.x1 || a.y0 > b.y1 || b.y0 > a.y1) continue;
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), layerOnly: a.layerOnly && b.layerOnly };
        boxes.splice(j, 1);
        merged = true;
        break;
      }
  }
  return boxes;
}

/** Held weakly, so a city doesn't keep every city before it alive. */
const lineage = new WeakMap<CityMap, { from: WeakRef<CityMap>; changed: Uint8Array }>();

/** Records that `to` is `from` regenerated with only the `changed` cells
 * looking different, so what is baked once per city (`ground-art.ts`, the
 * parks' grass) can be patched from `from`'s rather than made afresh. */
export function noteEdit(from: CityMap, to: CityMap, changed: Uint8Array) {
  if (from !== to) lineage.set(to, { from: new WeakRef(from), changed });
}

/** The city `map` was regenerated from and the cells that changed, if
 * recorded (`noteEdit`). */
export function editedFrom(map: CityMap): { from: CityMap; changed: Uint8Array } | undefined {
  const e = lineage.get(map), from = e?.from.deref();
  return e && from ? { from, changed: e.changed } : undefined;
}

/** `marked` grown by `by` cells each way (diagonals too). */
export function grow(marked: Uint8Array, by: number): Uint8Array {
  let cur = marked;
  for (let k = 0; k < by; k++) {
    const next = cur.slice();
    for (let i = 0; i < CELL_COUNT; i++) {
      if (!cur[i]) continue;
      const x = i % CELLS_W, y = (i - x) / CELLS_W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < CELLS_W && ny < CELLS_H) next[ny * CELLS_W + nx] = 1;
        }
    }
    cur = next;
  }
  return cur;
}
