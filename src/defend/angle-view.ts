/** Angle view's state and measures, shared by the city layer and what is
 * drawn over the buildings each frame (gates swinging, ballistas, the keep's
 * banner). Presentation only. */
import { ART, WALL_FACE_HANG } from "./art-scale.ts";
import type { Building } from "./citygen.ts";

let on = false;
/** Whether Angle view is on (`setAngleView` in `city-layer.ts` sets it). */
export const angled = () => on;
export function setAngled(value: boolean) {
  on = value;
}

/** How many art pixels building `b`'s south face hangs below its roof in
 * Angle view: towers stand tallest after the keep, houses lowest. */
export function faceDepth(b: Building): number {
  if (b.kind === "house") return 5;
  if (b.kind === "keep") return 11;
  if (b.kind === "gate" || b.kind === "wallBallista") return Math.round(ART * WALL_FACE_HANG);
  if (b.kind.endsWith("Tower")) return 9;
  return HALL_FACE;
}

/** How many art pixels a hall's south face hangs (any structure not a tower). */
export const HALL_FACE = 7;

/** How far up (in cells) standing building `b`'s sprite is drawn in Angle
 * view, so the foot of its south face is where the foot of its lot is: a
 * wall stone, a gate or a bastion by the wall's face, anything else by its
 * own face. 0 with Angle view off, and for fences and wooden gates. */
export function liftOf(b: Building): number {
  if (!on || b.fence || b.woodGate) return 0;
  if (b.kind === "wall" || b.kind === "gate" || b.kind === "wallBallista") return WALL_FACE_HANG;
  return faceDepth(b) / ART;
}

/** `liftOf(b)` in whole canvas pixels at `px` a cell. */
export const liftPx = (b: Building, px: number) => Math.round(liftOf(b) * px);
