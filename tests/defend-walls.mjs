// Walls placed on their own, on desktop and phones: a wall dragged from the
// palette onto the finer grid of quarter tiles outside the city, a placed
// one carried along, tapping one opens the walls' tree, Town walls lets one
// stand inside the city, and in battle the enemy has to break through them.
// Isolated browser contexts only: never reads or changes a player's saved
// game. Needs `npm run dev`. Screenshots go to test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { dropAt } from './drag-raise.mjs';
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
      const { placeCityTile, placeWall } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 400; s.smithy.copper = 20;
      s.defend.owned.wallBlock = 40;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      // A crooked line of walls across the road north of the city.
      const k = l.keep;
      for (let i = 0; i < 14; i++) l = placeWall(l, { qx: (k.tx - 2) * 4 + i, qy: (k.ty - 3) * 4 + (i % 7 < 4 ? 1 : 2) }) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('walls-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('walls-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    const hook = () => page.evaluate(async () => {
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
    await hook();
    await page.waitForFunction(() => window.__dp);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="false"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/walls-${width}-placed.png` });

    const at = (x, y) => page.evaluate(([x, y]) => window.__dp.renderer.toClient(x, y), [x, y]);
    /** The middle of quarter tile (qx, qy), on the page. */
    const quarter = (qx, qy) => at((qx + 0.5) * 2, (qy + 0.5) * 2);
    /** Where to let go for a section to land on quarter (qx, qy). */
    const drop = (qx, qy) => dropAt(page, (qx + 0.5) * 2, (qy + 0.5) * 2);
    const drag = async (a, b, shot) => {
      if (phone) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
        if (shot) await page.screenshot({ path: shot });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        await page.mouse.move(b.x, b.y, { steps: 8 });
        if (shot) await page.screenshot({ path: shot });
        await page.mouse.up();
      }
    };
    const centre = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

    // From the palette onto a quarter tile left of the city.
    let s = await state(page);
    const k = s.defend.layout.keep, placed = s.defend.layout.walls.length;
    const spot = { qx: (k.tx - 2) * 4 + 1, qy: k.ty * 4 + 2 };
    const tile = page.locator('#defend-palette [data-item="wallBlock"]');
    assert.ok(await tile.count(), 'walls are in the palette');
    await drag(centre(await tile.boundingBox()), await drop(spot.qx, spot.qy), `${out}/walls-${width}-dragging.png`);
    s = await state(page);
    assert.equal(s.defend.layout.walls.length, placed + 1, 'one more wall stands');
    assert.deepEqual(s.defend.layout.walls.at(-1), spot, 'on the quarter it was let go over');
    // Carried three quarters along.
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(700);
    await drag(await quarter(spot.qx, spot.qy), await drop(spot.qx - 3, spot.qy));
    s = await state(page);
    assert.deepEqual(s.defend.layout.walls.at(-1), { qx: spot.qx - 3, qy: spot.qy }, 'moved three quarters along');
    // Inside the city it is refused, for now.
    await drag(await quarter(spot.qx - 3, spot.qy), await drop(k.tx * 4 + 3, k.ty * 4 + 3));
    s = await state(page);
    assert.deepEqual(s.defend.layout.walls.at(-1), { qx: spot.qx - 3, qy: spot.qy }, 'not inside the city without Town walls');

    // A tap on a wall opens the walls' tree.
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const w = await quarter(spot.qx - 3, spot.qy);
    if (phone) await page.touchscreen.tap(w.x, w.y); else await page.mouse.click(w.x, w.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    assert.match(await panel.locator('.ug-title').textContent(), /Walls/);
    assert.equal(await panel.locator('.ug-node.next').count(), 3, 'three branches from the walls');
    const buy = async id => {
      await press(panel.locator(`[data-node="${id}"]`));
      await press(panel.locator(`[data-ug-buy="${id}"]`));
      await page.waitForTimeout(150);
    };
    await buy('q:stonework:1');
    await buy('q:thornwork:1');
    await buy('q:townWalls:1');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/walls-${width}-tree.png` });
    s = await state(page);
    assert.deepEqual(s.defend.wallRanks, { stonework: 1, thornwork: 1, townWalls: 1 });
    assert.equal(s.defend.layout.innerWalls, true);
    await press(panel.locator('[data-specialty-close]'));
    await page.waitForTimeout(200);

    // Now one goes inside the city.
    const inside = { qx: (k.tx - 1) * 4 + 1, qy: k.ty * 4 + 3 };
    await drag(await quarter(spot.qx - 3, spot.qy), await drop(inside.qx, inside.qy), `${out}/walls-${width}-inside-dragging.png`);
    s = await state(page);
    assert.deepEqual(s.defend.layout.walls.at(-1), inside, 'inside the city with Town walls');
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/walls-${width}-inside.png` });

    // In battle: the walls are stones the enemy has to break, with their upgrades.
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.locator('#defend-start').click();
    const fought = await page.evaluate(() => {
      const sim = window.__dp.sim;
      return { pieces: sim.pieces.length, walls: sim.bonuses.walls };
    });
    assert.ok(fought.pieces >= 40, `the placed walls' stones (${fought.pieces})`);
    assert.deepEqual(fought.walls, { stonework: 1, thornwork: 1, townWalls: 1 });
    // A band of orcs north of the line of walls, a few seconds on.
    await page.evaluate(() => {
      const sim = window.__dp.sim, k = sim.keep.rect;
      for (let i = 0; i < 14; i++) {
        const x = k.x - 10 + (i % 7) * 3.5, y = k.y - 22 + Math.floor(i / 7) * 2;
        sim.enemies.push({ id: sim.newId(), kind: 'orc', x, y, hp: 300, maxHp: 300, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 });
      }
      sim.fieldDirty = true;
      window.defendDebug?.(9);
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/walls-${width}-battle.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`walls ${width}: ok`);
  }
} finally {
  await browser.close();
}
