// The building menu gallery (tests/building-menu.html): the square menu
// over a real build-phase board and round building sprites, its icons, the
// square ranges with crosshairs and their nearby square, and the palette's
// opening flash. Desktop and phone, isolated contexts, no player saves.
// Needs `npm run dev`. Screenshots go to test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const out = process.env.SHOTS || 'test-results';
mkdirSync(out, { recursive: true });
try {
  for (const [width, height] of [[1280, 1000], [390, 844]]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(new URL('tests/building-menu.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForSelector('#defend-board .building-menu');
    await page.waitForTimeout(600);
    const check = await page.evaluate(() => {
      const board = document.querySelector('#defend-board').getBoundingClientRect();
      const live = document.querySelector('#defend-board .building-menu').getBoundingClientRect();
      const demos = [...document.querySelectorAll('.menu-demo')].map((d) => {
        const m = d.querySelector('.building-menu');
        const inBox = (el) => { const r = el.getBoundingClientRect(), b = m.getBoundingClientRect(); return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1; };
        return {
          controls: d.dataset.controls,
          square: Math.abs(m.offsetWidth - m.offsetHeight) <= 1,
          hooks: ['tree', 'remove', 'aim', 'range'].filter((h) => m.querySelector(`[data-bm="${h}"]`)),
          modes: m.querySelectorAll('[data-bm-mode]').length,
          checked: m.querySelectorAll('[aria-checked="true"]').length,
          inside: [...m.querySelectorAll('button, input')].every(inBox),
        };
      });
      const icons = [...document.querySelectorAll('#icons img')].every((i) => i.complete && i.naturalWidth === 48);
      return { live: live.left >= board.left - 1 && live.right <= board.right + 1 && live.top >= board.top - 1 && live.bottom <= board.bottom + 1, demos, icons };
    });
    assert.ok(check.live, 'the live menu stays on the board');
    assert.ok(check.icons, 'every icon loaded');
    for (const d of check.demos) {
      assert.ok(d.square, `${d.controls} menu is square`);
      assert.ok(d.inside, `${d.controls} menu's controls fit inside it`);
      if (d.controls === 'plain') assert.deepEqual([d.hooks, d.modes], [['tree', 'remove'], 0]);
      else assert.deepEqual([d.hooks, d.modes, d.checked], [['tree', 'remove', 'aim', 'range'], 5, 1]);
    }
    // The slider steps by 5% and its readout follows.
    const slider = page.locator('#defend-board [data-bm="range"]');
    await slider.focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#defend-board [data-bm="range-value"]').textContent(), '80%');
    await page.locator('#defend-board').screenshot({ path: `${out}/building-menu-${width}-board.png` });
    await page.evaluate(() => window.buildingMenuGallery.show('troops'));
    await page.waitForTimeout(200);
    await page.locator('#defend-board').screenshot({ path: `${out}/building-menu-${width}-troops.png` });
    await page.evaluate(() => { window.buildingMenuGallery.show('none'); window.buildingMenuGallery.flash(); });
    await page.waitForTimeout(120);
    await page.locator('#defend-board').screenshot({ path: `${out}/building-menu-${width}-flash.png` });
    await page.screenshot({ path: `${out}/building-menu-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('building menu gallery ok');
} finally {
  await browser.close();
}
