// The Highlands (zone 5, waves 81–100): the desert's dunes in snow, the
// trails trodden through them, the snowballs, the vault's ice spires,
// pillars, rune stones, relics and frozen sheets, in battle, at sunset and
// at night, desktop and phone, and its wilds past the board. Isolated
// saves. Needs `npm run dev`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = process.env.SHOTS || 'test-results';
const scale = Number(process.env.SCALE || 1);
mkdirSync(out, { recursive: true });
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone, deviceScaleFactor: phone ? 3 : scale });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.profile = { name: 'Vault Tester', flag: { base: 3, layers: [] } };
      s.defend.furthestWave = 82; s.defend.bestWave = 81; s.defend.startWave = 81; s.defend.storiesSeen = ['frozen'];
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('vault-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('vault-seeded', 'yes');
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
    await page.waitForTimeout(3000);
    await page.evaluate(() => document.querySelector('#defend-start').click());
    await page.waitForTimeout(4000);
    const plan = await page.evaluate(() => {
      const r = window.__dp.renderer, p = r.vault?.plan, sim = window.__dp.sim;
      return { area: r.area, mode: sim?.atmosphere?.mode, spires: p?.spires.length ?? -1, pillars: p?.pillars.length ?? -1, runes: p?.runes.length ?? -1, relics: p?.relics.length ?? -1, sheets: p?.sheets.length ?? -1, trails: sim?.trails?.style };
    });
    console.log(width, JSON.stringify(plan));
    assert.equal(plan.area, 'frozen');
    assert.equal(plan.mode, 'snow');
    assert.ok(plan.spires >= 3 && plan.pillars >= 2 && plan.runes >= 1, JSON.stringify(plan));
    await page.screenshot({ path: `${out}/frozen-vault-${width}-battle.png` });
    if (!process.env.BASELINE)
      for (const what of ['spires', 'pillars', 'runes', 'relics', 'sheets']) {
        await page.evaluate((what) => {
          const r = window.__dp.renderer, t = r.vault.plan[what][0]; if (!t) return;
          r.cam.s = 3; r.cam.x = r.canvas.width / 2 - t.x * r.px * 3; r.cam.y = r.canvas.height / 2 - t.y * r.px * 3;
        }, what);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/frozen-vault-${width}-${what}.png` });
      }
    // Zoomed out, the snow and the mountains round the board.
    await page.evaluate(() => {
      const r = window.__dp.renderer;
      r.cam.s = 0.45; r.cam.x = r.canvas.width * 0.32; r.cam.y = r.canvas.height * 0.3;
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${out}/frozen-vault-${width}-wilds.png` });
    await page.evaluate(() => {
      const r = window.__dp.renderer;
      r.cam.s = 1.5; r.cam.x = r.canvas.width * 0.5; r.cam.y = r.canvas.height * 0.45;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/frozen-vault-${width}-edge.png` });
    for (const phase of ['sunset', 'night']) {
      await page.evaluate((phase) => {
        const g = window.__dp.host.game(); g.settings.dayNightCycle = false; g.settings.timeOfDay = phase;
      }, phase);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/frozen-vault-${width}-edge-${phase}.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('frozen vault ok');
