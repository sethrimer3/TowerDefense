/** What DEFEND draws over the board while the player is building: the dim
 * gold tile grid, and for a drag, which tiles accept the item, the hovered
 * tile, the item's ghost and an aimed bomb's reach. */
import { SUB, TILES_H, TILES_W, boardSize, tileKey, type Rect } from "./grid.ts";
import { QUARTER, QUARTERS_H, QUARTERS_W } from "./layout.ts";
import type { StructureKind } from "./catalog.ts";

export type Overlay = {
  /** Tile keys that accept the dragged item. */
  legal: Set<string>;
  hover: string | null;
  ghost: { rect: Rect; kind: StructureKind | "cityTile" | "cityGate" | "wallSpikes" | "wallBallista" | "wallBlock" } | null;
  /** A piece of the wall being carried (a gate, spikes or a ballista): the
   * stretches or corners of wall that take it, the one under the pointer
   * and whether it fits there. */
  gates?: { legal: Rect[]; hover: Rect | null; fits: boolean };
  /** A wall section being carried: the quarter tiles (keyed "qx,qy") that
   * take it, the one under the pointer and whether it fits there. The
   * placing grid turns four times finer. */
  walls?: { legal: Set<string>; hover: string | null; fits: boolean };
  /** A structure being carried: the cells its footprint would take under
   * the pointer, whether it fits there, and whether it keeps a clear
   * quarter round it (every building but monster bait). The board shows its
   * grid of quarter tiles. Null before it is over the board. */
  quarters?: { rect: Rect; fits: boolean; clear: boolean } | null;
  /** With `quarters`: one flag a quarter tile of the board (row by row),
   * set where some spot the structure can take covers it; the rest are
   * shaded. */
  open?: Uint8Array;
  /** A bomb being aimed: centre in cells. */
  bomb?: { x: number; y: number; r: number } | null;
  /** The war banner being planted: centre and the reach it rallies to. */
  banner?: { x: number; y: number; r: number } | null;
  /** A strike spell being aimed: centre, reach, and (filled in by the page)
   * the fallen it would raise there. */
  spell?: { x: number; y: number; r: number; souls?: { x: number; y: number }[]; look?: "meteor" | "frost" | "reinforce"; spots?: { x: number; y: number; look: string }[] } | null;
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
  if (o.quarters !== undefined) drawQuarterGrid(c, px, o.open);
  else if (o.walls) drawWallTargets(c, px, o.walls);
  else if (o.gates) drawGateTargets(c, px, o.gates);
  else if (o.legal.size || o.ghost || o.hover !== null) drawTargets(c, px, o);
  if (o.ghost) drawGhost(c, px, o.ghost.rect);
  if (o.quarters) drawFootprint(c, px, o.quarters);
  if (o.bomb) drawBombReach(c, px, o.bomb);
  if (o.banner) drawRallyReach(c, px, o.banner);
  if (o.spell?.look === "meteor") drawMeteorReach(c, px, o.spell);
  else if (o.spell?.look === "frost") drawFrostReach(c, px, o.spell);
  else if (o.spell?.look === "reinforce") drawReinforceReach(c, px, o.spell);
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

/** The Frost nova's reach, in ice blue, with a six-pointed snowflake where it bursts. */
function drawFrostReach(c: CanvasRenderingContext2D, px: number, at: { x: number; y: number; r: number }) {
  c.strokeStyle = "rgba(170,225,255,0.95)";
  c.fillStyle = "rgba(90,170,230,0.16)";
  c.lineWidth = Math.max(1, px * 0.12);
  c.setLineDash([px * 0.25, px * 0.25]);
  c.beginPath();
  c.arc(at.x * px, at.y * px, at.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.setLineDash([]);
  // A pixel snowflake: a plus and an x, outlined in black.
  const k = Math.max(1, Math.round(px * 0.1)), x = Math.round(at.x * px), y = Math.round(at.y * px);
  const arms: [number, number][] = [];
  for (let i = -3; i <= 3; i++) arms.push([i, 0], [0, i]);
  for (let i = -2; i <= 2; i++) if (i) arms.push([i, i], [i, -i]);
  c.fillStyle = "#0b1622";
  for (const [i, j] of arms) c.fillRect(x + i * k - k, y + j * k - k, 3 * k, 3 * k);
  for (const [i, j] of arms) {
    c.fillStyle = Math.abs(i) + Math.abs(j) <= 1 ? "#ffffff" : "#bfe8ff";
    c.fillRect(x + i * k, y + j * k, k, k);
  }
}

/** The Reinforcements' aim: the ground they will hold, in faint gold, and a
 * gold pixel chevron pointing down at each spot a soldier will land on (a
 * larger one for a champion). */
function drawReinforceReach(c: CanvasRenderingContext2D, px: number, at: NonNullable<Overlay["spell"]>) {
  c.strokeStyle = "rgba(246,199,90,0.7)";
  c.fillStyle = "rgba(246,199,90,0.08)";
  c.lineWidth = Math.max(1, px * 0.08);
  c.setLineDash([px * 0.3, px * 0.3]);
  c.beginPath();
  c.arc(at.x * px, at.y * px, at.r * px, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.setLineDash([]);
  const chevron: [number, number][] = [[-2, -1], [-1, 0], [0, 1], [1, 0], [2, -1]];
  for (const s of at.spots ?? []) {
    const k = Math.max(1, Math.round(px * (s.look === "champion" ? 0.14 : 0.09))), x = Math.round(s.x * px), y = Math.round(s.y * px);
    c.fillStyle = "#140c0a";
    for (const [i, j] of chevron) c.fillRect(x + i * k - k, y + j * k - k, 3 * k, 3 * k);
    c.fillStyle = s.look === "archer" ? "#a8e07a" : "#f6c75a";
    for (const [i, j] of chevron) c.fillRect(x + i * k, y + j * k, k, k);
  }
}

/** The board's grid of quarter tiles, those no spot covers shaded (`open`),
 * the tile lines over the finer ones. */
function drawQuarterGrid(c: CanvasRenderingContext2D, px: number, open?: Uint8Array) {
  const Q = (px * SUB) / QUARTER;
  const { W, H } = boardSize(px);
  const at = (q: number) => Math.round(q * Q);
  if (open) {
    c.fillStyle = "rgba(0,0,0,0.4)";
    for (let qy = 0; qy < QUARTERS_H; qy++)
      for (let qx = 0; qx < QUARTERS_W; qx++) {
        if (open[qy * QUARTERS_W + qx]) continue;
        // Runs of shaded quarters in a row are one rectangle, so no seams.
        let end = qx + 1;
        while (end < QUARTERS_W && !open[qy * QUARTERS_W + end]) end++;
        c.fillRect(at(qx), at(qy), at(end) - at(qx), at(qy + 1) - at(qy));
        qx = end - 1;
      }
  }
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = "rgba(216,181,114,0.22)";
  c.beginPath();
  for (let qx = 1; qx < QUARTERS_W; qx++) if (qx % QUARTER) { c.moveTo(at(qx) + 0.5, 0); c.lineTo(at(qx) + 0.5, H); }
  for (let qy = 1; qy < QUARTERS_H; qy++) if (qy % QUARTER) { c.moveTo(0, at(qy) + 0.5); c.lineTo(W, at(qy) + 0.5); }
  c.stroke();
  c.strokeStyle = "rgba(216,181,114,0.5)";
  c.beginPath();
  for (let tx = 1; tx < TILES_W; tx++) { c.moveTo(at(tx * QUARTER) + 0.5, 0); c.lineTo(at(tx * QUARTER) + 0.5, H); }
  for (let ty = 1; ty < TILES_H; ty++) { c.moveTo(0, at(ty * QUARTER) + 0.5); c.lineTo(W, at(ty * QUARTER) + 0.5); }
  c.stroke();
  c.restore();
}

/** For a structure, over its ghost: the quarters its footprint would take
 * under the pointer, tinted and framed (gold where it fits, red where it
 * won't), and for a building the clear quarter it keeps round it dashed. */
function drawFootprint(c: CanvasRenderingContext2D, px: number, q: NonNullable<Overlay["quarters"]>) {
  const x = Math.round(q.rect.x * px), y = Math.round(q.rect.y * px);
  const w = Math.round((q.rect.x + q.rect.w) * px) - x, h = Math.round((q.rect.y + q.rect.h) * px) - y;
  const lw = Math.max(1, px * 0.14);
  if (q.clear) {
    const m = Math.round((px * SUB) / QUARTER);
    c.save();
    c.lineWidth = Math.max(1, px * 0.08);
    c.strokeStyle = q.fits ? "rgba(242,201,76,0.75)" : "rgba(230,70,80,0.75)";
    c.setLineDash([Math.max(2, px * 0.5), Math.max(2, px * 0.35)]);
    c.strokeRect(x - m + 0.5, y - m + 0.5, w + 2 * m - 1, h + 2 * m - 1);
    c.restore();
  }
  c.fillStyle = q.fits ? "rgba(242,201,76,0.18)" : "rgba(200,40,50,0.38)";
  c.fillRect(x, y, w, h);
  c.save();
  c.strokeStyle = q.fits ? "rgba(242,201,76,0.7)" : "rgba(230,70,80,0.7)";
  c.lineWidth = 1;
  c.beginPath();
  const step = (px * SUB) / QUARTER;
  for (let k = step; k < w - 1; k += step) { c.moveTo(Math.round(x + k) + 0.5, y); c.lineTo(Math.round(x + k) + 0.5, y + h); }
  for (let k = step; k < h - 1; k += step) { c.moveTo(x, Math.round(y + k) + 0.5); c.lineTo(x + w, Math.round(y + k) + 0.5); }
  c.stroke();
  c.restore();
  c.lineWidth = lw;
  c.strokeStyle = q.fits ? "rgba(242,201,76,0.95)" : "rgba(230,70,80,0.9)";
  c.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
}

/** For a wall section: the board's grid of quarter tiles, those that won't
 * take it shaded, the tile lines over the finer ones, and the quarter under
 * the pointer framed (red where it won't go). */
function drawWallTargets(c: CanvasRenderingContext2D, px: number, w: NonNullable<Overlay["walls"]>) {
  const Q = (px * SUB) / QUARTER;
  const { W, H } = boardSize(px);
  const at = (q: number) => Math.round(q * Q);
  for (let qy = 0; qy < QUARTERS_H; qy++)
    for (let qx = 0; qx < QUARTERS_W; qx++) {
      const ok = w.legal.has(`${qx},${qy}`);
      c.fillStyle = ok ? "rgba(242,201,76,0.05)" : "rgba(0,0,0,0.4)";
      c.fillRect(at(qx), at(qy), at(qx + 1) - at(qx), at(qy + 1) - at(qy));
    }
  c.save();
  c.lineWidth = 1;
  c.strokeStyle = "rgba(216,181,114,0.22)";
  c.beginPath();
  for (let qx = 1; qx < QUARTERS_W; qx++) if (qx % QUARTER) { c.moveTo(at(qx) + 0.5, 0); c.lineTo(at(qx) + 0.5, H); }
  for (let qy = 1; qy < QUARTERS_H; qy++) if (qy % QUARTER) { c.moveTo(0, at(qy) + 0.5); c.lineTo(W, at(qy) + 0.5); }
  c.stroke();
  c.strokeStyle = "rgba(216,181,114,0.5)";
  c.beginPath();
  for (let tx = 1; tx < TILES_W; tx++) { c.moveTo(at(tx * QUARTER) + 0.5, 0); c.lineTo(at(tx * QUARTER) + 0.5, H); }
  for (let ty = 1; ty < TILES_H; ty++) { c.moveTo(0, at(ty * QUARTER) + 0.5); c.lineTo(W, at(ty * QUARTER) + 0.5); }
  c.stroke();
  c.restore();
  if (w.hover === null) return;
  const [qx, qy] = w.hover.split(",").map(Number);
  const lw = Math.max(1, px * 0.14), x = at(qx), y = at(qy), s = at(qx + 1) - x;
  c.fillStyle = w.fits ? "rgba(242,201,76,0.18)" : "rgba(200,40,50,0.22)";
  c.fillRect(x, y, s, s);
  c.lineWidth = lw;
  c.strokeStyle = w.fits ? "rgba(242,201,76,0.95)" : "rgba(230,70,80,0.85)";
  c.strokeRect(x + lw / 2, y + lw / 2, s - lw, s - lw);
}
