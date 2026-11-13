// The Tiles tab's Shop, in a browser: a second tap on the Tiles tab turns to
// the Shop (another back to the collection); the Shop lists each kind for
// sale as a row with its price and Buy, the kinds still locked behind
// Defend waves under the open ones; a Buy that can't go through sends up
// words saying what it still needs. Uses an isolated fixture, never the
// player's saved game. Needs `npm run dev`. Screenshots go to test-results/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 800 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.profile = { name: 'Shop tester', flag: { base: 3, layers: [] } };
      s.defend.bestWave = 4; s.defend.furthestWave = 5;
      s.smithy = { copper: 5, silver: 0, gold: 0 };
      return s;
    });
    await context.addInitScript((fixture) => {
      if (!sessionStorage.getItem('shop-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('shop-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    const tab = page.locator('[data-tab="tiles"]');
    await tab.click();
    await page.waitForSelector('.tiles-grid .tile');
    assert.equal(await page.locator('[data-mode="collection"]').getAttribute('aria-pressed'), 'true');

    // A second tap on the tab opens the Shop.
    await tab.click();
    await page.waitForSelector('.tiles-grid.shop-list .shop-row');
    assert.equal(await page.locator('[data-mode="shop"]').getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(500);
    const rows = await page.locator('.shop-row').evaluateAll((rs) => rs.map((r) => [r.dataset.key, r.classList.contains('locked'), r.querySelector('.shop-price').textContent.trim()]));
    const locked = rows.filter((r) => r[1]).map((r) => r[0]);
    // Beaten wave 4: the Watch tower and both guilds are open, the Repair shop (wave 5) and the extras locked.
    for (const id of ['watchTower', 'meleeGuild', 'rangedGuild']) assert.ok(!locked.includes(id), id);
    for (const id of ['repairShop', 'monsterBait', 'wallSpikes', 'wallBallista']) assert.ok(locked.includes(id), id);
    assert.ok(rows.every((r) => r[2]), 'every row shows its price');
    const firstLocked = rows.findIndex((r) => r[1]);
    assert.ok(rows.slice(firstLocked).every((r) => r[1]), 'locked rows come after the open ones');
    await page.screenshot({ path: `test-results/tiles-shop-${width}.png` });

    // A locked Buy says which wave opens it.
    await page.locator('.shop-buy[data-buy-tile="wallBallista"]').scrollIntoViewIfNeeded();
    await page.locator('.shop-buy[data-buy-tile="wallBallista"]').click();
    await page.waitForSelector('.buy-need');
    assert.equal(await page.locator('.buy-need').textContent(), 'Beat wave 30 to unlock');
    await page.waitForTimeout(2000);

    // An open Buy short of metal says how much more.
    await page.locator('.tiles-shelf').evaluate((s) => (s.scrollTop = 0));
    await page.locator('.shop-buy[data-buy-tile="meleeGuild"]').click();
    await page.locator('.shop-buy[data-buy-tile="meleeGuild"]').click();
    await page.waitForTimeout(800);
    await page.locator('.shop-buy[data-buy-tile="meleeGuild"]').click();
    await page.waitForSelector('.buy-need');
    assert.match(await page.locator('.buy-need').last().textContent(), /^Need \d+ more Copper$/);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `test-results/tiles-shop-${width}-need.png` });

    // Another tap goes back to the collection.
    await tab.click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator('[data-mode="collection"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('tiles shop ok');
} finally {
  await browser.close();
}
