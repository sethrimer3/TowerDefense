// Fresh browser contexts exercise the actual app without accessing player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });

async function app(viewport, smithy, free = false) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(({ smithy, free }) => {
    localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2, smithy,
      settings: { devMode: free, soundOff: true, ambienceOff: true, reduceMotion: true } }));
  }, { smithy, free });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('#defend-start');
  return { context, page, errors };
}
const wallet = page => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')).smithy);
const tab = (page, id) => page.locator(`nav [data-tab="${id}"]`).click();
async function building(page, id) {
  await page.locator('#mine-buildings-toggle').click();
  await page.locator(`[data-building="${id}"]`).click();
}

try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 360, height: 640 }]) {
    const { context, page, errors } = await app(viewport, { copper: 10, silver: 0, gold: 22 });
    assert.equal(await page.locator('.currency').count(), 6);
    assert.deepEqual(await page.locator('.currency small').allTextContents(), ['COPPER', 'SILVER', 'GOLD', 'KNOWLEDGE', 'UPGRADE', '???']);
    assert.equal(await page.locator('#gold').textContent(), '22');
    assert.equal(await page.locator('.gold-currency .bar-icon.gold').count(), 1);
    assert.equal(await page.locator('.currency img[src$="gold.png"]').count(), 0);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.currency')].every(el => {
      const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && r.width > 0;
    })), true);
    await page.screenshot({ path: `test-results/metal-economy-header-${viewport.width}.png` });

    await tab(page, 'mine');
    assert.match(await page.locator('#mine-hire').textContent(), /2 Copper/);
    await page.locator('#mine-hire').click();
    assert.deepEqual(await wallet(page), { copper: 8, silver: 0, gold: 22 });
    await building(page, 'shaft');
    assert.match(await page.locator('[data-upgrade="shaft"]').textContent(), /4 Copper/);
    await page.locator('[data-upgrade="shaft"]').click();
    assert.deepEqual(await wallet(page), { copper: 4, silver: 0, gold: 22 });

    await tab(page, 'library');
    assert.match(await page.locator('#library-shelf').textContent(), /1 Copper/);
    await page.locator('#library-shelf').click();
    assert.deepEqual(await wallet(page), { copper: 3, silver: 0, gold: 22 });
    await page.locator('#library-hire').click();
    assert.deepEqual(await wallet(page), { copper: 1, silver: 0, gold: 22 });
    assert.equal(await page.locator('#library-hire').isDisabled(), true);
    await page.screenshot({ path: `test-results/metal-economy-library-${viewport.width}.png` });

    await tab(page, 'tiles');
    await page.locator('[data-mode="shop"]').click();
    await page.locator('[data-filter="consumables"]').click();
    await page.locator('[data-tile="bomb"]').click();
    assert.match(await page.locator('[data-buy-tile="bomb"]').textContent(), /1 Copper/);
    await page.locator('[data-buy-tile="bomb"]').click();
    assert.deepEqual(await wallet(page), { copper: 0, silver: 0, gold: 22 });
    assert.equal(await page.locator('[data-buy-tile="bomb"]').isDisabled(), true);
    assert.equal(await page.evaluate(() => 'gold' in JSON.parse(localStorage.getItem('towerdefense.v1'))), false);
    assert.deepEqual(errors, []);
    await context.close();
  }

  for (const free of [false, true]) {
    const initial = { copper: 2000, silver: 5, gold: free ? 0 : 1 };
    const { context, page, errors } = await app({ width: 390, height: 844 }, initial, free);
    await tab(page, 'mine');
    await page.evaluate(() => window.mineLevel('warehouse', 3));
    await building(page, 'warehouse');
    assert.match(await page.locator('[data-upgrade="warehouse"]').textContent(), /1926 Copper · 4 Silver · 1 Gold/);
    await page.locator('[data-upgrade="warehouse"]').click();
    assert.deepEqual(await wallet(page), free ? initial : { copper: 74, silver: 1, gold: 0 });
    await tab(page, 'library');
    await page.evaluate(() => window.libraryLab(3));
    await page.locator('#library-lab').click();
    assert.match(await page.locator('#library-lab-up').textContent(), /810 Copper · 12 Silver · 1 Gold/);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.library-head button')].every(el => {
      const r = el.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
    })), true, 'mixed prices must fit the mobile Library header');
    await page.screenshot({ path: `test-results/metal-economy-mixed-${free ? 'dev' : 'paid'}.png` });
    if (free) {
      await page.locator('#library-lab-up').click();
      assert.deepEqual(await wallet(page), initial);
    } else {
      assert.equal(await page.locator('#library-lab-up').isDisabled(), true);
      assert.deepEqual(await wallet(page), { copper: 74, silver: 1, gold: 0 });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }

  const page = await browser.newPage();
  await page.goto(new URL('tests/defend-stress.html?enemies=100&manual=1', base).href);
  await page.waitForFunction(() => window.stressPage);
  const rewards = await page.evaluate(async () => {
    const { defaults } = await import('/src/save.ts');
    const { payWave } = await import('/src/progression.ts');
    const p = window.stressPage, s = defaults();
    s.defend = p.save;
    p.host.earnWave = wave => payWave(s, wave);
    p.sim.slain.roach = 500;
    const clear = wave => { p.sim.events = [{ type: 'waveCleared', wave }]; p.handleEvents(); };
    clear(1);
    const record = p.newRecord;
    clear(1); clear(10); clear(10); clear(5);
    return { points: s.upgradePoints, best: s.defend.bestWave, record, knowledge: s.knowledge,
      metal: s.smithy, hasCoins: 'gold' in s, text: p.message };
  });
  assert.deepEqual({ ...rewards, text: undefined }, { points: 2, best: 10, record: 1,
    knowledge: 0, metal: { copper: 10, silver: 0, gold: 0 }, hasCoins: false, text: undefined });
  assert.ok(!/gold|copper|knowledge/i.test(rewards.text || ''));
  await page.close();
  console.log('Metal economy: desktop/mobile labels, shared purchases, mixed prices, dev mode and DEFEND rewards passed.');
} finally { await browser.close(); }
