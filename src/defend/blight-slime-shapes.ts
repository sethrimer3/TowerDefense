/** The Blight Slime's pixels: the Blight Essence glob (`currency-icons.ts`)
 * on a flattened foot, squashed or stretched by level, its edge wobbling
 * through a loop of Perlin frames. Outline-free; presentation only. */
import { rgba } from "./damage-art.ts";
import { slimeScale } from "./blight-slime.ts";
import { perlin } from "../ui/currency-icons.ts";

/** Essence's colours: body, deep edge, sheen and glint. */
const BODY = rgba(0x050407), DEEP = rgba(0x120c18), SHEEN = rgba(0x2c2238), GLINT = rgba(0x7a6a8c);
/** Wobble frames in one loop, and frames a second. */
export const SLIME_WOBBLES = 8;
/** How far the noise pushes the edge, in body radii, and its grain. */
const WOBBLE = { amount: 0.16, scale: 1.3, loop: 0.55 };

/** The sprite box: room to flatten sideways and stretch upward. */
export const slimeBox = (w: number) => w * 2;

/** The slime's pixels in an `n`-square box (`slimeBox(w)` by default), its
 * foot on the row `base` (the box's middle plus half a body). `level` is a
 * squash level, `frame` a wobble frame. */
export function slimePixels(w: number, level = 0, frame = 0, n = slimeBox(w), base = Math.floor(n / 2 + w / 2)): Uint32Array {
  const out = new Uint32Array(n * n);
  const { sx, sy } = slimeScale(level), r = w / 2;
  const cx = n / 2, cy = base - r * sy;
  const a = frame / SLIME_WOBBLES * Math.PI * 2;
  const ox = Math.cos(a) * WOBBLE.loop, oy = Math.sin(a) * WOBBLE.loop;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (y >= base) continue;
    const dx = (x + .5 - cx) / sx, dy = (y + .5 - cy) / sy, d = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    // The foot spreads: below the middle the body widens toward the ground.
    const foot = dy > 0 ? 1 + .18 * (dy / r) : 1;
    const reach = r * foot * (1 + WOBBLE.amount * perlin(Math.cos(angle) * WOBBLE.scale + ox + 4.7, Math.sin(angle) * WOBBLE.scale + oy + 9.2, 0) * (dy > 0 ? .4 : 1));
    if (d > reach) continue;
    const lit = (-dx - dy) / (Math.SQRT2 * Math.max(reach, 1));
    const rim = d > reach - 1.4;
    out[y * n + x] = lit > .7 && rim ? GLINT : lit > .42 && rim ? SHEEN : d > reach - .9 ? DEEP : BODY;
  }
  return out;
}

/** The resting body in a `w`-square box, for the replaceable body source. */
export const slimeBodyPixels = (w: number) => slimePixels(w, 0, 0, w, w);

