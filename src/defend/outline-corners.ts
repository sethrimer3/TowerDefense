/** Orthogonal outlines: four Settings (and Defend board) checkboxes that
 * drop the diagonal corner pixels from black outlines, so an outline only
 * touches its body edge to edge (a four-neighbour ring, never a corner):
 *
 * - **buildings** (`orthoBuildings`): the one-art-pixel ring `damage-art.ts`
 *   adds to every outlined sprite (buildings, the keep, gates, banners…).
 * - **troops** (`orthoTroops`): the player's units' dark-navy contours.
 * - **enemies** (`orthoEnemies`): every other unit contour except the
 *   burning portal one.
 * - **blight** (`orthoBlight`): the Dark One enemies' portal (perlin noise)
 *   contour.
 *
 * Presentation only. Sprites are rebuilt once on a change (`bumpPixelArt`)
 * and unit contours are rebuilt with the combat cache (`cornersKey`). */
import { PLAYER_UNIT_INK, PORTAL_UNIT_INK } from "./art-scale.ts";
import { bumpPixelArt } from "./pixel-sprites.ts";

export type OutlinePart = "buildings" | "troops" | "enemies" | "blight";
export const ORTHO_PARTS: readonly OutlinePart[] = ["buildings", "troops", "enemies", "blight"];
const on: Record<OutlinePart, boolean> = { buildings: false, troops: false, enemies: false, blight: false };

/** Whether `part`'s outlines leave out their corners. */
export const orthogonal = (part: OutlinePart) => on[part];
export function setOrthogonal(part: OutlinePart, value: boolean) {
  if (on[part] === value) return;
  on[part] = value;
  if (part === "buildings") bumpPixelArt();
}
/** The unit contour part an ink belongs to. */
export const inkPart = (ink: string): OutlinePart => ink === PLAYER_UNIT_INK ? "troops" : ink === PORTAL_UNIT_INK ? "blight" : "enemies";
/** Changes whenever a unit contour's corners change. */
export const cornersKey = () => `${+on.troops}${+on.enemies}${+on.blight}`;
