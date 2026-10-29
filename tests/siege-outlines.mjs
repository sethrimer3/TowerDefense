import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium', headless: true });
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('tests/siege-outlines.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    const samples = await page.evaluate(async () => {
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { FRIEND_INK, ENEMY_INK } = await import('/src/campaign/siege-colors.ts');
      const rgb = hex => hex.slice(1).match(/../g).map(n => parseInt(n, 16));
      const count = (canvas, ink) => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, color = rgb(ink);
        let n = 0; for (let i = 0; i < data.length; i += 4) if (color.every((v, c) => data[i + c] === v) && data[i + 3]) n++;
        return n;
      };
      const rows = [...document.querySelectorAll('#gallery canvas')].map(canvas => ({ red: count(canvas, ENEMY_INK), blue: count(canvas, FRIEND_INK) }));
      const sprite = document.createElement('canvas'); sprite.width = sprite.height = 3;
      const p = sprite.getContext('2d'); p.fillStyle = '#000'; p.fillRect(0, 0, 3, 3); p.fillStyle = '#00ff00'; p.fillRect(1, 1, 1, 1);
      const checks = [];
      for (const merged of [true, false]) {
        const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 8;
        const c = canvas.getContext('2d'), outlines = new UnitOutline(), layer = outlines.begin(c, merged);
        for (const [x, ink] of [[1, FRIEND_INK], [6, ENEMY_INK]]) { outlines.ink(ink); layer.units.drawImage(sprite, x, 1); }
        outlines.end(c);
        checks.push({ blue: [...c.getImageData(1, 1, 1, 1).data].slice(0, 3), red: [...c.getImageData(6, 1, 1, 1).data].slice(0, 3), body: [...c.getImageData(2, 2, 1, 1).data].slice(0, 3) });
      }
      return { rows, checks, blue: rgb(FRIEND_INK), red: rgb(ENEMY_INK), fits: document.documentElement.scrollWidth <= innerWidth };
    });
    assert.equal(samples.rows.length, 8);
    assert.ok(samples.rows.every(row => row.red > 10 && row.blue > 10), JSON.stringify(samples.rows));
    for (const check of samples.checks) { assert.deepEqual(check.red, samples.red); assert.deepEqual(check.blue, samples.blue); assert.deepEqual(check.body, [0, 255, 0]); }
    assert.equal(samples.fits, true);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `test-results/siege-outlines-${width}.png`, fullPage: true });
    await page.close();
  }
  console.log('Per-side silhouettes, unchanged body pixels, touching native families, merged/individual/square outlines and night gallery pass.');
} finally { await browser.close(); }
