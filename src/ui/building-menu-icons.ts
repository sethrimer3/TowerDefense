/** Pixel-art icons for the building menu (`building-menu.ts`): the five
 * targeting modes, the rally flag and the target crosshairs (each with a
 * red-crossed "clear" twin), the upgrade tree, and the remove buttons (back
 * to the palette in Defend, sold for gold in Ambush). Drawn in code like the
 * mode icons: shapes on a 16 × 16 grid by material, each shaded light on its
 * upper left edges and dark on its lower right, ringed in a black outline
 * afterwards. Presentation only. */

/** Art pixels across an icon. */
export const MENU_ICON_SIZE = 16;
const N = MENU_ICON_SIZE;
const OUTLINE = 0x0c0a0a;

type Material = { tones: [number, number, number]; flat?: boolean };
const STONE: Material = { tones: [0xb0a896, 0x7a7466, 0x4a463e] };
const WOOD: Material = { tones: [0xd39b5c, 0x9a6638, 0x5f3c20] };
const DARK_WOOD: Material = { tones: [0x8f613b, 0x6a4529, 0x432b18] };
const BRASS: Material = { tones: [0xf6dc94, 0xd1a446, 0x8a6220] };
const GOLD: Material = { tones: [0xfff1b0, 0xf2c14e, 0xa77818] };
const FOE: Material = { tones: [0xf08070, 0xc43c30, 0x7c2420] };
const GREY: Material = { tones: [0xa39e98, 0x6f6a66, 0x45413e] };
const EMPTY: Material = { tones: [0x4a3434, 0x3a2828, 0x2a1c1c] };
const FLAG: Material = { tones: [0x9cc4ff, 0x4f84d8, 0x2a4f94] };
const CROSS: Material = { tones: [0xff6a55, 0xe0281e, 0x8c140e] };
const DUST: Material = { tones: [0xcfc3a6, 0xcfc3a6, 0xcfc3a6], flat: true };
const INK: Material = { tones: [OUTLINE, OUTLINE, OUTLINE], flat: true };

class Grid {
  cells: (Material | null)[] = new Array(N * N).fill(null);
  set(x: number, y: number, m: Material | null) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < N && y < N) this.cells[y * N + x] = m;
  }
  at(x: number, y: number) {
    return x >= 0 && y >= 0 && x < N && y < N ? this.cells[y * N + x] : null;
  }
  rect(x: number, y: number, w: number, h: number, m: Material | null) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, m);
  }
  disc(cx: number, cy: number, r: number, m: Material | null) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.set(x, y, m);
  }
  line(x0: number, y0: number, x1: number, y1: number, m: Material, width = 1) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let s = 0; s <= steps; s++) {
      const x = x0 + ((x1 - x0) * s) / steps, y = y0 + ((y1 - y0) * s) / steps;
      this.set(x, y, m);
      if (width > 1) this.set(x + 1, y, m);
    }
  }
}

/** A heart filling most of the icon. */
function heart(g: Grid, m: Material) {
  g.disc(4.6, 5.6, 3, m);
  g.disc(10.4, 5.6, 3, m);
  for (let y = 6; y <= 13; y++) {
    const half = Math.max(0, 6.8 - (y - 6) * 0.95);
    g.rect(Math.round(7.5 - half), y, Math.round(2 * half), 1, m);
  }
}

/** Red crosses an icon out: drawn over it, for the "clear" twins. */
function crossOut(g: Grid) {
  g.line(2, 2, 12, 12, CROSS, 2);
  g.line(12, 2, 2, 12, CROSS, 2);
}

function rallyFlag(g: Grid) {
  g.rect(2, 13, 5, 2, STONE);
  g.rect(3, 2, 2, 11, WOOD);
  g.rect(5, 2, 8, 6, FLAG);
  g.set(12, 4, null);
  g.set(12, 5, null);
  g.set(11, 5, null);
  g.rect(3, 1, 2, 1, BRASS);
}

function crosshairs(g: Grid) {
  // Square corner brackets, as the board draws them, ticks in to a red middle.
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    for (let i = 0; i < 4; i++) {
      g.set(7 + sx * (6 - i), 7 + sy * 6, GOLD);
      g.set(7 + sx * 6, 7 + sy * (6 - i), GOLD);
    }
  }
  for (let i = 2; i <= 4; i++) {
    g.set(7 + i, 7, GOLD);
    g.set(7 - i, 7, GOLD);
    g.set(7, 7 + i, GOLD);
    g.set(7, 7 - i, GOLD);
  }
  g.set(7, 7, CROSS);
}

const DRAW = {
  /** Closest: a little stone tower with an enemy beside it, another far off. */
  closest(g: Grid) {
    g.rect(1, 8, 5, 6, STONE);
    g.set(1, 7, STONE);
    g.set(3, 7, STONE);
    g.set(5, 7, STONE);
    g.rect(3, 11, 1, 2, INK);
    g.disc(9.5, 11, 1.8, FOE);
    g.disc(12.5, 3, 1.5, GREY);
    g.set(7, 11, BRASS);
  },
  /** First: three enemies down the road, the leader picked out, an arrow
   * the way they go. */
  first(g: Grid) {
    g.rect(0, 13, 16, 1, DUST);
    g.disc(2.5, 10, 1.5, GREY);
    g.disc(6.5, 10, 1.5, GREY);
    g.disc(11, 9.6, 2, FOE);
    g.line(2, 4, 11, 4, BRASS);
    g.line(9, 2, 11, 4, BRASS);
    g.line(9, 6, 11, 4, BRASS);
  },
  /** Strongest: a full heart. */
  strongest(g: Grid) {
    heart(g, FOE);
  },
  /** Weakest: a heart half drained and cracked. */
  weakest(g: Grid) {
    heart(g, FOE);
    for (let y = 0; y < N; y++) for (let x = 8; x < N; x++) if (g.at(x, y) === FOE) g.set(x, y, EMPTY);
    g.line(8, 3, 7, 6, INK);
    g.line(7, 6, 9, 8, INK);
    g.line(9, 8, 7, 11, INK);
  },
  /** Groups: a huddle of enemies inside brass corner brackets. */
  groups(g: Grid) {
    g.disc(5.5, 5.5, 1.6, FOE);
    g.disc(9.5, 5.5, 1.6, FOE);
    g.disc(5.5, 9.5, 1.6, FOE);
    g.disc(9.5, 9.5, 1.6, FOE);
    for (const [x, y, dx, dy] of [[1, 1, 1, 1], [13, 1, -1, 1], [1, 13, 1, -1], [13, 13, -1, -1]]) {
      g.line(x, y, x + 2 * dx, y, BRASS);
      g.line(x, y, x, y + 2 * dy, BRASS);
    }
  },
  /** The rally flag: a blue banner on a pole. */
  flag: rallyFlag,
  /** The rally flag crossed out: press to take it away. */
  flagClear(g: Grid) {
    rallyFlag(g);
    crossOut(g);
  },
  /** Gold target crosshairs: square brackets, like the board's. */
  crosshair: crosshairs,
  /** The crosshairs crossed out: press to take them away. */
  crosshairClear(g: Grid) {
    crosshairs(g);
    crossOut(g);
  },
  /** The upgrade tree: brass nodes on branches growing up from a root. */
  tree(g: Grid) {
    g.line(7, 13, 7, 3, WOOD, 2);
    g.line(7, 9, 3, 5, WOOD);
    g.line(8, 9, 12, 5, WOOD);
    g.disc(3, 4, 1.6, BRASS);
    g.disc(12.5, 4, 1.6, BRASS);
    g.disc(7.5, 2, 1.6, BRASS);
    g.rect(5, 13, 6, 2, BRASS);
  },
  /** Back to the palette: an arrow down into a chest. */
  inventory(g: Grid) {
    g.rect(1, 8, 14, 6, WOOD);
    g.rect(1, 7, 14, 2, DARK_WOOD);
    g.rect(1, 10, 14, 1, BRASS);
    g.rect(7, 10, 2, 2, BRASS);
    g.rect(7, 0, 2, 4, GOLD);
    g.rect(5, 4, 6, 1, GOLD);
    g.rect(6, 5, 4, 1, GOLD);
  },
  /** Sold for gold: a stack of coins. */
  sell(g: Grid) {
    g.rect(2, 11, 12, 3, GOLD);
    g.rect(3, 8, 10, 3, GOLD);
    g.rect(2, 10, 12, 1, BRASS);
    g.disc(8, 4.5, 3.6, GOLD);
    g.rect(7, 3, 2, 3, BRASS);
  },
};
export type MenuIcon = keyof typeof DRAW;
export const MENU_ICONS = Object.keys(DRAW) as MenuIcon[];

/** The icon as `N × N` ARGB pixels, 0 where empty. */
export function menuIconPixels(icon: MenuIcon): Uint32Array {
  const g = new Grid();
  DRAW[icon](g);
  const out = new Uint32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const m = g.at(x, y);
      if (m) {
        const tone = m.flat ? 1 : g.at(x - 1, y) !== m || g.at(x, y - 1) !== m ? 0 : g.at(x + 1, y) !== m || g.at(x, y + 1) !== m ? 2 : 1;
        out[y * N + x] = (m.tones[tone] | 0xff000000) >>> 0;
      } else if (g.at(x - 1, y) || g.at(x + 1, y) || g.at(x, y - 1) || g.at(x, y + 1)) out[y * N + x] = (OUTLINE | 0xff000000) >>> 0;
    }
  return out;
}

const urls = new Map<string, string>();
/** The icon as a data URL, `scale` screen pixels an art pixel, made once. */
export function menuIconUrl(icon: MenuIcon, scale = 2): string {
  const key = `${icon}@${scale}`;
  const cached = urls.get(key);
  if (cached) return cached;
  const px = menuIconPixels(icon);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = N * scale;
  const c = canvas.getContext("2d")!;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (!v) continue;
    c.fillStyle = `rgb(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255})`;
    c.fillRect((i % N) * scale, Math.floor(i / N) * scale, scale, scale);
  }
  const url = canvas.toDataURL();
  urls.set(key, url);
  return url;
}

/** The icon as an `<img>` for a menu button. */
export const menuIconImg = (icon: MenuIcon) => `<img class="ui-sprite bm-icon" src="${menuIconUrl(icon)}" alt="" aria-hidden="true">`;
