// Landscape (desktop) Defend: every floating control takes its own clicks,
// and an open upgrade tree hides everything that floats over the board.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  for (const viewport of [{ width: 1046, height: 908 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2, profile: { name: 'Hit Tester', flag: { base: 3, layers: [] } } }));
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
    await page.waitForSelector('#defend-start', { state: 'visible' });
    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('landscape')));
    // Buttons whose middle is covered by something else (the board, a panel).
    const blocked = (outsideTree) => page.evaluate((outsideTree) => [...document.querySelectorAll('#defend-start, #defend-left button, .defend-right button, .shell > nav button')]
      .filter(b => {
        const r = b.getBoundingClientRect();
        if (!r.width || getComputedStyle(b).visibility !== 'visible' || (outsideTree && b.closest('.defend-specialty'))) return false;
        return !b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
      }).map(b => b.id || b.textContent.trim()), outsideTree);
    assert.deepEqual(await blocked(false), [], `${viewport.width}: controls take their own clicks`);
    // Open the keep's upgrade tree from its building menu.
    const box = await page.locator('#defend-canvas').boundingBox();
    // The keep stands a little right of and below the field's middle.
    const side = Math.min(box.width, box.height);
    let opened = false;
    for (const [dx, dy] of [[0.037, 0.207], [0.03, 0.2], [0.045, 0.215], [0.037, 0.19], [0.037, 0.225]]) {
      await page.mouse.click(box.x + box.width / 2 + dx * side, box.y + box.height / 2 + dy * side);
      const tree = page.locator('[aria-label="Upgrade tree"]');
      if (await tree.isVisible().catch(() => false)) { await tree.click(); opened = true; break; }
    }
    assert.ok(opened, `${viewport.width}: keep's building menu offers its upgrade tree`);
    await page.waitForSelector('#defend-specialty.upgrade-tree:not([hidden])');
    const shown = await page.evaluate(() => [...document.querySelectorAll('.shell > nav button, .defend-head button, .defend-side button, .currency-hold')]
      .filter(e => e.getBoundingClientRect().width && getComputedStyle(e).visibility === 'visible').map(e => e.id || e.className || e.textContent.trim()));
    assert.deepEqual(shown, [], `${viewport.width}: nothing floats over an open tree`);
    await page.locator('[data-specialty-close]').click();
    await page.waitForSelector('#defend-start', { state: 'visible' });
    assert.deepEqual(await blocked(true), [], `${viewport.width}: controls return when the tree closes`);
    await page.locator('#defend-start').click();
    await page.waitForSelector('#defend-start', { state: 'detached' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Landscape controls take their clicks and step aside for an open upgrade tree.');
} finally { await browser.close(); }
