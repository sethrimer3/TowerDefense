// Native canvas pixel checks and isolated production fixtures. No player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { ART, UNIT_CONTOUR_ART_PIXELS, DARK_UNIT_INK, PLAYER_UNIT_INK } = await import('/src/defend/art-scale.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
    const make = (w = 64, h = 64) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const pixel = (c, x, y) => [...c.getImageData(x, y, 1, 1).data];
    const checks = [];
    for (const width of [.5, 1, 2]) {
      const cv = make(), c = cv.getContext('2d'), outline = new UnitOutline(), l = outline.begin(c, false, width);
      outline.ink(DARK_UNIT_INK); l.units.fillStyle = '#000000';
      l.units.fillRect(10, 10, 8, 8); l.units.fillRect(14, 10, 8, 8);
      outline.end(c);
      checks.push({ width, edge: pixel(c, 9, 14), farther: pixel(c, 8, 14), outside: pixel(c, 7, 14), body: pixel(c, 14, 14), overlapEdge: pixel(c, 18, 14) });
    }
    const cv = make(), c = cv.getContext('2d'), outline = new UnitOutline(), l = outline.begin(c, true, 1);
    outline.ink(PLAYER_UNIT_INK); l.units.fillStyle = '#43ba73'; l.units.fillRect(10, 10, 10, 10);
    outline.ink(DARK_UNIT_INK); l.units.fillStyle = '#000'; l.units.fillRect(16, 10, 10, 10);
    outline.end(c);
    const fadedCanvas = make(), fadedC = fadedCanvas.getContext('2d'), fadedOutline = new UnitOutline();
    const faded = fadedOutline.begin(fadedC, true, .5); fadedOutline.ink(PLAYER_UNIT_INK, .5);
    faded.units.globalAlpha = .62; faded.units.fillStyle = '#000';
    faded.units.fillRect(10, 10, 8, 8); faded.units.fillRect(14, 10, 8, 8);
    fadedOutline.end(fadedC);
    const translucent = { inside: pixel(fadedC, 14, 14), edge: pixel(fadedC, 9, 14) };
    const opponents = { blue: pixel(c, 9, 14), red: pixel(c, 26, 14), seam: pixel(c, 16, 14), friendBody: pixel(c, 12, 14) };
    // Baked rims removed; body paths track cropping and the actual camera.
    const sprite = make(5, 5), s = sprite.getContext('2d'); s.fillStyle = '#000'; s.fillRect(0, 0, 5, 5); s.fillStyle = '#43ba73'; s.fillRect(1, 1, 3, 3);
    const neutral = [];
    for (const merged of [false, true]) {
      const cv = make(), c = cv.getContext('2d'), outline = new UnitOutline(), l = outline.begin(c, merged, .5);
      const rim = outline.ink();
      for (const x of [10, 17]) {
        rim.fillStyle = '#000'; rim.fillRect(x - 1, 9, 12, 12);
        l.units.fillStyle = '#43ba73'; l.units.fillRect(x, 10, 10, 10);
      }
      outline.end(c); neutral.push({ merged, interior: pixel(c, 16, 14) });
    }
    const sprites = [];
    for (const crop of [false, true]) {
      const cv = make(), c = cv.getContext('2d'), outline = new UnitOutline(); c.setTransform(2, 0, 0, 2, 3, 5);
      const l = outline.begin(c, true, .5); outline.ink(PLAYER_UNIT_INK);
      if (crop) l.units.drawImage(sprite, 2, 1, 2, 3, 4, 4, 2, 3);
      else l.units.drawImage(sprite, 4, 4);
      outline.end(c);
      sprites.push({ crop, body: pixel(c, crop ? 11 : 13, 15), edge: pixel(c, crop ? 10 : 12, 15), outside: pixel(c, crop ? 9 : 11, 15) });
    }
    // Production battle under all graphics/motion options. Visibility colors
    // must remain saturated even at the center of a full-strength color drain.
    const map = generateCity(fitLayout(defaultLayout()), 3), levels = Object.fromEntries(UPGRADES.map(u => [u.id, 0]));
    const sim = new DefendSim(map, levels, 4); sim.breakT = 1e9;
    for (let i = 0; i < 65; i++) sim.spawnAuxiliary(i % 13 === 0 ? 'largeDarkling' : i % 7 ? 'miniDarkling' : 'darkling', 20 + (i % 10) * .25, 10 + Math.floor(i / 10) * .25);
    const home = map.buildings.find(b => b.kind === 'keep').id;
    const base = { id: 900000, kind: 'sword', home, x: 24, y: 11, hp: 20, maxHp: 20, cd: 0, flash: 0, path: [], thinkT: 0, target: -1 };
    sim.soldiers = [base, { ...base, id: 900001, x: 24.2 }];
    const gallery = document.querySelector('canvas'); gallery.width = 1100; gallery.height = 900; gallery.style.cssText = 'width:1100px;height:900px';
    const gc = gallery.getContext('2d'); gc.fillStyle = '#1a2127'; gc.fillRect(0, 0, 1100, 900);
    const frames = [];
    for (const phone of [false, true]) for (const simple of [false, true]) for (const merged of [false, true]) for (const motion of [false, true]) {
      setPixelArt(!simple);
      const cv = make(); cv.style.cssText = `width:${phone ? 390 : 800}px;height:${phone ? 700 : 850}px`; document.body.append(cv);
      const renderer = new DefendRenderer(cv); renderer.resize(phone ? 390 : 800, phone ? 700 : 850);
      renderer.cam.s = 2; renderer.cam.x = -50; renderer.cam.y = -20;
      const opts = { grid: 0, weather: null, night: 0, now: 1000, reduceMotion: motion, effects: false, simpleEnemies: simple, simpleTroops: simple, mergedOutlines: merged };
      renderer.draw(map, sim, null, opts);
      const a = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const count = color => { const rgb = color.slice(1).match(/../g).map(v => parseInt(v, 16)); let n = 0; for (let i = 0; i < a.length; i += 4) if (rgb.every((v, k) => a[i + k] === v) && a[i + 3]) n++; return n; };
      // On a phone, a half-art-pixel rim is subpixel coverage, so its color
      // blends with the ground rather than producing a fully opaque RGB sample.
      const drawContours = renderer.outline.drawContours.bind(renderer.outline);
      renderer.outline.drawContours = () => {};
      renderer.draw(map, sim, null, opts);
      const bare = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      renderer.outline.drawContours = drawContours;
      const visible = ink => {
        const channel = renderer.outline.contours.channels.get(ink);
        if (!channel) return 0;
        const ring = channel.c.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 0; i < ring.length; i += 4) if (ring[i + 3] >= 16 && [0, 1, 2].some(k => a[i + k] !== bare[i + k])) n++;
        return n;
      };
      frames.push({ phone, simple, merged, motion, crimson: visible(DARK_UNIT_INK), blue: visible(PLAYER_UNIT_INK), opaqueCrimson: count(DARK_UNIT_INK), drain: renderer.darkDrain.density.active });
      renderer.draw(map, sim, null, { ...opts, now: 1200 });
      cv.remove();
    }
    // Large readable gallery of overlapping black pixels and player bodies.
    const inks = [DARK_UNIT_INK, PLAYER_UNIT_INK];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
      const x = col * 550, y = row * 300;
      gc.fillStyle = row === 1 ? '#161c24' : row === 2 ? '#aaa69b' : '#4d6336'; gc.fillRect(x, y, 550, 300);
      gc.fillStyle = '#eee3c7'; gc.font = '18px monospace'; gc.fillText(col ? 'Player units · dark blue' : 'Dark units · deep crimson', x + 20, y + 30);
      const outline = new UnitOutline(), l = outline.begin(gc, true, 8 / 2); outline.ink(inks[col]);
      l.units.fillStyle = col ? '#6b94b4' : '#000';
      for (const [dx, dy, size] of [[50, 100, 8], [100, 100, 16], [160, 100, 24], [250, 100, 24], [266, 108, 24], [282, 100, 24], [250, 116, 24]]) l.units.fillRect(x + dx, y + dy, size, size);
      outline.end(gc);
      gc.fillStyle = '#eee3c7'; gc.font = '14px monospace'; gc.fillText('1px        2px       3px        overlapping group', x + 35, y + 165); gc.fillText('Outline: half an art pixel', x + 20, y + 220);
    }
    // Bounded crowd work: constant canvas count, no frame readbacks.
    const bench = make(720, 1040), bc = bench.getContext('2d'), bo = new UnitOutline();
    const timings = [], canvasCount = { value: 0 }, readbacks = { value: 0 };
    const create = document.createElement.bind(document), get = CanvasRenderingContext2D.prototype.getImageData;
    document.createElement = function(name, ...args) { if (name === 'canvas') canvasCount.value++; return create(name, ...args); };
    CanvasRenderingContext2D.prototype.getImageData = function(...args) { readbacks.value++; return get.apply(this, args); };
    try {
      for (let frame = 0; frame < 25; frame++) {
        bc.clearRect(0, 0, 720, 1040); const start = performance.now(), l = bo.begin(bc, true, .5); bo.ink(DARK_UNIT_INK); l.units.fillStyle = '#000';
        for (let i = 0; i < 5000; i++) l.units.fillRect(20 + (i * 7 % 680), 20 + (i * 13 % 1000), 2, 2);
        bo.end(bc);
        if (frame >= 5) timings.push(performance.now() - start);
      }
    } finally { document.createElement = create; CanvasRenderingContext2D.prototype.getImageData = get; }
    timings.sort((a, b) => a - b);
    return { ART, UNIT_CONTOUR_ART_PIXELS, crimson: DARK_UNIT_INK, blue: PLAYER_UNIT_INK, checks, translucent, opponents, neutral, sprites, frames, benchmark: { enemies: 5000, medianMs: timings[10], p95Ms: timings[19], canvases: canvasCount.value, readbacks: readbacks.value } };
  });
  const rgb = hex => hex.slice(1).match(/../g).map(v => parseInt(v, 16));
  assert.equal(result.ART, 8); assert.equal(result.UNIT_CONTOUR_ART_PIXELS, .5);
  for (const check of result.checks) {
    assert.ok(check.edge.slice(0, 3).every((v, i) => Math.abs(v - rgb(result.crimson)[i]) <= 1), JSON.stringify(check));
    assert.deepEqual(check.body, [0, 0, 0, 255]); assert.deepEqual(check.overlapEdge, [0, 0, 0, 255]);
    assert.equal(check.outside[3], 0);
    if (check.width === .5) { assert.ok(check.edge[3] >= 120 && check.edge[3] <= 136, JSON.stringify(check)); assert.equal(check.farther[3], 0); }
    else { assert.equal(check.edge[3], 255); assert.equal(check.farther[3], check.width === 2 ? 255 : 0); }
  }
  assert.deepEqual(result.translucent.inside.slice(0, 3), [0, 0, 0]);
  assert.ok(result.translucent.edge.slice(0, 3).every((v, i) => Math.abs(v - rgb(result.blue)[i]) <= 1));
  assert.deepEqual(result.opponents.blue.slice(0, 3), rgb(result.blue)); assert.deepEqual(result.opponents.red.slice(0, 3), rgb(result.crimson));
  assert.deepEqual(result.opponents.seam, [0, 0, 0, 255]); assert.deepEqual(result.opponents.friendBody, [67, 186, 115, 255]);
  assert.deepEqual(result.neutral[0].interior, [0, 0, 0, 255]);
  assert.deepEqual(result.neutral[1].interior, [67, 186, 115, 255]);
  for (const s of result.sprites) { assert.deepEqual(s.body, [67, 186, 115, 255]); assert.deepEqual(s.edge.slice(0, 3), rgb(result.blue)); assert.equal(s.outside[3], 0); }
  assert.ok(result.frames.every(f => f.crimson > 0 && f.blue > 0 && f.drain), JSON.stringify(result.frames));
  assert.equal(result.benchmark.readbacks, 0); assert.ok(result.benchmark.canvases <= 2);
  assert.deepEqual(errors, []);
  mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/unit-contours.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/unit-contours.png' });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
