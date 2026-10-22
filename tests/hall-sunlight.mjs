// Real Tiles UI plus isolated room renders. Fresh browser contexts only;
// no player saves. Checks soft edges, motion, night, Reduce Motion and art toggles.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1280, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Midmorning: visible daylight and a modest diagonal solar heading.
    await page.addInitScript(() => { Date.now = () => 1100000; });
    await page.goto(base); await page.waitForSelector('#defend-start');
    await page.locator('[data-tab="tiles"]').click();
    await page.waitForSelector('.tiles-grid .tile');
    await page.waitForTimeout(600); // Let the existing tab-entry animation settle.
    await page.screenshot({ path: `test-results/tiles-sunlight-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const checks = await page.evaluate(async () => {
      const { HallBackdrop } = await import('/src/ui/hall-art.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { SoftSunlight } = await import('/src/soft-sunlight.ts');
      const canvas = document.createElement('canvas');
      canvas.style = `position:fixed;inset:20px;width:${Math.min(600, innerWidth - 40)}px;height:700px;image-rendering:pixelated;z-index:1000`;
      document.body.append(canvas);
      const room = new HallBackdrop(canvas, 'keep'), ctx = canvas.getContext('2d');
      const pixels = () => Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      room.draw(140000, [], 1, false); const first = pixels();
      room.draw(170000, [], 1, false); const moved = pixels();
      room.draw(200000, [], 1, true); const still = pixels();
      room.draw(230000, [], 1, true); const stillLater = pixels();
      // The city outside retains its own flickering sconces at night;
      // inspect only the interior wall below the window for stray sunlight.
      const below = Math.ceil(room.win.y1 + 6) * canvas.width * 4;
      room.draw(260000, [], 0, false); const night = pixels().slice(below);
      room.draw(290000, [], 0, false); const nightLater = pixels().slice(below);
      setPixelArt(false); room.draw(320000, [], 1, true); const legacy = pixels();
      setPixelArt(true); room.draw(350000, [], 1, true); const restored = pixels();
      setPixelArt(false); room.draw(380000, [], 1, true); const legacyAgain = pixels();
      setPixelArt(true); room.draw(140000, [], 1, false);
      // Symmetric native leadwork, including both halves of the rose/lancets.
      let asymmetric = 0;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width / 2; x++) {
        if ((room.part[y * canvas.width + x] === 2) !== (room.part[y * canvas.width + canvas.width - x - 1] === 2)) asymmetric++;
      }
      const probe = document.createElement('canvas'); probe.width = 240; probe.height = 240;
      const light = new SoftSunlight(), c = probe.getContext('2d');
      light.draw(c, 120, 0, 40, 240, 0, 1);
      const row = c.getImageData(0, 70, 240, 1).data;
      let maxStep = 0; const shades = new Set();
      for (let x = 1; x < 240; x++) { shades.add(row[x * 4 + 3]); maxStep = Math.max(maxStep, Math.abs(row[x * 4 + 3] - row[(x - 1) * 4 + 3])); }
      const samples = [];
      for (let k = 0; k < 45; k++) { const start = performance.now(); room.draw(141000 + k * 80, [], 1, false); samples.push(performance.now() - start); }
      samples.sort((a,b) => a-b);
      const same = (a,b) => a.every((v,i) => v === b[i]);
      return { moved: !same(first,moved), still: same(still,stillLater), night: same(night,nightLater), gated: !same(still,legacy), restored: same(still,restored), legacy: same(legacy,legacyAgain), asymmetric, maxStep, shades: shades.size, p95: samples[Math.floor(samples.length * .95)] };
    });
    assert.equal(checks.moved, true, 'sunlight/dust move over time');
    assert.equal(checks.still, true, 'Reduce Motion freezes decorative movement');
    assert.equal(checks.night, true, 'night has no sunlight or lit dust');
    assert.equal(checks.gated && checks.restored && checks.legacy, true, 'window art toggles/rebakes without resizing');
    assert.equal(checks.asymmetric, 0, 'leadwork stays symmetric on the native grid');
    assert.ok(checks.maxStep <= 4 && checks.shades >= 16, 'light edges feather smoothly to transparent');
    await page.locator('body > canvas').screenshot({ path: `test-results/tiles-window-detail-${width}.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: soft edges, solar/dust motion, night, reduced motion, art toggle and leadwork passed; room draw p95 ${checks.p95.toFixed(2)}ms`);
    await context.close();
  }
} finally { await browser.close(); }
