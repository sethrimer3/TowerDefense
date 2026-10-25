// The forest outside Mossbound Ruins' walls: trees, rocks and dirt pads
// filling the open ground while building and in battle, the trees swaying,
// and blasts blowing them up into craters of dirt. Isolated browser
// contexts only, no player saves. Needs `npm run dev`. Screenshots go to
// test-results/ (or SHOTS).
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
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('forest-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('forest-seeded', 'yes');
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
    await page.waitForTimeout(300);
    const building = await page.evaluate(() => window.__dp.renderer.forest.counts);
    assert.ok(building.trees > 300, `the open ground is wooded (${building.trees} trees)`);
    assert.equal(building.standing, building.trees);
    await page.screenshot({ path: `${out}/forest-${width}-building.png` });
    // Zoomed in on the forest beside the wall, two moments apart: the trees sway.
    const spot = await page.evaluate(() => {
      const r = window.__dp.renderer, map = window.__dp.currentMap(), k = map.buildings.find(b => b.kind === 'keep').rect;
      const c = r.toClient(k.x + k.w / 2 - 14, k.y + k.h / 2 + 2);
      r.zoomAt(c.x, c.y, 4);
      return true;
    });
    assert.ok(spot);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/forest-${width}-close.png` });
    await page.click('#defend-start');
    await page.waitForFunction(() => window.__dp.sim);
    // Blasts out in the woods: trees blown up into dirt.
    const blown = await page.evaluate(async () => {
      const dp = window.__dp, sim = dp.sim, r = dp.renderer, map = dp.currentMap(), k = map.buildings.find(b => b.kind === 'keep').rect;
      const x = k.x + k.w / 2 - 14, y = k.y + k.h / 2 + 2;
      sim.explode(x, y, { r: 2.2, damage: 1, friendlyFire: false });
      sim.explode(x + 3, y - 2, { r: 1.4, damage: 1, friendlyFire: false });
      await new Promise(f => setTimeout(f, 120));
      return r.forest.counts;
    });
    assert.ok(blown.standing < blown.trees, 'the blasts felled trees');
    assert.ok(blown.debris > 0, 'felled trees burst into leaves and splinters');
    await page.screenshot({ path: `${out}/forest-${width}-blast.png` });
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${out}/forest-${width}-craters.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('forest: ok');
} finally { await browser.close(); }
