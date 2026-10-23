// Upgrading buildings one at a time in Defend, on desktop and phones: the
// palette sells only the basic buildings, tapping a placed one while
// building opens its living upgrade tree, each node costs Knowledge and
// changes only that building, a choice withers the branches beside it and
// sprouts its own, choices down another branch sit beside and below while
// the branch carries on upward, hidden and closed-off branches trail off as
// fading lines, nodes can be dragged and spring back, an owned node can be
// undone and a respec gives every point back, free, pressing and holding a placed
// building or a palette tile opens its tree, and the guilds' troops fight. Isolated browser contexts only: never reads or changes a
// player's saved game. Needs `npm run dev`. Screenshots go to test-results/.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { raiseOf } from './drag-raise.mjs';
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
      // Loaded first: a press held still too long opens the building's tree.
      await page.evaluate(async () => { window.__layout = await import('/src/defend/layout.ts'); });
      const from = await page.locator(`#defend-palette [data-item="${item}"]`).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 4);
      const to = await page.evaluate(([item, nth, raise]) => {
        const { quarterSize, QUARTERS_W, QUARTERS_H } = window.__layout;
        const dp = window.__dp, r = dp.renderer, box = r.canvas.getBoundingClientRect(), session = dp.pointers.session, l = dp.host.save().layout, k = l.keep;
        const kind = item.split('~')[0], { qw, qh } = quarterSize(kind, (l.compact ?? []).includes(kind));
        // Every top left quarter the structure fits at, nearest the keep first.
        const keys = [];
        // Only the tiles round the keep, quickly: a press held still too long opens the tree.
        for (let qy = Math.max(4, (k.ty - 1) * 4); qy + qh <= Math.min(QUARTERS_H, (k.ty + 2) * 4); qy++)
          for (let qx = Math.max(0, (k.tx - 1) * 4); qx + qw <= Math.min(QUARTERS_W, (k.tx + 2) * 4); qx++) if (session.layoutAt(`${qx},${qy}`)) keys.push([qx, qy]);
        const d = ([qx, qy]) => Math.abs(qx + qw / 2 - (k.tx + 0.5) * 4) + Math.abs(qy + qh / 2 - (k.ty + 0.5) * 4);
        keys.sort((a, b) => d(a) - d(b) || a[1] - b[1] || a[0] - b[0]);
        // Let go `raise` cells below it: the building rides above the pointer.
        const shown = keys.map(([qx, qy]) => r.toClient((qx + qw / 2) * 2, (qy + qh / 2) * 2 + raise))
          .filter(p => p.x > box.left + 4 && p.x < box.right - 4 && p.y > box.top + 4 && p.y < box.bottom - 4);
        if (!shown.length) throw new Error('No visible legal destination');
        return shown[nth % shown.length];
      }, [item, nth, await raiseOf(page)]);
      await page.mouse.move(to.x, to.y, { steps: 6 });
      await page.mouse.up();
      return (await state(page)).defend.layout.structures.filter(s => s.kind === item.split('~')[0]).at(-1);
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

    // A Watch tower: three towers to become, no paths of its own.
    const tower = await place('watchTower');
    await tapBuilding(tower.uid);
    assert.match(await panel.locator('.ug-title').textContent(), /Watch tower/);
    assert.equal(await panel.locator('.ug-node.next').count(), 3);
    assert.match(await allocatedText(), /✦ 0/);
    assert.equal(await panel.locator('.ug-respec').isDisabled(), true, 'nothing to respec yet');
    // Becoming another tower sits beside and below.
    const centreOf = id => page.evaluate(id => { const r = document.querySelector(`#defend-specialty [data-node="${id}"]`).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, id);
    await page.waitForTimeout(1200);
    const rootAt = await centreOf('k:watchTower');
    for (const k of ['k:archerTower', 'k:cannonTower', 'k:wizardTower']) assert.ok((await centreOf(k)).y > rootAt.y, `${k} sits below the Watch tower`);
    assert.ok(Number(await panel.locator('.ug-branches').getAttribute('data-hidden')) >= 2 + 2 + 3, 'what each tower opens trails off');
    assert.equal(await panel.locator('.ug-branches').getAttribute('data-closed'), '0', 'nothing closed off yet');
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
    assert.ok(!tree.some(n => n.startsWith('k:archerTower') || n.startsWith('k:cannonTower')), `the other branches withered: ${tree}`);
    assert.ok(tree.includes('k:stormTower=next') && tree.includes('k:pyreTower=next') && tree.includes('k:frostTower=next'), `the wizard's own branches sprouted: ${tree}`);
    assert.ok(!tree.some(n => n.startsWith('p:') || n.startsWith('k:darkKeep')), `only their attunements before one is taken: ${tree}`);
    assert.match(await allocatedText(), /✦ 8/);
    assert.ok(Number(await panel.locator('.ug-branches').getAttribute('data-closed')) > 0, 'the Watch tower trails the branches it closed off');
    await buy('k:stormTower');
    await settled();
    assert.equal((await placed(tower.uid)).kind, 'stormTower', 'attuned to lightning, a tower of its own');
    await buy('p:storm:1');
    await settled();
    assert.deepEqual([(await placed(tower.uid)).path, (await placed(tower.uid)).rank], ['storm', 1]);
    tree = await nodes();
    assert.ok(!tree.some(n => n.startsWith('k:pyreTower') || n.startsWith('k:frostTower')), 'the Pyre and Frost towers are cut off');
    assert.ok(tree.includes('k:darkKeep=locked'), 'the ultimate waits at the end of Stormcalling');
    assert.ok((await centreOf('p:storm:1')).y < (await centreOf('k:stormTower')).y, 'its branch climbs upward');
    assert.ok((await centreOf('k:stormTower')).y < (await centreOf('k:wizardTower')).y, 'over the wizard tower');
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
    // Undo the Storm tower: free, its Knowledge back, the Pyre and Frost towers open again.
    const kBefore = (await state(page)).knowledge;
    await press(panel.locator('[data-node="k:stormTower"]'));
    await press(panel.locator('[data-ug-undo="k:stormTower"]'));
    await settled();
    assert.deepEqual([(await placed(tower.uid)).kind, (await placed(tower.uid)).path], ['wizardTower', undefined], 'back to a plain wizard tower');
    assert.equal((await state(page)).knowledge, 92, `the Storm tower's and Stormcalling I's Knowledge back (from ${kBefore})`);
    assert.ok((await nodes()).includes('k:pyreTower=next'), 'the Pyre tower opens again');
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/upgrade-${width}-undone.png` });
    await buy('k:stormTower');
    await settled();
    await buy('p:storm:1');
    await settled();
    await press(panel.locator('[data-node="p:storm:2"]'));
    assert.equal(await panel.locator('[data-ug-buy="p:storm:2"]').isDisabled(), true, 'Stormcalling II costs more than is left');
    await press(panel.locator('[data-specialty-close]'));

    // A Melee Guild becomes an Assassins' den (its own size), then is respecced, free.
    const melee = await place('meleeGuild');
    await tapBuilding(melee.uid);
    assert.deepEqual(await nodes(), ['k:meleeGuild=owned', 'k:barracks=next', 'k:assassinDen=next', 'k:spearHall=next']);
    const before = await state(page);
    await buy('k:assassinDen');
    await settled();
    assert.ok((await nodes()).includes('k:bloodHall=next'));
    await page.screenshot({ path: `${out}/upgrade-${width}-barracks.png` });
    await press(panel.locator('.ug-respec'));
    await settled();
    s = await state(page);
    assert.equal((await placed(melee.uid)).kind, 'meleeGuild', 'back to a Melee Guild');
    assert.equal(s.knowledge, before.knowledge, 'every point back');
    assert.equal(s.smithy.copper, before.smithy.copper, 'free');
    assert.deepEqual((await nodes()).sort(), ['k:assassinDen=next', 'k:barracks=next', 'k:meleeGuild=owned', 'k:spearHall=next']);
    // Tap a picked node again to buy it; tap a picked owned one again to sell everything after it.
    await page.evaluate(() => { window.__dp.host.game().knowledge += 500; });
    const k0 = await page.evaluate(() => window.__dp.host.game().knowledge);
    const twice = async id => { await press(panel.locator(`[data-node="${id}"]`)); await press(panel.locator(`[data-node="${id}"]`)); await settled(); };
    await twice('k:assassinDen');
    assert.equal((await placed(melee.uid)).kind, 'assassinDen', 'a second tap buys it');
    await twice('k:bloodHall');
    await twice('p:bloodletters:1');
    assert.deepEqual([(await placed(melee.uid)).kind, (await placed(melee.uid)).path, (await placed(melee.uid)).rank], ['bloodHall', 'bloodletters', 1]);
    await press(panel.locator('[data-node="k:assassinDen"]'));
    assert.match(await panel.locator('.ug-again').textContent(), /sell everything after it/);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/upgrade-${width}-tap-again.png` });
    await press(panel.locator('[data-node="k:assassinDen"]'));
    await settled();
    assert.deepEqual([(await placed(melee.uid)).kind, (await placed(melee.uid)).path], ['assassinDen', undefined], 'sold down to the den');
    await page.screenshot({ path: `${out}/upgrade-${width}-sold-down.png` });
    await twice('k:meleeGuild');
    assert.equal((await placed(melee.uid)).kind, 'meleeGuild', 'and down to the Melee Guild');
    assert.equal((await state(page)).knowledge, k0, 'every point back');
    await press(panel.locator('[data-specialty-close]'));

    // The Ranged Guild's three branches.
    const ranged = await place('rangedGuild', 1);
    await tapBuilding(ranged.uid);
    assert.equal(await panel.locator('.ug-node.next').count(), 3);
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/upgrade-${width}-ranged-guild.png` });
    // A Musket hall is 3 × 2 quarters, not the guild's 2 × 2: it waits in the
    // palette, attuned to Volley fire but not yet on its first rank.
    await buy('k:gunHall');
    await settled();
    await buy('k:musketHall');
    await page.waitForSelector('#defend-specialty', { state: 'hidden' });
    assert.equal(await placed(ranged.uid), undefined, 'taken up');
    assert.ok((await state(page)).defend.owned.musketHall >= 1);
    assert.equal((await place('musketHall'))?.kind, 'musketHall', 'and placed again');
    const ranged2 = await place('rangedGuild', 2);
    await tapBuilding(ranged2.uid);
    await buy('k:gunHall');
    await press(panel.locator('[data-specialty-close]'));
    await place('meleeGuild', 3);

    // Press and hold: on a placed building, or on a palette tile.
    const hold = async (x, y) => {
      if (phone) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await page.waitForTimeout(700);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(x, y); await page.mouse.down();
        await page.waitForTimeout(700); await page.mouse.up();
      }
      await page.waitForSelector('#defend-specialty:not([hidden])');
    };
    const centre = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
    const layoutBefore = JSON.stringify((await state(page)).defend.layout.structures);
    const towerAt = await page.evaluate(uid => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, tower.uid);
    await hold(towerAt.x, towerAt.y);
    assert.match(await panel.locator('.ug-title').textContent(), /Storm tower/, 'holding a placed building opens its tree');
    assert.equal(JSON.stringify((await state(page)).defend.layout.structures), layoutBefore, 'and leaves it where it stood');
    await page.waitForTimeout(300);
    assert.equal(await panel.isHidden(), false, 'letting go keeps it open');
    await page.screenshot({ path: `${out}/upgrade-${width}-hold-building.png` });
    await press(panel.locator('[data-specialty-close]'));
    // The palette's last Watch tower: held, upgraded right there.
    await page.evaluate(() => { window.__dp.host.game().knowledge += 200; });
    await hold(...Object.values(centre(await page.locator('#defend-palette [data-item="watchTower"]').boundingBox())));
    assert.match(await panel.locator('.ug-title').textContent(), /Watch tower/, 'holding a palette tile opens its tree');
    assert.equal(await panel.locator('.ug-node.next').count(), 3);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/upgrade-${width}-hold-palette.png` });
    await buy('k:archerTower');
    await settled();
    s = await state(page);
    assert.equal(s.defend.owned.archerTower, 1, 'the copy in the palette became an archer tower');
    assert.equal(s.defend.owned.watchTower, 0, 'its Watch tower is used up');
    assert.match(await panel.locator('.ug-title').textContent(), /Archer tower/, 'and its tree goes on from there');
    assert.ok(await page.locator('#defend-palette [data-item="archerTower"]').count(), 'the palette shows it');
    assert.deepEqual((await nodes()).filter(n => n.endsWith('=next')).sort(), ['k:brazierTower=next', 'k:hawkTower=next'], 'its branches\' towers');
    await buy('k:brazierTower');
    await settled();
    await buy('p:fireArrows:1');
    await settled();
    s = await state(page);
    assert.equal(s.defend.kept.length, 1, 'it waits on Fire arrows as a kept copy');
    assert.ok(await page.locator(`#defend-palette [data-item^="brazierTower~"]`).count(), 'under its own palette entry');
    await press(panel.locator('[data-specialty-close]'));
    s = await state(page);
    assert.deepEqual(['stormTower', 'musketHall', 'gunHall', 'meleeGuild'].map(k => s.defend.owned[k] >= 1), [true, true, true, true]);

    // Saved, reloaded, and fought with.
    await page.reload(); await page.waitForSelector('#defend-start');
    s = await state(page);
    assert.deepEqual([(s.defend.layout.structures.find(x => x.uid === tower.uid)).path, s.defend.layout.structures.find(x => x.uid === tower.uid).rank], ['storm', 1]);
    await hook(); await page.waitForFunction(() => window.__dp);
    await page.locator('#defend-start').click();
    const paths = await page.evaluate(() => Object.values(window.__dp.sim.bonuses.structurePaths).map(p => p.stormTower));
    assert.deepEqual(paths.filter(Boolean), [{ path: 'storm', rank: 1 }]);
    await page.evaluate(() => window.defendDebug?.(14));
    const kinds = await page.evaluate(() => [...new Set(window.__dp.sim.soldiers.map(s => s.kind))].sort());
    for (const k of ['brawler', 'musketeer', 'gunner']) assert.ok(kinds.includes(k), `${k} in ${kinds}`);
    await page.evaluate(() => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 8, (k.ty) * 8); dp.renderer.zoomAt(p.x, p.y, 3.5); });
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/upgrade-${width}-battle.png` });
    await page.locator('#defend-abandon').click(); await page.locator('#defend-abandon').click();

    // The shop sells only the basic buildings; Tiles shows the stats.
    await page.locator('nav [data-tab="tiles"]').click();
    await page.locator('.tiles-hall [data-tile="watchTower"]').first().click();
    assert.match(await page.locator('.tile-detail .tile-stats').textContent(), /marking range/);
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/upgrade-${width}-tiles.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: palette, upgrade panel, becoming, paths, guild branches, reload, battle and Tiles passed`);
    await context.close();
  }
} finally { await browser.close(); }
