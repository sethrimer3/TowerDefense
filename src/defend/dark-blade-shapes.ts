/** Pixel masks for the Dark Blade, sampled on the art lattice at each of
 * `DARK_BLADE_FACINGS` facings so a turning knight steps through crisp
 * silhouettes: a black pentagon body with one point forward, a black cloak
 * flaring out behind it threaded with faint burning lines, and an orange and
 * black greatsword. Body-space coordinates run from the box centre in body
 * pixels, forward up (−y). Outline-free: the shared portal contour draws the
 * rim. Presentation only. */
import { rgba } from "./damage-art.ts";

export const DARK_BLADE_FACINGS = 64;
/** Cloak sway frames. */
export const DARK_BLADE_SWAYS = 4;
const BLACK = 0xff000000;
const EMBER = [rgba(0x5c2209), rgba(0x9a3d0f), rgba(0xd8661c)] as const;
const STEEL = rgba(0x15100e), EDGE = rgba(0xf08a2a), CORE = rgba(0x8a3210), GUARD = rgba(0xffb347);

const PENTAGON_APOTHEM = Math.cos(Math.PI / 5);

/** Inside a regular pentagon of circumradius `r` with a vertex at −y. */
export function inPentagon(x: number, y: number, r: number) {
  const a = r * PENTAGON_APOTHEM;
  for (let k = 0; k < 5; k++) {
    // Edge midpoints sit 36° either side of each vertex.
    const angle = -Math.PI / 2 + Math.PI / 5 + k * 2 * Math.PI / 5;
    if (x * Math.cos(angle) + y * Math.sin(angle) > a) return false;
  }
  return true;
}

/** The cloak hem, as body-space depth behind the centre, for a sway phase. */
const hem = (w: number, x: number, sway: number) =>
  w * (.74 + .06 * Math.sin(x / w * 9 + sway * Math.PI * 2 / DARK_BLADE_SWAYS) + .04 * Math.sin(x / w * 23 - sway * 1.7));

/** The colour at a body-space point, or 0 where nothing is. */
function bodyAt(w: number, x: number, y: number, sway: number) {
  if (inPentagon(x, y, w / 2)) {
    // A faint burning rim along the two front edges, so the pentagon's
    // point reads against the cloak.
    if (y < 0 && !inPentagon(x * 1.22, (y + w * .06) * 1.22, w / 2)) return EMBER[0];
    return BLACK;
  }
  // The cloak hangs from the shoulders and flares toward a rippling hem.
  if (y < w * .05) return 0;
  const depth = y / w, half = w * (.3 + .12 * Math.min(1, depth / .75));
  if (Math.abs(x) > half || y > hem(w, x, sway)) return 0;
  // Faint burning threads run down the cloak, wavering with the sway.
  for (const [n, at] of [[0, -.2], [1, 0], [2, .2]] as const) {
    const lx = w * at * (1 + depth * .5) + Math.sin(depth * 8 + n * 2.1 + sway * Math.PI / 2) * w * .03;
    if (Math.abs(x - lx) < .5 && y > w * .18 && y < hem(w, x, sway) - .6) return EMBER[n === 1 ? (depth > .5 ? 2 : 1) : 0];
  }
  return BLACK;
}

/** Side of the square lattice the knight and its cloak need to turn in
 * place, the same parity as `w` so facing 0 centres exactly. */
export function darkBladeBox(w: number) { return w + 2 * Math.ceil(w * .62); }

/** The knight turned clockwise by `angle` (radians) on an `m`-pixel lattice. */
export function darkBladeTurned(w: number, angle: number, sway = 0, m = darkBladeBox(w)): Uint32Array {
  const data = new Uint32Array(m * m), cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const sx = x + .5 - m / 2, sy = y + .5 - m / 2;
    data[y * m + x] = bodyAt(w, cos * sx + sin * sy, -sin * sx + cos * sy, sway);
  }
  return data;
}

/** The pentagon body alone, upright on a `w`-pixel lattice: the replaceable
 * source for exports and artist PNGs. */
export function darkBladeBodyPixels(w: number): Uint32Array {
  const data = new Uint32Array(w * w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (inPentagon(x + .5 - w / 2, y + .5 - w / 2, w / 2)) data[y * w + x] = BLACK;
  return data;
}

/** Greatsword length in body pixels for a `w`-pixel knight. */
export const greatswordLength = (w: number) => Math.round(w * 1.25);
export const greatswordBox = (w: number) => 2 * (greatswordLength(w) + 2);

/** The greatsword pointing along `angle` (clockwise from up) from the box
 * centre, its grip: a black blade with a burning core and orange edges, and
 * an orange crossguard. */
export function greatswordTurned(w: number, angle: number): Uint32Array {
  const len = greatswordLength(w), m = greatswordBox(w), data = new Uint32Array(m * m);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
    const sx = x + .5 - m / 2, sy = y + .5 - m / 2;
    // Along the blade (a) and across it (b).
    const a = sx * sin - sy * cos, b = sx * cos + sy * sin, ab = Math.abs(b);
    let c = 0;
    if (a >= -1.6 && a < .4 && ab < .7) c = STEEL;                    // grip
    else if (a >= .4 && a < 1.4 && ab < 2.2) c = ab > 1.4 ? GUARD : EDGE; // crossguard
    else if (a >= 1.4 && a < len) {
      const width = 1.35 * Math.min(1, (len - a) / 2.6);              // tapering point
      if (ab < width) c = ab < .45 && a < len - 2 ? CORE : ab > width - .6 ? EDGE : STEEL;
    }
    data[y * m + x] = c;
  }
  return data;
}
