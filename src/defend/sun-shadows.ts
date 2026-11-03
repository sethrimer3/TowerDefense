/** Cached moving sunlight over the existing city height map. */
import type { Sun } from "../daylight.ts";
import { CELLS_W, CELLS_H } from "./grid.ts";
import { ART } from "./art-scale.ts";
import type { CityMap, Building } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { heights, paintShadows, sunShadowMask } from "./shadow-art.ts";
import { spriteFootprint, standingKey } from "./city-layer.ts";
import { pixelKey } from "./pixel-sprites.ts";

export class SunShadows {
  private map: CityMap | null = null;
  private terrain = "";
  private direction = "";
  private h: Float32Array = new Float32Array(0);
  private canvas: HTMLCanvasElement | null = null;
  /** When (`performance.now()`) the heights were last taken. */
  private cast = -Infinity;
  private stands = 0;

  draw(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, sun: Sun, looks?: Readonly<Record<number, string>>) {
    if (sun.strength <= 0) return;
    // What stands, not `mapVersion`, which also counts each rebuilt cell.
    const terrain = `${pixelKey()}:${looks ? Object.entries(looks).join() : ""}`, stands = sim ? standingKey(sim) : -1;
    const x = Math.round(sun.x * 8) / 8, y = Math.round(sun.y * 8) / 8, direction = `${x}:${y}`;
    // Buildings falling every frame (a worm through the city) recast the
    // whole board's shadows at most every `RECAST_MS`.
    const clock = performance.now();
    if (this.map !== map || this.terrain !== terrain || this.stands !== stands && clock - this.cast >= RECAST_MS) {
      this.cast = clock; this.stands = stands;
      const standing = (b: Building) => (!sim || sim.intact(b)) && !(b.structureUid !== undefined && looks?.[b.structureUid] === "cloudborne");
      this.h = heights(map, standing, b => spriteFootprint(map, b, b.structureUid !== undefined ? looks?.[b.structureUid] : undefined));
      this.map = map; this.terrain = terrain; this.direction = "";
    }
    if (this.direction !== direction) {
      this.canvas ??= Object.assign(document.createElement("canvas"), { width: CELLS_W * ART, height: CELLS_H * ART });
      const off = this.canvas.getContext("2d")!;
      off.clearRect(0, 0, this.canvas.width, this.canvas.height);
      paintShadows(off, sunShadowMask(this.h, x, y), ART);
      this.direction = direction;
    }
    c.save(); c.imageSmoothingEnabled = false; c.globalAlpha *= Math.min(1, sun.strength / .27);
    c.drawImage(this.canvas!, 0, 0, CELLS_W * px, CELLS_H * px); c.restore();
  }
}

/** Milliseconds at least between recasting for buildings falling or rising. */
const RECAST_MS = 250;
