import { DIVISION_DPS } from "./siege-division-dps.ts";
import { rating, MIN_MMR } from "./siege-rating.ts";
import { GM_ANCHOR } from "./siege-ranks.ts";
/** Linear interpolation between generated geometric anchors is deterministic
 * across engines. Bronze IV starts at the reachable minimum of 100. */
export function dpsForMmr(value: number) {
  const mmr = rating(value);
  if (mmr >= GM_ANCHOR) return DIVISION_DPS[34];
  const tier = Math.max(1, Math.floor(mmr / 80)),
    floor = tier === 1 ? MIN_MMR : tier * 80,
    next = (tier + 1) * 80;
  // Ultimates open at Master. Interpolating their budget into Diamond I
  // would request castles that cannot fit under the pre-ultimate rules.
  if (tier === 24) return DIVISION_DPS[tier];
  return DIVISION_DPS[tier] + ((DIVISION_DPS[tier + 1] - DIVISION_DPS[tier]) * (mmr - floor)) / (next - floor);
}
