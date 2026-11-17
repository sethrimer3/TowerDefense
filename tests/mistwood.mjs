// The Mistwood (zone 6, waves 101–120): its moss, ancient trees, rune
// stones, fairy rings, wells, logs and ferns, the mist rolling in
// while building, in battle and at night, desktop and phone, and its
// wilds past the board. Isolated saves. Needs `npm run dev`.
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
      s.profile = { name: 'Mist Tester', flag: { base: 3, layers: [] } };
      s.defend.furthestWave = 102; s.defend.bestWave = 101; s.defend.startWave = 101;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('mist-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('mist-seeded', 'yes');
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
      const r = window.__dp.renderer, p = r.mistwood?.plan;
      return { area: r.area, trees: p?.trees.length ?? -1, stones: p?.stones.length ?? -1, rings: p?.rings.length ?? -1, logs: p?.logs.length ?? -1 };
    });
    console.log(width, JSON.stringify(plan));
    assert.equal(plan.area, 'fungal');
    if (!process.env.BASELINE) assert.ok(plan.trees >= 3 && plan.stones >= 4 && plan.rings >= 2 && plan.logs >= 2, JSON.stringify(plan));
    await page.screenshot({ path: `${out}/mistwood-${width}-building.png` });
    await page.evaluate(() => document.querySelector('#defend-start').click());
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/mistwood-${width}-battle.png` });
    // The mist rolled in over the board and the wilds, then a blast clearing it.
    await page.waitForFunction(() => (window.__dp.sim?.atmosphere?.roll ?? 0) >= 0.9, null, { timeout: 60000 });
    await page.screenshot({ path: `${out}/mistwood-${width}-mist.png` });
    const cleared = await page.evaluate(() => {
      const sim = window.__dp.sim, env = sim.atmosphere, x = 6.5, y = 48.5;
      const before = env.mistAt(x, y);
      sim.explode(x, y, { r: 3, damage: 0, friendlyFire: false });
      return { before, after: env.mistAt(x, y) };
    });
    console.log(width, 'mist cleared', JSON.stringify(cleared));
    assert.ok(cleared.before > 0.3 && cleared.after < 0.1, JSON.stringify(cleared));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/mistwood-${width}-cleared.png` });
    // Close-ups of each feature.
    if (!process.env.BASELINE)
      for (const what of ['trees', 'stones', 'rings', 'wells', 'logs']) {
        await page.evaluate((what) => {
          const r = window.__dp.renderer, t = r.mistwood.plan[what][0]; if (!t) return;
          r.cam.s = 3; r.cam.x = r.canvas.width / 2 - t.x * r.px * 3; r.cam.y = r.canvas.height / 2 - t.y * r.px * 3;
        }, what);
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${out}/mistwood-${width}-${what}.png` });
      }
    // Zoomed out, the forest round the board.
    await page.evaluate(() => {
      const r = window.__dp.renderer;
      r.cam.s = 0.45; r.cam.x = r.canvas.width * 0.32; r.cam.y = r.canvas.height * 0.3;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/mistwood-${width}-forest.png` });
    // The corner of the board, the wilds round it.
    await page.evaluate(() => {
      const r = window.__dp.renderer;
      r.cam.s = 1.5; r.cam.x = r.canvas.width * 0.5; r.cam.y = r.canvas.height * 0.45;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/mistwood-${width}-edge.png` });
    for (const phase of ['sunset', 'night']) {
      await page.evaluate((phase) => {
        const g = window.__dp.host.game(); g.settings.dayNightCycle = false; g.settings.timeOfDay = phase;
      }, phase);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/mistwood-${width}-edge-${phase}.png` });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log('mistwood ok');
