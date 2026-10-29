import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium', headless: true });
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' }), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/siege-entry.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => window.siegeFixture);
    await page.locator('[data-action="find"]').click();
    await page.waitForFunction(() => document.querySelector('.siege-castle-preview')?.dataset.ready === 'true');
    await page.locator('[data-action="attack"]').click();
    await page.locator('[data-action="start"]').click();
    const brightness = [];
    for (const [left, phase] of [[110, 'day'], [60, 'sunset'], [35, 'dusk'], [10, 'night']]) {
      const sample = await page.evaluate(({ left }) => {
        const { page } = window.siegeFixture;
        page.sim.elapsed = 120 - left;
        page.frame(performance.now());
        const canvas = document.querySelector('.campaign-board > canvas'), data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0, n = 0;
        for (let i = 0; i < data.length; i += 64) { sum += data[i] + data[i + 1] + data[i + 2]; n += 3; }
        return { mean: sum / n, phase: document.querySelector('.siege-timer').dataset.sky };
      }, { left });
      assert.equal(sample.phase, phase);
      assert.equal(await page.locator('.siege-timer').innerText(), `${left}s`);
      brightness.push(sample.mean);
      await page.screenshot({ path: `test-results/siege-sky-${phase}-${width}.png` });
    }
    assert.ok(brightness[3] < brightness[0] * 0.85, 'Night visibly darkens the castle');
    const style = await page.locator('.siege-units').evaluate(el => ({ background: getComputedStyle(el).backgroundColor, border: getComputedStyle(el).borderTopColor }));
    assert.equal(style.background, 'rgba(0, 0, 0, 0.55)');
    assert.equal(style.border, 'rgb(185, 138, 62)');
    await page.waitForTimeout(150);
    assert.equal(await page.locator('.siege-timer').innerText(), '10s', 'Paused sky and timer stay on battle time');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Siege day, sunset, dusk, night, paused time and translucent units box pass on desktop and phone.');
} finally { await browser.close(); }
