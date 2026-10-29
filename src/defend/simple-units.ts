/** The Simple enemies and Simple troops settings: every unit drawn as one
 * crisp square in its colour inside a black outline, lit along the top and
 * left and shaded along the bottom and right, one art pixel each. Squares
 * are batched into one path per colour, so a crowd of thousands costs a
 * handful of fills. Presentation only. */
import { FLAG_BEARER, HERO, SHADE, HOPLITE, JAVELINEER, LANCER, SPEARMAN, ARCHER_UNIT, ASSASSIN_UNIT, BRAWLER, DARK_WIZARD, ENEMIES, enemySize, FIRE_MAGE, GATLING_GUNNER, GUNNER, MACHINE_GUNNER, MUSKETEER, RAIL_SNIPER, ROCKETEER, SLINGER, SNIPER, SOLDIER, VALKYRIE } from "./catalog.ts";
import type { Enemy, Soldier } from "./sim.ts";
import type { UnitInks } from "./unit-outline.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };

/** Each troop kind's size and colour, shared with the garrison badges. */
export const TROOPS: Record<Soldier["kind"], { size: number; color: string }> = {
  sword: SOLDIER,
  archer: ARCHER_UNIT,
  mage: FIRE_MAGE,
  valkyrie: VALKYRIE,
  darkWizard: DARK_WIZARD,
  undead: { size: SOLDIER.size, color: "#cfd3bf" },
  reinforcement: { size: SOLDIER.size, color: "#a9bde0" },
  brawler: BRAWLER,
  slinger: SLINGER,
  sniper: SNIPER,
  musketeer: MUSKETEER,
  gunner: GUNNER,
  machineGunner: MACHINE_GUNNER,
  gatlingGunner: GATLING_GUNNER,
  railSniper: RAIL_SNIPER,
  rocketeer: ROCKETEER,
  spearman: SPEARMAN,
  hoplite: HOPLITE,
  javelineer: JAVELINEER,
  lancer: LANCER,
  hero: HERO,
  shade: SHADE,
  flagBearer: FLAG_BEARER,
  assassin: ASSASSIN_UNIT,
};

/** Squares waiting to be filled, as flat x, y, side runs, by fill colour;
 * kept between frames so a frame allocates nothing once warm. */
const fills = new Map<string, number[]>();
const outlines = new Map<string, number[]>();

function add(map: Map<string, number[]>, color: string, x: number, y: number, s: number) {
  let list = map.get(color);
  if (!list) map.set(color, (list = []));
  list.push(x, y, s);
}

/** Every queued square: outlines (on `rims`), bodies, then the light and
 * shade edges. */
function flush(c: CanvasRenderingContext2D, k: number, rims = c, rimFor?: (color: string) => CanvasRenderingContext2D) {
  for (const [color, q] of outlines) {
    if (!q.length) continue;
    const r = rimFor?.(color) ?? rims;
    r.fillStyle = color;
    r.beginPath();
    for (let i = 0; i < q.length; i += 3) r.rect(q[i] - k, q[i + 1] - k, q[i + 2] + 2 * k, q[i + 2] + 2 * k);
    r.fill();
    q.length = 0;
  }
  const edges: number[] = [];
  for (const [color, q] of fills) {
    if (!q.length) continue;
    c.fillStyle = color;
    c.beginPath();
    for (let i = 0; i < q.length; i += 3) {
      c.rect(q[i], q[i + 1], q[i + 2], q[i + 2]);
      if (q[i + 2] >= 3 * k) edges.push(q[i], q[i + 1], q[i + 2]);
    }
    c.fill();
    q.length = 0;
  }
  if (!edges.length) return;
  c.fillStyle = "rgba(255,255,255,0.32)";
  c.beginPath();
  for (let i = 0; i < edges.length; i += 3) {
    const x = edges[i], y = edges[i + 1], s = edges[i + 2];
    c.rect(x, y, s - k, k);
    c.rect(x, y + k, k, s - 2 * k);
  }
  c.fill();
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.beginPath();
  for (let i = 0; i < edges.length; i += 3) {
    const x = edges[i], y = edges[i + 1], s = edges[i + 2];
    c.rect(x + k, y + s - k, s - k, k);
    c.rect(x + s - k, y + k, k, s - 2 * k);
  }
  c.fill();
}

/** One art pixel in canvas pixels: the outline and edge thickness. */
const artPixel = (px: number) => Math.max(1, Math.round(px / 8));

function queue(px: number, k: number, x: number, y: number, size: number, color: string, outline: string) {
  const s = Math.max(2 * k, Math.round(size * px));
  const sx = Math.round(x * px - s / 2), sy = Math.round(y * px - s / 2);
  add(outlines, outline, sx, sy, s);
  add(fills, color, sx, sy, s);
}

/** Enemies as squares, gold-outlined while marked, white while struck.
 * With `rims`, the outlines go there (merged outlines, `unit-outline.ts`). */
export function drawSimpleEnemies({ c, px }: Brush, enemies: readonly Enemy[], rims = c, inks?: UnitInks, rimFor?: (color: string) => CanvasRenderingContext2D) {
  const k = artPixel(px);
  for (const e of enemies) {
    const def = ENEMIES[e.kind];
    if (def.darkPixels) {
      const s = k * def.darkPixels;
      c.fillStyle = "#000000";
      c.fillRect(Math.round(e.x * px - s / 2), Math.round(e.y * px - s / 2), s, s);
      continue;
    }
    queue(px, k, e.x, e.y, enemySize(e), e.flash > 0 ? "#ffffff" : def.color, inks?.ink(e.id) ?? (e.marked ? "#f2c94c" : def.boss ? "#7a1616" : "#000000"));
  }
  flush(c, k, rims, rimFor);
}

/** Your troops as squares, white while struck, their outlines on `rims`. */
export function drawSimpleTroops({ c, px }: Brush, soldiers: readonly Soldier[], rims = c, inks?: UnitInks, rimFor?: (color: string) => CanvasRenderingContext2D) {
  const k = artPixel(px);
  for (const u of soldiers) {
    const t = TROOPS[u.kind];
    queue(px, k, u.x, u.y, t.size, u.flash > 0 ? "#ffffff" : t.color, inks?.ink(u.id) ?? "#000000");
  }
  flush(c, k, rims, rimFor);
}
