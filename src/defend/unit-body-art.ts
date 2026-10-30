/** Pure, replaceable body frames; facing, flash and cape looks have stable
 * names. Weapons and the moving cape remain independent sprite layers. */
import { BODY_FRAMES, NECRO_ROWS, NECRO_COLORS, CALLED_ROWS, CALLED_COLORS } from "./melee-body-data.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { rowPixels, sourcePixels, type ArtPiece } from "./sprite-source.ts";
import type { Facing } from "./melee-facing.ts";
export const BODY_DIRECTIONS: Facing[] = ["south", "north", "east", "west"];
export function meleeFramePixels(key: string, direction: Facing) {
  const frame = BODY_FRAMES.find((f) => f.key === key)!;
  const raw = rowPixels(frame.views[direction], frame.palette);
  return { ...raw, data: sourcePixels(ART_NAMES.unit(key, direction), raw.w, raw.h, () => raw.data) };
}
export function summonedArcherPixels(called: boolean, flash = false) {
  const raw = rowPixels(called ? CALLED_ROWS.archer : NECRO_ROWS.archer, called ? CALLED_COLORS : NECRO_COLORS, flash);
  return {
    ...raw,
    data: sourcePixels(
      ART_NAMES.unit(`${called ? "called" : "risen"}-archer-${flash ? "struck" : "plain"}`),
      raw.w,
      raw.h,
      () => raw.data,
    ),
  };
}
export function unitBodyPieces(): ArtPiece[] {
  const pieces: ArtPiece[] = [];
  for (const f of BODY_FRAMES)
    for (const direction of BODY_DIRECTIONS) {
      const p = meleeFramePixels(f.key, direction);
      pieces.push({
        name: ART_NAMES.unit(f.key, direction),
        w: p.w,
        h: p.h,
        about: `${f.key}, facing ${direction}`,
        pixels: () => meleeFramePixels(f.key, direction).data,
      });
    }
  for (const called of [false, true])
    for (const flash of [false, true]) {
      const p = summonedArcherPixels(called, flash),
        key = `${called ? "called" : "risen"}-archer-${flash ? "struck" : "plain"}`;
      pieces.push({
        name: ART_NAMES.unit(key),
        w: p.w,
        h: p.h,
        about: key,
        pixels: () => summonedArcherPixels(called, flash).data,
      });
    }
  return pieces;
}
