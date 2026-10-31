// Isolated fixtures; never opens a game save. Start the Vite server first.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  const checks = await page.evaluate(async () => {
    const { DarkDrain, DarkDensity } = await import('/src/defend/dark-drain.ts');
    const { drawEnemyArt } = await import('/src/defend/battle-art.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
    const canvas = document.querySelector('canvas');
    canvas.width = 1100; canvas.height = 900; canvas.style.cssText = 'width:1100px;height:900px';
    const c = canvas.getContext('2d', { willReadFrequently: true });
    const crowd = n => Array.from({ length: n }, (_, id) => ({ id, kind: id % 13 === 0 ? 'largeDarkling' : id % 7 ? 'miniDarkling' : 'darkling', hp: 1, x: 20, y: 20 }));
    const sample = (x, y) => Array.from(c.getImageData(x, y, 1, 1).data).slice(0, 3);
    const pixels = [];
    // Actual compositing: a colorful detailed field, identical in each panel.
    for (const [panel, n] of [9, 10, 35, 60].entries()) {
      c.save(); c.translate(panel % 2 * 550, Math.floor(panel / 2) * 450);
      for (let y = 0; y < 45; y++) for (let x = 0; x < 55; x++) {
        c.fillStyle = `hsl(${(x * 5 + y * 3) % 360} 65% ${35 + ((x + y) % 3) * 8}%)`;
        c.fillRect(x * 10, y * 10, 10, 10);
      }
      c.fillStyle = '#dc6432'; c.fillRect(190, 190, 20, 20);
      const sim = { enemies: crowd(n), time: 1 };
      const drain = new DarkDrain(); drain.draw(c, 10, sim, 1000);
      const ox = panel % 2 * 550, oy = Math.floor(panel / 2) * 450;
      pixels.push({ count: n, center: sample(ox + 200, oy + 200), edge: sample(ox + 290, oy + 200), outside: sample(ox + 400, oy + 200) });
      c.fillStyle = '#eee3c7'; c.font = '20px monospace'; c.fillText(`${n} dark enemies`, 22, 35);
      c.font = '14px monospace'; c.fillText(n < 10 ? 'Below threshold' : n < 60 ? 'Growing radial drain' : 'Grayscale core, contrast preserved', 22, 58);
      for (let i = 0; i < Math.min(n, 60); i++) drawEnemyArt({ c, px: 10 }, { ...crowd(1)[0], kind: i % 13 === 0 ? 'largeDarkling' : i % 7 ? 'miniDarkling' : 'darkling', x: 19 + (i % 10) * .25, y: 19 + Math.floor(i / 10) * .25 }, sim);
      c.restore();
    }
    // Saturation blending removes color while retaining the original gray span.
    const full = pixels[3].center;
    const grayscale = Math.max(...full) - Math.min(...full);
    const contrast = [];
    for (const value of [20, 220]) {
      const cv = document.createElement('canvas'); cv.width = cv.height = 400;
      const cc = cv.getContext('2d'); cc.fillStyle = `rgb(${value},${value},${value})`; cc.fillRect(0, 0, 400, 400);
      const drain = new DarkDrain(); drain.draw(cc, 10, { enemies: crowd(60), time: 1 }, 1000);
      contrast.push(cc.getImageData(200, 200, 1, 1).data[0]);
    }
    const benchmarks = [];
    for (const n of [1000, 5000, 10000]) {
      const es = Array.from({ length: n }, (_, i) => ({ ...crowd(1)[0], x: .5 + (i * 7 % 71), y: .5 + (i * 13 % 103) }));
      const d = new DarkDensity(), samples = [];
      for (let i = 0; i < 35; i++) { const start = performance.now(); d.update(es); if (i >= 5) samples.push(performance.now() - start); }
      samples.sort((a, b) => a - b);
      benchmarks.push({ enemies: n, densityMedianMs: samples[15], densityP95Ms: samples[28], fieldBytes: d.field.byteLength });
    }
    // Full production renderer at desktop and phone sizes, zoomed and panned,
    // graphics/settings combinations, and paused repeats.
    const frames = [];
    const map = generateCity(fitLayout(defaultLayout()), 3);
    const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    for (let i = 0; i < 60; i++) sim.spawnAuxiliary(i % 13 === 0 ? 'largeDarkling' : i % 7 ? 'miniDarkling' : 'darkling', 20 + (i % 10) * .15, 10 + Math.floor(i / 10) * .15);
    for (const phone of [false, true]) for (const reduced of [false, true]) for (const simple of [false, true]) for (const pixel of [false, true]) {
      setPixelArt(pixel);
      const cv = document.createElement('canvas'); cv.style.cssText = `width:${phone ? 390 : 800}px;height:${phone ? 700 : 850}px`;
      document.body.append(cv);
      const renderer = new DefendRenderer(cv); renderer.resize(phone ? 390 : 800, phone ? 700 : 850);
      renderer.cam.s = 1.5; renderer.cam.x = -20; renderer.cam.y = -20;
      const opts = { grid: 0, weather: null, night: 0, now: 1000, reduceMotion: reduced, effects: false, simpleEnemies: simple, mergedOutlines: true };
      renderer.draw(map, sim, null, opts); renderer.draw(map, sim, null, { ...opts, now: 1200 });
      const drain = renderer.darkDrain;
      frames.push({ phone, reduced, simple, pixel, active: drain.density.active, width: cv.width, height: cv.height });
      cv.remove();
    }
    return { pixels, grayscale, contrast, benchmarks, frames };
  });
  assert.equal(checks.grayscale, 0, 'maximum center is fully grayscale');
  assert.deepEqual(checks.pixels[0].center, [220, 100, 50], 'nine enemies preserve color');
  assert.deepEqual(checks.contrast, [20, 220], 'grayscale preserves the full tonal contrast');
  assert.ok(checks.frames.every(f => f.active), 'effect survives all viewports/settings');
  assert.deepEqual(errors, []);
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/darklings.json', JSON.stringify(checks, null, 2));
  await page.screenshot({ path: 'test-results/darklings.png' });
  console.log(JSON.stringify(checks, null, 2));
} finally { await browser.close(); }
