/** Plank bridges where a road crosses water (`CityMap.bridges`), painted over the ponds at `ART` pixels a cell:
 * planks laid across the way over the water, a seam between each, a dark rail and posts along each side, in a
 * black outline. A deck reaches a cell onto each bank. Presentation only. */
import { CELLS_W, CELLS_H, cellIndex, hash } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import { ART } from "./park-art.ts";

const PLANKS = ["#9a6b3f", "#8c5f36", "#a3754a"],
  SEAM = "#4a2f17",
  RAIL = "#5a3a1e",
  POST = "#3d2814",
  OUTLINE = "#100c08";

/** Each connected bridge's cells, and whether its way runs down the board (planks across) or along it. */
export function bridgeSpans(map: CityMap) {
  const b = map.bridges,
    spans: { cells: number[]; down: boolean }[] = [];
  if (!b) return spans;
  const seen = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) {
    if (!b[i] || seen[i]) continue;
    const cells: number[] = [],
      stack = [i];
    seen[i] = 1;
    let x0 = CELLS_W,
      x1 = 0,
      y0 = CELLS_H,
      y1 = 0;
    while (stack.length) {
      const c = stack.pop()!,
        x = c % CELLS_W,
        y = (c - x) / CELLS_W;
      cells.push(c);
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= CELLS_W || ny >= CELLS_H) continue;
        const n = cellIndex(nx, ny);
        if (b[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    spans.push({ cells, down: y1 - y0 >= x1 - x0 });
  }
  return spans;
}

export function paintBridges(c: CanvasRenderingContext2D, px: number, map: CityMap) {
  const b = map.bridges;
  if (!b) return;
  const a = px / ART,
    fill = (color: string, ax: number, ay: number, w: number, h: number) => {
      const x = Math.round(ax * a),
        y = Math.round(ay * a);
      c.fillStyle = color;
      c.fillRect(x, y, Math.round((ax + w) * a) - x, Math.round((ay + h) * a) - y);
    };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < CELLS_W && y < CELLS_H && b[cellIndex(x, y)] > 0;
  for (const span of bridgeSpans(map))
    for (const cell of span.cells) {
      const cx = cell % CELLS_W,
        cy = (cell - cx) / CELLS_W,
        ax = cx * ART,
        ay = cy * ART;
      // Planks two art pixels wide across the way, toned by their place along it, a seam after each.
      for (let k = 0; k < ART; k += 2) {
        const along = (span.down ? ay : ax) + k,
          tone = PLANKS[hash(along, span.cells[0], 0xb1) % PLANKS.length];
        if (span.down) {
          fill(tone, ax, ay + k, ART, 1);
          fill(SEAM, ax, ay + k + 1, ART, 1);
        } else {
          fill(tone, ax + k, ay, 1, ART);
          fill(SEAM, ax + k + 1, ay, 1, ART);
        }
      }
      // A rail with posts along each side the deck ends on, outlined toward the water.
      const sides = span.down
        ? ([
            [-1, 0],
            [1, 0],
          ] as const)
        : ([
            [0, -1],
            [0, 1],
          ] as const);
      for (const [dx, dy] of sides) {
        if (on(cx + dx, cy + dy)) continue;
        if (span.down) {
          const x = dx < 0 ? ax : ax + ART - 2;
          fill(RAIL, x, ay, 2, ART);
          fill(OUTLINE, dx < 0 ? ax : ax + ART - 1, ay, 1, ART);
          for (let k = 0; k < ART; k += 4) fill(POST, x, ay + k, 2, 2);
        } else {
          const y = dy < 0 ? ay : ay + ART - 2;
          fill(RAIL, ax, y, ART, 2);
          fill(OUTLINE, ax, dy < 0 ? ay : ay + ART - 1, ART, 1);
          for (let k = 0; k < ART; k += 4) fill(POST, ax + k, y, 2, 2);
        }
      }
    }
}
