// Measure the actual rAF camera cadence with the ordinary 10 Hz simulation.
// Uses the isolated fixture, with no access to player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const results = [];
mkdirSync('test-results', { recursive: true });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: viewport.width === 390 ? 3 : 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/library-idle.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => window.idleFixture);
    const samples = await page.evaluate(async () => {
      const { library } = window.idleFixture, r = library.renderer, sim = library.sim;
      r.target = null;
      let previous = performance.now(), accumulator = 0;
      const measure = async action => {
        action?.();
        const draw = [], frames = [];
        let held = 0, moving = 0, last = `${r.focus.y}:${r.zoom}`;
        for (let n = 0; n < 300; n++) {
          await new Promise(requestAnimationFrame);
          const now = performance.now(), delta = now - previous;
          previous = now;
          accumulator += delta;
          while (accumulator >= 100) { sim.step(.1); accumulator -= 100; }
          const active = r.goal !== null, start = performance.now();
          r.draw(sim, 960000 + now, sim.time, true);
          draw.push(performance.now() - start); frames.push(delta);
          const next = `${r.focus.y}:${r.zoom}`;
          if (active) { moving++; if (next === last) held++; }
          last = next;
        }
        const stats = values => {
          values.sort((a, b) => a - b);
          return { mean: values.reduce((a, b) => a + b) / values.length, p95: values[Math.floor(values.length * .95)] };
        };
        return { drawMs: stats(draw), frameMs: stats(frames), moving, held, heldShare: moving ? held / moving : 0, finished: r.goal === null };
      };
      // Warm both rooms and the renderer before comparing timing.
      r.frameRoom(true);
      await measure();
      const steady = await measure();
      const nave = await measure(() => r.frameRoom(false));
      r.zoomBy(6, r.canvas.width / 2, r.canvas.height / 2);
      const lab = await measure(() => r.frameRoom(true));
      // Camera animation must also continue when simulation time is held.
      r.frameRoom(false);
      const frozenStart = r.focus.y;
      for (let n = 0; n < 20; n++) {
        await new Promise(requestAnimationFrame);
        r.draw(sim, 960000, sim.time, true);
      }
      return { steady, nave, lab, frozenMoved: Math.abs(r.focus.y - frozenStart) > 1 };
    });
    results.push({ viewport, ...samples });
    assert.deepEqual(errors, []);
    if (!process.env.CAMERA_BASELINE) {
      for (const motion of [samples.nave, samples.lab]) {
        assert.ok(motion.moving > 10);
        assert.ok(motion.heldShare < .05, JSON.stringify(motion));
        assert.ok(motion.finished);
      }
      assert.ok(samples.frozenMoved, 'Camera should animate independently of simulation ticks');
    }
    await page.close();
  }
  writeFileSync(`test-results/library-camera-${process.env.CAMERA_BASELINE ? 'before' : 'after'}.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
