// The Magnifying glass setting: while dragging a building onto the Defend
// board (desktop mouse and phone touch), a box above the finger shows the
// board zoomed in round where it would go, its middle the board's own pixels
// there; it hides on release and stays away with the setting off. The
// `magnify` hook other gestures use points it too.
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
      const { placeCityTile } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true; s.settings.magnifier = true;
      s.defend.owned.watchTower = 3;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('loupe-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('loupe-fixture-seeded', 'yes');
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
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="false"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(400);
    const k = fixture.defend.layout.keep;
    const target = await page.evaluate(([x, y]) => window.__dp.renderer.toClient(x, y), [(k.tx + 1) * 8 + 4, k.ty * 8 + 4]);
    const loupe = () => page.evaluate(() => {
      const box = document.querySelector('.defend-loupe');
      if (!box || box.hidden) return null;
      const r = box.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    /** The loupe's middle pixel against the board's at the point it magnifies. */
    const pixels = () => page.evaluate(() => {
      const box = document.querySelector('.defend-loupe'), dp = window.__dp;
      const l = dp.pointers.looking, r = dp.renderer, c = r.canvas, cr = c.getBoundingClientRect();
      const p = r.toClient(l.cell.x, l.cell.y);
      const at = (cv, x, y) => [...cv.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data];
      const bx = (p.x - cr.left) * c.width / cr.width, by = (p.y - cr.top) * c.height / cr.height, near = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push(at(c, bx + dx, by + dy));
      return { loupe: at(box, box.width / 2, box.height / 2), board: near, focus: p };
    });
    const tile = page.locator('.defend-item[data-item="watchTower"]');
    const b = await tile.boundingBox(), a = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const cdp = phone ? await context.newCDPSession(page) : null;
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    const hold = async (p) => {
      if (phone) {
        await touch('touchStart', a);
        for (let i = 1; i <= 8; i++) await touch('touchMove', { x: a.x + (p.x - a.x) * i / 8, y: a.y });
        for (let i = 1; i <= 8; i++) await touch('touchMove', { x: p.x, y: a.y + (p.y - a.y) * i / 8 });
      } else {
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        await page.mouse.move(p.x, p.y, { steps: 8 });
      }
      await page.waitForTimeout(150);
    };
    const release = async () => { if (phone) await touch('touchEnd'); else await page.mouse.up(); await page.waitForTimeout(200); };

    await hold(target);
    const box = await loupe();
    assert.ok(box, 'the magnifying glass shows while dragging');
    const px = await pixels();
    assert.ok(box.top + box.height <= Math.min(target.y, px.focus.y), 'it sits above the finger and the point it magnifies');
    assert.ok(box.left >= 0 && box.left + box.width <= width, 'inside the window');
    await page.screenshot({ path: `${out}/loupe-${width}-dragging.png` });
    // Within a device pixel of the point: the copy's rounding may land beside it.
    const diff = Math.min(...px.board.map(b => Math.max(...px.loupe.slice(0, 3).map((v, i) => Math.abs(v - b[i])))));
    assert.ok(diff <= 24, `its middle shows the board's pixels there (${px.loupe} vs ${px.board.join(' ')})`);
    await page.screenshot({ path: `${out}/loupe-${width}-dragging.png` });
    await release();
    assert.equal(await loupe(), null, 'it hides when the building is let go');

    // The hook any gesture (tower aiming, rally flags) points it with.
    await page.evaluate(([x, y, cx, cy]) => window.__dp.pointers.magnify({ x, y }, { x: cx, y: cy }), [target.x, target.y, k.tx * 8 + 4, k.ty * 8 + 4]);
    await page.waitForTimeout(100);
    assert.ok(await loupe(), 'magnify points the glass for any gesture');
    await page.screenshot({ path: `${out}/loupe-${width}-hook.png` });
    await page.evaluate(() => window.__dp.pointers.magnify(null));
    await page.waitForTimeout(100);
    assert.equal(await loupe(), null, 'and magnify(null) hides it');

    // Turned off on the Settings page, no glass.
    await page.locator('button[data-tab="settings"]').click();
    const box2 = page.locator('#magnifier');
    assert.equal(await box2.isChecked(), true, 'the Settings page shows it on');
    await box2.uncheck();
    await page.locator('button[data-tab="defend"]').click();
    await page.waitForTimeout(300);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="false"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(200);
    await hold(target);
    assert.equal(await loupe(), null, 'no glass with the setting off');
    await release();
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')))).settings.magnifier, false, 'and saved off');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok ${width}`);
  }
} finally {
  await browser.close();
}
