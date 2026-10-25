// Gunners up in a watch tower in the browser, on desktop and phones: they
// show as badges over the tower, not as themselves on its roof, and drop
// out when it falls. Isolated browser contexts only: never reads or changes
// a player's saved game. Needs `npm run dev`. Screenshots go to
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
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      const kinds = [['gunHall', 0, -1], ['musketHall', 0, 1], ['revolutionary', -1, 0], ['watchTower', 1, 0], ['watchTower', 1, 0]];
      for (const [k] of kinds) s.defend.owned[k] = (s.defend.owned[k] ?? 0) + 1;
      s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      for (const [kind, dx, dy] of kinds) l = placeStructure(l, kind, k.tx + dx, k.ty + dy) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('garrison-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('garrison-fixture-seeded', 'yes');
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
    await page.locator('#defend-start').click();
    await page.waitForFunction(() => window.__dp.sim);
    // Gunners climb only a tower their hall is rallied to: each hall to its nearest tower.
    await page.evaluate(() => {
      const sim = window.__dp.sim, mid = (b) => ({ x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 });
      const towers = sim.map.buildings.filter(b => b.kind === 'watchTower');
      for (const b of sim.map.buildings) {
        if (!['gunHall', 'gunNest', 'gatlingNest', 'rocketBattery', 'musketHall', 'sniperLodge', 'revolutionary'].includes(b.kind) || !towers.length) continue;
        const h = mid(b), t = towers.reduce((a, c) => Math.hypot(mid(c).x - h.x, mid(c).y - h.y) < Math.hypot(mid(a).x - h.x, mid(a).y - h.y) ? c : a);
        sim.setRally(b.id, { ...mid(t), tower: t.id });
      }
    });
    // Until the towers fill.
    for (let i = 0; i < 20; i++) {
      const up = await page.evaluate(() => window.__dp.sim.soldiers.filter(s => s.perch?.up).length);
      if (up >= 3) break;
      await page.evaluate(() => window.defendDebug?.(2));
    }
    const towers = await page.evaluate(() => {
      const sim = window.__dp.sim, by = {};
      for (const s of sim.soldiers) if (s.hp > 0 && s.perch?.up) (by[s.perch.tower] ??= []).push(s.kind);
      return by;
    });
    const ids = Object.keys(towers);
    assert.ok(ids.length > 0, 'gunners climbed a tower');
    await page.evaluate(id => {
      const dp = window.__dp, b = dp.sim.map.buildings[id];
      for (let i = 0; i < 7; i++) { const p = dp.renderer.toClient(b.rect.x + 1, b.rect.y); dp.renderer.zoomAt(p.x, p.y, 1.5); }
      dp.paused = true;
    }, +ids.sort((a, b) => towers[b].length - towers[a].length)[0]);
    await page.waitForTimeout(600); await page.screenshot({ path: `${out}/garrison-${width}.png` });
    // The tower falls: they drop out, and the badges go.
    await page.evaluate(id => { const sim = window.__dp.sim; sim.damageBuilding(+id, 1e9); window.defendDebug(0.2); }, ids[0]);
    const left = await page.evaluate(id => window.__dp.sim.soldiers.filter(s => s.perch?.up && s.perch.tower === +id).length, ids[0]);
    assert.equal(left, 0);
    assert.deepEqual(errors, []);
    console.log(`${width}px: ${JSON.stringify(towers)} badged; dropped out when it fell`);
    await context.close();
  }
} finally { await browser.close(); }
