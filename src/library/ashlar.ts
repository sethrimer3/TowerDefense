/** The Library's dressed stone, shared by the nave's back wall, the
 * hallways and the alchemy lab: courses of ashlar blocks (bigger on piers
 * and pilasters), each block its own shade, with a height for the bump
 * lighting that makes each block's face catch the light on the side toward
 * it. */

type RGB = [number, number, number];

/** A fixed number in [0, 1) for a few integers. */
export function h01(a: number, b: number, c = 0) {
  let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The stone at world pixel (x, y): its colour and its height (0 in the
 * joints, rising to 1 across a block's face). `pier` lays the bigger blocks
 * of a pier. */
export function ashlar(x: number, y: number, pier: boolean): { rgb: RGB; hgt: number } {
  const ch = pier ? 12 : 9, bw = pier ? 16 : 18;
  const course = Math.floor(y / ch), off = mod(course, 2) ? bw / 2 : 0;
  const bx = Math.floor((x + off) / bw), lx = mod(x + off, bw), ly = mod(y, ch);
  const edge = Math.min(lx, bw - 1 - lx, ly, ch - 1 - ly);
  const t = (pier ? 0.95 : 0.82) * (0.82 + h01(bx, course, 9) * 0.3) * (0.93 + h01(x, y, 1) * 0.12);
  if (edge === 0) return { rgb: [30, 27, 26], hgt: 0 };
  return { rgb: [92 * t, 86 * t, 80 * t], hgt: Math.min(1, edge / 2.2) * (0.85 + h01(x, y, 2) * 0.15) };
}

/** How much more (or less) light a bump-mapped pixel with slope (sx, sy)
 * takes from a light (dx, dy) away from it at distance d: the face toward
 * the light brightens, the face away darkens. */
export const facing = (sx: number, sy: number, dx: number, dy: number, d: number) => (d > 0.5 ? Math.max(0.15, 1 + 2.6 * ((sx * dx + sy * dy) / d)) : 1);
