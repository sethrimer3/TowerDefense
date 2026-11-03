/** The runes on enchanted books, seen up close: small glyphs drawn in pixels
 * a fifth of the Library's own (`GLYPH_FINE` to a pixel), each `GLYPH_SIZE`
 * fine pixels square, one where each glowing rune pixel sits on a spine.
 * Presentation only. */

/** Fine pixels to one Library pixel. */
export const GLYPH_FINE = 5;
/** A glyph's width and height in fine pixels. */
export const GLYPH_SIZE = 7;

/** The designs, `#` lit. Runic and geometric: chevrons, branching staves,
 * spirals, diamonds, hourglasses and nested squares. */
const ROWS: string[][] = [
  [ // a hand-bowl rune: a staff rising out of a cup
    "...#...",
    "..###..",
    "#.###.#",
    "#..#..#",
    "#..#..#",
    ".#.#.#.",
    "..###..",
  ],
  [ // twin chevrons
    "...#...",
    "..#.#..",
    ".#...#.",
    "...#...",
    "..#.#..",
    ".#...#.",
    ".......",
  ],
  [ // a branching stave
    "#..#..#",
    ".#.#.#.",
    "..###..",
    "...#...",
    "...#...",
    "...#...",
    "...#...",
  ],
  [ // a lightning stroke
    ".......",
    "......#",
    "..#..#.",
    ".#.##..",
    "#......",
    ".......",
    ".......",
  ],
  [ // a diamond with arms
    "...#...",
    "..#.#..",
    ".#...#.",
    "#.....#",
    ".#...#.",
    "..#.#..",
    "...#...",
  ],
  [ // a bent hook
    ".......",
    ".#####.",
    ".#...#.",
    ".#.###.",
    ".#.....",
    ".#.....",
    ".......",
  ],
  [ // a cross with a short bar
    "...#...",
    "...#...",
    "#######",
    "...#...",
    "...#...",
    "..#....",
    ".#.....",
  ],
  [ // a square spiral
    "#######",
    "#.....#",
    "#.###.#",
    "#.#.#.#",
    "#.#...#",
    "#.#####",
    ".......",
  ],
  [ // a ringed cross
    "..###..",
    ".#.#.#.",
    "#..#..#",
    "#######",
    "#..#..#",
    ".#.#.#.",
    "..###..",
  ],
  [ // a goblet
    "#######",
    ".#...#.",
    "..#.#..",
    "...#...",
    "...#...",
    "...#...",
    "..###..",
  ],
  [ // a nested square
    "#######",
    "#.....#",
    "#.###.#",
    "#.###.#",
    "#.###.#",
    "#.....#",
    "#######",
  ],
  [ // an hourglass
    "#######",
    ".#...#.",
    "..#.#..",
    "...#...",
    "..#.#..",
    ".#...#.",
    "#######",
  ],
  [ // a scatter of motes in a cross
    "...#...",
    ".......",
    "..#.#..",
    "#..#..#",
    "..#.#..",
    ".......",
    "...#...",
  ],
  [ // a ring with arms
    "...#...",
    "..###..",
    ".#...#.",
    "##...##",
    ".#...#.",
    "..###..",
    "...#...",
  ],
];

/** Each design as the fine pixels it lights, `[x, y]` from its top left. */
export const GLYPHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = ROWS.map((rows) => {
  const lit: [number, number][] = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => ch === "#" && lit.push([x, y])));
  return lit;
});

/** The glyph for the `k`th rune on the book in slot `slot`: steady, so a
 * book keeps its writing. */
export function glyphFor(slot: number, k: number) {
  let h = Math.imul(slot + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return GLYPHS[(h >>> 0) % GLYPHS.length];
}

/** How far the rune pixels have turned into glyphs at `devicePerPixel`
 * screen pixels to a Library pixel: none while a fine pixel would be under
 * 1.5 screen pixels, all once it is 3, eased between. */
export function glyphShare(devicePerPixel: number) {
  const fine = devicePerPixel / GLYPH_FINE, k = Math.max(0, Math.min(1, (fine - 1.5) / 1.5));
  return k * k * (3 - 2 * k);
}

const GLOWS = new Map<ReadonlyArray<readonly [number, number]>, [number, number][]>();
/** The fine pixels round a glyph's strokes (beside one, not on one), each
 * once, where its faint glow lies. */
export function glowOf(lit: ReadonlyArray<readonly [number, number]>) {
  let glow = GLOWS.get(lit);
  if (!glow) {
    const on = new Set(lit.map(([x, y]) => `${x},${y}`)), seen = new Set<string>();
    glow = [];
    for (const [x, y] of lit)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const key = `${x + dx},${y + dy}`;
        if (on.has(key) || seen.has(key)) continue;
        seen.add(key);
        glow.push([x + dx, y + dy]);
      }
    GLOWS.set(lit, glow);
  }
  return glow;
}
