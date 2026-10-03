/** Where everything stands in the Library: side view in pixels, x right,
 * y down, the floor's top at `FLOOR`. The nave runs from x 0 to `W`; a
 * hallway leads out of each side through a door in the pier, `HALL` long. */
export const W = 192;
export const H = 300;
/** The floor's top row (librarians' feet stand on it). */
export const FLOOR = 288;
/** The stained-glass window: a lancet under a pointed head. */
export const WINDOW = { x0: 74, x1: 118, top: 18, bottom: 116 };
/** Shelves stop here, just short of the window's sill. */
export const SHELF_TOP = WINDOW.bottom + 5;
export const BAYS = 10;
export const BAY_W = 16;
export const BAY_X0 = (W - BAYS * BAY_W) / 2;
/** A shelf unit: two rows of books, each over its plank. */
export const UNIT_H = 14;
export const ROW_H = 7;
export const BOOKS_PER_ROW = 7;
export const MAX_UNITS = Math.floor((FLOOR - SHELF_TOP) / UNIT_H);
export const MAX_SHELVES = BAYS * MAX_UNITS;
export const SLOTS = BAYS * MAX_UNITS * 2 * BOOKS_PER_ROW;
/** The two reading tables at the foot of the nave: left edge and width. */
export const TABLES = [{ x: 38, w: 26 }, { x: 128, w: 26 }];
export const TABLE_TOP = FLOOR - 6;
/** The side hallways: how far each runs out from the nave, and how tall it
 * is (three times a librarian with a hat). */
export const HALL = 56;
export const HALL_H = 15;
/** Where a hallway leaves the picture: librarians going out vanish here. */
export const EXITS = [-HALL + 3, W + HALL - 3];
/** The water butts, one in each hallway just outside its door. */
export const BUTTS = [-12, W + 11];
/** Where the carts stand when parked: the book cart under the window, the
 * barrow by whichever spot is nearest the work. */
export const CART_HOME = 106;
export const BARROW_SPOTS = [26, 74, 166];
/** The return shelf: a low stand on the floor between the barrow's middle
 * spot and the cart, where professors put the books they have read (two
 * rows of `RETURN_PER_ROW`), to be wheeled out. */
export const RETURN = { x: 84, w: 14 };
export const RETURN_PER_ROW = 6;
export const RETURN_BOOKS = 2 * RETURN_PER_ROW;

/** The alchemy lab, a vaulted cellar under the nave (the view pans down to
 * it): its ceiling's top, its floor's top (researchers' feet), and the
 * picture's whole height. A stair runs down from a trapdoor in the nave's
 * floor at `STAIR_X`. */
export const LAB_TOP = H + 8;
export const LAB_FLOOR = LAB_TOP + 112;
export const WORLD_H = LAB_FLOOR + 10;
export const STAIR_X = 20;
/** Where the researchers stand to work, on the lab's floor (x), and which
 * way they face: the shelf of jars, the alembic, the athanor's bellows, the
 * transmutation circle, the cauldron, the desk's stool, the mortar bench and
 * the homunculus in its jar. */
export const LAB = {
  jars: { x: 33, face: 1 }, alembic: { x: 51, face: -1 }, athanor: { x: 86, face: -1 }, circle: { x: 98, face: 1 },
  cauldron: { x: 115, face: 1 }, desk: { x: 155, face: -1 }, mortar: { x: 168, face: -1 }, jar: { x: 174, face: 1 },
} as const;
export type LabStation = keyof typeof LAB;
