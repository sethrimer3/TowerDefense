/** The Ambush world map's layout: the zones laid end to end along the journey, each holding its own
 * levels, and the winding dotted way from one level to the next. Built from the level list alone, so
 * zones can be reordered, added or taken out without touching the map. Pure: no DOM. */
import { AREAS, type AreaId } from "../defend/areas.ts";
import { hash01 } from "../defend/grid.ts";
import { dist } from "../exact.ts";
import { AMBUSH_LEVELS, levelUnlocked, type AmbushLevel, type AmbushProgress, type LevelPoint } from "./levels.ts";

/** A zone on the map: its area and the campaign indices of its levels, in order. */
export type MapZone = { area: AreaId; name: string; color: string; dark: string; levels: number[] };
/** "y": the journey climbs the page from the bottom (tall windows); "x": it runs left to right (wide ones). */
export type Axis = "x" | "y";
export type MapNode = { level: number; zone: number; x: number; y: number };
export type PlacedZone = MapZone & { from: number; to: number };
export type WorldLayout = {
  axis: Axis;
  /** Size in art pixels. */
  w: number;
  h: number;
  /** Art pixels across the journey, and along it. */
  across: number;
  length: number;
  zoneLen: number;
  margin: number;
  zones: PlacedZone[];
  nodes: MapNode[];
  /** `paths[i]` runs from `nodes[i]` to `nodes[i + 1]`, a point about every art pixel. */
  paths: LevelPoint[][];
};

/** Consecutive levels of one area make a zone, in campaign order. */
export function mapZones(levels: readonly AmbushLevel[] = AMBUSH_LEVELS): MapZone[] {
  const zones: MapZone[] = [];
  levels.forEach((level, i) => {
    const last = zones[zones.length - 1];
    if (last?.area === level.area) last.levels.push(i);
    else {
      const area = AREAS.find((a) => a.id === level.area);
      zones.push({ area: level.area, name: area?.name ?? level.area, color: area?.color ?? "#c8b48a", dark: area?.dark ?? "#3a2c1c", levels: [i] });
    }
  });
  return zones;
}

/** Map coordinates (along the journey, across it) to the sheet's art pixels. */
export const toSheet = (axis: Axis, length: number, along: number, cross: number): LevelPoint =>
  axis === "y" ? { x: cross, y: length - 1 - along } : { x: along, y: cross };

const SEED = 0x3a9e11;

export function worldLayout(zones: readonly MapZone[], axis: Axis, across: number, zoneLen: number): WorldLayout {
  const margin = Math.round(zoneLen * 0.12),
    length = margin * 2 + zones.length * zoneLen,
    placed = zones.map((z, k) => ({ ...z, from: margin + k * zoneLen, to: margin + (k + 1) * zoneLen })),
    nodes: MapNode[] = [];
  let step = 0;
  placed.forEach((zone, k) => {
    const n = zone.levels.length;
    zone.levels.forEach((level, j) => {
      // A gentle snake from side to side, a little different at every step.
      const phase = step * 2.15 + (hash01(SEED, step, 1) - 0.5) * 0.9;
      const cross = Math.round(across * Math.max(0.22, Math.min(0.78, 0.5 + 0.3 * Math.sin(phase))));
      const along = Math.round(zone.from + (zoneLen * (j + 0.5)) / n + (hash01(SEED, step, 2) - 0.5) * zoneLen * 0.08);
      nodes.push({ level, zone: k, ...toSheet(axis, length, along, cross) });
      step++;
    });
  });
  const paths = nodes.slice(1).map((b, i) => curve(nodes[i], b, i));
  return { axis, w: axis === "y" ? across : length, h: axis === "y" ? length : across, across, length, zoneLen, margin, zones: placed, nodes, paths };
}

/** A bowed quadratic from `a` to `b`, sampled about once an art pixel. */
function curve(a: LevelPoint, b: LevelPoint, i: number): LevelPoint[] {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    d = dist(dx, dy) || 1,
    bow = (hash01(SEED, i, 3) - 0.5) * 0.7 * d;
  const c = { x: (a.x + b.x) / 2 - (dy / d) * bow, y: (a.y + b.y) / 2 + (dx / d) * bow };
  const n = Math.max(2, Math.ceil(d * 1.4)),
    out: LevelPoint[] = [];
  for (let s = 0; s <= n; s++) {
    const t = s / n,
      u = 1 - t;
    out.push({ x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y });
  }
  return out;
}

/** Points every `gap` art pixels along a path, leaving `skip` clear at either end (under the markers). */
export function dots(path: readonly LevelPoint[], gap: number, skip: number): LevelPoint[] {
  const out: LevelPoint[] = [];
  let total = 0;
  const lengths = path.slice(1).map((p, i) => dist(p.x - path[i].x, p.y - path[i].y));
  const full = lengths.reduce((a, b) => a + b, 0);
  let next = skip;
  for (let i = 0; i < lengths.length; i++) {
    while (next <= total + lengths[i] && next <= full - skip) {
      const t = lengths[i] ? (next - total) / lengths[i] : 0;
      out.push({ x: Math.round(path[i].x + (path[i + 1].x - path[i].x) * t), y: Math.round(path[i].y + (path[i + 1].y - path[i].y) * t) });
      next += gap;
    }
    total += lengths[i];
  }
  return out;
}

/** Levels shown on the map: the first, and each one the level before has earned a star on (or that has its own). */
export const visibleLevels = (progress: AmbushProgress, count = AMBUSH_LEVELS.length) =>
  Array.from({ length: count }, (_, i) => i).filter((i) => levelUnlocked(progress, i));
/** The dotted way from level `i` to the next shows once level `i` has at least one star. */
export const pathShown = (progress: AmbushProgress, i: number) => i + 1 < AMBUSH_LEVELS.length && (progress.stars[AMBUSH_LEVELS[i].id] ?? 0) > 0;
