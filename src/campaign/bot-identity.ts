import { PALETTE, PATTERNS, OPACITIES, type Flag } from "../profile/model.ts";
import { identityHash } from "./bot-names.ts";
const luma = PALETTE.map((c) => {
  const n = parseInt(c.hex.slice(1), 16);
  return Math.round(((n >>> 16) * 299 + ((n >>> 8) & 255) * 587 + (n & 255) * 114) / 1000);
});
export const flagContrast = (a: number, b: number) => Math.abs(luma[a] - luma[b]);
export function botFlag(seed: number): Flag {
  seed >>>= 0;
  const base = identityHash(seed, 11) % PALETTE.length,
    layers: Flag["layers"] = [];
  let previous = base;
  const count = identityHash(seed, 12) % 5;
  for (let i = 0; i < count; i++) {
    const colors = PALETTE.map((_, n) => n).filter((n) => flagContrast(n, previous) >= 85);
    const color = colors[identityHash(seed, 13 + i * 3) % colors.length];
    layers.push({
      pattern: PATTERNS[identityHash(seed, 14 + i * 3) % PATTERNS.length],
      color,
      opacity: i === 0 ? 100 : OPACITIES[identityHash(seed, 15 + i * 3) % OPACITIES.length],
    });
    previous = color;
  }
  return { base, layers };
}
