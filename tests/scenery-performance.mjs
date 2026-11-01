// Native scenery/lighting A/B and invalidation checks; no player saves.
// Start npm run dev. Reference modules are frozen from before these fixes.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const sources = ['lighting.ts', 'forest-art.ts'].map(file => [file, execFileSync('git', ['show', `9515016:src/defend/${file}`], { encoding: 'utf8' })
  .replace(/from "\.\.\/(.*?)"/g, 'from "../../src/$1"').replace(/from "\.\/(.*?)"/g, 'from "../../src/defend/$1"')]);
const root = `test-results/scenery-reference-${createHash('sha256').update(JSON.stringify(sources)).digest('hex').slice(0, 16)}`;
mkdirSync(root, { recursive: true });
for (const [file, source] of sources) writeFileSync(`${root}/${file}`, source);
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/@vite/client', route => route.fulfill({ contentType: 'application/javascript', body: 'export const injectQuery = url => url;' }));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async root => {
    const currentForest = await import('/src/defend/forest-art.ts'), oldForest = await import(`/${root}/forest-art.ts`);
    const { forestPlan, ForestDamage } = await import('/src/defend/forest.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { DefendLighting, MASK } = await import('/src/defend/lighting.ts');
    const { DefendLighting: OldLighting } = await import(`/${root}/lighting.ts`);
    const { paintBuildingMask } = await import('/src/defend/city-layer.ts');
    const { ambientFor } = await import('/src/defend/weather.ts');
    const { bumpPixelArt } = await import('/src/defend/pixel-sprites.ts');
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const compare = (a, b) => {
      let max = 0, differences = 0;
      for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); max = Math.max(max, d); if (d) differences++; }
      return { max, differences };
    };
    const image = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const measure = tasks => {
      const samples = Object.fromEntries(Object.keys(tasks).map(k => [k, []]));
      for (const f of Object.values(tasks)) for (let i = 0; i < 3; i++) f();
      for (let round = 0; round < 9; round++) {
        const entries = Object.entries(tasks); if (round % 2) entries.reverse();
        for (const [key, f] of entries) { const t = performance.now(); f(); samples[key].push(performance.now() - t); }
      }
      return Object.fromEntries(Object.entries(samples).map(([key, a]) => [key, +a.sort((a, b) => a - b)[4].toFixed(3)]));
    };
    const map = generateCity(fitLayout(defaultLayout()), 7), plan = forestPlan(map), damage = new ForestDamage(plan);
    const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4); sim.breakT = 1e9;
    const W = 72 * 8, H = 104 * 8, a = new Uint32Array(W * H), b = new Uint32Array(W * H);
    const forest = [];
    for (const box of [{ x0: 64, y0: 144, x1: 96, y1: 176 }, { x0: 0, y0: 0, x1: W, y1: H }]) {
      const ms = measure({ before: () => oldForest.paintFloor(a, plan, damage, box), after: () => currentForest.paintFloor(b, plan, damage, box) });
      forest.push({ box, ms, ...compare(a, b) });
    }
    const mountains = plan.boulders.filter(b => b.cells.length >= 9);
    const reusedMountains = mountains.every(b => currentForest.mountainSource(b) === currentForest.mountainSource(b));
    const masks = ['body', 'rim'].map(mode => { const cv = make(72 * MASK, 104 * MASK); paintBuildingMask(cv.getContext('2d'), MASK, { map, sim, lights: [], stones: [] }, mode); return cv; });
    const lighting = [];
    for (const px of [6, 9.23076923076923, 18]) {
      const layers = [new OldLighting(), new DefendLighting()], canvases = layers.map(() => make(720, 840));
      const intact = id => sim.intact(map.buildings[id]);
      for (const L of layers) { L.setMap(map); L.setMasks(...masks); L.bakePending(sim.solid, 1e4); L.update(sim.solid, [], intact); }
      const frame = { px, now: 1234, reduceMotion: false, intact }, carried = { torches: [{ id: 13, x: 30, y: 40 }], solid: sim.solid, version: sim.mapVersion };
      const draw = (index, ambient = ambientFor({ rain: true }, 1)) => {
        const c = canvases[index].getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.fillStyle = '#73615a'; c.fillRect(0, 0, c.canvas.width, c.canvas.height);
        c.translate((c.canvas.width - 72 * px) / 2, (c.canvas.height - 104 * px) / 2);
        layers[index].drawLight(c, frame, ambient, carried);
        // Buildings and moving unit contours use different surface sizes.
        const outline = r => { r.fillStyle = '#fff'; r.fillRect(24, 24, 16, 16); };
        layers[index].shineOutlines(c, outline, { body: unitBody, by: .75 });
      };
      const unitBody = make(720, 840); unitBody.getContext('2d').fillRect(25, 25, 14, 14);
      const ms = measure({ before: () => draw(0), after: () => draw(1) });
      const checks = [];
      const verify = label => { draw(0); draw(1); checks.push({ label, ...compare(image(canvases[0]), image(canvases[1])) }); };
      verify('warmed');
      frame.now = 4567; verify('flicker');
      for (const alpha of [.3, .8]) {
        const ambient = { ...ambientFor({ rain: false }, alpha), color: alpha < .5 ? '#111827' : '#281b2a' };
        draw(0, ambient); draw(1, ambient); checks.push({ label: 'ambient ' + alpha, ...compare(image(canvases[0]), image(canvases[1])) });
      }
      // Repaint masks in place: identity alone cannot validate cached alpha.
      const keep = sim.keep.rect;
      for (const cv of masks) { const c = cv.getContext('2d'); c.clearRect((keep.x + keep.w / 2 - .5) * MASK, (keep.y + keep.h / 2 - .5) * MASK, MASK, MASK); }
      for (const L of layers) { L.setMasks(...masks); L.bakePending(sim.solid, 1e4); L.update(sim.solid, [], intact); }
      verify('repainted masks');
      const L = layers[1], fixed = L.buildingGrown, fixedRim = L.buildingRimLit, dynamic = L.grown;
      let resizes = 0, beforeResizes = 0;
      for (const cv of [fixed, fixedRim, dynamic, L.rimLit]) for (const property of ['width', 'height']) {
        const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
        Object.defineProperty(cv, property, { configurable: true, get() { return d.get.call(this); }, set(v) { resizes++; d.set.call(this, v); } });
      }
      for (const cv of [layers[0].grown, layers[0].rimLit]) for (const property of ['width', 'height']) {
        const d = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
        Object.defineProperty(cv, property, { configurable: true, get() { return d.get.call(this); }, set(v) { beforeResizes++; d.set.call(this, v); } });
      }
      let growthCopies = 0; const g = fixed.getContext('2d'), blit = g.drawImage.bind(g);
      g.drawImage = (...args) => { growthCopies++; return blit(...args); };
      for (let i = 0; i < 3; i++) { frame.now += 17; draw(0); draw(1); }
      lighting.push({ px, ms, checks, beforeResizes, resizes, growthCopies, distinctBuffers: fixed !== dynamic && fixedRim !== L.rimLit });
    }
    const r = new DefendRenderer(make(720, 840)); r.px = 6;
    let maskUpdates = 0; const setMasks = r.lighting.setMasks.bind(r.lighting);
    r.lighting.setMasks = (...args) => { maskUpdates++; return setMasks(...args); };
    const refresh = () => r.refreshLayer(map, sim);
    refresh(); await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    r.layerKey = r.maskKey = ''; maskUpdates = 0; refresh();
    const zoomMs = measure({ before: () => { r.maskKey = ''; r.layerKey = ''; refresh(); }, after: () => { r.layerKey = ''; refresh(); } });
    maskUpdates = 0;
    for (const zoom of [1, 1.5, 2.6, 4.1, 1]) { r.cam.s = zoom; refresh(); }
    const zoomMaskUpdates = maskUpdates;
    sim.mapVersion++; refresh(); const geometry = maskUpdates;
    sim.hp[sim.keepId] *= .4; refresh(); const damaged = maskUpdates;
    bumpPixelArt(); refresh(); const art = maskUpdates;
    return { note: 'Warm-cache headless Chromium CPU submission medians, alternating order; component timings, not FPS. Frozen reference: 9515016.', forest, reusedMountains, lighting,
      maskInvalidation: { zoomMs, zoomMaskUpdates, geometry, damaged, art } };
  }, root);
  writeFileSync('test-results/scenery-performance.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  for (const row of result.forest) assert.equal(row.differences, 0, JSON.stringify(row));
  assert.equal(result.reusedMountains, true);
  for (const row of result.lighting) {
    assert.ok(row.checks.every(c => c.differences === 0), JSON.stringify(row));
    assert.ok(row.beforeResizes > 0); assert.equal(row.resizes, 0); assert.equal(row.growthCopies, 0); assert.equal(row.distinctBuffers, true);
  }
  assert.deepEqual(Object.fromEntries(Object.entries(result.maskInvalidation).filter(([k]) => k !== 'zoomMs')), { zoomMaskUpdates: 0, geometry: 1, damaged: 2, art: 3 });
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
