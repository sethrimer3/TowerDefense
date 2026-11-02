// Settings and the Defend palette: no visible scrollbar but pixel scroll arrows (top middle while
// more is above, bottom middle while more is below); and each major section folds shut and open smoothly,
// staying shut through a redraw, on desktop and phone. Isolated saves; needs the dev server.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });

try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width < 500 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2,
        profile: { name: 'Fold Tester', flag: { base: 3, layers: [] } },
        settings: { soundOff: true, ambienceOff: true, developerMode: true },
      }));
    });
    await page.goto(base);
    await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.locator('nav [data-tab="settings"]').click();
    const scroller = page.locator('#settings');
    const { scrollbar, overflow } = await scroller.evaluate(e => ({ scrollbar: e.offsetWidth - e.clientWidth, overflow: e.scrollHeight > e.clientHeight }));
    assert.equal(scrollbar, 0, 'no scrollbar gutter');
    assert.ok(overflow, 'the page still has more than fits, so it still scrolls');
    await scroller.evaluate(e => { e.scrollTop = 200; });
    assert.ok(await scroller.evaluate(e => e.scrollTop) > 0, 'still scrollable');
    await scroller.evaluate(e => { e.scrollTop = 0; });
    const arrows = async (sel) => page.evaluate(sel => {
      const p = document.querySelector(sel).parentElement;
      const shown = d => p.querySelector(`:scope > .scroll-arrow-${d}`).classList.contains('show');
      return { up: shown('up'), down: shown('down') };
    }, sel);
    await page.waitForTimeout(100);
    assert.deepEqual(await arrows('#settings'), { up: false, down: true }, 'at the top only the down arrow');
    await scroller.evaluate(e => { e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(100);
    assert.deepEqual(await arrows('#settings'), { up: true, down: false }, 'at the bottom only the up arrow');
    await scroller.evaluate(e => { e.scrollTop = 0; });

    const sections = page.locator('.settings-section');
    assert.equal(await sections.count(), 3);
    await page.screenshot({ path: `test-results/settings-sections-${width}-open.png` });
    const body = page.locator('[data-section="gameplay"] .settings-body');
    const full = await body.evaluate(e => e.getBoundingClientRect().height);
    assert.ok(full > 100);
    await page.locator('[data-section="gameplay"] .settings-toggle').click();
    await page.waitForTimeout(120);
    const mid = await body.evaluate(e => e.getBoundingClientRect().height);
    assert.ok(mid > 1 && mid < full, `mid-fold height ${mid} between 0 and ${full}`);
    await page.waitForTimeout(400);
    assert.ok(await body.evaluate(e => e.getBoundingClientRect().height) < 1, 'folded shut');
    assert.equal(await page.locator('[data-section="gameplay"] .settings-toggle').getAttribute('aria-expanded'), 'false');
    assert.ok(await body.evaluate(e => e.inert), 'folded controls are inert');

    await page.locator('[data-section="display"] .settings-toggle').click();
    await page.waitForTimeout(450);
    await page.screenshot({ path: `test-results/settings-sections-${width}-folded.png` });
    // A redraw (Developer mode off and on) keeps the folds.
    await page.locator('[data-section="display"] .settings-toggle').click();
    await page.waitForTimeout(450);
    await page.locator('#developer-mode').click();
    assert.equal(await sections.count(), 2);
    assert.ok(await page.locator('[data-section="gameplay"]').evaluate(e => e.classList.contains('folded')));
    await page.locator('#developer-mode').click();
    await page.locator('[data-section="gameplay"] .settings-toggle').click();
    await page.waitForTimeout(450);
    assert.ok(Math.abs(await body.evaluate(e => e.getBoundingClientRect().height) - full) < 1, 'opened again');
    // The Defend palette: every item shown so it runs past the stage.
    await page.locator('#show-empty').check().catch(() => {});
    await page.locator('nav [data-tab="defend"]').click();
    const toggle = page.locator('#defend-side-toggle');
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
    await page.waitForTimeout(600);
    const palette = page.locator('#defend-palette');
    assert.equal(await palette.evaluate(e => { const s = getComputedStyle(e); return e.offsetWidth - e.clientWidth - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth); }), 0, 'no palette scrollbar');
    if (await palette.evaluate(e => e.scrollHeight > e.clientHeight + 1)) {
      assert.deepEqual(await arrows('#defend-palette'), { up: false, down: true });
      await palette.evaluate(e => { e.scrollTop = 120; });
      await page.waitForTimeout(100);
      assert.deepEqual(await arrows('#defend-palette'), { up: true, down: true });
      await page.screenshot({ path: `test-results/settings-sections-${width}-palette.png` });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('settings sections ok');
} finally {
  await browser.close();
}
