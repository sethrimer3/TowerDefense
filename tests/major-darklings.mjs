// All Darklings' portal contours in the production renderer: the fiery
// dimension shows only through their outlines, scrolls with the wall clock and
// holds still under Reduce Motion. Isolated fixture, no player saves. Start the
// Vite server first.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
mkdirSync('test-results', { recursive: true });
try {
  const results = [];
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
    const r = await page.evaluate(async (phone) => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { UPGRADES } = await import('/src/defend/catalog.ts');
      document.body.innerHTML = '';
      const w = phone ? 390 : 1280, h = phone ? 844 : 800;
      const map = generateCity(fitLayout(defaultLayout()), 3);
      const scene = major => {
        const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
        for (let i = 0; i < 12; i++) sim.spawnAuxiliary(major ? 'majorDarkling' : 'largeDarkling', 18 + (i % 4) * 1.5, 8 + Math.floor(i / 4) * 1.5);
        for (let i = 0; i < 30; i++) sim.spawnAuxiliary(i % 3 ? 'miniDarkling' : 'darkling', 24 + (i % 6) * .3, 9 + Math.floor(i / 6) * .3);
        return sim;
      };
      const cv = document.createElement('canvas'); cv.style.cssText = `width:${w}px;height:${h}px;display:block`;
      document.body.append(cv);
      const renderer = new DefendRenderer(cv); renderer.resize(w, h);
      renderer.cam.s = phone ? 5 : 4; renderer.cam.x = cv.width / 2 - 22 * renderer.px * renderer.cam.s; renderer.cam.y = cv.height / 2 - 10 * renderer.px * renderer.cam.s;
      const c = cv.getContext('2d');
      const count = (sim, now, reduceMotion = false) => {
        const opts = { grid: 0, weather: null, night: 0, now, reduceMotion, effects: false, mergedOutlines: true };
        renderer.draw(map, sim, null, opts);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let fire = 0, hash = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 110 && d[i] > d[i + 1] && d[i + 1] > d[i + 2] && d[i] - d[i + 2] > 80 && d[i + 1] > 25) { fire++; hash = (hash * 31 + d[i] + d[i + 1] * 7) | 0; }
        return { fire, hash };
      };
      const base = scene(false); count(base, 900); const plain = count(base, 1000);
      const sim = scene(true);
      count(sim, 900); const a = count(sim, 1000), b = count(sim, 4000);
      const still = [count(sim, 1000, true), count(sim, 9000, true)];
      // Leave a frame showing for the screenshot.
      count(sim, 2500);
      return { plain, a, b, still, width: cv.width, height: cv.height };
    }, phone);
    await page.screenshot({ path: `test-results/major-darklings-${phone ? 'phone' : 'desktop'}.png` });
    assert.deepEqual(errors, []);
    assert.ok(r.plain.fire > 0, 'Large and smaller Darklings have fiery contours too');
    assert.ok(r.a.fire > r.plain.fire, `portal contours show fire (${r.a.fire} vs ${r.plain.fire})`);
    assert.notEqual(r.a.hash, r.b.hash, 'the dimension scrolls with the wall clock');
    assert.deepEqual(r.still[0], r.still[1], 'Reduce Motion holds it still');
    results.push({ phone, ...r });
    await page.close();
  }
  writeFileSync('test-results/major-darklings.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
