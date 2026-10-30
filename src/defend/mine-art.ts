import { drawSmall } from "./small-art.ts";
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
    const pose=m.age<MINELAYER.arm?0:1;
    drawSmall(c,px,m.smart?"smart-mine":"mine",pose,m.x,m.y);

  }
}
