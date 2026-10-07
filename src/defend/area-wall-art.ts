/** The city wall's masonry in every area after Mossbound Ruins, as pixel art
 * at `WALL_ART` pixels a cell: each wall cell a cap stone (whole, or split
 * into two or three blocks) lit from the upper left, with the area's own
 * stone and dressing (sandstone strata, glowing basalt joints, algae and
 * barnacles, mushrooms, snow, amethyst, glassy obsidian, gilded star stone,
 * the void's runes), and the hanging south face as two courses of the same
 * stone. Mossbound Ruins keeps its hand-drawn sprites (`city-layer.ts`).
 * Everything is hashed from the cell, so a wall looks the same each repaint. */
import { hash, hash01 } from "./grid.ts";
import { pixels, sprite, type Pix } from "./damage-art.ts";
import type { AreaId } from "./areas.ts";

/** Art pixels a wall cell, each way. */
export const WALL_ART = 16;
/** Art rows of the hanging face. */
export const FACE_ROWS = 7;

/** A block's corners (inclusive), in art pixels. */
type Block = { x0: number; y0: number; x1: number; y1: number };

type Look = {
  /** Joint colour, and what fills a joint at art pixel (gx, gy) of the
   * whole wall when it isn't plain mortar (glowing seams, gold, sand). */
  mortar: number;
  joint?: (gx: number, gy: number) => number | undefined;
  /** Shadow, dark, mid, lit and the sheen along a block's lit edges. */
  stone: readonly [number, number, number, number, number];
  /** Per-block dressing over the plain stone. */
  dress?: (p: Pix, b: Block, seed: number) => void;
  /** Dressing over the face strip (16 × `FACE_ROWS`) at wall column `cx`. */
  face?: (p: Pix, cx: number, seed: number) => void;
  /** Tones of fallen stones, dark to lit, and the odd accent piece. */
  rubble: readonly number[];
  accent: readonly number[];
};

const pick = <T>(xs: readonly T[], h: number) => xs[h % xs.length];
const inBlock = (b: Block, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/** Plots `rows` of a small sprite (characters keyed into `pal`, "." empty)
 * with its top left at (x, y), only where `ok` allows. */
function stamp(p: Pix, x: number, y: number, rows: readonly string[], pal: Record<string, number>, ok = (_x: number, _y: number) => true) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]];
      if (c !== undefined && ok(x + i, y + j)) p.set(x + i, y + j, c);
    }
  });
}

/** A seeded spot inside `b`, kept `m` pixels from its edges. */
function spotIn(b: Block, seed: number, k: number, m = 1) {
  const w = Math.max(1, b.x1 - b.x0 + 1 - 2 * m), h = Math.max(1, b.y1 - b.y0 + 1 - 2 * m);
  return [b.x0 + m + Math.floor(hash01(seed, k, 1) * w), b.y0 + m + Math.floor(hash01(seed, k, 2) * h)] as const;
}

/** A wandering crack of `n` pixels from (x, y) in `b`. */
function crack(p: Pix, b: Block, x: number, y: number, n: number, seed: number, colors: readonly number[]) {
  for (let k = 0; k < n && inBlock(b, x, y); k++) {
    p.set(x, y, colors[k % colors.length]);
    const h = hash(seed, k, 9) % 4;
    if (h === 0) x++;
    else if (h === 1) x--;
    y += h === 3 ? 0 : 1;
  }
}

/** Sandstone strata, cracks, and sand drifted into the joints. */
const DESERT: Look = {
  mortar: 0x6a4018,
  joint: (gx, gy) => (hash01(gx >> 1, gy >> 1, 401) < 0.12 ? 0x9a6a30 : undefined),
  stone: [0x74441a, 0xa0652a, 0xc0823a, 0xd99e4e, 0xeec27a],
  dress(p, b, seed) {
    const off = hash(seed, 3) % 4;
    for (let y = b.y0 + 2; y < b.y1; y++)
      if ((y + off) % 4 === 0)
        for (let x = b.x0 + 1; x < b.x1; x++) if (hash01(seed, x, y) < 0.7) p.set(x, y, 0xc28640);
    if (hash01(seed, 4) < 0.3) {
      const [x, y] = spotIn(b, seed, 5, 2);
      crack(p, b, x, y, 4, seed, [0x6e4419]);
    }
    // Sand banked in the lower left corner.
    if (hash01(seed, 6) < 0.5)
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3 - j; i++) p.set(b.x0 + i, b.y1 - j, j ? 0xe9c27a : 0xd8ac5c);
  },
  face(p, cx, seed) {
    // Sand heaped against the foot of the wall.
    for (let x = 0; x < WALL_ART; x++) {
      const gx = cx * WALL_ART + x;
      const h = Math.max(0, Math.round(0.6 + Math.sin(gx * 0.45 + seed) * 1.3 + hash01(gx, 402) * 0.8));
      for (let j = 0; j < h; j++) p.set(x, FACE_ROWS - 1 - j, j === h - 1 ? 0xf0cc84 : j ? 0xd9a650 : 0xb88440);
    }
  },
  rubble: [0x9a6428, 0xc68a3c, 0xe2ae58],
  accent: [0xb88440, 0xd9a650, 0xf0cc84],
};

/** Basalt with molten joints and the odd glowing crack. */
const EMBER: Look = {
  mortar: 0x3a0d06,
  joint: (gx, gy) => {
    const h = hash01(gx >> 2, gy >> 2, 411), k = hash01(gx, gy, 412);
    return h < 0.3 ? (k < 0.2 ? 0xffb040 : k < 0.7 ? 0xe8561a : 0xa82a0c) : h < 0.6 && k < 0.6 ? 0x7a1e0a : undefined;
  },
  stone: [0x150f0e, 0x271e1d, 0x382c2a, 0x4e3f3b, 0x6a5650],
  dress(p, b, seed) {
    // Heat bleeding into the stone beside its glowing joints.
    for (let x = b.x0; x <= b.x1; x++) if (hash01(seed, x, 13) < 0.5) p.set(x, b.y1, 0x5a2014);
    for (let y = b.y0; y <= b.y1; y++) if (hash01(seed, y, 14) < 0.5) p.set(b.x1, y, 0x5a2014);
    if (hash01(seed, 15) < 0.35) {
      const [x, y] = spotIn(b, seed, 16, 2);
      crack(p, b, x, y, 5, seed, [0xff7a2a, 0xd8461a, 0xffc04a]);
    }
  },
  face(p, cx, seed) {
    // Lava weeping down from the top joint.
    for (let k = 0; k < 2; k++) {
      if (hash01(seed, cx, k, 17) < 0.45) continue;
      const x = 1 + (hash(seed, cx, k, 18) % (WALL_ART - 2)), n = 2 + (hash(seed, cx, k, 19) % 4);
      for (let j = 0; j < n; j++) p.set(x, 1 + j, j === n - 1 ? 0xffc04a : 0xe0501a);
    }
  },
  rubble: [0x271e1d, 0x382c2a, 0x4e3f3b],
  accent: [0x8a2410, 0xe0501a, 0xffa040],
};

/** Sea-green stone, algae, barnacles and a wet sheen. */
const DROWNED: Look = {
  mortar: 0x0a2123,
  joint: (gx, gy) => (hash01(gx, gy, 421) < 0.15 ? 0x2a5530 : undefined),
  stone: [0x123234, 0x1f4d4e, 0x2e6967, 0x468c85, 0x7cc0b2],
  dress(p, b, seed) {
    if (hash01(seed, 20) < 0.55) {
      // A clump of weed grown out from an edge.
      const left = hash01(seed, 21) < 0.5, n = 4 + (hash(seed, 22) % 4);
      let x = left ? b.x0 : b.x0 + (hash(seed, 23) % Math.max(1, b.x1 - b.x0)), y = left ? b.y0 + (hash(seed, 24) % Math.max(1, b.y1 - b.y0)) : b.y1;
      for (let k = 0; k < n; k++) {
        p.set(x, y, pick([0x2d5a2a, 0x3f7434, 0x5a9440], hash(seed, k, 25)));
        p.set(left ? x + 1 : x, left ? y : y - 1, 0x2d5a2a);
        if (left) x += hash(seed, k, 27) % 2;
        else y -= hash(seed, k, 27) % 2;
      }
    }
    for (let k = 0; k < 3; k++)
      if (hash01(seed, k, 28) < 0.4) {
        const [x, y] = spotIn(b, seed, 30 + k, 2);
        p.set(x, y, 0xd4dcc8);
        p.set(x + 1, y, 0x9aa894);
        p.set(x, y + 1, 0x24403c);
      }
    if (hash01(seed, 29) < 0.5) for (let k = 0; k < 3; k++) p.set(b.x0 + 2 + k, b.y0 + 3 - k, 0x9fded0);
  },
  face(p, cx, seed) {
    // The tide line, slimy weed below it, and drips.
    for (let x = 0; x < WALL_ART; x++) {
      const gx = cx * WALL_ART + x;
      if (hash01(gx, 423) < 0.5) p.set(x, 3, 0x5aa89c);
      const h = 1 + (hash(gx >> 1, 424) % 3);
      for (let j = 0; j < h; j++) p.set(x, FACE_ROWS - 1 - j, j === h - 1 ? 0x3f7434 : 0x2d5a2a);
    }
    if (hash01(seed, cx, 33) < 0.5) {
      const x = hash(seed, cx, 34) % WALL_ART;
      p.set(x, 1, 0x7cc0b2);
      p.set(x, 2, 0xb4ece0);
    }
  },
  rubble: [0x1f4d4e, 0x2e6967, 0x468c85],
  accent: [0x2d5a2a, 0x3f7434, 0x5a9440],
};

const SHROOM = { o: 0x1c0a14, d: 0x96305e, m: 0xe0628f, l: 0xffaccb, s: 0xeadcc6 };
const SHROOMS = [
  ["..ooo..", ".ollmo.", "omlmmmo", "odddddo", ".oosoo.", "..oso..", "...o..."],
  [".ooo.", "olmmo", "ddddd", ".oso.", "..o.."],
] as const;

/** Mauve stone, mycelium in the joints, pink mushrooms and spores. */
const FUNGAL: Look = {
  mortar: 0x25131d,
  joint: (gx, gy) => (hash01(gx, gy, 431) < 0.04 ? 0xb89aa0 : undefined),
  stone: [0x3a1f30, 0x553148, 0x6e445e, 0x8b5a77, 0xae7d97],
  dress(p, b, seed) {
    const n = hash01(seed, 40) < 0.4 ? 1 + (hash(seed, 41) % 2) : 0;
    for (let k = 0; k < n; k++) {
      const big = k === 0 && b.x1 - b.x0 > 8 && b.y1 - b.y0 > 8, art = SHROOMS[big ? 0 : 1];
      const [x, y] = spotIn(b, seed, 43 + k, 0);
      stamp(p, Math.min(x, b.x1 - art[0].length + 1), Math.min(y, b.y1 - art.length + 2), art, SHROOM, (sx, sy) => sx >= 0 && sy >= 0 && sx < WALL_ART && sy < WALL_ART);
    }
    for (let k = 0; k < 2; k++)
      if (hash01(seed, k, 46) < 0.35) {
        const [x, y] = spotIn(b, seed, 47 + k, 1);
        p.set(x, y, 0xa8f0dc);
      }
  },
  face(p, cx, seed) {
    // A bracket fungus on the face.
    if (hash01(seed, cx, 48) < 0.5) {
      const x = 2 + (hash(seed, cx, 49) % (WALL_ART - 7));
      stamp(p, x, 2, ["ollllo", ".mmmm.", "..dd.."], { o: 0x1c0a14, l: 0xf0a0bf, m: 0xc8507e, d: 0x7a2448 });
    }
  },
  rubble: [0x553148, 0x6e445e, 0x8b5a77],
  accent: [0x96305e, 0xe0628f, 0xffaccb],
};

/** Blue-grey stone under a cap of snow, and icicles on the face. */
const FROZEN: Look = {
  mortar: 0x16222d,
  stone: [0x26384a, 0x3a5670, 0x55789a, 0x7a9ebe, 0xa8c8e0],
  dress(p, b, seed) {
    // Snow on each block, deepest in the middle, with a shaded lip.
    const w = b.x1 - b.x0 + 1, deep = hash01(seed, 55) * 5, lean = (hash01(seed, 56) - 0.5) * 6, from = hash01(seed, 57) * 0.4;
    for (let x = b.x0; x <= b.x1; x++) {
      const t = (x - b.x0 + 0.5) / w;
      if (t < from) continue;
      const depth = Math.min(b.y1 - b.y0 - 1, Math.round(deep * Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))) + lean * (t - 0.5) + hash01(seed, x, 50) * 1.4));
      if (depth <= 0) continue;
      for (let j = 0; j < depth; j++) p.set(x, b.y0 + j, j === 0 ? 0xf6fbff : j === depth - 1 ? 0xbcd6ec : 0xdcecf8);
      p.set(x, b.y0 + depth, 0x3a5670);
    }
    for (let k = 0; k < 2; k++)
      if (hash01(seed, k, 51) < 0.5) p.set(b.x0 + 1 + (hash(seed, k, 52) % Math.max(1, w - 2)), b.y0 + 1, 0xffffff);
    if (hash01(seed, 53) < 0.4) {
      const [x, y] = spotIn(b, seed, 54, 2);
      p.set(x, Math.max(y, b.y1 - 3), 0xd8f0ff);
    }
  },
  face(p, cx) {
    // Snow on the lip, icicles hanging under it.
    for (let x = 0; x < WALL_ART; x++) {
      const gx = cx * WALL_ART + x;
      p.set(x, 0, hash01(gx, 441) < 0.8 ? 0xe6f2fc : 0xbcd6ec);
      if (hash01(gx, 442) < 0.4) {
        const n = 1 + (hash(gx, 443) % 5);
        for (let j = 0; j < n; j++) p.set(x, 1 + j, j === n - 1 ? 0xa8d0ec : j === 0 ? 0xf6fbff : 0xd4ecfa);
      }
    }
  },
  rubble: [0x3a5670, 0x55789a, 0x7a9ebe],
  accent: [0xbcd6ec, 0xdcecf8, 0xf6fbff],
};

const SHARD = { o: 0x0d0614, l: 0xe6c0ff, m: 0xb274f0, d: 0x7238bc };
const SHARDS = [
  ["..o..", ".olo.", ".olmo", "olmmo", "olmdo", "olmdo", "olmdo", ".ooo."],
  [".o..", "olo.", "olmo", "olmo", "olmo", "olmdo", ".ooo"],
  [".o..", "olo.", "olmo", "olmo", ".oo."],
] as const;

/** Dark geode rock studded with amethyst. */
const CRYSTAL: Look = {
  mortar: 0x110918,
  joint: (gx, gy) => (hash01(gx, gy, 451) < 0.04 ? 0x8a4ad0 : undefined),
  stone: [0x1c1228, 0x2c1d3e, 0x3e2a56, 0x54396f, 0x6e4f8c],
  dress(p, b, seed) {
    if (hash01(seed, 60) < 0.42) {
      const n = 1 + (hash(seed, 61) % 3);
      const [x0, y0] = spotIn(b, seed, 62, 1);
      for (let k = 0; k < n; k++) {
        const art = SHARDS[hash(seed, k, 63) % SHARDS.length];
        const x = x0 + k * 3 - 2, y = Math.max(b.y0, Math.min(y0, b.y1 - art.length + 1) + (k % 2) * 2);
        stamp(p, x, y, art, SHARD, (sx, sy) => sx >= 0 && sy >= 0 && sx < WALL_ART && sy < WALL_ART);
      }
    }
    for (let k = 0; k < 2; k++)
      if (hash01(seed, k, 64) < 0.4) {
        const [x, y] = spotIn(b, seed, 65 + k, 1);
        p.set(x, y, 0x9a62d8);
      }
  },
  face(p, cx, seed) {
    // Shards growing up from the foot of the wall.
    for (let k = 0; k < 2; k++) {
      if (hash01(seed, cx, k, 66) < 0.5) continue;
      const x = 1 + (hash(seed, cx, k, 67) % (WALL_ART - 4));
      stamp(p, x, FACE_ROWS - 4, [".o.", "olo", "olmo", "oooo"], SHARD);
    }
  },
  rubble: [0x2c1d3e, 0x3e2a56, 0x54396f],
  accent: [0x7238bc, 0xb274f0, 0xe6c0ff],
};

/** Black volcanic glass with a hard sheen and smouldering veins. */
const OBSIDIAN: Look = {
  mortar: 0x050305,
  joint: (gx, gy) => (hash01(gx >> 1, gy, 461) < 0.1 ? 0x5a1410 : undefined),
  stone: [0x0e0a0e, 0x1e171e, 0x2c232c, 0x3e323e, 0x6e5c70],
  dress(p, b, seed) {
    // A diagonal glint across the glass.
    const off = 3 + (hash(seed, 70) % 5);
    for (let y = b.y0 + 1; y < b.y1; y++)
      for (let x = b.x0 + 1; x < b.x1; x++) {
        const d = x - b.x0 + (y - b.y0) - off;
        if (d === 0) p.set(x, y, 0x857488);
        else if (d === 1 || d === -1) p.set(x, y, 0x3e3240);
      }
    if (hash01(seed, 71) < 0.3) {
      const [x, y] = spotIn(b, seed, 72, 2);
      crack(p, b, x, y, 5, seed, [0x8c2218, 0xc8401e]);
    }
  },
  face(p, cx, seed) {
    if (hash01(seed, cx, 73) < 0.2) {
      const x = 2 + (hash(seed, cx, 74) % (WALL_ART - 4));
      for (let j = 1; j < FACE_ROWS - 1; j++) p.set(x + (j >> 1), j, j % 2 ? 0x8c2218 : 0x5a1410);
    }
  },
  rubble: [0x151015, 0x211a21, 0x3a2e3a],
  accent: [0x5a1410, 0x8c2218, 0xc8401e],
};

/** Star-blue stone set in gilded joints, with inlaid stars. */
const ASTRAL: Look = {
  mortar: 0x6e5020,
  joint: (gx, gy) => {
    const h = hash01(gx, gy, 471);
    return h < 0.07 ? 0xffe8a0 : h < 0.45 ? 0xc89a40 : undefined;
  },
  stone: [0x101934, 0x1a274e, 0x253768, 0x334888, 0x5068a8],
  dress(p, b, seed) {
    if (hash01(seed, 80) < 0.45) {
      const [x, y] = spotIn(b, seed, 81, 3);
      const big = hash01(seed, 82) < 0.4;
      p.set(x, y, 0xfff6c8);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        p.set(x + dx, y + dy, 0xe8c060);
        if (big) p.set(x + 2 * dx, y + 2 * dy, 0x9a7a3a);
      }
    }
    for (let k = 0; k < 3; k++)
      if (hash01(seed, k, 83) < 0.4) {
        const [x, y] = spotIn(b, seed, 84 + k, 1);
        p.set(x, y, 0x8ea0d8);
      }
  },
  face(p, cx) {
    // A gilded band under the lip.
    for (let x = 0; x < WALL_ART; x++) {
      const gx = cx * WALL_ART + x;
      p.set(x, 1, (gx % 4) === 0 ? 0xffe8a0 : 0xc89a40);
      p.set(x, 2, 0x6e5020);
    }
  },
  rubble: [0x1a274e, 0x253768, 0x334888],
  accent: [0x6e5020, 0xc89a40, 0xffe8a0],
};

/** The void's stone, faint violet runes and seams. */
const NADIR: Look = {
  mortar: 0x06040a,
  joint: (gx, gy) => (hash01(gx >> 1, gy >> 1, 481) < 0.2 ? 0x3e2670 : undefined),
  stone: [0x0c0a14, 0x1a1528, 0x261e3a, 0x342a52, 0x564884],
  dress(p, b, seed) {
    if (hash01(seed, 90) < 0.35) {
      const [x, y] = spotIn(b, seed, 91, 3);
      const runes = [["l.l", ".l.", "l.l"], ["lll", "l..", "lll"], [".l.", "lll", ".l."], ["l..", "ll.", "l.l"]] as const;
      for (const [dx, dy] of [[-1, -1], [3, -1], [-1, 3], [3, 3]]) p.set(x + dx, y + dy, 0x2e2050);
      stamp(p, x, y, runes[hash(seed, 92) % runes.length], { l: 0xa47ae8 });
    }
  },
  face(p, cx, seed) {
    if (hash01(seed, cx, 93) < 0.4) {
      const x = 3 + (hash(seed, cx, 94) % (WALL_ART - 6));
      p.set(x, 2, 0xa47ae8);
      p.set(x + 1, 3, 0x6a48b0);
      p.set(x - 1, 4, 0x6a48b0);
    }
  },
  rubble: [0x14101e, 0x1e172d, 0x2a2140],
  accent: [0x2e2050, 0x6a48b0, 0xa47ae8],
};

const LOOKS: Partial<Record<AreaId, Look>> = {
  desert: DESERT,
  ember: EMBER,
  drowned: DROWNED,
  fungal: FUNGAL,
  frozen: FROZEN,
  crystal: CRYSTAL,
  obsidian: OBSIDIAN,
  astral: ASTRAL,
  nadir: NADIR,
};

/** Whether the area's wall is drawn here (every area but the first). */
export const hasWallArt = (area: AreaId) => !!LOOKS[area];

/** How a cell's cap stone is cut: whole, halved either way, or a row of two
 * over one long block. The joints run along the cell's right and bottom. */
function blocks(cx: number, cy: number): Block[] {
  const E = WALL_ART - 2;
  const h = hash(cx, cy, 500) % 10;
  if (h < 6) return [{ x0: 0, y0: 0, x1: E, y1: E }];
  if (h < 8) return [{ x0: 0, y0: 0, x1: E, y1: 6 }, { x0: 0, y0: 8, x1: E, y1: E }];
  if (h < 9) return [{ x0: 0, y0: 0, x1: 6, y1: E }, { x0: 8, y0: 0, x1: E, y1: E }];
  return [{ x0: 0, y0: 0, x1: 8, y1: 6 }, { x0: 10, y0: 0, x1: E, y1: 6 }, { x0: 0, y0: 8, x1: E, y1: E }];
}

/** Plain stone in `b`: pillowed, lit from the upper left (lit, mid and dark
 * bands dithered where they meet), a few grains, a sheen along its top and
 * left edges and a shadow along its bottom and right. */
function stone(p: Pix, look: Look, b: Block, seed: number) {
  const [shadow, dark, mid, lit, sheen] = look.stone;
  const w = b.x1 - b.x0, h = b.y1 - b.y0;
  const bias = (hash01(seed, 1) - 0.5) * 0.25;
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const g = hash01(seed, x, y, 2);
      const t = ((x - b.x0) / Math.max(1, w) + (y - b.y0) / Math.max(1, h)) / 2 + bias + (g - 0.5) * 0.18;
      let c = t < 0.28 ? lit : t < 0.72 ? mid : dark;
      if (g < 0.05) c = dark;
      if (y === b.y1 || x === b.x1) c = shadow;
      else if (y === b.y0) c = t > 0.5 ? lit : sheen;
      else if (x === b.x0) c = lit;
      // Corners knocked off, so each block reads as a dressed stone.
      const cx = x === b.x0 || x === b.x1, cy = y === b.y0 || y === b.y1;
      if (cx && cy) continue;
      p.set(x, y, c);
    }
}

/** One wall cell's cap: `WALL_ART` square RGBA pixels. */
export function wallCapPixels(area: AreaId, cx: number, cy: number): Uint32Array {
  const look = LOOKS[area] ?? DESERT;
  const out = new Uint32Array(WALL_ART * WALL_ART), p = pixels(out, WALL_ART, WALL_ART);
  for (let y = 0; y < WALL_ART; y++)
    for (let x = 0; x < WALL_ART; x++) p.set(x, y, look.joint?.(cx * WALL_ART + x, cy * WALL_ART + y) ?? look.mortar);
  blocks(cx, cy).forEach((b, k) => {
    const seed = hash(cx, cy, k, 501);
    stone(p, look, b, seed);
    look.dress?.(p, b, seed);
  });
  return out;
}

/** The face hung below a wall stone in column `cx`: `WALL_ART` ×
 * `FACE_ROWS` RGBA pixels, two courses of stone in shade under a dark joint. */
export function wallFacePixels(area: AreaId, cx: number): Uint32Array {
  const look = LOOKS[area] ?? DESERT;
  const [shadow, dark, mid] = look.stone;
  const out = new Uint32Array(WALL_ART * FACE_ROWS), p = pixels(out, WALL_ART, FACE_ROWS);
  for (let y = 0; y < FACE_ROWS; y++)
    for (let x = 0; x < WALL_ART; x++) {
      const gx = cx * WALL_ART + x;
      const course = y < 3 ? 0 : 1;
      const joint = y === 0 || y === 3 || y === FACE_ROWS - 1 || (gx + course * 4) % 8 === 7;
      if (joint) p.set(x, y, (hash01(gx, y, 504) < 0.5 ? look.joint?.(gx, 4000 + y) : undefined) ?? look.mortar);
      else p.set(x, y, y === 1 || y === 4 ? mid : hash01(gx, y, 502) < 0.2 ? shadow : dark);
    }
  look.face?.(p, cx, hash(cx, 503));
  return out;
}

/** Fallen stone and accent tones for the area's wall rubble. */
export const wallRubbleTones = (area: AreaId) => {
  const look = LOOKS[area];
  return look ? { stone: look.rubble, accent: look.accent } : null;
};

/** Cached sprites of a cell's cap and a column's face (the cap repeats
 * every eight cells each way so the cache stays small). */
export const wallCapSprite = (area: AreaId, cx: number, cy: number) =>
  sprite(`areaWall:${area}:${cx & 7}:${cy & 7}`, WALL_ART, WALL_ART, () => wallCapPixels(area, cx & 7, cy & 7));
export const wallFaceSprite = (area: AreaId, cx: number) =>
  sprite(`areaFace:${area}:${cx & 7}`, WALL_ART, FACE_ROWS, () => wallFacePixels(area, cx & 7));
