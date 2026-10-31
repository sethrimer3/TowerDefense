// Shared fiery Blight contours and soft black joins; no player save access.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 850 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { paintPortal } = await import('/src/defend/portal-noise.ts');
    const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
    const { PORTAL_UNIT_INK, DARK_UNIT_INK, PLAYER_UNIT_INK } = await import('/src/defend/art-scale.ts');
    const make = () => { const s = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4); s.soldiers = []; s.civilians = []; return s; };
    const canvas = (w = 300, h = 200) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const pixel = (c, x, y) => [...c.getImageData(x, y, 1, 1).data];
    const gallery = document.querySelector('canvas'); gallery.width = 1000; gallery.height = 850;
    gallery.style.cssText = 'width:1000px;height:850px'; const gc = gallery.getContext('2d');
    const samples = [], categories = [], portraits = [], widths = [];
    for (const def of Object.values(ENEMIES).filter(d => d.faction === 'darkOne')) {
      const cv = canvas(); paintPortrait(cv, def.kind);
      const d = cv.getContext('2d').getImageData(12, 12, 56, 56).data;
      let fire = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 110 && d[i + 1] > 30 && d[i] > d[i + 1] * 1.2 && d[i + 1] > d[i + 2] * 1.5) fire++;
      portraits.push({ kind: def.kind, fire });
    }
    for (const simple of [false, true]) for (const scale of [1, 1.25, 2]) {
      const s = make();
      for (const [i, kind] of ['miniDarkling', 'darkling', 'largeDarkling'].entries()) s.spawnAuxiliary(kind, 1 + i, 1);
      const cv = canvas(600, 250), c = cv.getContext('2d'), outline = new UnitOutline(); c.scale(scale, scale);
      drawUnits({ c, px: 64 }, s, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
      const ring = outline.contours.channels.get(PORTAL_UNIT_INK).c;
      for (const [i, artWidth] of [.5, .75, 1].entries()) {
        const left = (1 + i) * 64 * scale - (i + 1) * 4 * scale, row = ring.getImageData(left - 20, 64 * scale, 20, 1).data;
        let coverage = 0; for (let a = 3; a < row.length; a += 4) coverage += row[a] / 255;
        widths.push({ simple, scale, side: i + 1, coverage, expected: artWidth * 8 * scale });
      }
    }
    // An artist-replaced tiny body must receive the same fractional rim.
    for (const side of [1, 2]) {
      const cv = canvas(), c = cv.getContext('2d'), outline = new UnitOutline(), l = outline.begin(c, true, 4);
      const sprite = canvas(side, side), sc = sprite.getContext('2d'); sc.fillStyle = '#000'; sc.fillRect(0, 0, side, side);
      outline.ink(PORTAL_UNIT_INK); outline.mergePixelGaps(); l.units.drawImage(sprite, 40, 40, side * 8, side * 8); outline.mergePixelGaps(false); outline.end(c, true);
      const row = outline.contours.channels.get(PORTAL_UNIT_INK).c.getImageData(20, 44, 20, 1).data;
      let coverage = 0; for (let a = 3; a < row.length; a += 4) coverage += row[a] / 255;
      widths.push({ artist: true, side, coverage, expected: side === 1 ? 4 : 6 });
    }
    for (const simple of [false, true]) {
      // Check every dark faction member, including complex sprites, in isolation.
      for (const def of Object.values(ENEMIES).filter(d => d.faction === 'darkOne')) {
        const s = make(); s.spawnAuxiliary(def.kind, 2, 2);
        const cv = canvas(), c = cv.getContext('2d'), outline = new UnitOutline();
        drawUnits({ c, px: 48 }, s, null, false, undefined, { enemies: simple, reduceMotion: true }, outline, undefined, { defer: true });
        const channels = outline.contours.channels;
        categories.push({ simple, kind: def.kind, portal: channels.has(PORTAL_UNIT_INK), crimson: channels.has(DARK_UNIT_INK) });
      }
      // A channel containing complex artwork must not black-fill its internals.
      const complex = make(); complex.spawnAuxiliary('necromancer', 2, 2);
      const co = new UnitOutline(), cc = canvas().getContext('2d');
      drawUnits({ c: cc, px: 48 }, complex, null, false, undefined, { enemies: simple }, co, undefined, { defer: true });
      categories.push({ simple, kind: 'complex mask', portal: co.contours.channels.has(PORTAL_UNIT_INK), crimson: false, pixelBounds: co.contours.channels.get(PORTAL_UNIT_INK).pixelBounds });
      // Watch the same crack open, then close again. Black coverage comes from
      // the actor layer, not a screenshot or a recolored terrain pixel.
      const s = make(), left = s.spawnAuxiliary('largeDarkling', 2, 2), right = s.spawnAuxiliary('largeDarkling', 2.4, 2);
      const cv = canvas(), c = cv.getContext('2d'), outline = new UnitOutline();
      const gaps = [.04, .10, .15, .20, .24, .30, .40, .20, .10, .04];
      for (let step = 0; step < gaps.length; step++) {
        const gap = gaps[step]; right.x = left.x + .375 + gap;
        c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
        drawUnits({ c, px: 64 }, s, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
        const x = Math.floor((left.x + .1875 + gap / 2) * 64), y = 128;
        const body = pixel(outline.layer.c, x, y);
        outline.drawContours(c, 2.5);
        samples.push({ simple, gap, body, final: pixel(c, x, y) });
        if (step < 6) {
          const gx = step % 3 * 333, gy = (simple ? 2 : 0) * 180 + Math.floor(step / 3) * 180;
          gc.fillStyle = '#42573a'; gc.fillRect(gx, gy, 333, 180);
          gc.imageSmoothingEnabled = false; gc.drawImage(cv, 102, 108, 100, 40, gx + 10, gy + 40, 300, 120);
          gc.fillStyle = '#f2dcc5'; gc.font = '15px monospace'; gc.fillText(`${simple ? 'Simple' : 'Normal'} · gap ${(gap * 8).toFixed(2)} art px`, gx + 15, gy + 24);
        }
      }
      // A 2D grid of cracks must be filled, not merely have its rims erased.
      const grid = make();
      // Uniform large bodies for an exact interior sample, plus an ally across
      // the bridge: destination-over must preserve its colored body.
      for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) grid.spawnAuxiliary('darkling', 1.5 + x * .27, 1 + y * .27);
      c.clearRect(0, 0, 300, 200);
      drawUnits({ c, px: 64 }, grid, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
      let holes = 0;
      const data = outline.layer.c.getImageData(96, 64, 64, 48).data;
      for (let i = 0; i < data.length; i += 4) if (data[i] || data[i + 1] || data[i + 2] || data[i + 3] !== 255) holes++;
      samples.push({ simple, gridHoles: holes });
      // Explicit pixel capture ends before a complex member in the same channel.
      grid.spawnAuxiliary('necromancer', 4, 2);
      c.clearRect(0, 0, 300, 200);
      drawUnits({ c, px: 64 }, grid, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
      samples.push({ simple, pixelBoundsRight: outline.contours.channels.get(PORTAL_UNIT_INK).pixelBounds.x1 });
      // Closing never fattens a lone pixel into a larger black body.
      const single = make(); single.spawnAuxiliary('miniDarkling', 2, 2);
      c.clearRect(0, 0, 300, 200);
      drawUnits({ c, px: 64 }, single, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
      samples.push({ simple, loneOutside: pixel(outline.layer.c, 123, 128), loneInside: pixel(outline.layer.c, 124, 128) });
    }
    // An ally already drawn in the neck keeps its own body color and navy rim.
    const cv = canvas(), c = cv.getContext('2d'), o = new UnitOutline(), l = o.begin(c, true, 4);
    o.ink(PLAYER_UNIT_INK); l.units.fillStyle = '#43ba73'; l.units.fillRect(49, 20, 2, 30);
    o.ink(PORTAL_UNIT_INK); o.mergePixelGaps(); l.units.fillStyle = '#000'; l.units.beginPath(); l.units.rect(24, 24, 24, 24); l.units.rect(52, 24, 24, 24); l.units.fill(); o.mergePixelGaps(false);
    o.end(c); const ally = pixel(c, 49, 34);
    // Warm-up then instrument actual crowd geometry+noise drawing, not a
    // synthetic per-unit approximation. The 10k case exceeds the native cap.
    const timings = [];
    for (const n of [1000, 5000, 10000]) {
      const s = make(), seed = s.spawnAuxiliary('miniDarkling', 0, 0);
      s.enemies = Array.from({ length: n }, (_, i) => ({ ...seed, id: i + 1, x: 1 + i % 100 * .13, y: 1 + Math.floor(i / 100) * .13 }));
      const cv = canvas(720, 1040), c = cv.getContext('2d'), o = new UnitOutline();
      const paint = t => { c.clearRect(0, 0, 720, 1040); drawUnits({ c, px: 40 }, s, null, false, undefined, {}, o, undefined, { defer: true }); o.drawContours(c, t); };
      paint(0); paint(.1);
      let allocations = 0, reads = 0;
      const create = document.createElement.bind(document), read = CanvasRenderingContext2D.prototype.getImageData;
      document.createElement = function(name, ...args) { if (name === 'canvas') allocations++; return create(name, ...args); };
      CanvasRenderingContext2D.prototype.getImageData = function(...args) { reads++; return read.apply(this, args); };
      const rounds = [];
      try { for (let i = 0; i < 15; i++) { const t = performance.now(); paint(i / 10); rounds.push(performance.now() - t); } }
      finally { document.createElement = create; CanvasRenderingContext2D.prototype.getImageData = read; }
      rounds.sort((a, b) => a - b); timings.push({ n, allocations, reads, medianMs: rounds[7], p95Ms: rounds[14] });
      if (n === 5000) gc.drawImage(cv, 0, 0, 720, 1040, 10, 725, 180, 120);
    }
    // Visible size comparison beside the stress thumbnail.
    const sizes = make();
    for (const [i, kind] of ['miniDarkling', 'darkling', 'largeDarkling'].entries()) sizes.spawnAuxiliary(kind, 1 + i * 1.7, 1.3);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) sizes.spawnAuxiliary(x % 2 ? 'darkling' : 'miniDarkling', 7 + x * .2, .8 + y * .2);
    const comparison = canvas(780, 130), comp = comparison.getContext('2d'), rim = new UnitOutline();
    drawUnits({ c: comp, px: 64 }, sizes, null, false, undefined, {}, rim, undefined, { defer: true }); rim.drawContours(comp, 2.5);
    gc.drawImage(comparison, 200, 720); gc.fillStyle = '#f2dcc5'; gc.font = '15px monospace';
    gc.fillText('Mini: 0.5        Darkling: 0.75      Large: 1 art px       Mixed pack', 215, 745);
    // Previews alternating with a battle must keep their own warmed patterns.
    const contexts = [canvas().getContext('2d'), canvas().getContext('2d')];
    const box = { x: 0, y: 0, w: 300, h: 200 };
    for (const c of contexts) paintPortal(c, box, 0);
    const create = document.createElement.bind(document); let alternatingCanvases = 0;
    document.createElement = function(name, ...args) { if (name === 'canvas') alternatingCanvases++; return create(name, ...args); };
    try { for (let i = 0; i < 10; i++) paintPortal(contexts[i % 2], box, i / 10); }
    finally { document.createElement = create; }
    return { categories, samples, portraits, widths, ally, timings, alternatingCanvases };
  });
  mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/blight-contours.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/blight-contours.png' });
  for (const w of result.widths) assert.ok(Math.abs(w.coverage - w.expected) < .02, JSON.stringify(w));
  assert.ok(result.portraits.every(p => p.fire > 0), JSON.stringify(result.portraits));
  assert.ok(result.categories.every(r => r.portal && !r.crimson), JSON.stringify(result.categories));
  assert.ok(result.categories.filter(r => r.kind === 'complex mask').every(r => r.pixelBounds === null));
  for (const simple of [false, true]) {
    const s = result.samples.filter(r => r.simple === simple && r.gap !== undefined);
    assert.deepEqual(s[0].body, [0, 0, 0, 255], 'tight crack fills solid black');
    assert.equal(s[6].body[3], 0, 'wide passage stays open');
    assert.equal(s[6].final[3], 0, 'no noise spans a wide passage');
    assert.ok(s.slice(1, 5).some(r => r.body[3] > 0 && r.body[3] < 255), 'necks fade between black and fire');
    assert.ok(s.slice(0, 5).every(r => r.final[3] === 255), 'necks contain black/fire, without scenery leaking through');
    for (let i = 1; i < 7; i++) assert.ok(s[i].body[3] <= s[i - 1].body[3], 'black recedes as the gap opens');
    assert.deepEqual(s[0].body, s[9].body, 'closing restores the original fill without ghosting');
  }
  assert.ok(result.samples.filter(r => r.gridHoles !== undefined).every(r => r.gridHoles === 0), JSON.stringify(result.samples));
  assert.ok(result.samples.filter(r => r.pixelBoundsRight !== undefined).every(r => r.pixelBoundsRight < 200), 'complex units do not extend the fill mask');
  for (const r of result.samples.filter(r => r.loneInside)) { assert.deepEqual(r.loneInside, [0, 0, 0, 255]); assert.equal(r.loneOutside[3], 0, 'isolated body size stays intact'); }
  assert.deepEqual(result.ally, [67, 186, 115, 255]);
  assert.ok(result.timings.every(r => r.allocations === 0 && r.reads === 0), JSON.stringify(result.timings));
  assert.equal(result.alternatingCanvases, 0, 'alternating renderers retain their pattern tiles');
  assert.deepEqual(errors, []); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
