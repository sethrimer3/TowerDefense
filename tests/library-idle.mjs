// Isolated fixtures: never reads or writes the player's save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const errors = [];
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/library-idle.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  await page.waitForFunction(() => window.idleFixture);
  const initial = await page.evaluate(() => window.idleFixture.read());
  assert.equal(initial.knowledge, 0); assert.equal(initial.points, 0);
  assert.equal(initial.libraryOwed, 3600000); assert.equal(initial.mineOwed, 3600000);
  const canvas = await page.locator('#library-canvas').boundingBox();
  assert.ok(canvas.width > 100 && canvas.height > 100);
  assert.match(await page.locator('#library-away').innerText(), /1:00:00/);
  const bench = await page.evaluate(async () => {
    const samples = [];
    for (let n = 0; n < 90; n++) {
      await new Promise(requestAnimationFrame);
      const t = performance.now(); window.idleFixture.step(); samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    return { ...window.idleFixture.read(), mean: samples.reduce((a, b) => a + b) / samples.length, p95: samples[Math.floor(samples.length * .95)] };
  });
  assert.ok(bench.knowledge > 0 && bench.libraryOwed < initial.libraryOwed && bench.mineOwed < initial.mineOwed);
  await page.screenshot({ path: 'test-results/library-idle-desktop.png' });
  // Real flame propagation makes holes, with smoke and ash simulated offscreen too.
  const physics = await page.evaluate(() => {
    const f = window.idleFixture, s = f.library.sim;
    s.ignite(0);
    for (let n = 0; n < 150; n++) s.step(.1);
    f.draw();
    const fire = s.fire;
    let holes = 0; for (let y = 220; y < 288; y++) for (let x = 16; x < 176; x++) holes += fire.missing(x, y) ? 1 : 0;
    return { holes, smoke: fire.smoke.reduce((a, b) => a + (b > 0), 0), active: fire.active, shelves: s.shelves };
  });
  assert.ok(physics.holes > 0 && physics.smoke > 0 && physics.active);
  assert.equal(physics.shelves, 40);
  await page.screenshot({ path: 'test-results/library-fire-desktop.png' });
  // Prove a consumed furniture pixel displays the underlying stone, rather than black wood.
  const pixels = await page.evaluate(() => {
    const f = window.idleFixture, r = f.library.renderer, sim = f.library.sim;
    const x = 80, y = 280, i = y * 192 + x, cell = Math.floor(y / 2) * 96 + Math.floor(x / 2);
    const before = Array.from(r.scene.slice(i * 3, i * 3 + 3));
    sim.fire.char[cell] = 1; sim.fire.version++; f.draw();
    return { before, after: Array.from(r.scene.slice(i * 3, i * 3 + 3)), stone: Array.from(r.base.slice(i * 3, i * 3 + 3)) };
  });
  assert.deepEqual(pixels.after, pixels.stone);
  assert.notDeepEqual(pixels.before, pixels.stone);
  const fireBench = await page.evaluate(async () => {
    const samples = [];
    for (let n = 0; n < 90; n++) {
      await new Promise(requestAnimationFrame);
      const t = performance.now(); window.idleFixture.step(); samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    return { ...window.idleFixture.read(), mean: samples.reduce((a, b) => a + b) / samples.length, p95: samples[Math.floor(samples.length * .95)] };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.idleFixture.draw());
  const mobile = await page.locator('#library-canvas').boundingBox();
  assert.ok(mobile.width > 100 && mobile.height > 100);
  const boxes = await page.evaluate(() => {
    const a = document.querySelector('#library-away').getBoundingClientRect(), b = document.querySelector('#library-alert').getBoundingClientRect();
    return { overlap: a.top < b.bottom && b.top < a.bottom, right: a.right, width: innerWidth };
  });
  assert.equal(boxes.overlap, false); assert.ok(boxes.right <= boxes.width);
  await page.screenshot({ path: 'test-results/library-fire-mobile.png' });
  await page.evaluate(() => window.idleFixture.show('mine'));
  assert.match(await page.locator('#mine-away').innerText(), /idle time remaining/);
  await page.screenshot({ path: 'test-results/mine-idle-mobile.png' });
  assert.deepEqual(errors, []);
  writeFileSync('test-results/library-idle.json', JSON.stringify({ initial, bench, fireBench, physics, pixels }, null, 2));
  console.log(JSON.stringify({ bench, fireBench, physics, mobile, errors }));
} finally { await browser.close(); }
