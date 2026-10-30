/** Small world sprites share one named source/outline path. Shadows and
 * trails are separate translucent layers and never grow silhouettes. */
import { ART } from "./art-scale.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";
import { pixels, sprite, drawSprite } from "./damage-art.ts";
export type SmallKind = "fireball" | "frostball" | "mine" | "smart-mine" | "nano-canister" | "wall-bolt";
const nameOf = (kind: SmallKind, pose: number) => ART_NAMES.projectile(kind, pose);
export function smallPixels(kind: SmallKind, pose = 0) {
  const w = kind === "wall-bolt" ? 25 : kind === "nano-canister" ? 5 : kind.endsWith("mine") ? 6 : 5,
    h = kind === "nano-canister" ? 7 : w;
  const data = new Uint32Array(w * h),
    p = pixels(data, w, h);
  if (kind === "wall-bolt") {
    const angle = ((pose % 16) / 16) * Math.PI * 2,
      dx = Math.cos(angle),
      dy = Math.sin(angle),
      burn = pose >= 16;
    for (let t = -9; t <= 4; t++)
      p.set(
        Math.round(12 + dx * t),
        Math.round(12 + dy * t),
        t >= 2 ? (burn ? (t >= 4 ? 0xffd36b : 0xf07a28) : 0x9a9aa2) : t <= -7 ? 0xd8cfb4 : 0xa07a48,
      );
  } else if (kind === "nano-canister") {
    for (let y = 1; y <= 5; y++)
      for (let x = 1; x <= 3; x++) p.set(x, y, y === 3 ? 0x8cffb4 : x === 1 ? 0xc4ccd8 : x === 3 ? 0x3a4250 : 0x7a8698);
  } else if (kind.endsWith("mine")) {
    const smart = kind === "smart-mine";
    for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) p.set(x, y, smart ? 0x8b9271 : 0x656c4a);
    p.set(2, 2, 0xc3c49a);
    p.set(3, 3, pose ? 0xdc6a35 : 0x67635d);
    if (smart) {
      p.set(0, 2 + (pose % 2), 0x151912);
      p.set(5, 3 - (pose % 2), 0x151912);
    }
  } else {
    const flame =
      kind === "frostball"
        ? [0x294966, 0x4e7fa2, 0x88c6e2, 0xc5ebf8, 0xf4fcff]
        : [0x7a1c10, 0xc8452a, 0xf08a34, 0xf6c75a, 0xfff4c8];
    for (let y = 1; y <= 3; y++)
      for (let x = 1; x <= 3; x++)
        p.set(
          x,
          y,
          x === 1 && y === 1 ? flame[4] : x <= 2 && y <= 2 ? flame[3] : x === 3 && y === 3 ? flame[1] : flame[2],
        );
  }
  return { w, h, data: sourcePixels(nameOf(kind, pose), w, h, () => data) };
}
export function drawSmall(
  c: CanvasRenderingContext2D,
  px: number,
  kind: SmallKind,
  pose: number,
  x: number,
  y: number,
  scale = 1,
) {
  const w = kind === "wall-bolt" ? 25 : kind === "nano-canister" ? 5 : kind.endsWith("mine") ? 6 : 5,
    h = kind === "nano-canister" ? 7 : w;
  const cv = sprite(`small:${kind}:${pose}`, w, h, () => smallPixels(kind, pose).data);
  const u = (px / ART) * scale;
  drawSprite(c, cv, x * px - (w * u) / 2, y * px - (h * u) / 2, w * u, h * u);
}
export function smallPieces(): ArtPiece[] {
  return (["fireball", "frostball", "mine", "smart-mine", "nano-canister", "wall-bolt"] as SmallKind[]).flatMap(
    (kind) =>
      Array.from({ length: kind === "wall-bolt" ? 32 : kind.endsWith("mine") ? 2 : 1 }, (_, pose) => {
        const p = smallPixels(kind, pose);
        return {
          name: nameOf(kind, pose),
          w: p.w,
          h: p.h,
          about: `${kind}, pose ${pose}`,
          pixels: () => smallPixels(kind, pose).data,
        };
      }),
  );
}
