import type { EnemyKind } from "./catalog.ts";

/** Facings a flying Blight body is drawn at: each one its own pixel mask, so
 * a turning flier steps through crisp silhouettes instead of a rotated,
 * anti-aliased polygon. */
export const BLIGHT_FLIER_FACINGS = 64;

/** Whether a point (in body pixels, from the box centre, upper point forward)
 * is inside the body. A shallow rear notch makes the dart a paper airplane. */
function inside(kind: EnemyKind, w: number, x: number, y: number) {
  const h = Math.sqrt(3) / 2, dx = Math.abs(x / w), down = y / w + h / 2;
  if (down < 0 || down > h || dx > down / (2 * h)) return false;
  return !(kind === "blightDart" && down > h * .68 + dx * .64);
}

/** Side of the square lattice a `w`-pixel body needs to turn in place. The
 * margin keeps the same parity, so facing 0 is exactly the upright source. */
export function blightFlierBox(w: number) { return w + 2 * Math.ceil(w * .162 + .01); }

/** Source silhouette on the native art lattice; upper point faces forward. */
export function blightFlierPixels(kind: EnemyKind, w: number): Uint32Array {
  return blightFlierTurned(kind, w, 0, w);
}

/** The body turned by `angle` (clockwise, radians), sampled at each pixel's
 * centre on an `m`-pixel lattice centred on the body. */
export function blightFlierTurned(kind: EnemyKind, w: number, angle: number, m = blightFlierBox(w)): Uint32Array {
  const data = new Uint32Array(m * m), cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const sx = x + .5 - m / 2, sy = y + .5 - m / 2;
    if (inside(kind, w, cos * sx + sin * sy, -sin * sx + cos * sy)) data[y * m + x] = 0xff000000;
  }
  return data;
}

/** Pixels of a triangle's outline, `line` pixels thick, on a lattice whose
 * origin is the triangle's centre: [x, y] cell indices, cell `x` spanning
 * x..x+1. `radius` is the centre-to-vertex distance, in cells. */
export function triangleOutlineCells(radius: number, angle: number, line = 1): [number, number][] {
  const cells: [number, number][] = [], inner = radius / 2, reach = Math.ceil(radius + line);
  for (let y = -reach; y < reach; y++) for (let x = -reach; x < reach; x++) {
    const px = x + .5, py = y + .5;
    // Distance inside each edge; the edges' normals point at 30°, 150°, 270°
    // from the first vertex's direction.
    let least = Infinity;
    for (let n = 0; n < 3; n++) {
      const a = angle + Math.PI / 2 + n * Math.PI * 2 / 3;
      least = Math.min(least, inner - (px * Math.cos(a) + py * Math.sin(a)));
    }
    if (least >= 0 && least < line) cells.push([x, y]);
  }
  return cells;
}
