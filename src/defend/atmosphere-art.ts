/** Ground weather stays beneath combat silhouettes. A board-bounded raster
 * is repainted only when weather changes; drifting detail has a fixed cap. */
import { CELLS_W, CELLS_H, cellIndex } from "./grid.ts";
import { weatherNoise } from "./atmosphere.ts";
import type { DefendSim } from "./sim.ts";

export class AtmosphereArt {
  private canvas: HTMLCanvasElement | null = null;
  private data: ImageData | null = null;
  private sim: DefendSim | null = null;
  private key = "";

  draw(c: CanvasRenderingContext2D, px: number, sim: DefendSim, reduceMotion: boolean, effects: boolean) {
    const env = sim.atmosphere;
    if (!env) return;
    this.canvas ??= document.createElement('canvas');
    const cv = this.canvas;
    if (!this.data) {
      cv.width = CELLS_W * 2; cv.height = CELLS_H * 2;
      this.data = cv.getContext('2d')!.createImageData(cv.width, cv.height);
    }
    const key = `${env.version}:${reduceMotion}:${effects}`;
    if (sim !== this.sim || key !== this.key) {
      this.sim = sim; this.key = key;
      const data = this.data.data, mist = env.mode === 'mist';
      const t = reduceMotion ? 0 : env.time * .15;
      for (let y = 0; y < cv.height; y++) for (let x = 0; x < cv.width; x++) {
        const cx = x >> 1, cy = y >> 1, i = cellIndex(cx, cy), k = (y * cv.width + x) * 4;
        const depth = env.sand[i], haze = effects ? env.air[i] : 0;
        const noise = weatherNoise(x / 9 + t + env.vx[i] * .15, y / 9 + t * .4 + env.vy[i] * .15);
        const right = env.sand[cellIndex(Math.min(CELLS_W - 1, cx + 1), cy)];
        const below = env.sand[cellIndex(cx, Math.min(CELLS_H - 1, cy + 1))];
        const slope = Math.max(-30, Math.min(30, (depth * 2 - right - below) * 80));
        const sandAlpha = Math.min(.64, depth * .7), airAlpha = Math.min(.17, haze * (mist ? .2 : .09) * (.55 + noise * .7));
        data[k] = mist && depth < .03 ? 161 + noise * 20 : 196 + slope + noise * 12;
        data[k + 1] = mist && depth < .03 ? 188 + noise * 15 : 145 + slope + noise * 12;
        data[k + 2] = mist && depth < .03 ? 170 + noise * 20 : 72 + slope + noise * 10;
        data[k + 3] = Math.round(Math.max(sandAlpha, airAlpha) * 255);
      }
      cv.getContext('2d')!.putImageData(this.data, 0, 0);
    }
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(cv, 0, 0, CELLS_W * px, CELLS_H * px);
    if (effects && !reduceMotion && env.mode === 'sand') {
      c.fillStyle = 'rgba(242,210,146,.6)';
      const size = Math.max(1, Math.round(px * .08));
      for (const p of env.grains) {
        c.fillRect(Math.round(p.x * px), Math.round(p.y * px), size, size);
        // A short wind-aligned saltation streak, still below every enemy.
        c.fillRect(Math.round((p.x - env.wind.x * .17) * px), Math.round((p.y - env.wind.y * .17) * px), size, size);
      }
      c.lineWidth = Math.max(1, px * .045);
      for (const p of env.weeds) {
        c.save(); c.translate(p.x * px, p.y * px); c.rotate(p.turn);
        const r = Math.max(2, px * .32);
        c.strokeStyle = '#6c4d29'; c.beginPath();
        for (let n = 0; n <= 9; n++) {
          const a = n * Math.PI * 2 / 9, x = Math.cos(a) * r, y = Math.sin(a) * r * .8;
          if (!n) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.stroke(); c.strokeStyle = '#c39b58'; c.beginPath();
        for (let n = 0; n < 5; n++) {
          const a = n * Math.PI * 2 / 5;
          c.moveTo(Math.cos(a) * r, Math.sin(a) * r * .8);
          c.lineTo(-Math.cos(a + .4) * r * .8, -Math.sin(a + .4) * r * .7);
        }
        c.stroke(); c.restore();
      }
    }
    c.restore();
  }
}
