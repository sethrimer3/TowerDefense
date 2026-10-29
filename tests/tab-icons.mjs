import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }),
  headless: true,
});
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    // A fresh context keeps the fixture separate from player profiles and saves.
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [], images = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.resourceType() === 'image' && /\/assets\/ui\/|\.png(?:\?|$)/.test(request.url())) images.push(request.url());
    });
    await page.goto(new URL('tests/tab-icons.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => document.querySelectorAll('#gallery canvas').length === 24);
    await page.evaluate(() => document.fonts.ready);
    const result = await page.evaluate(async () => {
      const { TAB_ICON_NAMES, TAB_ICON_VARIANTS, tabIconPixels } = await import('/src/ui/tab-icons.ts');
      const art = [];
      for (const name of TAB_ICON_NAMES) for (const variant of TAB_ICON_VARIANTS) {
        const pixels = tabIconPixels(name, variant);
        if (![...pixels].every(([pixel, color]) => Number.isInteger(pixel) && pixel >= 0 && pixel < 256 && /^#[0-9a-f]{6}$/i.test(color))) {
          throw new Error(`Invalid pixel in ${name}/${variant}`);
        }
        art.push(JSON.stringify([...pixels]));
      }
      const canvases = [...document.querySelectorAll('main canvas')];
      const blocks = canvases.every(canvas => {
        if (canvas.width !== 48 || canvas.height !== 48) return false;
        const data = canvas.getContext('2d').getImageData(0, 0, 48, 48).data;
        let painted = 0, transparent = 0;
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
          const offset = (y * 48 + x) * 4;
          const block = (Math.floor(y / 3) * 3 * 48 + Math.floor(x / 3) * 3) * 4;
          if (![0, 1, 2, 3].every(c => data[offset + c] === data[block + c])) return false;
          if (data[offset + 3] === 255) painted++;
          else if (data[offset + 3] === 0) transparent++;
          else return false;
        }
        return painted > 0 && transparent > 0;
      });
      return {
        designs: new Set(art).size, blocks,
        selected: TAB_ICON_NAMES.map(name => JSON.stringify([...tabIconPixels(name)])),
        expected: [tabIconPixels('defend', 'a'), tabIconPixels('defend', 'c'), tabIconPixels('settings', 'b')].map(pixels => JSON.stringify([...pixels])),
        newSword: !art.includes(JSON.stringify([...tabIconPixels('siege')])),
        fits: document.documentElement.scrollWidth <= innerWidth,
        labelled: document.querySelectorAll('canvas[role="img"][aria-label]').length,
        saved: localStorage.length,
      };
    });
    assert.equal(result.designs, 12);
    assert.equal(result.blocks, true, 'Opaque art pixels and transparency stay on the 3× lattice');
    assert.equal(result.fits, true, 'Gallery fits the viewport');
    assert.equal(result.labelled, 16);
    assert.equal(result.selected[0], result.expected[0], 'Defend uses A');
    assert.equal(result.selected[1], result.expected[1], 'Ambush uses Defend C');
    assert.equal(result.selected[3], result.expected[2], 'Settings uses B');
    assert.equal(result.newSword, true, 'Siege has its own sword design');
    assert.equal(result.saved, 0, 'Gallery creates no save');
    assert.deepEqual(images, [], 'No sprite images are requested');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `test-results/tab-icons-${width}.png`, fullPage: true });
    await page.locator('#selected').screenshot({ path: `test-results/tab-icons-selected-${width}.png` });

    // Seed only this fresh context, then verify the canvases in real navigation.
    await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const save = defaults();
      save.profile = { name: 'Test Warden', flag: { base: 12, layers: [{ pattern: 'cross', color: 3 }] } };
      save.settings.soundOff = true;
      localStorage.setItem('towerdefense.v1', JSON.stringify(save));
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
    const combat = page.locator('nav [data-tab="defend"]');
    await combat.waitFor();
    async function checkCurrent(mode) {
      assert.equal(await page.locator('nav canvas[data-tab-icon]').count(), 0, 'Legacy canvases are absent when disabled');
      const image = combat.locator('.combat-icon-layer img.ui-sprite');
      assert.match(await image.getAttribute('src'), /^data:image\/png/);
      await image.evaluate(img => img.decode());
      const settings = page.locator('nav [data-tab="settings"] img');
      assert.match(await settings.getAttribute('src'), /^data:image\/png/);
      await settings.evaluate(img => img.decode());
    }
    async function checkIcon(name) {
      const result = await page.evaluate(async name => {
        const { paintTabIcon } = await import('/src/ui/tab-icons.ts');
        const canvas = document.querySelector(`nav canvas[data-tab-icon="${name}"]`);
        if (!canvas) return false;
        const expected = document.createElement('canvas');
        paintTabIcon(expected, name);
        return canvas.toDataURL() === expected.toDataURL();
      }, name);
      assert.equal(result, true, `Live ${name} icon matches the selection`);
    }
    await checkCurrent('defend');
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#legacy-graphics').isChecked(), false);
    assert.match(await page.locator('label:has(#legacy-graphics)').innerText(), /Show legacy graphics/);
    await page.locator('#legacy-graphics').check();
    await checkIcon('defend');
    await checkIcon('settings');
    await combat.click(); // Return to Defend without cycling.
    for (const mode of ['defend', 'ambush', 'siege']) {
      await page.waitForFunction(mode => document.querySelector('nav [data-tab="defend"]').dataset.mode === mode && document.querySelectorAll('.combat-icon-layer').length === 1, mode);
      await checkIcon(mode);
      await page.locator('nav').screenshot({ path: `test-results/tab-icons-${mode}-nav-${width}.png` });
      await combat.click();
    }
    await page.locator('nav [data-tab="settings"]').click();
    await checkIcon('settings');
    const before = await page.locator('nav [data-tab="settings"] canvas').evaluate(canvas => canvas.toDataURL());
    await page.locator('#pixel-art').click();
    await page.waitForTimeout(100); // Allow the existing icon refresh frame to run.
    assert.equal(await page.locator('nav [data-tab="settings"] canvas').evaluate(canvas => canvas.toDataURL()), before, 'Pixel Art setting preserves UI art');
    await checkIcon('defend');
    await combat.click(); // Return to Defend without cycling.
    await combat.evaluate(button => { for (let i = 0; i < 4; i++) button.click(); });
    await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
    await checkIcon('ambush');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await combat.click();
    assert.equal(await combat.locator('.combat-icon-layer').count(), 1, 'Legacy graphics respects Reduce Motion');
    await checkIcon('siege');
    await page.reload();
    await combat.waitFor();
    await checkIcon('defend');
    await checkIcon('settings');
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#legacy-graphics').isChecked(), true, 'Choice survives reload');
    await combat.click();
    await combat.click(); // Ambush.
    await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
    await checkIcon('ambush');
    await combat.click(); // Siege.
    await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
    await checkIcon('siege');
    await page.locator('nav [data-tab="settings"]').click();
    await page.locator('#legacy-graphics').uncheck();
    await checkCurrent('siege');
    assert.equal(await combat.getAttribute('data-mode'), 'siege', 'Changing artwork preserves the current mode');
    await combat.click(); // Return to Siege without cycling.
    for (const mode of ['defend', 'ambush', 'siege']) {
      await combat.click();
      await page.waitForFunction(() => document.querySelectorAll('.combat-icon-layer').length === 1);
      await checkCurrent(mode);
    }
    await page.reload();
    await combat.waitFor();
    await checkCurrent('defend');
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#legacy-graphics').isChecked(), false, 'Disabled choice survives reload');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Legacy graphics setting: opt-in, immediate switching, both icon sets, reload and Pixel Art independence pass on desktop and phone.');
} finally {
  await browser.close();
}
