/**
 * The wax seal over every dialog, as pixel art: a red blob with a wavy rim,
 * lit from the upper left, a ring pressed into it and the keep stamped in
 * its middle. The art has no outline of its own; `sealPixels` rings it with
 * one dark pixel afterwards, as the game outlines its sprites. `installSeal`
 * hands it to the CSS as `--seal-art` (theme.css shows it unless Show legacy
 * graphics brings back the old smooth seal.svg).
 */

/** The wax's art pixels across, before the outline. */
export const SEAL = 24;
/** Dark to light. */
const WAX = [0x3e0a09, 0x5c1210, 0x7e1b18, 0xa02a22, 0xc03c30, 0xd85a48, 0xec8a72];
const RIM = 0x250504;
/** The keep pressed into the wax: two crenellated towers, the wall between, the gate. */
const KEEP = [
  "X.X...X.X",
  "XXX...XXX",
  "XXXXXXXXX",
  "XXXXXXXXX",
  "XXXX.XXXX",
  "XXX...XXX",
  "XXX...XXX",
];

/** RGB colours (or -1, clear) in rows of `SEAL + 2`, the outline included. */
export function sealPixels(): number[] {
  const n = SEAL + 2, c = (SEAL - 1) / 2, out: number[] = new Array(n * n).fill(-1);
  const inWax = (x: number, y: number) => {
    const dx = x - c, dy = y - c;
    return Math.hypot(dx, dy) <= 10.4 + 0.9 * Math.cos(8 * Math.atan2(dy, dx) + 0.4);
  };
  const kx = Math.round(c - (KEEP[0].length - 1) / 2), ky = Math.round(c - (KEEP.length - 1) / 2) + 1;
  const keep = (x: number, y: number) => KEEP[y - ky]?.[x - kx] === "X";
  for (let y = 0; y < SEAL; y++)
    for (let x = 0; x < SEAL; x++) {
      if (!inWax(x, y)) continue;
      const dx = x - c, dy = y - c, r = Math.hypot(dx, dy);
      const light = (-dx - dy) / (r * Math.SQRT2 || 1) * Math.min(1, r / 6);
      // Raised wax lit from the upper left, its edge rolling away; the
      // middle inside the ring pressed in, so lit the other way.
      let v = r < 6.6 ? 0.6 - 0.1 * light * (r / 6.6) : 0.5 + 0.38 * light - 0.3 * Math.max(0, r - 8.5) / 2;
      if (r >= 6.6 && r < 7.5) v -= 0.22;
      else if (r >= 7.5 && r < 8.3 && light > 0.2) v += 0.14;
      const band = v * (WAX.length - 1), lo = Math.floor(band);
      let tone = Math.max(0, Math.min(WAX.length - 1, lo + (band - lo > ((x + y) % 2 ? 0.65 : 0.35) ? 1 : 0)));
      // The keep in the darkest wax; its windows and gate are the wax itself.
      if (keep(x, y)) tone = 0;
      out[(y + 1) * n + x + 1] = WAX[tone];
    }
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if (out[y * n + x] >= 0 && out[y * n + x] !== RIM) continue;
      const near = (ax: number, ay: number) => ax >= 0 && ay >= 0 && ax < n && ay < n && out[ay * n + ax] >= 0 && out[ay * n + ax] !== RIM;
      if (near(x - 1, y) || near(x + 1, y) || near(x, y - 1) || near(x, y + 1)) out[y * n + x] = RIM;
    }
  return out;
}

/** Puts the seal in `--seal-art` on the root, once. */
export function installSeal() {
  if (typeof document === "undefined" || document.documentElement.style.getPropertyValue("--seal-art")) return;
  const px = sealPixels(), n = SEAL + 2, cv = document.createElement("canvas");
  cv.width = cv.height = n;
  const c = cv.getContext("2d")!, img = c.createImageData(n, n);
  px.forEach((rgb, i) => {
    if (rgb < 0) return;
    img.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], i * 4);
  });
  c.putImageData(img, 0, 0);
  document.documentElement.style.setProperty("--seal-art", `url("${cv.toDataURL()}")`);
}
