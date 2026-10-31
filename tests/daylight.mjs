// Isolated saves. Requires Vite; checks actual settings, scenery, and tab suspension.
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
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500, reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 7,
        profile: { name: 'Sun Tester', flag: { base: 3, layers: [] } },
        settings: { reduceMotion: true, effectsOff: false, soundOff: true, ambienceOff: true },
      }));
    });
    await page.goto(base);
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    const nav = tab => page.locator(`nav [data-tab="${tab}"]`).click();
    const settings = () => nav('settings');
    const sky = () => page.evaluate(async () => {
      if (!window.__readDaylight) {
        const urls = performance.getEntriesByType('resource').map(e => e.name).filter(url => new URL(url).pathname === '/src/daylight.ts');
        for (const url of [...urls.reverse(), '/src/daylight.ts']) {
          const module = await import(url);
          if (module.worldSky()) { window.__readDaylight = module.worldSky; break; }
        }
      }
      return window.__readDaylight?.();
    });
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
    await settings();
    assert.equal(await page.locator('#day-night-cycle').isChecked(), true);
    assert.equal(await page.locator('#faster-sun-catchup').isChecked(), true);
    await page.locator('#faster-sun-catchup').uncheck();
    assert.equal(await page.locator('#time-of-day').isDisabled(), true);
    assert.equal((await sky()).phase, 'day', 'a new game starts in daylight');
    await page.locator('#day-night-cycle').uncheck();
    const samples = [];
    for (const phase of ['day', 'sunset', 'dusk', 'twilight', 'night', 'dawn']) {
      await settings(); await page.locator('#time-of-day').selectOption(phase);
      assert.equal((await sky()).phase, phase);
      await nav('defend'); await page.waitForTimeout(180);
      const sample = await page.locator('#defend-canvas').evaluate(canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 64) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
        return { r: r / n, g: g / n, b: b / n, image: canvas.toDataURL() };
      });
      samples.push({ phase, ...sample });
      await page.locator('#defend-canvas').screenshot({ path: `test-results/day-cycle-${width}-${phase}.png` });
    }
    const day = samples[0], sunset = samples[1], night = samples[4];
    assert.ok(night.r + night.g + night.b < (day.r + day.g + day.b) * .65, 'night visibly darkens the building view');
    assert.ok(sunset.r / sunset.b > day.r / day.b, 'sunset warms actual world pixels');
    assert.equal(new Set(samples.map(s => s.image)).size, 6, 'every fixed phase produces distinct scene art');
    await settings(); await page.locator('#time-of-day').selectOption('sunset');
    for (const tab of ['mine', 'library', 'tiles']) {
      await nav(tab); await page.waitForTimeout(220);
      assert.equal((await sky()).phase, 'sunset', 'all tabs share one time of day');
      await page.screenshot({ path: `test-results/day-cycle-${width}-${tab}-sunset.png` });
    }
    await settings(); await page.locator('#time-of-day').selectOption('night');
    assert.equal((await saved()).settings.timeOfDay, 'night');
    const fixed = await sky(); await page.waitForTimeout(220); assert.deepEqual(await sky(), fixed);
    await page.reload(); await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await settings();
    assert.equal(await page.locator('#day-night-cycle').isChecked(), false);
    assert.equal(await page.locator('#time-of-day').inputValue(), 'night');
    assert.equal(await page.locator('#faster-sun-catchup').isChecked(), false);
    assert.equal(await page.locator('#faster-sun-catchup').isDisabled(), true);
    assert.equal((await sky()).phase, 'night');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'settings fit on a phone');
    await page.screenshot({ path: `test-results/day-cycle-${width}-settings.png` });
    // Large wall-clock jumps must not leak into the presentation clock while hidden.
    await page.clock.install();
    await page.locator('#day-night-cycle').check();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.clock.runFor(32);
    const before = (await sky()).time;
    await page.clock.fastForward(60000);
    const after = (await sky()).time;
    assert.ok(Math.abs(((after - before + 300000) % 300000) - 60000) < 100, 'the visible sky advances in play time');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = (await sky()).time;
    await page.clock.fastForward(600000);
    assert.equal((await sky()).time, hidden, 'ten minutes hidden do not move the sky');
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(32);
    assert.ok(Math.abs((await sky()).time - hidden) < 100, 'returning does not catch up the visual cycle');
    const persisted = await saved(); assert.ok(Number.isFinite(persisted.dayClock));
    assert.deepEqual(errors, []);
    console.log(`day cycle ${width}: phases, warm pixels, shared tabs, persistence, moving play clock and hidden-tab pause passed`);
    await page.close();
  }
} finally { await browser.close(); }
