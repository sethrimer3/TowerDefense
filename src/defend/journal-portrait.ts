import { ENEMIES, type EnemyKind } from "./catalog.ts";
import { drawEnemyArt } from "./battle-art.ts";
import { assembleFortress } from "./fortress.ts";
import { hash01 } from "./grid.ts";
import type { DefendSim, Enemy } from "./sim.ts";

/** The enemy journal's portraits: each discovered enemy drawn by the
 * battle's own art, trimmed and scaled up in whole pixels inside an oak
 * frame outlined in black, with brass at its corners, over a patch of dark
 * earth. Presentation only; nothing here touches a battle. */

/** The portrait canvas, its border and the box the enemy is fitted into. */
export const PORTRAIT = 80;
const BORDER = 10, FIT = 54;
/** The scratch canvas each enemy is first drawn on, at its art's own scale. */
const SCRATCH = 256;

const FRAME_COLOURS = {
  outline: "#0b0706", dark: "#3b2212", wood: "#61391c", grain: "#4e2d16", light: "#86542a", edge: "#a8743e",
  brass: "#e8b955", brassDark: "#9c6e2a", nail: "#4a3218",
  earth: "#21170f", earthDither: "#2b1e14", earthLight: "#3a2a1c", earthSpeck: "#4b3825"
};

/** Pixels a cell to draw a kind at, so its sprite comes out at its own art
 * scale: siege engines and boats at 10, walking fortresses at 8, the ice
 * creatures at their sprites' width, every other body at 16. */
function scaleFor(kind: EnemyKind): number {
  const def = ENEMIES[kind];
  if (def.siege || def.boat) return 10;
  if (def.fortress) return 8;
  if (kind === "iceGolem") return Math.ceil(12 / def.size);
  if (kind === "iceCube") return Math.ceil(10 / def.size);
  return 16;
}

/** A stand-in enemy at (x, y), as the sim would spawn it, facing right. */
function standIn(kind: EnemyKind, x: number, y: number, id: number): Enemy {
  const def = ENEMIES[kind];
  return {
    id, kind, x, y, hp: def.hp, maxHp: def.hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0,
    marked: false, flash: 0, facing: { x: 1, y: 0 },
    ...(kind === "burrowingMole" ? { burrow: 0 } : {})
  };
}

/** Draws `kind` centred on a scratch canvas at `px` pixels a cell and
 * returns the box its pixels cover. */
function drawOnScratch(scratch: HTMLCanvasElement, kind: EnemyKind, px: number) {
  const c = scratch.getContext("2d", { willReadFrequently: true })!;
  c.clearRect(0, 0, SCRATCH, SCRATCH);
  c.imageSmoothingEnabled = false;
  const def = ENEMIES[kind];
  const mid = SCRATCH / 2 / px;
  let id = 1;
  const enemies: Enemy[] = [];
  const sim = {
    time: 0,
    effects: [],
    spawnAuxiliary(k: EnemyKind, x: number, y: number) {
      const part = standIn(k, x, y, ++id);
      enemies.push(part);
      return part;
    }
  } as unknown as DefendSim;
  // A chain shows its head and a few segments trailing up behind it.
  const segments = Math.min(def.chainLength ?? 1, 4);
  const step = 0.3;
  const top = mid + ((segments - 1) * step) / 2;
  for (let n = segments - 1; n >= 0; n--) enemies.push(standIn(kind, mid, top - n * step, ++id));
  const head = enemies[enemies.length - 1];
  if (def.fortress) assembleFortress(sim, head);
  const b = { c, px };
  // Fortress parts are drawn by their core.
  for (const e of enemies) if (!e.fortressPart) drawEnemyArt(b, e, sim);

  const data = c.getImageData(0, 0, SCRATCH, SCRATCH).data;
  let x0 = SCRATCH, y0 = SCRATCH, x1 = -1, y1 = -1;
  for (let y = 0; y < SCRATCH; y++)
    for (let x = 0; x < SCRATCH; x++)
      if (data[(y * SCRATCH + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The oak frame and the earth behind the enemy, in two-pixel steps. */
function paintFrame(c: CanvasRenderingContext2D, kind: EnemyKind) {
  const P = FRAME_COLOURS, S = PORTRAIT, u = 2;
  const box = (x: number, y: number, w: number, h: number, colour: string) => {
    c.fillStyle = colour;
    c.fillRect(x, y, w, h);
  };
  // Earth, dithered, lighter toward the floor in front.
  box(0, 0, S, S, P.earth);
  for (let y = BORDER; y < S - BORDER; y += u)
    for (let x = BORDER; x < S - BORDER; x += u) {
      const floor = (y - BORDER) / (S - 2 * BORDER);
      const r = hash01(x, y, kind.length);
      if (((x + y) / u) % 2 === 0 && r < 0.25 + floor * 0.5) box(x, y, u, u, floor > 0.6 && r < 0.2 ? P.earthLight : P.earthDither);
      else if (r > 0.985) box(x, y, u, u, P.earthSpeck);
    }
  // The oak moulding: a black outline, a lit top and left, grain, a shadowed
  // bottom and right, and a black line round the picture.
  box(0, 0, S, u, P.outline); box(0, S - u, S, u, P.outline);
  box(0, 0, u, S, P.outline); box(S - u, 0, u, S, P.outline);
  for (let k = u; k < BORDER - u; k += u) {
    const lit = k === u ? P.edge : k === BORDER - 2 * u ? P.dark : P.wood;
    const shade = k === u ? P.dark : k === BORDER - 2 * u ? P.light : P.wood;
    box(k, k, S - 2 * k, u, lit); box(k, k, u, S - 2 * k, lit);
    box(k, S - k - u, S - 2 * k, u, shade); box(S - k - u, k, u, S - 2 * k, shade);
  }
  // Grain streaks along each side.
  for (let n = 0; n < 10; n++) {
    const along = BORDER + Math.floor(hash01(n, 7) * (S - 2 * BORDER - 6) / u) * u, len = 4 + Math.floor(hash01(n, 9) * 3) * u;
    const k = 2 * u;
    if (n % 4 === 0) box(along, k, len, u, P.grain);
    else if (n % 4 === 1) box(along, S - k - u, len, u, P.grain);
    else if (n % 4 === 2) box(k, along, u, len, P.grain);
    else box(S - k - u, along, u, len, P.grain);
  }
  box(BORDER - u, BORDER - u, S - 2 * (BORDER - u), u, P.outline);
  box(BORDER - u, S - BORDER, S - 2 * (BORDER - u), u, P.outline);
  box(BORDER - u, BORDER - u, u, S - 2 * (BORDER - u), P.outline);
  box(S - BORDER, BORDER - u, u, S - 2 * (BORDER - u), P.outline);
  // Brass corner plates, each with a nail.
  for (const [cx, cy] of [[0, 0], [S - 12, 0], [0, S - 12], [S - 12, S - 12]]) {
    box(cx, cy, 12, 12, P.outline);
    box(cx + u, cy + u, 8, 8, P.brass);
    box(cx + u, cy + 8, 8, u, P.brassDark); box(cx + 8, cy + u, u, 8, P.brassDark);
    box(cx + 4, cy + 4, u, u, P.nail);
  }
}

let scratch: HTMLCanvasElement | null = null;

/** Paints `kind`'s framed portrait on an 80 × 80 canvas. */
export function paintPortrait(canvas: HTMLCanvasElement, kind: EnemyKind) {
  canvas.width = canvas.height = PORTRAIT;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = false;
  paintFrame(c, kind);
  scratch ??= Object.assign(document.createElement("canvas"), { width: SCRATCH, height: SCRATCH });
  // Measured at its art's own scale, then drawn again as large as fits:
  // baked sprites only in whole multiples, so their pixels stay even, and
  // bodies drawn in rectangles (fortresses too) at any scale.
  const native = scaleFor(kind), def = ENEMIES[kind];
  const first = drawOnScratch(scratch, kind, native);
  if (!first) return;
  const size = Math.max(first.w, first.h), baked = def.siege || def.boat || kind === "iceGolem" || kind === "iceCube";
  let px = size > FIT || !baked ? Math.max(2, Math.floor((native * FIT) / size)) : native * Math.floor(FIT / size);
  let box = drawOnScratch(scratch, kind, px);
  // Rounding can leave it a pixel or two over: step down until it fits.
  while (box && Math.max(box.w, box.h) > FIT && px > 2) box = drawOnScratch(scratch, kind, --px);
  if (!box) return;
  c.drawImage(scratch, box.x, box.y, box.w, box.h, Math.round((PORTRAIT - box.w) / 2), Math.round((PORTRAIT - box.h) / 2), box.w, box.h);
}

/** Paints every portrait canvas (`data-portrait` naming its kind) under `root`. */
export function paintPortraits(root: ParentNode) {
  root.querySelectorAll<HTMLCanvasElement>("canvas[data-portrait]").forEach(canvas => {
    const kind = canvas.dataset.portrait as EnemyKind;
    if (ENEMIES[kind]) paintPortrait(canvas, kind);
  });
}
