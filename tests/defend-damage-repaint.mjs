// A building's damage stage changing repaints only the boxes round it: the
// city layer, the lighting's body/rim masks and their occlusion read back
// must match a whole repaint exactly, and cost a fraction of one.
// Needs `npm run dev`. PLAYWRIGHT_EXECUTABLE / TEST_URL supported.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
try {
  for (const [width, dpr, crisp] of [[1280, 1, true], [390, 3, true], [1280, 1, false]]) {
    const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: dpr });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'tests/performance.html');
    const out = await page.evaluate(async ({ width, crisp }) => {
      const { stressScene } = await import('/tests/defend-stress-scene.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const s = stressScene(150);
      const make = () => { const cv = document.createElement('canvas'); const r = new DefendRenderer(cv); r.crisp = crisp; r.resize(width * devicePixelRatio, 800 * devicePixelRatio); return r; };
      const opts = now => ({ grid: 0, weather: { rain: false }, night: 1, now, reduceMotion: false, effects: true, mergedOutlines: true, area: 'moss' });
      const a = make();
      let full = 0; const paint = a.paintMasks.bind(a); a.paintMasks = (...x) => { full++; return paint(...x); };
      a.draw(s.map, s.sim, null, opts(0));
      const pixels = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const compare = (r, b) => {
        const diff = (x, y) => { if (x.length !== y.length) return -1; let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };
        return { layer: diff(pixels(r.layer), pixels(b.layer)), body: diff(pixels(r.bodyMask), pixels(b.bodyMask)), rim: diff(pixels(r.rimMask), pixels(b.rimMask)), covered: diff(r.lighting.masks.covered, b.lighting.masks.covered), art: diff(r.lighting.masks.pixels, b.lighting.masks.pixels) };
      };
      const kinds = ['house', 'wall', 'barracks', 'archerTower', 'keep', 'gate', 'wizardTower'];
      const results = [];
      const timings = [];
      for (const [step, fraction] of [[0, .6], [1, .4], [2, .1], [3, 1], [4, .3]]) {
        // Several buildings of every kind, some side by side, change stage.
        for (const kind of kinds) {
          const all = s.map.buildings.filter(b => b.kind === kind);
          for (let i = step; i < all.length; i += Math.max(1, Math.floor(all.length / 2))) { const b = all[i]; s.sim.hp[b.id] = s.sim.maxHp[b.id] * fraction; }
        }
        const before = full, t = performance.now();
        a.draw(s.map, s.sim, null, opts(16 * (step + 1)));
        timings.push(performance.now() - t);
        const fresh = make(); fresh.draw(s.map, s.sim, null, opts(16 * (step + 1)));
        results.push({ step, incremental: full === before, ...compare(a, fresh) });
      }
      return { results, timings };
    }, { width, crisp });
    for (const r of out.results) {
      assert.ok(r.incremental, `step ${r.step} repainted incrementally`);
      // Masks are painted at whole pixels a cell, and so is the layer with
      // Crisp pixel zoom (the default): exact. With a fractional scale a
      // few anti-aliased pixels on a box's edge may differ by a shade.
      assert.deepEqual({ body: r.body, rim: r.rim, covered: r.covered, art: r.art }, { body: 0, rim: 0, covered: 0, art: 0 }, `step ${r.step} masks match a whole repaint`);
      if (crisp) assert.equal(r.layer, 0, `step ${r.step} layer matches a whole repaint`);
      else assert.ok(r.layer >= 0 && r.layer < 2000, `step ${r.step} layer differs only on box edges: ${r.layer}`);
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px @${dpr}x crisp ${crisp}: ${out.results.length} incremental damage repaints match whole repaints (layer differences: ${out.results.map(r => r.layer).join(', ')}); frame ms ${out.timings.map(t => t.toFixed(0)).join(', ')}`);
    await page.close();
  }
} finally { await browser.close(); }
