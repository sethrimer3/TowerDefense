// The gold line traced clockwise round placed pieces while building: one
// layer of pixels hugging a melee guild's own sprite, caught part way round,
// closed, fading and gone, on street dirt rather than a square lot of its
// own. Isolated browser contexts only, no player saves. Needs `npm run dev`.
// Screenshots go to test-results/ (or SHOTS).
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
      const { placeCityTile, placeStructureAt } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.defend.owned.meleeGuild = 2; s.defend.owned.watchTower = 3;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      l = placeStructureAt(l, 'meleeGuild', { qx: k.tx * 4, qy: (k.ty - 1) * 4 }) ?? l;
      l = placeStructureAt(l, 'watchTower', { qx: k.tx * 4 + 3, qy: (k.ty - 1) * 4 + 3 }) ?? l;
      s.defend.layout = l;
      return s;
    });
    assert.equal(fixture.defend.layout.structures.length, 2, 'the fixture placed its guild and tower');
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('shimmer-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('shimmer-seeded', 'yes');
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
    const info = await page.evaluate(async () => {
      const m = await import('/src/defend/placed-shimmer.ts');
      const map = window.__dp.currentMap(), targets = m.shimmerTargets(map), period = m.shimmerPeriod(targets.length);
      const t = targets.find(x => x.b?.kind === 'meleeGuild');
      const traced = targets.filter(x => x.b).map(x => x.b.kind).sort();
      const trace = m.SHIMMER.trace + m.SHIMMER.perCell * 2 * (t.rect.w + t.rect.h);
      const start = ((-period * t.phase) % period + period) % period;
      const r = window.__dp.renderer, c = r.toClient(t.rect.x + t.rect.w / 2, t.rect.y + t.rect.h / 2);
      r.zoomAt(c.x, c.y, 5);
      return { traced, times: [start + trace / 3, start + trace * 0.995, start + trace + 0.4, start + trace + 2], rect: t.rect };
    });
    assert.deepEqual(info.traced, ['keep', 'meleeGuild', 'watchTower'], 'every placed structure traces its sprite; houses never shimmer');
    const names = ['third', 'closing', 'fading', 'gone'];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(s => { performance.now = () => s * 1000; }, info.times[i]);
      await page.waitForTimeout(150);
      const box = await page.evaluate(k => {
        const r = window.__dp.renderer, a = r.toClient(k.x - 1, k.y - 1), b = r.toClient(k.x + k.w + 1, k.y + k.h + 1);
        return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
      }, info.rect);
      await page.screenshot({ path: `${out}/shimmer-${width}-${names[i]}.png`, clip: box });
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('shimmer: ok');
} finally { await browser.close(); }
