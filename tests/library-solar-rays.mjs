// Capture the actual Library shaft renderer through a full solar day and
// accelerated idle catch-up. Isolated fixtures; never reads a player save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/library-idle.html', base).href);
    await page.waitForFunction(() => window.idleFixture?.library?.renderer);
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map(e => e.name).find(url => new URL(url).pathname === '/src/daylight.ts') || '/src/daylight.ts';
      const { DayClock, DAY_MS, useDayClock } = await import(url);
      const library = window.idleFixture.library, renderer = library.renderer;
      const clock = new DayClock(), settings = { dayNightCycle: true, timeOfDay: 'day' };
      useDayClock(clock, () => settings);
      let calls = [];
      const probe = Object.assign(document.createElement('canvas'), { width: 192, height: 288 }), light = probe.getContext('2d');
      const real = renderer.sunlight.draw.bind(renderer.sunlight);
      renderer.sunlight.draw = (...args) => {
        calls.push({ tilt: args[5], strength: args[6] });
        const result = real(...args);
        real(light, ...args.slice(1)); // Same cached fields, in native room coordinates.
        return result;
      };
      const mass = () => {
        const data = light.getImageData(0, 110, 192, 20).data;
        let alpha = 0, weightedX = 0;
        for (let i = 0; i < data.length; i += 4) { const a = data[i + 3]; alpha += a; weightedX += a * ((i / 4) % 192); }
        return { alpha, x: alpha ? weightedX / alpha : null };
      };
      window.rayFixture = { library, renderer, clock, settings, DAY_MS,
        sample: (phase, animation = 12000) => {
          clock.elapsed = phase * DAY_MS; calls = []; light.clearRect(0, 0, 192, 288); library.frame(animation);
          return { calls: calls.slice(), motes: renderer.motes.length, light: mass() };
        },
        frame: animation => { calls = []; library.frame(animation); return calls.slice(); },
      };
    });
    const samples = [];
    for (const [name, phase] of [['dawn', .91], ['morning', .96], ['noon', 0], ['afternoon', .28], ['sunset', .42], ['dusk', .5], ['night', .73]]) {
      const sample = await page.evaluate(p => window.rayFixture.sample(p), phase);
      if (name === 'dusk' || name === 'night') {
        assert.equal(sample.calls.length, 0, `${name} has no direct sunbeams`);
        assert.equal(sample.light.alpha, 0);
        assert.equal(sample.motes, 0, 'no leftover sunlit dust after the sun sets');
      } else {
        assert.equal(sample.calls.length, 5);
        assert.ok(sample.calls.every(c => c.tilt === sample.calls[0].tilt));
        assert.ok(sample.light.alpha > 0, "the actual light fields paint visible rays");
        samples.push({ name, ...sample.calls[0], light: sample.light });
      }
      await page.locator('#library-canvas').screenshot({ path: `test-results/library-solar-${width}-${name}.png` });
    }
    assert.ok(samples[0].tilt > .8 && samples.at(-1).tilt < -.8, 'rays cross the full room');
    assert.equal(samples.find(s => s.name === 'noon').tilt, 0);
    assert.ok(samples[0].light.x > 192 * .75 && samples.at(-1).light.x < 192 * .25, 'painted light crosses the nave, beyond a local wiggle');
    assert.ok(Math.abs(samples.find(s => s.name === 'noon').light.x - 96) < 15, 'noon light paints the center');
    for (let n = 1; n < samples.length; n++) assert.ok(samples[n].tilt < samples[n - 1].tilt, 'visible sunlight sweeps one way through the day');
    const catchup = await page.evaluate(() => {
      const f = window.rayFixture;
      f.settings.dayNightCycle = false; f.settings.timeOfDay = 'sunset';
      const before = f.frame(12000);
      const originalDay = f.library.day;
      // Only the economic/catch-up clocks jump. Presentation time is held.
      f.library.day += 8 * 3600000; f.library.sim.time += 8 * 3600;
      const after = f.frame(12000), later = f.frame(72000);
      f.library.day = originalDay;
      const beforeActual = f.frame(72000);
      f.library.advance(f.library.ranTo + 16);
      const afterActual = f.frame(72000);
      f.settings.timeOfDay = 'night'; const night = f.frame(72000);
      return { before, after, later, beforeActual, afterActual, night };
    });
    assert.deepEqual(catchup.after, catchup.before, 'catch-up cannot change either ray heading or pulse phase');
    assert.deepEqual(catchup.afterActual, catchup.beforeActual, 'actual queued idle work cannot wiggle the shafts');
    assert.ok(catchup.later.every(c => c.tilt === catchup.before[0].tilt), 'holding sunset fixes the heading even as normal animation runs');
    assert.ok(catchup.later.some((c, i) => c.strength !== catchup.before[i].strength), 'ambient brightness can still breathe while the solar heading stays fixed');
    assert.equal(catchup.night.length, 0);
    assert.deepEqual(errors, []);
    console.log(`library solar rays ${width}: dawn/noon/sunset sweep, dark horizon, fixed headings and idle-clock independence passed`);
    await page.close();
  }
} finally { await browser.close(); }
