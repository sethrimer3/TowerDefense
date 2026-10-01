/** Light sources and their sight lines, kept from the dungeon lighting for
 * Defend and future use: a torch's light as it is placed, the tile-grid
 * visibility polygon its light fills, and the point-in-polygon test the
 * baked glow uses. World y grows up; tiles are 1 × 1. */

export type Point = { x: number; y: number };

/** A torch (or any flame) on the tile grid. `visibilityPolygon` is worked
 * out once with `computeVisibilityPolygon` and cached on it. */
export type Torch = { x: number; y: number; lightRadius: number; intensity: number; visibilityPolygon: Point[] };

/** A torch's light as it is placed. */
export const TORCH_LIGHT = {
  radius: 5.5, // Light reach in tiles (direct light; bounce light fades within it too)
  intensity: 0.7,
};

/** Even-odd point-in-polygon test against a torch's cached visibility polygon. */
export function insidePolygon(px: number, py: number, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Tile-grid visibility-polygon computation for torch light. Walls block
 * light; the result is cached on the torch (see placeTorches) and only
 * recomputed when the torch or nearby geometry changes, never per frame. */
type Segment = [Point, Point];
/** A ray from (ox, oy) along the unit direction (dx, dy). */
type Ray = { ox: number; oy: number; dx: number; dy: number };
/** Whether a hit at `u` along a segment (0 at one end, 1 at the other) lands on it. */
const onSegment = (u: number) => u >= -1e-6 && u <= 1 + 1e-6;
/** How far along the ray it meets the segment, or null when it misses. */
function rayHit({ ox, oy, dx, dy }: Ray, [a, b]: Segment): number | null {
  const sx = b.x - a.x,
    sy = b.y - a.y;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((a.x - ox) * sy - (a.y - oy) * sx) / denom;
  const u = ((a.x - ox) * dy - (a.y - oy) * dx) / denom;
  return t >= 0 && onSegment(u) ? t : null;
}
/** The faces of wall tile (tx, ty) that border an open tile, north, south,
 * east, then west. */
function openFaces(tx: number, ty: number, isWall: (x: number, y: number) => boolean): Segment[] {
  const l = tx,
    r = tx + 1,
    b = ty,
    t = ty + 1;
  const faces: [number, number, Segment][] = [
    [0, 1, [{ x: l, y: t }, { x: r, y: t }]],
    [0, -1, [{ x: l, y: b }, { x: r, y: b }]],
    [1, 0, [{ x: r, y: b }, { x: r, y: t }]],
    [-1, 0, [{ x: l, y: b }, { x: l, y: t }]],
  ];
  return faces.filter(([dx, dy]) => !isWall(tx + dx, ty + dy)).map(([, , face]) => face);
}
/** Builds the segments of every wall tile face that borders an open tile
 * within range of the torch (interior wall faces can never be seen, so
 * they're skipped to keep the segment list small). */
function collectSegments(
  ox: number,
  oy: number,
  reach: number,
  isWall: (x: number, y: number) => boolean,
): Segment[] {
  const segments: Segment[] = [];
  for (let ty = Math.floor(oy - reach); ty <= Math.ceil(oy + reach); ty++)
    for (let tx = Math.floor(ox - reach); tx <= Math.ceil(ox + reach); tx++)
      if (isWall(tx, ty)) segments.push(...openFaces(tx, ty, isWall));
  return segments;
}
export function computeVisibilityPolygon(
  torch: Pick<Torch, "x" | "y" | "lightRadius">,
  isWall: (x: number, y: number) => boolean,
): Point[] {
  const ox = torch.x + 0.5,
    oy = torch.y + 0.5,
    r = torch.lightRadius;
  const segments = collectSegments(ox, oy, r + 1, isWall);
  const angles = new Set<number>();
  const eps = 1e-4;
  for (const [a, b] of segments)
    for (const p of [a, b]) {
      const ang = Math.atan2(p.y - oy, p.x - ox);
      angles.add(ang);
      angles.add(ang + eps);
      angles.add(ang - eps);
    }
  const rays = 40;
  for (let i = 0; i < rays; i++) angles.add((i / rays) * Math.PI * 2 - Math.PI);
  const castRay = (ang: number): Point => {
    const ray = { ox, oy, dx: Math.cos(ang), dy: Math.sin(ang) };
    let best = r;
    for (const segment of segments) best = Math.min(best, rayHit(ray, segment) ?? best);
    return { x: ox + ray.dx * best, y: oy + ray.dy * best };
  };
  return [...angles].sort((a, b) => a - b).map(castRay);
}
