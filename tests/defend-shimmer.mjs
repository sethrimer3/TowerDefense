// The gold line traced round placed pieces while building: the keep and a
// placed watch tower caught part way round, closed, and fading, against the
// houses and the wall ring, which never shimmer. Isolated browser contexts
// only, no player saves. Needs `npm run dev`. Screenshots go to test-results/ (or SHOTS).
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
      if (!sessionStorage.getItem('shimmer-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('shimmer-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      window.__dp = null;
      const { DefendPage } = await import('/src/defend/ui.ts'), real = DefendPage.prototype.frame;
      DefendPage.prototype.frame = function(t) { window.__dp = this; return real.call(this, t); };
    });
    await page.waitForFunction(() => window.__dp);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    const info = await page.evaluate(async () => {
      const m = await import('/src/defend/placed-shimmer.ts');
      const map = window.__dp.currentMap(), targets = m.shimmerTargets(map), period = m.shimmerPeriod(targets.length);
      const keep = map.buildings.find(b => b.kind === 'keep');
      const t = targets.find(x => x.rect === keep.rect);
      const houses = map.buildings.filter(b => b.kind === 'house' || b.kind === 'wall').length;
      // Wall-clock seconds at which its trace is a third round, closing and fading.
      const trace = m.SHIMMER.trace + m.SHIMMER.perCell * 2 * (t.rect.w + t.rect.h);
      const start = ((-period * t.phase) % period + period) % period;
      const r = window.__dp.renderer, box = r.canvas.getBoundingClientRect();
      const c = r.toClient(keep.rect.x + keep.rect.w / 2, keep.rect.y + keep.rect.h / 2);
      r.zoomAt(c.x, c.y, 3);
      return { count: targets.length, houses, times: [start + trace / 3, start + trace * 0.97, start + trace + 0.4, start + trace + 2], keep: keep.rect };
    });
    assert.ok(info.count >= 1 && info.houses > 0, 'the keep shimmers, the houses and wall are there but not traced');
    const names = ['third', 'closing', 'fading', 'gone'];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(s => { performance.now = () => s * 1000; }, info.times[i]);
      await page.waitForTimeout(150);
      const box = await page.evaluate(k => {
        const r = window.__dp.renderer, a = r.toClient(k.x - 3, k.y - 3), b = r.toClient(k.x + k.w + 3, k.y + k.h + 3);
        return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
      }, info.keep);
      await page.screenshot({ path: `${out}/shimmer-${width}-${names[i]}.png`, clip: box });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('shimmer: ok');
} finally { await browser.close(); }
