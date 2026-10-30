import type { EnemyKind } from "./catalog.ts";

/** Source silhouette on the native art lattice; upper point faces forward.
 * A shallow rear notch makes the small kind read as a paper airplane. */
export function blightFlierPixels(kind: EnemyKind, w: number): Uint32Array {
  const data = new Uint32Array(w * w), h = Math.sqrt(3) / 2, top = .5 - h / 2;
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const dx = Math.abs((x + .5) / w - .5), down = (y + .5) / w - top;
    if (down < 0 || down > h || dx > down / (2 * h)) continue;
    if (kind === "blightDart" && down > h * .68 + dx * .64) continue;
    data[y * w + x] = 0xff000000;
  }
  return data;
}
