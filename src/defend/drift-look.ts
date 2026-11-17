/** What the drifting ground is made of: the Amber Desert's sand, or the
 * Highlands' snow. The two share every shape (the same dunes, trails,
 * drifts, craters and the things the wind rolls along); only their colours
 * differ. The renderer sets the look for the area it draws
 * (`setDriftLook`), and the dune art, the sand trails and the wilds read it,
 * each keying what it caches on it. Presentation only. */
import type { AreaId } from "./areas.ts";

export type DriftLook = "sand" | "snow";
let look: DriftLook = "sand";

/** The look an area's drifting ground takes. */
export const driftLookFor = (area: AreaId): DriftLook => (area === "frozen" ? "snow" : "sand");
export function driftLook() { return look; }
/** Draw drifts as `next`; whether it changed. */
export function setDriftLook(next: DriftLook) {
  if (next === look) return false;
  look = next;
  return true;
}

/** The simple snow's tones, deepest shade to the sunlit crest, in the
 * steps the sand's take: blue in the shade, as real snow is, the middle
 * one its flat sunlit ground. */
export const SNOW_TONES = [[66, 88, 136], [100, 128, 176], [146, 172, 212], [204, 220, 240], [230, 240, 251], [250, 253, 255]] as const;
/** The HD snow's tones, deep shadow to sunlit. */
export const HD_SNOW_TONES = [[72, 94, 140], [92, 118, 164], [116, 142, 186], [144, 170, 208], [170, 194, 226], [196, 214, 238], [216, 230, 247], [234, 242, 252], [250, 252, 255]];

/** The trails' banks: the face toward the sun, the face away and the grains
 * blown back over the trail, by look. */
export const BANKS = {
  sand: { lit: [252, 214, 150], shade: [96, 58, 30], grain: [200, 148, 88] },
  snow: { lit: [255, 255, 255], shade: [64, 90, 146], grain: [226, 236, 248] },
} as const;

/** The boulders a trail bends round: their top, shadow to sunlit; their
 * side, light to its foot; and their dark rim. Moab's red sandstone in the
 * desert; in the snow, blue-grey granite with snow lying on its top. */
export const TRAIL_ROCKS = {
  sand: { top: [[164, 70, 40], [190, 88, 48], [210, 106, 60], [230, 138, 84]], side: [[136, 54, 34], [114, 44, 30], [94, 36, 26]], rim: [64, 26, 18] },
  snow: { top: [[170, 190, 218], [206, 220, 240], [232, 240, 250], [252, 254, 255]], side: [[92, 104, 124], [74, 84, 104], [58, 66, 84]], rim: [30, 38, 56] },
} as const;
