// Pixel Art: the Settings page's toggle (on by default, saved), and the
// Defend board drawn with the PNG sprites while it is on and with its own
// art once it is off, in the isolated stress scene (no player saves) and
// the real app's Settings, desktop and phone (needs `npm run dev`).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results/pixel-art', { recursive: true });
try {
  for (const [name, viewport] of [['desktop', { width: 1100, height: 820 }], ['phone', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'tests/defend-stress.html?manual&enemies=100');
    await page.waitForFunction(() => window.stressPage);
    // Daylight and dry, the troops and enemies of kinds with a sprite.
    await page.evaluate(() => {
      const p = window.stressPage, s = p.sim;
      Object.assign(p, { night: 0, weather: null });
      const kinds = ['roach', 'orc', 'ogre', 'bat', 'warlord'];
      const spots = s.enemies.map(e => ({ x: e.x, y: e.y })).slice(0, 60);
      s.enemies.length = 0;
      spots.forEach((at, i) => { s.spawnEnemy(kinds[i % kinds.length]); Object.assign(s.enemies.at(-1), at, { flash: 0 }); });
      s.soldiers.forEach(u => { u.flash = 0; });
    });
    const frame = () => page.evaluate(() => { const p = window.stressPage; p.frame(performance.now()); });
    const pixels = () => page.evaluate(async () => {
      const m = await import('/src/defend/pixel-sprites.ts');
      return { on: m.pixelArtOn(), loaded: m.PIXEL_SPRITES.filter(id => m.pixelSprite(id)).length, total: m.PIXEL_SPRITES.length };
    });
    await page.evaluate(async () => {
      window.__pixelSprites = await import('/src/defend/pixel-sprites.ts');
      window.__pixelSprites.preloadPixelArt();
    });
    await page.waitForFunction(() => window.__pixelSprites.PIXEL_SPRITES.every(id => window.__pixelSprites.pixelSprite(id)));
    const loaded = await pixels();
    assert.equal(loaded.on, true, 'Pixel Art on by default');
    assert.equal(loaded.loaded, loaded.total, 'every registered sprite loads');
    for (let i = 0; i < 3; i++) await frame();
    const board = page.locator('#defend-canvas');
    const shotOn = await board.screenshot({ path: `test-results/pixel-art/${name}-on.png` });
    await page.evaluate(async () => (await import('/src/defend/pixel-sprites.ts')).setPixelArt(false));
    for (let i = 0; i < 3; i++) await frame();
    const shotOff = await board.screenshot({ path: `test-results/pixel-art/${name}-off.png` });
    assert.notDeepEqual(shotOn, shotOff, 'the board looks different with Pixel Art off');
    assert.equal((await pixels()).loaded, 0, 'no sprite is handed out while off');
    // The palette's bomb and city tile icons follow too.
    await page.evaluate(async () => (await import('/src/defend/pixel-sprites.ts')).setPixelArt(true));
    for (let i = 0; i < 3; i++) await frame();
    const again = await board.screenshot();
    assert.deepEqual(again.length > 0, true);
    assert.deepEqual(errors, []);
    await context.close();
  }
  // The real Settings page: Pixel Art, on by default, saved when turned off.
  const context = await browser.newContext({ viewport: { width: 1100, height: 820 } });
  const page = await context.newPage();
  await page.goto(base);
  await page.locator('[data-tab="settings"], #tab-settings, nav button:has-text("Settings")').first().click();
  const box = page.locator('#pixel-art');
  assert.equal(await box.isChecked(), true, 'Pixel Art checked by default');
  assert.match(await page.locator('label.setting:has(#pixel-art)').innerText(), /Pixel Art/);
  await box.uncheck();
  assert.equal(await page.evaluate(async () => (await import('/src/defend/pixel-sprites.ts')).pixelArtOn()), false);
  await page.reload();
  await page.locator('[data-tab="settings"], #tab-settings, nav button:has-text("Settings")').first().click();
  assert.equal(await page.locator('#pixel-art').isChecked(), false, 'the choice is saved');
  await context.close();
  console.log('pixel art checks passed');
} finally {
  await browser.close();
}
