// City tiles lift only when held: on desktop (mouse) and phones (touch), a
// press on a city tile that moves straight away pans the camera and leaves
// the city alone; one let go early is a tap; one held still for half a second
// grows a gold square from the tile's middle to its edges and then lifts the
// tile, which goes where it is dropped. Structures still lift at once.
// Isolated browser contexts only: never reads or changes a player's saved
// game. Needs `npm run dev`. Screenshots go to test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { dropAt, raiseOf } from './drag-raise.mjs';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = process.env.SHOTS || 'test-results';
mkdirSync(out, { recursive: true });
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
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
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('hold-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('hold-fixture-seeded', 'yes');
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

    const tileAt = (tx, ty) => page.evaluate(([tx, ty]) => window.__dp.renderer.toClient((tx + 0.5) * 8, (ty + 0.5) * 8), [tx, ty]);
    /** Where to let go for a carried tile to land on (tx, ty). */
    const dropTile = (tx, ty) => dropAt(page, (tx + 0.5) * 8, (ty + 0.5) * 8);
    const cam = () => page.evaluate(() => ({ ...window.__dp.renderer.cam }));
    const session = () => page.evaluate(() => window.__dp.pointers.session?.drag ?? null);
    assert.equal(await raiseOf(page), phone ? 8 : 0, 'dragged items ride above the finger on touch screens, not under a mouse');
    const lift = () => page.evaluate(() => window.__dp.pointers.liftProgress());
    const cdp = phone ? await context.newCDPSession(page) : null;
    const touch = (type, p) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
    const press = async p => { if (phone) await touch('touchStart', p); else { await page.mouse.move(p.x, p.y); await page.mouse.down(); } };
    const moveTo = async (a, b, steps = 8) => {
      for (let i = 1; i <= steps; i++) {
        const q = { x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps };
        if (phone) await touch('touchMove', q); else await page.mouse.move(q.x, q.y);
      }
    };
    const release = async () => { if (phone) await touch('touchEnd'); else await page.mouse.up(); };

    // Zoomed in, so the camera has room to pan.
    await page.evaluate(() => {
      const r = window.__dp.renderer, box = r.canvas.getBoundingClientRect();
      r.zoomAt(box.left + box.width / 2, box.top + box.height / 2, 2);
      // Up a little, so the drop point below the carried tile is in view.
      r.panBy(0, -box.height / 6);
    });
    await page.waitForTimeout(100);
    const k = (await state(page)).defend.layout.keep;
    const from = { tx: k.tx + 1, ty: k.ty }, key = `${from.tx},${from.ty}`;

    // Pressed and dragged straight away: the camera pans, the tile stays.
    let before = await cam(), a = await tileAt(from.tx, from.ty);
    await press(a);
    await moveTo(a, { x: a.x - 120, y: a.y - 60 });
    assert.equal(await session(), null, 'a quick drag lifts nothing');
    await release();
    let after = await cam();
    assert.ok(Math.abs(after.x - before.x) > 40, `the camera pans (${before.x} -> ${after.x})`);
    let s = await state(page);
    assert.ok(s.defend.layout.cityTiles.includes(key), 'the tile stays where it was');

    // Let go early: nothing lifts, nothing moves.
    a = await tileAt(from.tx, from.ty);
    await press(a);
    await page.waitForTimeout(200);
    await release();
    await page.waitForTimeout(450);
    assert.equal(await session(), null, 'a short press lifts nothing');
    assert.equal(await lift(), null, 'and its square is gone');

    // Held: the gold square grows, then the tile lifts and follows the pointer.
    before = await cam();
    a = await tileAt(from.tx, from.ty);
    await press(a);
    await page.waitForTimeout(250);
    const mid = await lift();
    assert.ok(mid && mid.tile.tx === from.tx && mid.tile.ty === from.ty, 'the held tile is marked');
    assert.ok(mid.t > 0.2 && mid.t < 0.9, `the square is part grown (${mid.t})`);
    // A finger's wobble doesn't pan or cancel the hold.
    if (phone) await touch('touchMove', { x: a.x + 3, y: a.y - 2 }); else await page.mouse.move(a.x + 3, a.y - 2);
    assert.equal(await session(), null, 'not lifted yet');
    await page.screenshot({ path: `${out}/tile-hold-${width}-growing.png` });
    await page.waitForTimeout(400);
    assert.equal((await session())?.from, 'cityTile', 'held, the tile lifts');
    assert.equal(await lift(), null, 'the square is done');
    after = await cam();
    assert.deepEqual([after.x, after.y], [before.x, before.y], 'holding never panned');
    const to = { tx: k.tx + 3, ty: k.ty };
    await moveTo({ x: a.x + 3, y: a.y - 2 }, await dropTile(to.tx, to.ty));
    await page.screenshot({ path: `${out}/tile-hold-${width}-dragging.png` });
    await release();
    s = await state(page);
    assert.ok(s.defend.layout.cityTiles.includes(`${to.tx},${to.ty}`), 'the tile goes where it is dropped');
    assert.ok(!s.defend.layout.cityTiles.includes(key), 'and leaves where it was');

    // The keep itself still lifts at once.
    const keepAt = await page.evaluate(() => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.kind === 'keep');
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    });
    await press(keepAt);
    await moveTo(keepAt, { x: keepAt.x + 20, y: keepAt.y }, 3);
    assert.equal((await session())?.from, 'keep', 'the keep lifts without a hold');
    await page.evaluate(() => window.__dp.pointers.end());
    await release();

    if (cdp) await cdp.detach();
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}: quick drags pan, holds lift city tiles`);
  }
} finally {
  await browser.close();
}
