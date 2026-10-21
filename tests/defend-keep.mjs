// The keep as a placeable city tile, and its own upgrade tree, on desktop
// and phones: the keep is dragged (by the keep or its tile) onto open ground
// with its tile, tapping or holding it opens its tree, its branches are
// bought side by side with Knowledge and respecced or undone for free, and in
// battle it shoots from its arrow loops and scalds with boiling oil.
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
      s.knowledge = 100; s.smithy.copper = 20;
      s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('keep-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('keep-fixture-seeded', 'yes');
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
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/keep-${width}-before.png` });

    const tileAt = (tx, ty) => page.evaluate(([tx, ty]) => window.__dp.renderer.toClient((tx + 0.5) * 8, (ty + 0.5) * 8), [tx, ty]);
    const keepAt = () => page.evaluate(() => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.kind === 'keep');
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    });
    /** Drags from client point `a` to `b` with the mouse or a finger,
     * first holding still long enough to lift a tile when `hold` is set. */
    const drag = async (a, b, shot, hold = false) => {
      if (phone) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
        if (hold) await page.waitForTimeout(650);
        for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8 }] });
        if (shot) await page.screenshot({ path: shot });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(a.x, a.y); await page.mouse.down();
        if (hold) await page.waitForTimeout(650);
        await page.mouse.move(b.x, b.y, { steps: 8 });
        if (shot) await page.screenshot({ path: shot });
        await page.mouse.up();
      }
    };

    // The keep onto open ground, two tiles left of its city: its tile goes with it.
    let s = await state(page);
    const k0 = s.defend.layout.keep, to = { tx: k0.tx - 2, ty: k0.ty - 1 };
    await drag(await keepAt(), await tileAt(to.tx, to.ty), `${out}/keep-${width}-dragging.png`);
    s = await state(page);
    assert.deepEqual(s.defend.layout.keep, to, 'the keep stands on open ground');
    assert.ok(!s.defend.layout.cityTiles.includes(`${to.tx},${to.ty}`), 'on its own tile');
    assert.equal(s.defend.layout.cityTiles.length, 3, 'the other tiles stay');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/keep-${width}-moved.png` });
    // And back onto a city tile, dragged by its tile's open ground.
    const corner = await page.evaluate(() => {
      const dp = window.__dp, map = dp.currentMap(), k = dp.host.save().layout.keep;
      for (let cy = k.ty * 8; cy < k.ty * 8 + 8; cy++) for (let cx = k.tx * 8; cx < k.tx * 8 + 8; cx++)
        if (map.owner[cy * 8 * 9 + cx] < 0 && map.city[cy * 8 * 9 + cx]) return dp.renderer.toClient(cx + 0.5, cy + 0.5);
      return null;
    });
    assert.ok(corner, 'open ground on the keep\'s tile');
    await drag(corner, await tileAt(k0.tx, k0.ty), undefined, true);
    s = await state(page);
    assert.deepEqual(s.defend.layout.keep, k0, 'pressed by its tile, the keep moves back');

    // A tap opens the keep's tree: three branches from the keep.
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const k = await keepAt();
    if (phone) await page.touchscreen.tap(k.x, k.y); else await page.mouse.click(k.x, k.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    assert.match(await panel.locator('.ug-title').textContent(), /Keep/);
    assert.equal(await panel.locator('.ug-node.next').count(), 3, 'every branch opens from the keep');
    const buy = async id => {
      await press(panel.locator(`[data-node="${id}"]`));
      await press(panel.locator(`[data-ug-buy="${id}"]`));
      await page.waitForTimeout(150);
    };
    await buy('q:bastions:1');
    await buy('q:arrowLoops:1');
    await buy('q:boilingOil:1');
    s = await state(page);
    assert.deepEqual(s.defend.keepRanks, { bastions: 1, arrowLoops: 1, boilingOil: 1 }, 'bought side by side');
    assert.equal(s.knowledge, 100 - 12);
    assert.equal(await panel.locator('.ug-node.next').count(), 3, 'each branch offers its next rank');
    await press(panel.locator('[data-node="q:arrowLoops:2"]'));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/keep-${width}-tree.png` });
    // Undo one branch's rank: free, its Knowledge back.
    await press(panel.locator('[data-node="q:boilingOil:1"]'));
    await press(panel.locator('[data-ug-undo="q:boilingOil:1"]'));
    s = await state(page);
    assert.deepEqual(s.defend.keepRanks, { bastions: 1, arrowLoops: 1 }, 'Boiling oil undone');
    assert.equal(s.knowledge, 100 - 8);
    // Respec: one press, free, every point back.
    await press(panel.locator('[data-ug-respec]'));
    s = await state(page);
    assert.equal(s.defend.keepRanks, undefined, 'respecced');
    assert.equal(s.knowledge, 100);
    assert.equal(s.smithy.copper, 20, 'free');
    // Tap a picked rank again to buy it; tap a picked owned one again to sell the ranks above it.
    await page.evaluate(() => { window.__dp.host.game().knowledge += 10000; });
    const twice = async id => { await press(panel.locator(`[data-node="${id}"]`)); await press(panel.locator(`[data-node="${id}"]`)); await page.waitForTimeout(150); };
    await twice('q:bastions:1');
    await twice('q:bastions:2');
    assert.deepEqual((await state(page)).defend.keepRanks, { bastions: 2 }, 'a second tap buys');
    await press(panel.locator('[data-node="q:bastions:1"]'));
    assert.match(await panel.locator('.ug-again').textContent(), /sell everything after it/);
    await press(panel.locator('[data-node="q:bastions:1"]'));
    await page.waitForTimeout(150);
    assert.deepEqual((await state(page)).defend.keepRanks, { bastions: 1 }, 'a second tap on an owned rank sells the ones above it');
    await twice('k:keep');
    s = await state(page);
    assert.equal(s.defend.keepRanks, undefined, 'and on the keep, every rank');
    assert.equal(s.knowledge, 10100, 'every point back');
    await page.evaluate(() => { window.__dp.host.game().knowledge -= 10000; });
    await page.evaluate(() => { window.__dp.host.game().settings.devMode = true; });
    for (const id of ['q:bastions:1', 'q:bastions:2', 'q:arrowLoops:1', 'q:arrowLoops:2', 'q:arrowLoops:3', 'q:boilingOil:1', 'q:boilingOil:2', 'q:boilingOil:3']) await buy(id);
    await page.evaluate(() => { window.__dp.host.game().settings.devMode = false; });
    await press(panel.locator('[data-specialty-close]'));
    assert.equal(await panel.isHidden(), true);

    // Held still, the keep opens its tree too, and stays where it stood.
    const kk = await keepAt();
    if (phone) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [kk] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    } else {
      await page.mouse.move(kk.x, kk.y); await page.mouse.down();
      await page.waitForTimeout(700); await page.mouse.up();
    }
    await page.waitForSelector('#defend-specialty:not([hidden])');
    assert.deepEqual((await state(page)).defend.layout.keep, k0);
    await press(panel.locator('[data-specialty-close]'));

    // In battle: arrows from the keep and oil at its walls.
    await page.reload(); await page.waitForSelector('#defend-start');
    await hook(); await page.waitForFunction(() => window.__dp);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.locator('#defend-start').click();
    const fought = await page.evaluate(() => {
      const dp = window.__dp, sim = dp.sim, keep = sim.keep, hp = sim.keepMaxHp();
      const r = keep.rect, foes = [];
      for (const [x, y] of [[r.x - 0.6, r.y + 1], [r.x + r.w + 0.6, r.y + 2], [r.x + 1, r.y - 4], [r.x + 4, r.y - 3]]) {
        const e = { id: sim.newId(), kind: 'orc', x, y, hp: 400, maxHp: 400, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
        sim.enemies.push(e); foes.push(e);
      }
      sim.indexEnemies();
      for (let i = 0; i < 12; i++) sim.towers.step(sim, 0.05);
      const scalded = foes.filter(e => e.hp < 400).length;
      // Out of the way of the wave itself.
      sim.enemies = sim.enemies.filter(e => !foes.includes(e));
      sim.indexEnemies();
      return { keep: sim.bonuses.keep, hp, arrows: sim.arrows.filter(a => a.origin?.building === sim.keepId).length, scalded };
    });
    assert.deepEqual(fought.keep, { bastions: 2, arrowLoops: 3, boilingOil: 3 }, 'the battle took the keep\'s ranks');
    assert.ok(fought.arrows >= 3, `a volley from the keep (${fought.arrows})`);
    assert.ok(fought.scalded >= 2, `oil scalded those at the walls (${fought.scalded})`);
    // A while into the wave, the keep picked to show its reach.
    await page.evaluate(() => window.defendDebug?.(30));
    const kb = await keepAt();
    if (phone) await page.touchscreen.tap(kb.x, kb.y); else await page.mouse.click(kb.x, kb.y);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${out}/keep-${width}-battle.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`keep ${width}: ok`);
  }
} finally {
  await browser.close();
}
