import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_W, LightField, RES, poolSamples, type PoolSamples } from '../src/defend/light-field.ts';
import { glowColor, lightFalloff } from '../src/torch-light.ts';

const close = (a: number, b: number, eps = 1e-4) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

/** A light's two bakes, `size` cells square from cell (left, top), with levels from `level`. */
function pool(left: number, top: number, size: number, level: (x: number, y: number, side: number) => number): PoolSamples & { values: Float32Array[] } {
  const cols = size * RES, rows = size * RES;
  const values = [0, 1].map((side) => {
    const v = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) v[y * cols + x] = level(x, y, side);
    return v;
  });
  return { ...poolSamples([values[0], values[1]], cols, glowColor), cols, rows, left, top, values };
}

/** What a canvas-held sample of level `v` is: alpha (0–1) and premultiplied colour. */
function sample(v: number) {
  if (v <= 0.003) return [0, 0, 0, 0];
  const px = new Uint8ClampedArray([...glowColor(v), Math.min(255, v * 255)]);
  const a = px[3] / 255;
  return [a, px[0] * a, px[1] * a, px[2] * a];
}

test('a pool carves the darkness and adds the glow as destination-out and lighter would', () => {
  const p = pool(4, 6, 3, (x, y, side) => (side ? 0.2 : ((x + y) % 7) / 7));
  const f = new LightField();
  f.clear();
  f.addPool(p, 0, 0.9, 0.5, 0.4, 0.7);
  for (const [x, y] of [[0, 0], [3, 2], [8, 8], [5, 1]]) {
    const o = (p.top * RES + y) * FIELD_W + p.left * RES + x;
    const [a0, r0] = sample(p.values[0][y * p.cols + x]);
    const [a1, r1] = sample(p.values[1][y * p.cols + x]);
    close(f.keep[o], (1 - 0.9 * a0) * (1 - 0.4 * a1));
    close(f.glow[3][o], (0.5 * a0 + 0.7 * a1) * 255, 1e-3);
    close(f.glow[0][o], 0.5 * r0 + 0.7 * r1, 1e-3);
  }
  // Outside the pool nothing changes.
  assert.equal(f.keep[0], 1);
  assert.equal(f.glow[3][0], 0);
});

test('overlapping pools multiply the darkness and sum the glow; a new frame starts clear', () => {
  const a = pool(10, 10, 2, () => 0.5), b = pool(11, 10, 2, () => 0.25);
  const f = new LightField();
  f.clear();
  f.addPool(a, 0, 1, 1, 0, 0);
  f.addPool(b, 0, 1, 1, 0, 0);
  const o = (10 * RES + 1) * FIELD_W + 11 * RES + 1;
  close(f.keep[o], (1 - sample(0.5)[0]) * (1 - sample(0.25)[0]));
  close(f.glow[3][o], (sample(0.5)[0] + sample(0.25)[0]) * 255, 1e-3);
  f.clear();
  assert.equal(f.keep[o], 1);
  assert.equal(f.glow[3][o], 0);
});

test("the flame's bob shifts a pool between rows as a bilinear draw would", () => {
  // Bright in one row only.
  const p = pool(20, 20, 2, (_, y) => (y === 2 ? 1 : 0));
  const f = new LightField();
  f.clear();
  f.addPool(p, 0.25, 0, 1, 0, 0);
  const row = (y: number) => f.glow[3][(20 * RES + y) * FIELD_W + 20 * RES + 1];
  close(row(2), 0.75 * 255, 1e-3);
  close(row(3), 0.25 * 255, 1e-3);
  assert.equal(row(1), 0);
  f.clear();
  f.addPool(p, -0.25, 0, 1, 0, 0);
  close(row(1), 0.25 * 255, 1e-3);
  close(row(2), 0.75 * 255, 1e-3);
  assert.equal(row(3), 0);
});

test('hand torches fall off in the candle palette, clamp, and clear each frame', () => {
  const f = new LightField();
  const out = new Uint8ClampedArray(f.keep.length * 4);
  f.clear();
  // A sample centre exactly on the flame, and one beyond its reach.
  const x = (30 * RES + 0.5) / RES, y = (40 * RES + 0.5) / RES;
  f.addTorch(x, y, 2, 0.5);
  f.paintTorches(out);
  const at = (gx: number, gy: number) => (gy * FIELD_W + gx) * 4;
  const core = at(30 * RES, 40 * RES);
  assert.equal(out[core + 3], Math.round(0.5 * lightFalloff(0.5 / 1024, 1) * 255));
  const [r] = glowColor(lightFalloff(0.5 / 1024, 1));
  assert.ok(Math.abs(out[core] - r) <= 1);
  assert.equal(out[at(30 * RES + 7, 40 * RES) + 3], 0, 'beyond reach');
  // Stacked torches clamp as lighter does.
  for (let i = 0; i < 5; i++) f.addTorch(x, y, 2, 1);
  f.paintTorches(out);
  assert.equal(out[core + 3], 255);
  f.clear();
  f.paintTorches(out);
  assert.equal(out[core + 3], 0, 'last frame forgotten');
});

test('a glow past full is painted at a half or quarter, with the doublings to restore it', () => {
  const f = new LightField();
  const out = new Uint8ClampedArray(f.keep.length * 4);
  f.clear();
  f.glow[3][5] = 200;
  f.glow[0][5] = 102;
  assert.equal(f.paintGlow(out), 0);
  assert.deepEqual([...out.slice(20, 24)], [130, 0, 0, 200]);
  f.glow[3][5] = 600;
  f.glow[0][5] = 306;
  assert.equal(f.paintGlow(out), 2);
  assert.deepEqual([...out.slice(20, 24)], [130, 0, 0, 150]);
  f.glow[3][5] = 5000;
  assert.equal(f.paintGlow(out), 2, 'at most a quarter');
  assert.equal(out[23], 255);
});

test('the darkness is the ambient colour at its alpha, as much as each sample keeps', () => {
  const f = new LightField();
  const out = new Uint8ClampedArray(f.keep.length * 4);
  f.clear();
  f.keep[3] = 0.5;
  f.paintDark(out, [7, 10, 24], 0.72);
  assert.deepEqual([...out.slice(0, 4)], [7, 10, 24, 184]);
  assert.deepEqual([...out.slice(12, 16)], [7, 10, 24, 92]);
});
