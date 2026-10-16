// Structures set on the quarter grid, on desktop and phones: a guild dragged
// from the palette shows the quarters it would take (gold where it fits,
// red beside another building), is set down where it was let go, and a
// placed one is carried to another spot. Isolated browser contexts only:
// never reads or changes a player's saved game. Needs `npm run dev`.
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
      const { placeCityTile, placeStructureAt } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.defend.owned.meleeGuild = 2; s.defend.owned.watchTower = 3; s.defend.owned.monsterBait = 2;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [-1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      // A melee guild in the top left of the tile north of the keep.
      l = placeStructureAt(l, 'meleeGuild', { qx: k.tx * 4, qy: (k.ty - 1) * 4 }) ?? l;
      l = placeStructureAt(l, 'watchTower', { qx: k.tx * 4 + 3, qy: (k.ty - 1) * 4 + 3 }) ?? l;
      s.defend.layout = l;
      return s;
    });
    assert.equal(fixture.defend.layout.structures.length, 2, 'the fixture placed its guild and tower');
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('quarters-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('quarters-fixture-seeded', 'yes');
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
    await page.screenshot({ path: `${out}/quarters-${width}-placed.png` });
    const k = fixture.defend.layout.keep;
    const at = (x, y) => page.evaluate(([x, y]) => window.__dp.renderer.toClient(x, y), [x, y]);
    /** The point in cells at the middle of a footprint `qw` × `qh` quarters
     * with its top left quarter at (qx, qy), on the page. */
    const spot = (qx, qy, qw = 2, qh = 2) => at((qx + qw / 2) * 2, (qy + qh / 2) * 2);
    const drag = async (a, b, shot) => {
      if (phone) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
        // Out sideways first, so the palette's own scrolling doesn't take the touch.
        const m = { x: b.x, y: a.y };
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (m.x - a.x) * i / 8, y: a.y }] });
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: m.y + (b.y - m.y) * i / 8 }] });
        if (shot) { await page.waitForTimeout(150); await page.screenshot({ path: shot }); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
        await page.waitForTimeout(500);
      } else {
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 8 });
        if (shot) { await page.waitForTimeout(150); await page.screenshot({ path: shot }); }
        await page.mouse.up();
      }
    };
    const centre = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const tile = page.locator('.defend-item[data-item="meleeGuild"]');
    // Right beside the first guild: refused, shown red.
    await drag(centre(await tile.boundingBox()), await spot(k.tx * 4 + 2, (k.ty - 1) * 4), `${out}/quarters-${width}-refused.png`);
    let s = await state(page);
    assert.equal(s.defend.layout.structures.filter(o => o.kind === 'meleeGuild').length, 1, 'a guild right beside another is refused');
    // The tile east of the keep, in its bottom right: placed exactly there.
    await drag(centre(await tile.boundingBox()), await spot((k.tx + 1) * 4 + 2, k.ty * 4 + 2), `${out}/quarters-${width}-dragging.png`);
    s = await state(page);
    const placed = s.defend.layout.structures.find(o => o.kind === 'meleeGuild' && o.tx === k.tx + 1);
    assert.ok(placed, 'the guild was placed on the tile it was dropped on');
    assert.deepEqual([placed.qx, placed.qy], [(k.tx + 1) * 4 + 2, k.ty * 4 + 2], 'exactly where it was let go');
    // Bait may huddle right beside a building.
    await drag(centre(await page.locator('.defend-item[data-item="monsterBait"]').boundingBox()), await spot((k.tx + 1) * 4 + 1, k.ty * 4 + 2, 1, 1), `${out}/quarters-${width}-bait.png`);
    s = await state(page);
    assert.ok(s.defend.layout.structures.some(o => o.kind === 'monsterBait' && o.qx === (k.tx + 1) * 4 + 1), 'bait stands right beside the guild');
    // The first guild carried to the tile's bottom left.
    const first = s.defend.layout.structures.find(o => o.kind === 'meleeGuild' && o.ty === k.ty - 1);
    await drag(await spot(first.qx, first.qy), await spot(k.tx * 4, (k.ty - 1) * 4 + 2), `${out}/quarters-${width}-moving.png`);
    s = await state(page);
    const moved = s.defend.layout.structures.find(o => o.uid === first.uid);
    assert.deepEqual([moved.qx, moved.qy], [k.tx * 4, (k.ty - 1) * 4 + 2], 'the placed guild moved to its new spot');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/quarters-${width}-after.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok ${width}`);
  }
} finally {
  await browser.close();
}
