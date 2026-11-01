// Paired native Blight workloads, isolated from player saves. Start npm run dev.
// Timing is diagnostic; assertions check work bounds rather than machine speed.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity, CellType } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { initWorm } = await import('/src/defend/blight-worm.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { PORTAL_UNIT_INK } = await import('/src/defend/art-scale.ts');
    const scene = () => {
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
      sim.soldiers = []; sim.civilians = []; return sim;
    };
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const paired = (before, after) => {
      const tasks = { before, after }, samples = { before: [], after: [] };
      for (const f of Object.values(tasks)) for (let i = 0; i < 3; i++) f();
      for (let round = 0; round < 9; round++) {
        const order = round % 2 ? ['after', 'before'] : ['before', 'after'];
        for (const name of order) { const t = performance.now(); tasks[name](); samples[name].push(performance.now() - t); }
      }
      return Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, +values.sort((a, b) => a - b)[4].toFixed(3)]));
    };
    const worms = [];
    for (const n of [1000, 5000, 20000]) {
      const sim = scene();
      sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.rocks.fill(0);
      sim.map.type.fill(CellType.OUT); sim.map.owner.fill(-1); sim.hp.fill(0); sim.built.fill(0);
      // Synthetic 20k population deliberately bypasses release caps; chains
      // retain native state/spacing. A zero-dt phase isolates lookup scaling.
      for (let i = 0; i < n; i += 7) {
        const segments = [];
        for (let k = 0; k < Math.min(7, n - i); k++) {
          const e = sim.newEnemy('smallBlightWorm', 10 + i % 40, 40);
          if (k) e.leader = segments[k - 1].id;
          segments.push(e); sim.enemies.push(e);
        }
        initWorm(sim, segments);
      }
      const lookup = sim.livingEnemy;
      const before = () => { sim.livingEnemy = id => sim.enemies.find(e => e.id === id && e.hp > 0); sim.stepUnits(0); };
      const after = () => { sim.livingEnemy = lookup; sim.stepUnits(0); };
      worms.push({ n, phaseMs: paired(before, after) });
    }
    const portals = [];
    for (const ratio of [1, 2]) {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: ratio });
      const sim = scene(); sim.spawnAuxiliary('blightDart', 10, 15);
      const cv = canvas(720 * ratio, 1040 * ratio), c = cv.getContext('2d');
      const outlines = [new UnitOutline(), new UnitOutline()];
      for (const outline of outlines) drawUnits({ c, px: 40 * ratio }, sim, null, false, undefined, {}, outline, undefined, { defer: true });
      const paint = full => { const outline = outlines[full ? 0 : 1]; outline.contours.channels.get(PORTAL_UNIT_INK).unbounded = full; outline.drawContours(c, 2.5); };
      const drawMs = paired(() => paint(true), () => paint(false));
      const pixels = [];
      for (const full of [true, false]) {
        const context = outlines[full ? 0 : 1].contours.portalFire.getContext('2d'), fill = context.fillRect.bind(context);
        let area = 0;
        context.fillRect = (x, y, w, h) => { area += w * h; fill(x, y, w, h); };
        paint(full); pixels.push(area); context.fillRect = fill;
      }
      const surfaces = outlines.map(o => o.contours.portalFire);
      portals.push({ ratio, drawMs, beforePixels: pixels[0], afterPixels: pixels[1],
        beforeBufferPixels: surfaces[0].width * surfaces[0].height, afterBufferPixels: surfaces[1].width * surfaces[1].height });
    }
    const crowds = [];
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 1 });
    for (const [n, mixed] of [[1000, false], [5000, false], [10000, false], [1000, true]]) {
      const sim = scene(), seed = sim.newEnemy('miniDarkling', 0, 0);
      sim.enemies = Array.from({ length: n }, (_, i) => {
        const j = mixed ? i * 37 % n : i;
        return { ...seed, id: i + 1, kind: mixed ? ['miniDarkling', 'darkling', 'largeDarkling'][j % 3] : seed.kind,
          x: 1 + j % 100 * (mixed ? .19 : .13), y: 1 + Math.floor(j / 100) * (mixed ? .27 : .13) };
      });
      const cv = canvas(720, 1040), c = cv.getContext('2d'), outline = new UnitOutline(), contours = outline.contours;
      const finish = contours.finish;
      // Original per-body geometry, under the same masks/noise and workload.
      const unmerged = function(bodies) {
        for (const channel of this.channels.values()) {
          for (const row of channel.pixelRows.values()) for (const [left, right] of row.spans) {
            channel.expanded.rect(left - row.radius, row.y - row.radius, right - left + row.radius * 2, row.h + row.radius * 2);
            for (let band = 0; band < 3; band++) {
              const pad = row.radius * (1 - band * .25);
              channel.pixels[band].rect(left - pad, row.y - pad, right - left + pad * 2, row.h + pad * 2);
            }
          }
          channel.pixelRows.clear();
        }
        return finish.call(this, bodies);
      };
      const paint = old => {
        contours.finish = old ? unmerged : finish;
        c.clearRect(0, 0, cv.width, cv.height);
        drawUnits({ c, px: 40 }, sim, null, false, undefined, {}, outline, undefined, { defer: true }); outline.drawContours(c, 2.5);
      };
      const drawMs = paired(() => paint(true), () => paint(false));
      // Exact geometry must preserve fractional coverage, not just look close.
      paint(true); const original = c.getImageData(0, 0, cv.width, cv.height).data;
      paint(false); const merged = c.getImageData(0, 0, cv.width, cv.height).data;
      let differences = 0;
      for (let i = 0; i < original.length; i++) if (Math.abs(original[i] - merged[i]) > 1) differences++;
      crowds.push({ n, mixed, drawMs, differences });
    }
    return { note: 'Paired headless Chromium CPU submission medians (ms), warm caches, alternating order. Not device FPS. Worm phases use zero dt; crowd rows include native bodies, contour masks, infill and fire.', worms, portals, crowds };
  });
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/blight-performance.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  for (const row of result.portals) {
    assert.ok(row.afterPixels < row.beforePixels / 10, JSON.stringify(row));
    assert.ok(row.afterBufferPixels < row.beforeBufferPixels / 10, 'destination mask must also be local: ' + JSON.stringify(row));
  }
  for (const row of result.crowds) assert.equal(row.differences, 0, JSON.stringify(row));
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
