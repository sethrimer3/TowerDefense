// A cloudborne Valkyrie palace on desktop and phones: its tree offers
// Cloudborne, while building it hovers over its lot on clouds, and in
// battle it drifts west across the board, fading to a tenth over the city
// or anyone and coming round from the east edge.
// Isolated browser contexts only: never reads or changes a player's saved
// game. Needs `npm run dev`. Screenshots go to test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = process.env.SHOTS || 'test-results';
mkdirSync(out, { recursive: true });
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 1e6; s.defend.owned.cityTile = 8; s.defend.owned.valkyriePalace = 1;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      l = placeStructure(l, 'valkyriePalace', l.keep.tx, l.keep.ty - 1) ?? l;
      const st = l.structures.find(st => st.kind === 'valkyriePalace');
      st.path = 'cloudborne'; st.rank = 3;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('sky-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('sky-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      window.__dp = null;
      const urls = new Set(['/src/defend/ui.ts']);
      for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
      for (const url of urls) {
        const { DefendPage } = await import(url), real = DefendPage.prototype.frame;
        if (real.__hooked) continue;
        DefendPage.prototype.frame = function(t) { window.__dp = this; return real.call(this, t); };
        DefendPage.prototype.frame.__hooked = true;
      }
    });
    await page.waitForFunction(() => window.__dp);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/sky-${width}-build.png` });
    // Tapping it opens its tree, Cloudborne climbed to III.
    const lot = await page.evaluate(() => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.kind === 'valkyriePalace');
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    });
    if (phone) await page.touchscreen.tap(lot.x, lot.y); else await page.mouse.click(lot.x, lot.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${out}/sky-${width}-tree.png` });
    assert.ok(await page.locator('#defend-specialty').innerText().then(t => /Cloudborne|Heavenly host/.test(t)), 'the tree names its path');
    await page.locator('#defend-specialty [data-specialty-close]').click();

    await page.locator('#defend-start').click();
    await page.waitForFunction(() => window.__dp?.sim);
    // Out over open ground, then over the city with troops below.
    const set = (x, y) => page.evaluate(([x, y]) => { const p = window.__dp.sim.skyPalaces[0]; p.x = x; p.y = y; }, [x, y]);
    const alpha = () => page.evaluate(() => [...window.__dp.renderer.sky.alpha.values()][0]);
    await set(4, 50); await page.waitForTimeout(1200);
    const clear = await alpha();
    await page.screenshot({ path: `${out}/sky-${width}-open.png` });
    const keep = await page.evaluate(() => window.__dp.sim.keep.rect);
    await set(keep.x - 1, keep.y - 1); await page.waitForTimeout(1200);
    const faded = await alpha();
    await page.screenshot({ path: `${out}/sky-${width}-over-city.png` });
    assert.ok(clear > 0.95, `opaque over open ground (${clear})`);
    assert.ok(faded < 0.15, `faded over the city (${faded})`);
    const state = await page.evaluate(async () => {
      const { CELLS_W } = await import('/src/defend/grid.ts');
      const sim = window.__dp.sim, p = sim.skyPalaces[0];
      p.x = -20; sim.update(0.25);
      return { lap: p.lap, east: p.x > CELLS_W, valkyries: sim.soldiers.filter(s => s.kind === 'valkyrie').length };
    });
    assert.equal(state.lap, 1, 'it comes round');
    assert.ok(state.east, 'from the east edge');
    assert.deepEqual(errors, []);
    console.log(width, { clear, faded, ...state });
    await context.close();
  }
} finally {
  await browser.close();
}
