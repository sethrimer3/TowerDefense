/** Small top-down charges on the same native art lattice as other projectiles. */
import { ART } from "./park-art.ts";
import { artPen } from "./pixel-fx.ts";
import { MINELAYER } from "../knowledge-paths.ts";
import type { DefendSim } from "./sim.ts";

export function drawMines(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean) {
  if (!sim.mines.length) return;
  const dot = artPen(c, px);
  for (const m of sim.mines) {
    const x = Math.round(m.x * ART), y = Math.round(m.y * ART);
    if (m.smart) {
      const step = !reduceMotion && Math.floor((m.x + m.y) * ART) % 2 ? 1 : 0;
      c.fillStyle = "#151912";
      dot(x - 3, y - 1 + step, 1, 2); dot(x + 2, y - step, 1, 2);
    }
    c.fillStyle = "#141913"; dot(x - 2, y - 2, 4, 4);
    c.fillStyle = m.smart ? "#8b9271" : "#656c4a"; dot(x - 1, y - 1, 2, 2);
    c.fillStyle = "#c3c49a"; dot(x - 1, y - 1, 1, 1);
    c.fillStyle = m.age < MINELAYER.arm ? "#67635d" : "#dc6a35"; dot(x, y, 1, 1);
  }
}
