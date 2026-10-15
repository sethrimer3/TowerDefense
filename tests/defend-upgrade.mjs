// Upgrading buildings one at a time in Defend, on desktop and phones: the
// palette sells only the basic buildings, tapping a placed one while
// building opens its living upgrade tree, each node costs Knowledge and
// changes only that building, a choice withers the branches beside it and
// sprouts its own, nodes can be dragged and spring back, a respec costs
// 5 Copper and gives every point back, and the guilds' troops fight. Isolated browser contexts only: never reads or changes a
// player's saved game. Needs `npm run dev`. Screenshots go to test-results/.
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
const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
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
      s.knowledge = 100;
      s.defend.owned.watchTower = 2; s.defend.owned.meleeGuild = 2; s.defend.owned.rangedGuild = 2; s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('upgrade-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('upgrade-fixture-seeded', 'yes');
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
    // Only the basic buildings among the towers and troop buildings.
    const items = await page.locator('#defend-palette [data-item]').evaluateAll(els => els.map(e => e.dataset.item));
    for (const k of ['watchTower', 'meleeGuild', 'rangedGuild']) assert.ok(items.includes(k), k);
    for (const k of ['archerTower', 'wizardTower', 'barracks', 'archerBarracks']) assert.ok(!items.includes(k), k);
    await page.waitForTimeout(300); await page.screenshot({ path: `${out}/upgrade-${width}-palette.png` });

    /** Drags palette `item` to the free legal tile nearest the keep that shows on screen. */
    const place = async (item, nth = 0) => {
      const from = await page.locator(`#defend-palette [data-item="${item}"]`).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 4);
      const to = await page.evaluate(nth => {
        const dp = window.__dp, r = dp.renderer, box = r.canvas.getBoundingClientRect(), k = dp.host.save().layout.keep;
        const keys = [...dp.pointers.session.legal.keys()].sort((a, b) => {
          const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
          return Math.abs(ax - k.tx) + Math.abs(ay - k.ty) - Math.abs(bx - k.tx) - Math.abs(by - k.ty) || a.localeCompare(b);
        });
        const shown = keys.map(key => { const [tx, ty] = key.split(',').map(Number); return r.toClient((tx + 0.5) * 7, (ty + 0.5) * 7); })
          .filter(p => p.x > box.left + 4 && p.x < box.right - 4 && p.y > box.top + 4 && p.y < box.bottom - 4);
        if (!shown.length) throw new Error('No visible legal destination');
        return shown[nth % shown.length];
      }, nth);
      await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
      return (await state(page)).defend.layout.structures.filter(s => s.kind === item).at(-1);
    };
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const tapBuilding = async uid => {
      const p = await page.evaluate(uid => {
        const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
        return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
      }, uid);
      if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await page.waitForSelector('#defend-specialty:not([hidden])');
    };
    /** Picks tree node `id` and buys it. */
    const buy = async id => {
      await press(panel.locator(`[data-node="${id}"]`));
      await press(panel.locator(`[data-ug-buy="${id}"]`));
    };
    const placed = async uid => (await state(page)).defend.layout.structures.find(s => s.uid === uid);
    const nodes = () => panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => `${e.dataset.node}=${['owned', 'next', 'locked'].find(c => e.classList.contains(c))}`));
    const settled = () => page.waitForFunction(() => !document.querySelector('#defend-specialty .ug-node.withering'), null, { timeout: 5000 });
    const allocatedText = () => panel.locator('.ug-alloc b').textContent();

    // A Watch tower: three towers to become, two paths to climb.
    const tower = await place('watchTower');
    await tapBuilding(tower.uid);
    assert.match(await panel.locator('.ug-title').textContent(), /Watch tower/);
    assert.equal(await panel.locator('.ug-node.next').count(), 5);
    assert.match(await allocatedText(), /✦ 0/);
    assert.equal(await panel.locator('.ug-respec').isDisabled(), true, 'nothing to respec yet');
    assert.ok(inside(await panel.boundingBox(), await page.locator('#defend-board').boundingBox()), 'the tree stays inside the board');
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/upgrade-${width}-watch-tower.png` });
    await buy('k:wizardTower');
    await page.waitForTimeout(350); await page.screenshot({ path: `${out}/upgrade-${width}-withering.png` });
    await settled();
    let s = await state(page);
    assert.equal((await placed(tower.uid)).kind, 'wizardTower', 'the same building, now a wizard tower');
    assert.equal(s.knowledge, 92);
    assert.equal(s.defend.owned.watchTower, 1, 'the other Watch tower is untouched');
    let tree = await nodes();
    assert.ok(!tree.some(n => n.startsWith('k:archerTower') || n.startsWith('p:spotters')), `the other branches withered: ${tree}`);
    assert.ok(tree.includes('p:storm:1=next') && tree.includes('p:pyromancy:3=locked'), `the wizard's own paths sprouted: ${tree}`);
    assert.match(await allocatedText(), /✦ 8/);
    await buy('p:storm:1');
    await settled();
    assert.deepEqual([(await placed(tower.uid)).path, (await placed(tower.uid)).rank], ['storm', 1]);
    tree = await nodes();
    assert.ok(!tree.some(n => n.startsWith('p:pyromancy') || n.startsWith('p:rime')), 'Pyromancy and Rime are cut off');
    assert.ok(tree.includes('k:darkKeep=locked'), 'the crown waits at the end of Stormcalling');
    assert.match(await allocatedText(), new RegExp(`✦ ${100 - (await state(page)).knowledge}`));
    // Drag a node: it follows, then eases back into the tree.
    const node = panel.locator('[data-node="p:storm:2"]'), home = await node.boundingBox();
    await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2); await page.mouse.down();
    await page.mouse.move(home.x + 90, home.y + 40, { steps: 8 });
    const pulled = await node.boundingBox();
    assert.ok(Math.abs(pulled.x - home.x) > 40, 'the node follows the pointer');
    await page.screenshot({ path: `${out}/upgrade-${width}-dragging.png` });
    await page.mouse.up();
    await page.waitForTimeout(1500);
    const back = await node.boundingBox();
    assert.ok(Math.abs(back.x - home.x) < 6 && Math.abs(back.y - home.y) < 6, `and springs back (${JSON.stringify(back)} vs ${JSON.stringify(home)})`);
    await page.screenshot({ path: `${out}/upgrade-${width}-wizard-tower.png` });
    await press(panel.locator('[data-node="p:storm:2"]'));
    assert.equal(await panel.locator('[data-ug-buy="p:storm:2"]').isDisabled(), true, 'Stormcalling II costs more than is left');
    await press(panel.locator('[data-specialty-close]'));

    // A Melee Guild becomes a barracks, then is respecced for 5 Copper.
    const melee = await place('meleeGuild');
    await tapBuilding(melee.uid);
    assert.deepEqual(await nodes(), ['k:meleeGuild=owned', 'k:barracks=next']);
    const before = await state(page);
    await buy('k:barracks');
    await settled();
    assert.ok((await nodes()).includes('p:crusaders:1=next'));
    await page.screenshot({ path: `${out}/upgrade-${width}-barracks.png` });
    await press(panel.locator('.ug-respec'));
    assert.match(await panel.locator('.ug-respec').textContent(), /Respec for 5 Copper\?/, 'asks once more');
    await press(panel.locator('.ug-respec'));
    await settled();
    s = await state(page);
    assert.equal((await placed(melee.uid)).kind, 'meleeGuild', 'back to a Melee Guild');
    assert.equal(s.knowledge, before.knowledge, 'every point back');
    assert.equal(s.smithy.copper, before.smithy.copper - 5);
    assert.deepEqual(await nodes(), ['k:meleeGuild=owned', 'k:barracks=next']);
    await press(panel.locator('[data-specialty-close]'));

    // The Ranged Guild's four branches.
    const ranged = await place('rangedGuild', 1);
    await tapBuilding(ranged.uid);
    assert.equal(await panel.locator('.ug-node.next').count(), 4);
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/upgrade-${width}-ranged-guild.png` });
    await buy('k:musketHall');
    await settled();
    assert.equal((await placed(ranged.uid))?.kind, 'musketHall');
    await press(panel.locator('[data-specialty-close]'));
    const ranged2 = await place('rangedGuild', 2);
    await tapBuilding(ranged2.uid);
    await buy('k:sniperLodge');
    await press(panel.locator('[data-specialty-close]'));
    await place('meleeGuild', 3);
    s = await state(page);
    assert.deepEqual(['wizardTower', 'musketHall', 'sniperLodge', 'meleeGuild'].map(k => s.defend.owned[k] >= 1), [true, true, true, true]);

    // Saved, reloaded, and fought with.
    await page.reload(); await page.waitForSelector('#defend-start');
    s = await state(page);
    assert.deepEqual([(s.defend.layout.structures.find(x => x.uid === tower.uid)).path, s.defend.layout.structures.find(x => x.uid === tower.uid).rank], ['storm', 1]);
    await hook(); await page.waitForFunction(() => window.__dp);
    await page.locator('#defend-start').click();
    const paths = await page.evaluate(() => Object.values(window.__dp.sim.bonuses.structurePaths).map(p => p.wizardTower));
    assert.deepEqual(paths.filter(Boolean), [{ path: 'storm', rank: 1 }]);
    await page.evaluate(() => window.defendDebug?.(14));
    const kinds = await page.evaluate(() => [...new Set(window.__dp.sim.soldiers.map(s => s.kind))].sort());
    for (const k of ['brawler', 'musketeer', 'sniper']) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
    await page.evaluate(() => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 7, (k.ty) * 7); dp.renderer.zoomAt(p.x, p.y, 3.5); });
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/upgrade-${width}-battle.png` });
    await page.locator('#defend-abandon').click(); await page.locator('#defend-abandon').click();

    // The shop sells only the basic buildings; Tiles shows the tree.
    await page.locator('nav [data-tab="tiles"]').click();
    await page.locator('.tiles-hall [data-key="watchTower"]').click();
    assert.match(await page.locator('.tile-specialties').textContent(), /Becomes Wizard tower/);
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/upgrade-${width}-tiles.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: palette, upgrade panel, becoming, paths, guild branches, reload, battle and Tiles passed`);
    await context.close();
  }
} finally { await browser.close(); }
