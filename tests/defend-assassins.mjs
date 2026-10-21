// The Assassins' den in the browser, on desktop and phones: a Melee Guild's
// tree offers the den beside the barracks, buying it opens its three branches,
// and dens on each path train assassins (cloaked ones shimmering, poisoned
// enemies dripping green) in battle. Isolated browser contexts only: never
// reads or changes a player's saved game. Needs `npm run dev`. Screenshots
// go to test-results/ (or SHOTS).
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
    // A city with a plain Melee Guild and a den on each of the four paths.
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 100000;
      s.defend.owned.meleeGuild = 1; s.defend.owned.assassinDen = 4; s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      l = placeStructure(l, 'meleeGuild', k.tx, k.ty - 1);
      for (const [path, dx, dy] of [['bloodletters', -1, 0], ['shadowcloak', 1, 0], ['venom', -1, -1]]) l = placeStructure(l, 'assassinDen', k.tx + dx, k.ty + dy, { path, rank: 3 });
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('assassin-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('assassin-fixture-seeded', 'yes');
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
    let s = await state(page);
    assert.equal(s.defend.layout.structures.filter(x => x.kind === 'assassinDen').length, 3, 'the dens stand');
    const zoomKeep = z => page.evaluate(z => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 8, (k.ty) * 8); dp.renderer.zoomAt(p.x, p.y, z); }, z);
    await zoomKeep(phone ? 2 : 2.5);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/assassins-${width}-dens.png` });

    // The Melee Guild's tree: a barracks or a den.
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const guild = s.defend.layout.structures.find(x => x.kind === 'meleeGuild');
    const p = await page.evaluate(uid => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, guild.uid);
    if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    const nodes = () => panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => `${e.dataset.node}=${['owned', 'next', 'locked'].find(c => e.classList.contains(c))}`));
    assert.deepEqual(await nodes(), ['k:meleeGuild=owned', 'k:barracks=next', 'k:assassinDen=next', 'k:spearHall=next']);
    await press(panel.locator('[data-node="k:assassinDen"]'));
    await page.waitForTimeout(900); await page.screenshot({ path: `${out}/assassins-${width}-melee-guild.png` });
    await press(panel.locator('[data-ug-buy="k:assassinDen"]'));
    await page.waitForFunction(() => !document.querySelector('#defend-specialty .ug-node.withering'), null, { timeout: 5000 });
    const tree = await nodes();
    for (const path of ['bloodletters', 'shadowcloak', 'venom']) assert.ok(tree.includes(`p:${path}:1=next`), `${path} in ${tree}`);
    assert.ok(tree.includes('u:assassinDen=locked'), 'its ultimate is still to come');
    assert.ok(!tree.some(n => n.startsWith('k:barracks')), 'the barracks withered');
    await press(panel.locator('[data-node="p:venom:1"]'));
    await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/assassins-${width}-den-tree.png` });
    s = await state(page);
    assert.equal(s.defend.layout.structures.find(x => x.uid === guild.uid).kind, 'assassinDen');
    await press(panel.locator('[data-specialty-close]'));

    // In battle.
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.defendDebug?.(16));
    const seen = await page.evaluate(() => {
      const sim = window.__dp.sim;
      return { kinds: [...new Set(sim.soldiers.map(s => s.kind))], cloaked: sim.soldiers.some(s => s.cloak !== undefined), venom: sim.enemies.some(e => e.venom) };
    });
    assert.ok(seen.kinds.includes('assassin'), `assassins in ${seen.kinds}`);
    assert.ok(seen.cloaked, 'the Shadowcloak den trains cloaked assassins');
    // For the picture: a pair of orcs walked up to each assassin.
    await page.evaluate(() => {
      const sim = window.__dp.sim, proto = sim.enemies[0] ?? { jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false };
      for (const u of sim.soldiers.slice(0, 12)) for (const [dx, dy] of [[1.2, 0.3], [-0.4, 1.3]]) {
        const e = { ...proto, kind: 'orc', id: sim.newId(), x: u.x + dx, y: u.y + dy, hp: 400, maxHp: 400, cd: 0, flash: 0 };
        for (const key of ['venom', 'chill', 'freeze', 'burn', 'burnDps', 'fortressPart', 'fortressParts', 'blink', 'aim']) delete e[key];
        sim.enemies.push(e);
      }
      window.__dp.inspect = null;
    });
    await page.evaluate(() => window.defendDebug?.(1.5));
    const venom = await page.evaluate(() => window.__dp.sim.enemies.some(e => e.venom));
    assert.ok(venom, 'the Venomblades poison what they strike');
    await page.evaluate(z => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.kind === 'assassinDen'), r = dp.renderer;
      const p = r.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h + 1);
      r.zoomAt(p.x, p.y, z);
    }, phone ? 2.5 : 3);
    await page.waitForTimeout(400); await page.screenshot({ path: `${out}/assassins-${width}-battle.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: dens, the Melee Guild's tree, the den's paths and battle passed`);
    await context.close();
  }
} finally { await browser.close(); }
