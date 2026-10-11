/** What DEFEND draws over the board while the player is building: the dim
 * gold tile grid, and for a drag, which tiles accept the item, the hovered
 * tile, the item's ghost and an aimed bomb's reach. */
import { SUB, TILES_H, TILES_W, boardSize, tileKey, type Rect } from "./grid.ts";
import type { StructureKind } from "./catalog.ts";

export type Overlay = {
  /** Tile keys that accept the dragged item. */
  legal: Set<string>;
  hover: string | null;
  ghost: { rect: Rect; kind: StructureKind | "cityTile" | "cityGate" | "wallSpikes" | "wallBallista" } | null;
  /** A piece of the wall being carried (a gate, spikes or a ballista): the
   * stretches or corners of wall that take it, the one under the pointer
   * and whether it fits there. */
  gates?: { legal: Rect[]; hover: Rect | null; fits: boolean };
  /** A bomb being aimed: centre in cells. */
  bomb?: { x: number; y: number; r: number } | null;
  /** The war banner being planted: centre and the reach it rallies to. */
  banner?: { x: number; y: number; r: number } | null;
  /** A strike spell being aimed: centre, reach, and (filled in by the page)
   * the fallen it would raise there. */
  spell?: { x: number; y: number; r: number; souls?: { x: number; y: number }[]; look?: "meteor" } | null;
  /** Tiles across the block the item takes (unset: 1). A larger item's
   * `legal` and `hover` keys are the top left tiles of its blocks. */
  span?: number;
};

/** Dim gold tile lines at `alpha`, `px` canvas pixels per cell. */
export function drawGrid(c: CanvasRenderingContext2D, px: number, alpha: number) {
  const T = px * SUB;
  const { W: width, H: height } = boardSize(px);
  c.save();
  c.strokeStyle = `rgba(216,181,114,${alpha})`;
  c.lineWidth = 1;
  c.beginPath();
  for (let tx = 1; tx < TILES_W; tx++) {
    const x = Math.round(tx * T) + 0.5;
    c.moveTo(x, 0);
    c.lineTo(x, height);
  }
  for (let ty = 1; ty < TILES_H; ty++) {
    const y = Math.round(ty * T) + 0.5;
    c.moveTo(0, y);
    c.lineTo(width, y);
  }
  c.stroke();
  c.restore();
}

export function drawOverlay(c: CanvasRenderingContext2D, px: number, o: Overlay) {
  if (o.gates) drawGateTargets(c, px, o.gates);
  else if (o.legal.size || o.ghost || o.hover !== null) drawTargets(c, px, o);
  if (o.ghost) drawGhost(c, px, o.ghost.rect);
  if (o.bomb) drawBombReach(c, px, o.bomb);
  if (o.banner) drawRallyReach(c, px, o.banner);
  if (o.spell?.look === "meteor") drawMeteorReach(c, px, o.spell);
  else if (o.spell) drawSpellReach(c, px, o.spell);
}

/** Shades the tiles that won't take the item and frames those that will,
 * the hovered one brightest. */
function drawTargets(c: CanvasRenderingContext2D, px: number, o: Overlay) {
  if ((o.span ?? 1) > 1) return drawBlockTargets(c, px, o, o.span!);
  const T = px * SUB;
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const key = tileKey(tx, ty);
      const x = Math.round(tx * T),
        y = Math.round(ty * T),
        s = Math.round((tx + 1) * T) - x;
      if (!o.legal.has(key)) {
        c.fillStyle = "rgba(0,0,0,0.38)";
        c.fillRect(x, y, s, s);
        continue;
      }
      const hover = key === o.hover;
      c.fillStyle = hover ? "rgba(242,201,76,0.16)" : "rgba(242,201,76,0.04)";
      c.fillRect(x, y, s, s);
      c.strokeStyle = hover ? "rgba(242,201,76,0.9)" : "rgba(242,201,76,0.38)";
      c.lineWidth = Math.max(1, px * (hover ? 0.16 : 0.08));
      c.strokeRect(x + c.lineWidth / 2, y + c.lineWidth / 2, s - c.lineWidth, s - c.lineWidth);
    }
}

/** For an item spanning a block of tiles: shades every tile no legal block
 * covers, tints those some block does, and frames the whole block under the
 * pointer, gold where it fits and red where it won't, so the player sees
 * every tile it takes. */
function drawBlockTargets(c: CanvasRenderingContext2D, px: number, o: Overlay, span: number) {
  const T = px * SUB;
  const covered = new Set<string>();
  for (const key of o.legal) {
    const [tx, ty] = key.split(",").map(Number);
    for (let dy = 0; dy < span; dy++) for (let dx = 0; dx < span; dx++) covered.add(tileKey(tx + dx, ty + dy));
  }
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const x = Math.round(tx * T), y = Math.round(ty * T), s = Math.round((tx + 1) * T) - x;
      c.fillStyle = covered.has(tileKey(tx, ty)) ? "rgba(242,201,76,0.04)" : "rgba(0,0,0,0.38)";
      c.fillRect(x, y, s, s);
    }
  if (o.hover === null) return;
  const [hx, hy] = o.hover.split(",").map(Number);
  const fits = o.legal.has(o.hover);
  const x = Math.round(hx * T), y = Math.round(hy * T);
  const w = Math.round(Math.min(TILES_W, hx + span) * T) - x, h = Math.round(Math.min(TILES_H, hy + span) * T) - y;
  c.fillStyle = fits ? "rgba(242,201,76,0.16)" : "rgba(200,40,50,0.18)";
  c.fillRect(x, y, w, h);
  const lw = Math.max(1, px * 0.16);
  c.lineWidth = lw;
  c.strokeStyle = fits ? "rgba(242,201,76,0.9)" : "rgba(230,70,80,0.85)";
  c.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  // The seams between the block's tiles, fainter.
  c.lineWidth = Math.max(1, px * 0.08);
  c.setLineDash([Math.max(2, px * 0.5), Math.max(2, px * 0.35)]);
  c.beginPath();
  for (let k = 1; k < span; k++) {
    const sx = Math.round((hx + k) * T) + 0.5, sy = Math.round((hy + k) * T) + 0.5;
    if (hx + k < TILES_W) {
      c.moveTo(sx, y);
      c.lineTo(sx, y + h);
    }
    if (hy + k < TILES_H) {
      c.moveTo(x, sy);
      c.lineTo(x + w, sy);
    }
  }
  c.stroke();
  c.setLineDash([]);
}

/** For a piece of the wall: dims the board and frames every stretch or
 * corner of wall that takes it, the one under the pointer brightest (red where it won't go). */
function drawGateTargets(c: CanvasRenderingContext2D, px: number, g: NonNullable<Overlay["gates"]>) {
  const { W, H } = boardSize(px);
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(0, 0, W, H);
  const frame = (r: Rect, fill: string, stroke: string, lw: number) => {
    const x = Math.round(r.x * px), y = Math.round(r.y * px), w = Math.round((r.x + r.w) * px) - x, h = Math.round((r.y + r.h) * px) - y;
    c.fillStyle = fill;
    c.fillRect(x, y, w, h);
    c.lineWidth = lw;
    c.strokeStyle = stroke;
    c.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  };
  for (const r of g.legal) frame(r, "rgba(242,201,76,0.12)", "rgba(242,201,76,0.6)", Math.max(1, px * 0.1));
  if (g.hover && !g.fits) frame(g.hover, "rgba(200,40,50,0.22)", "rgba(230,70,80,0.85)", Math.max(1, px * 0.16));
}

function drawGhost(c: CanvasRenderingContext2D, px: number, r: Rect) {
  c.fillStyle = "rgba(242,210,122,0.45)";
  c.fillRect(r.x * px, r.y * px, r.w * px, r.h * px);
  c.strokeStyle = "#f2d27a";
  c.lineWidth = Math.max(1, px * 0.12);
  c.strokeRect(r.x * px, r.y * px, r.w * px, r.h * px);
}

function drawBombReach(c: CanvasRenderingContext2D, px: number, bomb: { x: number; y: number; r: number }) {
  c.strokeStyle = "rgba(255,150,60,0.9)";
  c.fillStyle = "rgba(255,120,40,0.15)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.beginPath();
  c.arc(bomb.x * px, bomb.y * px, bomb.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

function drawRallyReach(c: CanvasRenderingContext2D, px: number, at: { x: number; y: number; r: number }) {
  c.strokeStyle = "rgba(242,210,122,0.9)";
  c.fillStyle = "rgba(242,210,122,0.12)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.beginPath();
  c.arc(at.x * px, at.y * px, at.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
}

/** The Necromancy spell's reach, in grave green, with a pale mark over each
 * fallen enemy it would raise. */
function drawSpellReach(c: CanvasRenderingContext2D, px: number, at: NonNullable<Overlay["spell"]>) {
  c.strokeStyle = "rgba(141,255,166,0.9)";
  c.fillStyle = "rgba(63,154,92,0.16)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.beginPath();
  c.arc(at.x * px, at.y * px, at.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  const d = Math.max(2, Math.round(px * 0.25));
  for (const s of at.souls ?? []) {
    const x = Math.round(s.x * px - d / 2), y = Math.round(s.y * px - d / 2);
    c.fillStyle = "#0b0907";
    c.fillRect(x - 1, y - 1, d + 2, d + 2);
    c.fillStyle = "#c9ffd4";
    c.fillRect(x, y, d, d);
  }
}

/** The Meteor strike's reach, in ember red, with a cross where it lands. */
function drawMeteorReach(c: CanvasRenderingContext2D, px: number, at: { x: number; y: number; r: number }) {
  c.strokeStyle = "rgba(255,150,70,0.95)";
  c.fillStyle = "rgba(200,69,42,0.16)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.setLineDash([px * 0.4, px * 0.25]);
  c.beginPath();
  c.arc(at.x * px, at.y * px, at.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.setLineDash([]);
  const d = Math.max(3, Math.round(px * 0.35)), w = Math.max(1, Math.round(px * 0.1));
  const x = Math.round(at.x * px), y = Math.round(at.y * px);
  c.fillStyle = "#140c0a";
  c.fillRect(x - d - 1, y - w - 1, 2 * d + 2, 2 * w + 2);
  c.fillRect(x - w - 1, y - d - 1, 2 * w + 2, 2 * d + 2);
  c.fillStyle = "#f6c75a";
  c.fillRect(x - d, y - w, 2 * d, 2 * w);
  c.fillRect(x - w, y - d, 2 * w, 2 * d);
}
