/** Source sprites for wall pikes, thrown knives and siege ammunition. */
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { pixels, sprite, drawSprite } from "./damage-art.ts";
import type { Side } from "./layout.ts";
const OUT: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export function pikePixels(side: Side, len: number) {
  const [dx, dy] = OUT[side],
    w = dx ? len + 2 : 1,
    h = dy ? len + 2 : 1,
    data = new Uint32Array(w * h),
    p = pixels(data, w, h);
  for (let a = 0; a < len + 2; a++)
    p.set(
      dx ? (dx > 0 ? a : len + 1 - a) : 0,
      dy ? (dy > 0 ? a : len + 1 - a) : 0,
      a >= len - 1 ? 0xcfcfd6 : a % 3 === 0 ? 0x4a4a52 : 0x7a7a84,
    );
  return { w, h, data: sourcePixels(ART_NAMES.spike(`spring-${side}`, len), w, h, () => data) };
}
export function drawPike(c: CanvasRenderingContext2D, px: number, side: Side, len: number, x: number, y: number) {
  const [dx, dy] = OUT[side],
    w = dx ? len + 2 : 1,
    h = dy ? len + 2 : 1;
  const cv = sprite(`spring-pike:${side}:${len}`, w, h, () => pikePixels(side, len).data);
  drawSprite(
    c,
    cv,
    (x + Math.min(0, dx * (len + 1)) / ART) * px,
    (y + Math.min(0, dy * (len + 1)) / ART) * px,
    (w * px) / ART,
    (h * px) / ART,
  );
}
export function knifePixels(dir: number) {
  const n = 9,
    m = 4,
    data = new Uint32Array(n * n),
    p = pixels(data, n, n),
    a = (dir / 16) * Math.PI * 2,
    ux = Math.cos(a),
    uy = Math.sin(a);
  for (const [t, color] of [
    [-1, 0x4a5266],
    [0, 0xc9d2e0],
    [1, 0xffffff],
    [2, 0xffffff],
  ])
    p.set(Math.round(m + ux * t), Math.round(m + uy * t), color);
  return sourcePixels(ART_NAMES.projectile("shade-knife", dir), n, n, () => data);
}
export function drawKnife(
  c: CanvasRenderingContext2D,
  px: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  outlined = false,
) {
  const dir = ((Math.round((Math.atan2(dy, dx) / Math.PI / 2) * 16) % 16) + 16) % 16;
  drawSprite(
    c,
    sprite(`knife:${dir}`, 9, 9, () => knifePixels(dir), outlined ? {} : false),
    (x - 4 / ART) * px,
    (y - 4 / ART) * px,
    (9 * px) / ART,
    (9 * px) / ART,
  );
}
export type Ammo = "stone" | "ball" | "rocket" | "bolt";
export function ammoPixels(kind: Ammo, pose: number) {
  const n = 7,
    data = new Uint32Array(n * n),
    p = pixels(data, n, n);
  const width = kind === "stone" ? 3 : kind === "ball" ? (pose ? 3 : 2) : kind === "rocket" ? 2 : 1,
    off = Math.floor((n - width) / 2);
  const colors =
    kind === "stone"
      ? [0x9a9385, 0xd2ccbd, 0x605a50]
      : kind === "rocket"
        ? [
            [0xff6a5a, 0xc8372d],
            [0xffe07a, 0xe0a020],
            [0x7fd0ff, 0x3a78d8],
            [0x9cf07a, 0x3c9e3a],
            [0xf59cff, 0xa24ad0],
            [0xffffff, 0xc9d2ff],
          ][pose % 6]
        : [0x363a43, 0xa3a9b3, 0x363a43];
  if (kind === "bolt") {
    const a = (pose / 16) * Math.PI * 2;
    for (let i = 0; i < 5; i++)
      p.set(
        Math.round(3 - Math.cos(a) * i),
        Math.round(3 - Math.sin(a) * i),
        i === 0 ? 0xa3a9b3 : i > 3 ? 0xe2d3a8 : 0xc48a52,
      );
  } else {
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) p.set(off + x, off + y, colors[0]);
    p.set(off, off, colors[1]);
    if (kind === "stone") p.set(off + 2, off + 2, colors[2]);
  }
  return sourcePixels(ART_NAMES.projectile(`siege-${kind}`, pose), n, n, () => data);
}
export function drawAmmo(c: CanvasRenderingContext2D, px: number, kind: Ammo, pose: number, x: number, y: number) {
  drawSprite(
    c,
    sprite(`siege-ammo:${kind}:${pose}`, 7, 7, () => ammoPixels(kind, pose)),
    (x - 3.5 / ART) * px,
    (y - 3.5 / ART) * px,
    (7 * px) / ART,
    (7 * px) / ART,
  );
}
export function weaponPieces(): ArtPiece[] {
  const out: ArtPiece[] = [];
  for (const side of ["n", "e", "s", "w"] as Side[])
    for (let len = 1; len <= 64; len++) {
      const p = pikePixels(side, len);
      out.push({
        name: ART_NAMES.spike(`spring-${side}`, len),
        w: p.w,
        h: p.h,
        about: `Spring pike, ${side}, length ${len}`,
        pixels: () => pikePixels(side, len).data,
      });
    }
  for (let dir = 0; dir < 16; dir++)
    out.push({
      name: ART_NAMES.projectile("shade-knife", dir),
      w: 9,
      h: 9,
      about: `Shade knife, heading ${dir}`,
      pixels: () => knifePixels(dir),
    });
  for (const kind of ["stone", "ball", "rocket", "bolt"] as Ammo[])
    for (let pose = 0; pose < (kind === "bolt" ? 16 : kind === "rocket" ? 6 : kind === "ball" ? 2 : 1); pose++)
      out.push({
        name: ART_NAMES.projectile(`siege-${kind}`, pose),
        w: 7,
        h: 7,
        about: `Siege ${kind}, pose ${pose}`,
        pixels: () => ammoPixels(kind, pose),
      });
  return out;
}
