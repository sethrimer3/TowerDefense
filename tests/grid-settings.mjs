// Isolated browser saves, with actual board strokes observed after changing Settings.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const colors = { white: '#ffffff', brown: '#8b5a2b', black: '#000000', gray: '#808080', gold: '#d8b572' };
mkdirSync('test-results', { recursive: true });

try {
  for (const width of [1280, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width === 360 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2,
        profile: { name: 'Grid Tester', flag: { base: 3, layers: [] } },
        settings: { reduceMotion: true, effectsOff: true, soundOff: true, ambienceOff: true },
      }));
      window.gridStrokes = [];
      const counts = new WeakMap(), proto = CanvasRenderingContext2D.prototype;
      const begin = proto.beginPath, line = proto.lineTo, stroke = proto.stroke;
      proto.beginPath = function (...args) { counts.set(this, 0); return begin.apply(this, args); };
      proto.lineTo = function (...args) { counts.set(this, (counts.get(this) || 0) + 1); return line.apply(this, args); };
      proto.stroke = function (...args) {
        if (this.canvas.id === 'defend-canvas' && counts.get(this) === 20 && this.lineWidth === 1) {
          window.gridStrokes.push({ color: this.strokeStyle, alpha: this.globalAlpha });
          if (window.gridStrokes.length > 50) window.gridStrokes.shift();
        }
        return stroke.apply(this, args);
      };
    });
    await page.goto(base);
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    const settings = async () => page.locator('nav [data-tab="settings"]').click();
    const board = async () => page.locator('nav [data-tab="defend"]').click();
    const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')).settings);
    await settings();
    assert.equal(await page.locator('#grid-opacity-row').isVisible(), false);
    assert.equal(await page.locator('#grid-color-row').isVisible(), false);
    await page.locator('#tile-grid').check();
    const slider = page.locator('#grid-opacity');
    assert.equal(await slider.getAttribute('min'), '0');
    assert.equal(await slider.getAttribute('max'), '100');
    assert.equal(await slider.getAttribute('step'), '5');
    assert.equal(await slider.inputValue(), '30');
    assert.equal(await page.locator('#grid-opacity-value').textContent(), '30%');
    assert.deepEqual(await page.locator('#grid-color option').evaluateAll(els => els.map(el => el.value)), Object.keys(colors));
    await slider.focus();
    for (const [key, value] of [['Home', 0], ['ArrowRight', 5], ['ArrowLeft', 0], ['End', 100], ['ArrowLeft', 95], ['ArrowRight', 100]]) {
      await page.keyboard.press(key);
      assert.equal(await slider.inputValue(), String(value));
      assert.equal(await page.locator('#grid-opacity-value').textContent(), `${value}%`);
      assert.equal((await saved()).gridOpacity, value);
    }
    for (const [color, hex] of Object.entries(colors)) {
      await page.selectOption('#grid-color', color);
      assert.equal((await saved()).gridColor, color);
      await page.evaluate(() => { window.gridStrokes = []; });
      await board();
      await page.waitForFunction(hex => window.gridStrokes.some(s => s.color === hex && s.alpha === 1), hex);
      await settings();
    }
    await slider.focus();
    await page.keyboard.press('Home');
    await board();
    await page.evaluate(async () => {
      window.gridStrokes = [];
      for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame);
    });
    assert.deepEqual(await page.evaluate(() => window.gridStrokes), [], 'zero opacity draws no grid');

    // Check actual RGBA line pixels at all supported colours and opacity endpoints.
    await page.evaluate(async colors => {
      const { drawGrid } = await import('/src/defend/edit-overlay.ts');
      const { boardSize } = await import('/src/defend/grid.ts');
      const canvas = document.createElement('canvas'), size = boardSize(1);
      canvas.width = size.W; canvas.height = size.H;
      const c = canvas.getContext('2d');
      for (const [color, hex] of Object.entries(colors)) for (const alpha of [0, .3, 1]) {
        c.clearRect(0, 0, canvas.width, canvas.height);
        drawGrid(c, 1, alpha, color);
        const rgba = c.getImageData(8, 1, 1, 1).data;
        if (Math.abs(rgba[3] - Math.round(alpha * 255)) > 1) throw new Error(`Wrong opacity: ${color}/${alpha}/${rgba}`);
        if (alpha) for (let k = 0; k < 3; k++) {
          if (Math.abs(rgba[k] - parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16)) > 2) throw new Error(`Wrong colour: ${color}/${alpha}/${rgba}`);
        }
      }
    }, colors);
    await settings();
    await page.selectOption('#grid-color', 'brown');
    await slider.focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
    await page.locator('#tile-grid').uncheck();
    assert.equal(await page.locator('#grid-opacity-row').isVisible(), false);
    assert.equal(await page.locator('#grid-color-row').isVisible(), false);
    await page.locator('#tile-grid').check();
    assert.equal(await slider.inputValue(), '30');
    assert.equal(await page.locator('#grid-color').inputValue(), 'brown');
    await page.reload();
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await settings();
    assert.equal(await page.locator('#grid-opacity').inputValue(), '30');
    assert.equal(await page.locator('#grid-color').inputValue(), 'brown');
    await page.locator('#grid-color').scrollIntoViewIfNeeded();
    assert.ok(await page.locator('#grid-color').evaluate(el => el.getBoundingClientRect().right <= innerWidth), 'color control fits');
    await page.screenshot({ path: `test-results/grid-settings-${width}.png` });
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: opacity steps, all colors on the board, zero opacity, pixels and persistence passed`);
  }
} finally { await browser.close(); }
