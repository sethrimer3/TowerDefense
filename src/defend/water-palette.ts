/** The forest lakes' colours, shared by the Ambush rivers so both read as
 * the same water (`forest-art.ts`, `river-art.ts`). Presentation only. */

/** The bank's mud, darkest first. */
export const BANK = [0x3d3a26, 0x55503a, 0x6b6448];
/** Water from the shallows (teal over sand) to the deep. */
export const WATER = [0x5a9e9a, 0x3f8691, 0x2f6d86, 0x25587a, 0x1d4766, 0x173852];
/** The pale lip of light along the far shore. */
export const FOAM = 0xa8d4d2;
/** Sand and pebbles showing through the shallows. */
export const SAND = 0x8a8458;
/** The light glinting off open water. */
export const GLINT = 0xd8f0f2;
/** Lily pads, darkest first. */
export const LILY = [0x21401f, 0x3d7a33, 0x63a54b];
/** Reeds: dark tufts, their stems and pale tips. */
export const REED = [0x2c4a22, 0x5b7a34, 0xb7a25a];
/** The black outline round the water. */
export const WATER_OUTLINE = 0x0b0907;
/** A 4 × 4 ordered dither threshold, 0 to 1. */
export const bayer = (X: number, Y: number) => [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5][(Y & 3) * 4 + (X & 3)] / 16 + 1 / 32;
