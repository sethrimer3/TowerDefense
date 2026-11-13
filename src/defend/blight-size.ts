/** Blight monsters (every Darkling, the three Blight Worms and the flying
 * Blight) are drawn one art pixel wider and taller than their bodies, so a
 * one-pixel Mini Darkling shows as two by two and a Blight Dart as seven
 * pixels across. Presentation only: collision, contact, packing, worm
 * spacing and replays still use the catalog's `size`. */
import { ENEMIES, type EnemyKind } from "./catalog.ts";
import { ART } from "./art-scale.ts";
import { isBlightFlier } from "./blight-fliers.ts";

export const BLIGHT_DRAW_GROWTH = 1;

/** Art pixels across a Blight monster as drawn, or undefined for any other kind. */
export function blightDrawnPixels(kind: EnemyKind): number | undefined {
  const def = ENEMIES[kind];
  if (def.darkPixels) return def.darkPixels + BLIGHT_DRAW_GROWTH;
  if (isBlightFlier(kind) || kind === "darkBlade" || kind === "lesserDarkBlade") return Math.round(def.size * ART) + BLIGHT_DRAW_GROWTH;
  return undefined;
}
