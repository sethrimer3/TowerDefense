// The Crystal Caves (zone 3, waves 41–60): gravel, slick rocks, glowing
// crystals, ponds and mushrooms with their spores, and shafts of daylight
// with dust, while building, in battle and at night, desktop and phone.
// Isolated saves. Needs `npm run dev`.
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
      s.profile = { name: 'Cave Tester', flag: { base: 3, layers: [] } };
      s.defend.furthestWave = 42; s.defend.startWave = 41;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('caves-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('caves-seeded', 'yes');
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
        DefendPage.prototype.frame = function (t) { window.__dp = this; return real.call(this, t); };
        DefendPage.prototype.frame.__hooked = true;
      }
    });
    await page.waitForFunction(() => window.__dp);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(3500);
    const plan = await page.evaluate(() => {
      const r = window.__dp.renderer;
      const p = r.caves.plan;
      return { area: r.area, rocks: p?.rocks.length ?? 0, ponds: p?.ponds.length ?? 0, crystals: p?.crystals.length ?? 0, mushrooms: p?.mushrooms.length ?? 0, shafts: p?.shafts.length ?? 0 };
    });
    assert.equal(plan.area, 'drowned');
    assert.ok(plan.rocks >= 10 && plan.ponds >= 2 && plan.crystals >= 6 && plan.mushrooms >= 6 && plan.shafts >= 2, JSON.stringify(plan));
    await page.screenshot({ path: `${out}/crystal-caves-${width}-building.png` });
    await page.locator('#defend-start').click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/crystal-caves-${width}-battle.png` });
    // Close-ups of a light shaft and a crystal cluster.
    for (const what of ['shafts', 'crystals', 'mushrooms', 'ponds']) {
      await page.evaluate((what) => {
        const r = window.__dp.renderer, t = r.caves.plan[what][0];
        r.cam.s = 3; r.cam.x = r.canvas.width / 2 - t.x * r.px * 3; r.cam.y = r.canvas.height / 2 - t.y * r.px * 3;
      }, what).catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/crystal-caves-${width}-${what}.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
console.log('crystal caves ok');
