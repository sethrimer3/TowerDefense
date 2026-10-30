import { ART } from "./art-scale.ts";
import { basicName, basicUnitSprite } from "./basic-unit-art.ts";
import { hasArtOverride } from "./art-overrides.ts";
import { drawSprite } from "./damage-art.ts";
/** The Simple enemies and Simple troops settings: every unit drawn as one
 * crisp square body; UnitContours supplies its outside outline. Lit along the top and
 * left and shaded along the bottom and right, one art pixel each. Squares
 * are batched into one path per colour, so a crowd of thousands costs a
 * handful of fills. Presentation only. */
import { ENEMIES, enemySize } from "./catalog.ts";
import type { Enemy, Soldier } from "./sim.ts";
import type { UnitInks } from "./unit-outline.ts";

type Brush = { c: CanvasRenderingContext2D; px: number };
const DARKLING_SOURCES = Object.values(ENEMIES).filter(def => def.darkPixels).map(def => basicName(def.kind, true));

export { TROOPS } from "./unit-bodies.ts";
import { TROOPS } from "./unit-bodies.ts";

/** Squares waiting to be filled, as flat x, y, side runs, by fill colour;
 * kept between frames so a frame allocates nothing once warm. */
const fills = new Map<string, number[]>();

function add(map: Map<string, number[]>, color: string, x: number, y: number, s: number) {
  let list = map.get(color);
  if (!list) map.set(color, (list = []));
  list.push(x, y, s);
}

/** Every queued body, then its light and shade edges. */
function flush(c: CanvasRenderingContext2D, k: number, rims = c, rimFor?: (color: string) => CanvasRenderingContext2D) {
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
const artPixel = (px: number) => Math.max(1, Math.round(px / ART));

function queue(px: number, k: number, x: number, y: number, size: number, color: string, outline: string) {
  const s = Math.max(2 * k, Math.round(size * px));
  const sx = Math.round(x * px - s / 2), sy = Math.round(y * px - s / 2);
  add(fills, color, sx, sy, s);
}

/** Enemies as squares, gold-outlined while marked, white while struck.
 * With `rims`, the outlines go there (merged outlines, `unit-outline.ts`). */
export function drawSimpleEnemies({ c, px }: Brush, enemies: readonly Enemy[], rims = c, inks?: UnitInks, rimFor?: (color: string) => CanvasRenderingContext2D) {
  const k = artPixel(px);
  drawDarklingBodies({ c, px }, enemies, false);
  for (const e of enemies) {
    const def = ENEMIES[e.kind];
    if (def.darkPixels) continue;
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

/** Fill pixel bodies as one union. Separate antialiased fillRect calls can
 * leave faint seams where two flush bodies meet under a fractional camera. */
export function drawDarklingBodies({ c, px }: Brush, enemies: readonly Enemy[], sourceArt = true) {
  c.fillStyle = "#000000"; c.beginPath();
  const replacements = sourceArt && DARKLING_SOURCES.some(hasArtOverride);
  let any = false;
  for (const e of enemies) {
    const side = ENEMIES[e.kind].darkPixels;
    if (!side || e.raidProxy) continue;
    const d = px / ART * side;
    if (replacements && hasArtOverride(basicName(e.kind, true))) {
      drawSprite(c, basicUnitSprite(e.kind, true), e.x * px - d / 2, e.y * px - d / 2, d, d);
      continue;
    }
    c.rect(e.x * px - d / 2, e.y * px - d / 2, d, d); any = true;
  }
  if (any) c.fill();
}
