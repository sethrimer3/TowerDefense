// The Magic Forest testing zone (waves 201–220): clovers over the open
// ground, wispy trees and lightning bugs round them, while building and in
// battle, desktop and phone. Isolated saves. Needs `npm run dev`.
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
      s.profile = { name: 'Forest Tester', flag: { base: 3, layers: [] } };
      s.defend.furthestWave = 221; s.defend.startWave = 201;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('magic-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('magic-seeded', 'yes');
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
      return { area: r.area, trees: r.magic.plan?.trees.length ?? 0, flies: r.magic.plan?.flies.length ?? 0, forest: r.forest.plan ? 1 : 0 };
    });
    assert.equal(plan.area, 'magic');
    assert.ok(plan.trees >= 6 && plan.flies > 60, JSON.stringify(plan));
    await page.screenshot({ path: `${out}/magic-forest-${width}-building.png` });
    await page.locator('#defend-start').click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/magic-forest-${width}-battle.png` });
    // A close-up of a tree with its lightning bugs.
    await page.evaluate(() => {
      const r = window.__dp.renderer, t = r.magic.plan.trees[0];
      r.cam.s = 3; r.cam.x = r.canvas.width / 2 - t.x * r.px * 3; r.cam.y = r.canvas.height / 2 - t.y * r.px * 3;
    }).catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/magic-forest-${width}-tree.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
console.log('magic forest ok');
