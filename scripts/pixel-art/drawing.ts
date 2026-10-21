import { BUILDING_PALETTE } from "../../src/defend/building-sprite-manifest.ts";

const P = BUILDING_PALETTE;
export type Color = keyof typeof P;

export class Drawing {
  data: Uint8Array;
  constructor(readonly w: number, readonly h: number, data?: Uint8Array) {
    this.data = data ?? new Uint8Array(w * h * 4);
  }
  dot(x: number, y: number, color: Color) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, rgb = Number.parseInt(P[color].slice(1), 16);
    this.data.set([rgb >> 16, (rgb >> 8) & 255, rgb & 255, 255], i);
  }
  rect(x: number, y: number, w: number, h: number, color: Color) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.dot(xx, yy, color);
  }
  line(x: number, y: number, x1: number, y1: number, color: Color) {
    const dx = Math.abs(x1 - x), sx = x < x1 ? 1 : -1, dy = -Math.abs(y1 - y), sy = y < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.dot(x, y, color);
      if (x === x1 && y === y1) break;
      const e = err * 2;
      if (e >= dy) { err += dy; x += sx; }
      if (e <= dx) { err += dx; y += sy; }
    }
  }
  stamp(rows: readonly string[], x: number, y: number, colors: Record<string, Color>) {
    rows.forEach((row, yy) => [...row].forEach((ch, xx) => { if (ch !== ".") this.dot(x + xx, y + yy, colors[ch]); }));
  }
  clear(x: number, y: number, w: number, h: number) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      if (xx >= 0 && yy >= 0 && xx < this.w && yy < this.h) this.data.fill(0, (yy * this.w + xx) * 4, (yy * this.w + xx + 1) * 4);
    }
  }
  copy(source: Drawing, x: number, y: number) {
    for (let yy = 0; yy < source.h; yy++) for (let xx = 0; xx < source.w; xx++) {
      const i = (yy * source.w + xx) * 4;
      this.data.set(source.data.subarray(i, i + 4), ((yy + y) * this.w + xx + x) * 4);
    }
  }
}

export type Ramp = readonly [Color, Color, Color];
