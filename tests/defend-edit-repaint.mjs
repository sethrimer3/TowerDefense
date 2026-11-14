// A building placed, moved or taken up while building regenerates the city,
// but the renderer repaints only round what changed: the city layer, the
// lighting's body/rim masks and their occlusion read back must match a
// whole repaint exactly, the lights that stayed put keep burning (their
// bakes carried over, never dark for a frame) and every bake ends equal to
// a fresh one; and it costs a fraction of a whole repaint.
// Needs `npm run dev`. PLAYWRIGHT_EXECUTABLE / TEST_URL supported.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
try {
  for (const [width, dpr, area] of [[1280, 1, 'moss'], [390, 3, 'moss'], [1280, 1, 'desert']]) {
    const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 }, deviceScaleFactor: dpr });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'tests/performance.html');
    const out = await page.evaluate(async ({ width, area }) => {
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout, placeStructureAt, moveStructureTo, removeStructure, structureSpots } = await import('/src/defend/layout.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const { forestPlan } = await import('/src/defend/forest.ts');
      const { DayClock, useDayClock } = await import('/src/daylight.ts');
      useDayClock(new DayClock(60_000), () => ({ dayNightCycle: false, timeOfDay: 'night' }));
      let layout = defaultLayout(); const k = layout.keep;
      layout.cityTiles = [[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]].map(([dx, dy]) => `${k.tx + dx},${k.ty + dy}`);
      const city = l => { const fit = fitLayout(l); if (!fit.ok) throw new Error(fit.reason); const m = generateCity(fit, 7); m.trails = { seed: 7 }; return m; };
      const make = () => { const cv = document.createElement('canvas'); const r = new DefendRenderer(cv); r.crisp = true; r.resize(width * devicePixelRatio, 800 * devicePixelRatio); return r; };
      const opts = now => ({ grid: 0, night: 1, now, reduceMotion: false, effects: true, mergedOutlines: true, area });
      const settle = (r, m, t) => { for (let i = 0; i < 200 && (i < 2 || r.lighting.queue.size); i++) r.draw(m, null, null, opts(t + i * 16)); };
      const a = make();
      let full = 0; const paint = a.paintMasks.bind(a); a.paintMasks = (...x) => { full++; return paint(...x); };
      let map = city(layout);
      settle(a, map, 0);
      const pixels = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const diff = (x, y) => { if (x.length !== y.length) return -1; let n = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) n++; return n; };
      const bakes = r => new Map([...r.lighting.bakes].map(([id, b]) => [id, b.pair.map(p => Array.from(p.values).join(',')).join('|')]));
      const edits = [];
      const spots = kind => structureSpots(layout, kind);
      const place = (kind, pick) => { const s = spots(kind); const next = placeStructureAt(layout, kind, s[Math.floor(s.length * pick)]); if (!next) throw new Error('not placed'); return next; };
      edits.push(['place tower', () => place('archerTower', 0.3)]);
      edits.push(['place hall', () => place('barracks', 0.7)]);
      edits.push(['move tower', () => { const st = layout.structures.find(s => s.kind === 'archerTower'); const s = structureSpots(layout, 'archerTower', st.uid); return moveStructureTo(layout, st.uid, s[Math.floor(s.length * 0.8)]); }]);
      for (const [kind, at] of [['wizardTower', 0.1], ['mageGuild', 0.5], ['cannonTower', 0.9], ['library', 0.4], ['meleeGuild', 0.2]]) edits.push([`place ${kind}`, () => place(kind, at)]);
      edits.push(['take up hall', () => removeStructure(layout, layout.structures.find(s => s.kind === 'barracks').uid)]);
      const results = [];
      for (const [name, edit] of edits) {
        const next = edit(); if (!next) throw new Error(name + ' failed');
        layout = next;
        const was = map; map = city(layout);
        const lit = a.lighting.lights.length, before = full, t = performance.now();
        a.draw(map, null, null, opts(5000));
        const ms = performance.now() - t;
        // Lights that stayed put burn on this very frame.
        const dark = a.lighting.lights.filter(l => !a.lighting.bakes.get(l.id)).length;
        settle(a, map, 5016);
        const fresh = make(); settle(fresh, map, 5000);
        const ba = bakes(a), bf = bakes(fresh);
        let bakeDiff = 0; for (const [id, v] of bf) if (ba.get(id) !== v) bakeDiff++;
        results.push({ name, ms, incremental: full === before, sharedForest: forestPlan(was) === forestPlan(map), dark, lights: a.lighting.lights.length, was: lit, bakeDiff,
          layer: diff(pixels(a.layer), pixels(fresh.layer)), layerBytes: a.layer.width * a.layer.height * 4, body: diff(pixels(a.bodyMask), pixels(fresh.bodyMask)), rim: diff(pixels(a.rimMask), pixels(fresh.rimMask)),
          grass: JSON.stringify(a.grass.plans) === JSON.stringify(fresh.grass.plans) ? 0 : 1,
          forestGrass: JSON.stringify(a.forestGrass.plans) === JSON.stringify(fresh.forestGrass.plans) && JSON.stringify(Array.from(a.forestGrass.sway?.gx ?? [])) === JSON.stringify(Array.from(fresh.forestGrass.sway?.gx ?? [])) ? 0 : 1,
          floor: a.forest.floor && fresh.forest.floor ? diff(a.forest.floor.px, fresh.forest.floor.px) : 0,
          covered: diff(a.lighting.masks.covered, fresh.lighting.masks.covered), art: diff(a.lighting.masks.pixels, fresh.lighting.masks.pixels) });
      }
      // A whole repaint of the same city, for comparison.
      const b = make(); settle(b, city(defaultLayout()), 0);
      const t = performance.now(); b.draw(map, null, null, opts(5000)); const wholeMs = performance.now() - t;
      const t2 = performance.now(); for (let i = 0; i < 10; i++) b.draw(map, null, null, opts(6000 + i * 16)); const steadyMs = (performance.now() - t2) / 10;
      return { results, wholeMs, steadyMs };
    }, { width, area });
    for (const r of out.results) {
      assert.ok(r.incremental, `${r.name}: repainted incrementally`);
      // The board's scale is fractional, and the browser samples a pixel-art
      // canvas drawn up through a clip (the box) a pixel off here and there
      // from drawing it whole: a few scattered pixels may differ by a shade.
      assert.ok(r.layer >= 0 && r.layer < r.layerBytes * 1e-3, `${r.name}: layer differs only by sampling (${r.layer} bytes)`);
      assert.deepEqual({ body: r.body, rim: r.rim, covered: r.covered, art: r.art, bakes: r.bakeDiff, floor: r.floor, grass: r.grass, forestGrass: r.forestGrass }, { body: 0, rim: 0, covered: 0, art: 0, bakes: 0, floor: 0, grass: 0, forestGrass: 0 }, `${r.name}: matches a whole repaint`);
      assert.ok(r.dark <= Math.abs(r.lights - r.was) + 6, `${r.name}: only new lights wait for a bake (${r.dark} dark of ${r.lights})`);
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px @${dpr}x ${area}: ${out.results.map(r => `${r.name} ${r.ms.toFixed(0)} ms (forest kept ${r.sharedForest}, ${r.dark} of ${r.lights} lights unbaked)`).join('; ')}; whole repaint ${out.wholeMs.toFixed(0)} ms, steady frame ${out.steadyMs.toFixed(0)} ms`);
    await page.close();
  }
} finally { await browser.close(); }
