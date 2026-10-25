import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// In battle a tap selects a troop building (its deployment range shows), and
// a second press on it dragged sets its rally point: a blue flag at the end
// of a dotted line, riding above the finger on touch screens, pulled in to
// the range and snapped onto a nearby watch tower for the gunner line.
// Isolated saves (seeded into fresh contexts), no player saves.
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1100, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 500, isMobile: width < 500 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const save = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = s.settings.ambienceOff = true;
      s.defend.owned.barracks = 1; s.defend.owned.gunHall = 1; s.defend.owned.watchTower = 1; s.defend.owned.cityTile = 3;
      let l = s.defend.layout; const { tx, ty } = l.keep;
      for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0]]) l = placeCityTile(l, tx + dx, ty + dy);
      l = placeStructure(l, 'barracks', tx - 1, ty); l = placeStructure(l, 'gunHall', tx, ty - 1); l = placeStructure(l, 'watchTower', tx + 1, ty);
      s.defend.layout = l; return s;
    });
    await context.addInitScript(save => {
      if (!sessionStorage.getItem('rally-seeded')) { localStorage.setItem('towerdefense.v1', JSON.stringify(save)); sessionStorage.setItem('rally-seeded', '1'); }
    }, save);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      const urls = new Set(['/src/defend/ui.ts']);
      for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
      for (const url of urls) {
        const { DefendPage } = await import(url), frame = DefendPage.prototype.frame;
        if (frame.__hooked) continue;
        DefendPage.prototype.frame = function(t) { window.__dp = this; return frame.call(this, t); };
        DefendPage.prototype.frame.__hooked = true;
      }
    });
    await page.waitForFunction(() => window.__dp);
    await page.locator('#defend-start').click();
    await page.waitForFunction(() => window.__dp.sim?.soldiers.length >= 2);
    await page.evaluate(() => { window.__dp.sim.speed = 0; window.__dp.pick(null); });
    await page.waitForTimeout(800);
    const cdp = width < 500 ? await context.newCDPSession(page) : null;
    const down = async (p) => cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }) : (await page.mouse.move(p.x, p.y), page.mouse.down());
    const move = async (p) => cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] }) : page.mouse.move(p.x, p.y, { steps: 8 });
    const up = async () => cdp ? cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) : page.mouse.up();
    const spots = await page.evaluate(() => {
      const d = window.__dp, find = (k) => d.sim.map.buildings.find(b => b.kind === k), mid = (b) => ({ x: b.rect.x + b.rect.w / 2, y: b.rect.y + b.rect.h / 2 });
      const raise = d.pointers.raise, barracks = find('barracks'), hall = find('gunHall'), tower = find('watchTower');
      const bm = mid(barracks), hm = mid(hall), tm = mid(tower);
      return { raise, barracks: barracks.id, hall: hall.id, tower: tower.id, bm, tm,
        barracksAt: d.renderer.toClient(bm.x, bm.y), flagTo: d.renderer.toClient(bm.x, bm.y + 6 + raise),
        farTo: d.renderer.toClient(bm.x - 40, bm.y + raise),
        hallAt: d.renderer.toClient(hm.x, hm.y), towerTo: d.renderer.toClient(tm.x + 1, tm.y + 1 + raise) };
    });
    const rally = (id) => page.evaluate(id => window.__dp.sim.rallies.get(id) ?? null, id);
    // A tap selects the barracks; a second press on it, dragged, plants its flag.
    await down(spots.barracksAt); await up();
    assert.equal(await page.evaluate(() => window.__dp.picked?.id), spots.barracks, 'a tap selects the barracks');
    await page.waitForTimeout(400);
    await down(spots.barracksAt); await move(spots.flagTo); await up();
    const set = await rally(spots.barracks);
    assert.ok(set && Math.abs(set.x - spots.bm.x) < 0.6 && Math.abs(set.y - (spots.bm.y + 6)) < 0.6, `the flag goes where it was dragged, above the finger: ${JSON.stringify(set)}`);
    await page.waitForTimeout(300); await page.screenshot({ path: `test-results/rally-aim-flag-${width}.png` });
    // Dragged far off, it stops at the deployment range's edge.
    const flagAt = await page.evaluate(p => window.__dp.renderer.toClient(p.x, p.y), set);
    await down(flagAt); await move(spots.farTo); await up();
    const edge = await rally(spots.barracks);
    const r = await page.evaluate(async id => { const { deployCircle } = await import('/src/defend/deployment.ts'); const d = window.__dp; return deployCircle(d.sim.map.buildings[id], d.sim.bonuses).r; }, spots.barracks);
    const out = edge && Math.hypot(edge.x - spots.bm.x, edge.y - spots.bm.y);
    assert.ok(edge && (Math.abs(out - r) < 0.01 || edge.x <= 0.5), `pulled in to the range (${out} of ${r})`);
    // Dragged back onto its building, the rally point clears.
    const edgeAt = await page.evaluate(p => window.__dp.renderer.toClient(p.x, p.y), edge);
    const homeTo = await page.evaluate(([p, raise]) => window.__dp.renderer.toClient(p.x, p.y + raise), [spots.bm, spots.raise]);
    await down(edgeAt); await move(homeTo); await up();
    assert.equal(await rally(spots.barracks), null, 'dragged home, it clears');
    // The gunner hall's flag snaps onto the watch tower.
    await down(spots.hallAt); await up();
    assert.equal(await page.evaluate(() => window.__dp.picked?.id), spots.hall);
    await page.waitForTimeout(400);
    await down(spots.hallAt); await move(spots.towerTo); await up();
    const snap = await rally(spots.hall);
    assert.equal(snap?.tower, spots.tower, `snapped onto the tower: ${JSON.stringify(snap)}`);
    await page.evaluate(() => { window.__dp.sim.speed = 1; });
    await page.waitForFunction(id => window.__dp.sim.soldiers.some(s => s.perch?.up && s.perch.tower === id), spots.tower, { timeout: 20000 });
    await page.evaluate(() => { window.__dp.sim.speed = 0; });
    await page.waitForTimeout(300); await page.screenshot({ path: `test-results/rally-aim-tower-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px: select, drag a rally flag (${cdp ? 'touch, raised' : 'mouse'}), range edge, clearing and watch tower snapping passed`);
  }
} finally { await browser.close(); }
