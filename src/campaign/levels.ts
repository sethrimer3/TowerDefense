/** Stable Ambush identities, deterministic tracks and best-star progression. */
import { decodeAmbushRanks, type AmbushRanks } from "../ambush-upgrades.ts";
import { AREAS, type AreaId } from "../defend/areas.ts";
import { hash, hash01, CELLS_W, CELLS_H } from "../defend/grid.ts";
import { dist } from "../exact.ts";
export type LevelPoint = { x: number; y: number };
export type AmbushLevel = { id: string; area: AreaId; zone: number; index: number; name: string; seed: number };
export type Stars = 0 | 1 | 2 | 3;
export type AmbushProgress = { stars: Partial<Record<string, Stars>>; autoSend?: true; ranks?: AmbushRanks; attempts?: Partial<Record<string, number>> };
const names = [
  ["Old Road", "Mossy Ford", "Ruin Gate"],
  ["Sandway", "Sunken Well", "Amber Pass"],
  ["Cinder Road", "Slag Crossing", "Forge Gate"],
  ["Tidal Road", "Coral Crossing", "Temple Gate"],
  ["Spore Trail", "Mushroom Grove", "Hollow Gate"],
  ["Ice Road", "Frost Crossing", "Vault Gate"],
  ["Shard Trail", "Prism Crossing", "Geode Gate"],
  ["Ash Road", "Grave Crossing", "Crypt Gate"],
  ["Star Road", "Comet Crossing", "Sanctuary Gate"],
  ["Last Road", "Dark Crossing", "Nadir Gate"],
];
export const AMBUSH_LEVELS: readonly AmbushLevel[] = AREAS.flatMap((area, zone) =>
  Array.from({ length: 3 }, (_, index) => ({
    id: `${area.id}-${index + 1}`,
    area: area.id,
    zone,
    index,
    name: names[zone][index],
    seed: hash(0xa6b057, zone, index),
  })),
);
export const ambushLevel = (index: number) => AMBUSH_LEVELS[Math.max(0, Math.min(29, Math.floor(index)))];
export const levelUnlocked = (progress: AmbushProgress, index: number) =>
  Number.isInteger(index) &&
  index >= 0 &&
  index < AMBUSH_LEVELS.length &&
  (index === 0 || (progress.stars[AMBUSH_LEVELS[index].id] ?? 0) > 0 || (progress.stars[AMBUSH_LEVELS[index - 1].id] ?? 0) > 0);
export const totalStars = (progress: AmbushProgress) => AMBUSH_LEVELS.reduce((n, l) => n + (progress.stars[l.id] ?? 0), 0);
export function recordStars(progress: AmbushProgress, level: AmbushLevel, stars: Stars) {
  const before = progress.stars[level.id] ?? 0;
  if (stars > before) progress.stars[level.id] = stars;
  return Math.max(0, stars - before);
}
export function decodeAmbush(raw: unknown): AmbushProgress {
  const out: AmbushProgress = { stars: {} };
  if (!raw || typeof raw !== "object") return out;
  const value = raw as { stars?: Record<string, unknown>; cleared?: number; autoSend?: unknown; ranks?: unknown; attempts?: Record<string, unknown> };
  if (value.stars && typeof value.stars === "object") {
    for (const level of AMBUSH_LEVELS) {
      const n = value.stars[level.id];
      if (Number.isInteger(n) && Number(n) >= 1 && Number(n) <= 3) out.stars[level.id] = n as Stars;
    }
  } else if (Number.isInteger(value.cleared)) {
    for (let i = 0; i < Math.max(0, Math.min(3, value.cleared!)); i++) out.stars[AMBUSH_LEVELS[i].id] = 1;
  }
  if (value.autoSend === true) out.autoSend = true;
  const ranks = decodeAmbushRanks(value.ranks, totalStars(out));
  if (ranks) out.ranks = ranks;
  for (const level of AMBUSH_LEVELS) {
    const n = value.attempts?.[level.id];
    if (Number.isSafeInteger(n) && Number(n) > 0 && Number(n) <= 1e9) (out.attempts ??= {})[level.id] = Number(n);
  }
  return out;
}
export function pointAlong(points: readonly LevelPoint[], fraction: number): LevelPoint {
  const lengths = points.slice(1).map((p, i) => dist(p.x - points[i].x, p.y - points[i].y));
  let remaining = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
    }
    remaining -= lengths[i];
  }
  return { ...points[points.length - 1] };
}
export type River = { top: number[]; depth: number[] };
export type Track = { lanes: LevelPoint[][]; points: LevelPoint[]; entry: LevelPoint; keep: LevelPoint; outposts: LevelPoint[]; river?: River };
/** The place of the level in the whole campaign, 0 to 29. */
export const levelOrder = (level: AmbushLevel) => level.zone * 3 + level.index;
/** Entry lanes: one, then two from the tenth level and three from the twenty-second. */
export const laneCount = (level: AmbushLevel) => (levelOrder(level) >= 21 ? 3 : levelOrder(level) >= 9 ? 2 : 1);
/** How often a level of the zone has a river across it. */
const RIVERS: Record<AreaId, number> = {
  moss: 0.6,
  desert: 0.25,
  ember: 0.2,
  drowned: 1,
  fungal: 0.5,
  frozen: 0.5,
  crystal: 0.4,
  obsidian: 0.3,
  astral: 0.35,
  nadir: 0.3,
};
type Snake = { left: number; right: number; band: number; entry: "top" | "left" | "right"; turns: number; first: number; last: number; diagonal: number };
/** A road winding down the board from its entry: runs across between `left` and `right`, each turn
 * dropping to the next row, now and then as one long diagonal. Ends at its last row. */
function snake(pick: (salt: number) => number, salt: number, s: Snake) {
  const rows = Array.from({ length: s.turns + 1 }, (_, i) => Math.round(s.first + ((s.last - s.first) * i) / s.turns));
  const at = (hi: boolean, n: number) => (hi ? s.right - Math.floor(pick(n) * s.band) : s.left + Math.floor(pick(n) * s.band));
  const points: LevelPoint[] = [];
  let hi: boolean;
  if (s.entry === "top") {
    hi = pick(salt) < 0.5;
    const x = at(hi, salt + 1);
    points.push({ x, y: 0 }, { x, y: rows[0] });
    hi = !hi;
  } else {
    hi = s.entry === "left";
    points.push({ x: s.entry === "left" ? 0 : CELLS_W - 1, y: rows[0] });
  }
  for (let i = 0; i <= s.turns; i++) {
    if (i > 0 && pick(salt + 30 + i) < s.diagonal) points.pop();
    const x = at(hi, salt + 10 + i);
    points.push({ x, y: rows[i] });
    if (i < s.turns) points.push({ x, y: rows[i + 1] });
    hi = !hi;
  }
  return points;
}
const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, gap: number) =>
  a.x - gap < b.x + b.w && b.x - gap < a.x + a.w && a.y - gap < b.y + b.h && b.y - gap < a.y + a.h;
/** The square of `size` cells round `p`, kept on the board as the battlefield keeps it. */
export const squareAt = (p: LevelPoint, size: number) => ({
  x: Math.max(0, Math.min(CELLS_W - size, Math.round(p.x - size / 2))),
  y: Math.max(1, Math.min(CELLS_H - size, Math.round(p.y - size / 2))),
  w: size,
  h: size,
});
function lanesFor(level: AmbushLevel, variant: number, river: boolean) {
  const pick = (salt: number) => hash01(level.seed, variant, salt),
    within = (salt: number, lo: number, hi: number) => lo + Math.floor(pick(salt) * (hi - lo + 1)),
    lanes = laneCount(level),
    order = levelOrder(level);
  const keep = { x: lanes > 1 ? within(1, 32, 40) : within(1, 18, 54), y: within(2, CELLS_H - 16, CELLS_H - 12) },
    last = keep.y - 10 - within(3, 4, 9),
    // Diagonals bend the roads, except where a river must be bridged straight across.
    diagonal = river ? 0 : 0.15 + order * 0.01;
  const sides = ["top", "left", "right"] as const;
  const finish = (points: LevelPoint[]) => {
    const end = points[points.length - 1],
      before = points[points.length - 2];
    // A last run across ends above the keep rather than overshooting it and doubling back.
    if (before && before.y === end.y && before.x !== end.x && points.length > 2) {
      if (before.x === keep.x) points.pop();
      else end.x = keep.x;
    } else if (end.x !== keep.x) points.push({ x: keep.x, y: end.y });
    points.push(keep);
    return points;
  };
  if (lanes === 1) {
    const entry = sides[within(4, 0, 2)],
      turns = Math.min(4, within(5, 2, 3) + (order >= 12 ? 1 : 0));
    const first = entry === "top" ? within(6, 10, 18) : within(6, 8, 16);
    return { keep, lanes: [finish(snake(pick, 100, { left: 8, right: CELLS_W - 9, band: 8, entry, turns, first, last, diagonal }))] };
  }
  // Two halves wind down either side and meet before the keep; a third lane runs straight down the middle.
  const half = CELLS_W / 2,
    turns = (n: number) => within(n, 2, 3);
  const west = snake(pick, 200, {
    left: 6,
    right: half - 7,
    band: 5,
    entry: pick(7) < 0.5 ? "top" : "left",
    turns: turns(8),
    first: within(9, 8, 16),
    last,
    diagonal,
  });
  const east = snake(pick, 300, {
    left: half + 6,
    right: CELLS_W - 7,
    band: 5,
    entry: pick(10) < 0.5 ? "top" : "right",
    turns: turns(11),
    first: within(12, 8, 16),
    last,
    diagonal,
  });
  const result = [finish(west), finish(east)];
  if (lanes === 3) {
    // The third comes straight down the middle, then turns aside to join one of the halves where it runs down
    // the board, sharing the rest of its way (straight on to the keep where neither has such a stretch).
    const x = within(13, half - 1, half + 1),
      side = result[pick(14) < 0.5 ? 0 : 1];
    const at = side.findIndex((b, k) => k > 0 && side[k - 1].x === b.x && side[k - 1].y >= 10 && b.y - side[k - 1].y >= 8);
    if (at > 0) {
      const y = Math.round((side[at - 1].y + side[at].y) / 2);
      result.push([{ x, y: 0 }, { x, y }, { x: side[at].x, y }, ...side.slice(at).map((p) => ({ ...p }))]);
    } else
      result.push(
        finish([
          { x, y: 0 },
          { x, y: last },
        ]),
      );
  }
  return { keep, lanes: result };
}
/** A river across the board, bridged wherever a lane crosses it: clear of the outposts, the castle,
 * the entries and every road running along it. */
function riverFor(level: AmbushLevel, lanes: LevelPoint[][], squares: { x: number; y: number; w: number; h: number }[]): River | undefined {
  for (let attempt = 0; attempt < 24; attempt++) {
    const start = 20 + Math.floor(hash01(level.seed, 0x52, attempt) * 46),
      top: number[] = [],
      depth: number[] = [];
    let off = 0;
    for (let x = 0; x < CELLS_W; x++) {
      if (x % 6 === 0) off = Math.max(-3, Math.min(3, off + (hash(level.seed, 0x53, x) % 3) - 1));
      top.push(start + off);
      depth.push(hash01(level.seed, 0x54, x >> 2) < 0.35 ? 4 : 3);
    }
    const wet = (x: number, y: number, gap: number) => x >= 0 && x < CELLS_W && y >= top[x] - gap && y < top[x] + depth[x] + gap;
    const clear =
      squares.every((r) => {
        for (let x = r.x; x < r.x + r.w; x++) if (wet(x, r.y, 2) || wet(x, r.y + r.h - 1, 2) || (r.y < top[x] && r.y + r.h > top[x])) return false;
        return true;
      }) &&
      lanes.every(
        (lane) =>
          !wet(Math.min(CELLS_W - 1, lane[0].x), lane[0].y, 3) &&
          lane.slice(1).every((b, i) => {
            const a = lane[i];
            // A diagonal may not cross the water: every bridge runs straight across it.
            if (a.x !== b.x && a.y !== b.y)
              return [a, b].every((p) => p.y < top[Math.min(CELLS_W - 1, p.x)] - 3) || [a, b].every((p) => p.y > top[Math.min(CELLS_W - 1, p.x)] + 6);
            if (a.y !== b.y) return true;
            for (let x = Math.min(a.x, b.x) - 1; x <= Math.max(a.x, b.x) + 1; x++) if (wet(x, a.y, 3)) return false;
            return true;
          }),
      );
    if (clear) return { top, depth };
  }
  return undefined;
}
/** Whether `lane` comes within `gap` cells of `square`. */
function passes(lane: LevelPoint[], square: { x: number; y: number; w: number; h: number }, gap: number) {
  for (let i = 1; i < lane.length; i++) {
    const a = lane[i - 1],
      b = lane[i],
      n = Math.max(1, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let t = 0; t <= n; t++) {
      const x = a.x + ((b.x - a.x) * t) / n,
        y = a.y + ((b.y - a.y) * t) / n;
      if (x > square.x - gap - 1 && x < square.x + square.w + gap && y > square.y - gap - 1 && y < square.y + square.h + gap) return true;
    }
  }
  return false;
}
export function trackFor(level: AmbushLevel): Track {
  const wet = hash01(level.seed, 0x51) < RIVERS[level.area];
  let made = lanesFor(level, 0, wet),
    outposts: LevelPoint[] = [];
  for (let variant = 0; variant < 24; variant++) {
    made = lanesFor(level, variant, wet);
    const [a, b] = made.lanes;
    outposts = b ? [pointAlong(a, 0.4), pointAlong(b, 0.4)] : [pointAlong(a, 1 / 3), pointAlong(a, 2 / 3)];
    const [p, q] = outposts.map((o) => squareAt(o, 16)),
      castle = squareAt(made.keep, 20);
    // Each outpost stands on its own lane alone, clear of the others' roads.
    const apart = !b || [p, q].every((square, k) => [a, b].every((lane, j) => j === k || !passes(lane, square, 2)));
    if (!overlaps(p, q, 2) && !overlaps(p, castle, 2) && !overlaps(q, castle, 2) && apart) break;
  }
  const { keep, lanes } = made,
    river = wet ? riverFor(level, lanes, [...outposts.map((o) => squareAt(o, 16)), squareAt(keep, 20)]) : undefined;
  return { lanes, points: lanes[0], entry: lanes[0][0], keep, outposts, ...(river ? { river } : {}) };
}
