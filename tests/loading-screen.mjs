// Isolated contexts: no player saves. Hold the game import to inspect actual boot.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const mainModule = /\/(?:src\/main\.ts|assets\/main-[^/]+\.js)(?:\?.*)?$/;
mkdirSync('test-results', { recursive: true });

try {
  for (const [name, viewport, reduced] of [
    ['desktop', { width: 1280, height: 900 }, false],
    ['phone', { width: 390, height: 844 }, false],
    ['landscape', { width: 844, height: 390 }, false],
    ['system-reduced', { width: 390, height: 844 }, 'system'],
    ['saved-reduced', { width: 390, height: 844 }, 'saved'],
  ]) {
    const page = await browser.newPage({ viewport, reducedMotion: reduced === 'system' ? 'reduce' : 'no-preference' });
    // Control animation frames so concurrent CPU-heavy game tests cannot let
    // the bar finish before the first pair of samples is taken.
    const time = new Date('2026-10-28T12:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(new Date(time.getTime() + 60_000));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    if (reduced === 'saved') await page.addInitScript(() => localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2, settings: { reduceMotion: true } })));
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await page.route(mainModule, async route => { await gate; await route.continue(); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.loading-stones').width > 300 / 3);
    assert.equal(await page.locator('#app').evaluate(el => el.inert), true);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    const layout = await page.evaluate(() => {
      const torch = document.querySelector('.loading-torch').getBoundingClientRect();
      const corner = document.querySelector('.loading-corner').getBoundingClientRect();
      const label = document.querySelector('.loading-label').getBoundingClientRect();
      const bar = document.querySelector('.loading-bricks').getBoundingClientRect();
      return { flameY: torch.top + 27, x: corner.x, right: corner.right, bottom: corner.bottom, labelRight: label.right, barX: bar.x };
    });
    assert.ok(Math.abs(layout.flameY - viewport.height / 3) < 7, `${name}: torch two thirds up`);
    assert.ok(layout.x >= 0 && layout.right <= viewport.width && layout.bottom <= viewport.height, `${name}: footer fits`);
    assert.ok(layout.labelRight < layout.barX, `${name}: label before brick bar`);
    const pixels = () => page.evaluate(() => ['.loading-stones', '.loading-torch', '.loading-bricks'].map(s => document.querySelector(s).toDataURL()));
    const before = await pixels();
    await page.clock.runFor(250);
    const after = await pixels();
    if (reduced) {
      assert.deepEqual(after, before, `${name}: still artwork`);
      assert.deepEqual(await page.locator('.loading-dots span').evaluateAll(els => els.map(el => getComputedStyle(el).visibility)), ['visible', 'visible', 'visible']);
    } else {
      assert.notEqual(after[0], before[0], `${name}: light flickers on stone`);
      assert.notEqual(after[1], before[1], `${name}: flame moves`);
      assert.notEqual(after[2], before[2], `${name}: bricks build`);
      for (const [time, expected] of [[0, 0], [375, 1], [675, 2], [975, 3]]) {
        const count = await page.locator('.loading-dots span').evaluateAll((els, time) => {
          for (const el of els) for (const animation of el.getAnimations()) { animation.pause(); animation.currentTime = time; }
          return els.filter(el => getComputedStyle(el).visibility === 'visible').length;
        }, time);
        assert.equal(count, expected, `${name}: dots at ${time} ms`);
      }
      let falling = false;
      for (let frame = 0; frame < 30 && !falling; frame++) {
        await page.clock.runFor(16);
        falling = await page.evaluate(() => {
          const canvas = document.querySelector('.loading-bricks'), c = canvas.getContext('2d');
          const pixels = c.getImageData(0, 0, canvas.width, 19).data;
          for (let p = 0; p < pixels.length; p += 4) if (pixels[p] === 168 && pixels[p + 1] === 69 && pixels[p + 2] === 46 && pixels[p + 3]) return true;
          return false;
        });
      }
      assert.ok(falling, `${name}: a brick falls above its resting course`);
    }
    await page.clock.runFor(1400);
    assert.equal(await page.locator('#loading-screen').count(), 1, `${name}: waits for game import`);
    await page.screenshot({ path: `test-results/loading-${name}.png` });
    release();
    await page.clock.resume();
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.locator('#profile-editor[open]').waitFor();
    assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
    assert.equal(await page.locator('#app').getAttribute('aria-busy'), null);
    assert.deepEqual(errors, [], `${name}: no runtime errors`);
    await page.close();
    console.log(`${name}: loading layout, motion and handoff passed`);
  }
  const page = await browser.newPage();
  await page.route(mainModule, route => route.abort());
  await page.goto(base);
  await page.locator('.loading-retry').waitFor({ state: 'visible' });
  assert.match(await page.locator('#loading-screen').getAttribute('aria-label'), /Unable to load/);
  await page.unroute(mainModule);
  await page.locator('.loading-retry').click();
  await page.locator('#loading-screen').waitFor({ state: 'detached' });
  await page.locator('#profile-editor[open]').waitFor();
  await page.close();
  console.log('failed import: retry successfully starts the game');
} finally {
  await browser.close();
}
