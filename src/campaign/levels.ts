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
export function trackFor(level: AmbushLevel) {
  const pick = (salt: number, lo: number, hi: number) => lo + Math.floor(hash01(level.seed, salt) * (hi - lo + 1));
  const right = pick(1, 54, CELLS_W - 12),
    left = pick(2, 13, 19);
  const top = pick(3, 12, 17),
    middle = pick(4, 38, 44),
    bottom = pick(5, 65, 72);
  const keep = { x: pick(6, 50, 58), y: pick(7, CELLS_H - 16, CELLS_H - 12) };
  const points = [
    { x: 0, y: top },
    { x: right, y: top },
    { x: right, y: middle },
    { x: left, y: middle },
    { x: left, y: bottom },
    { x: keep.x, y: bottom },
    keep,
  ];
  return { points, entry: points[0], keep, outposts: [pointAlong(points, 1 / 3), pointAlong(points, 2 / 3)] };
}
