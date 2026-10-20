// The Revolutionary in the browser, on desktop and phones: it stands in the
// city, its tree grafts the shared branches onto its node and buys one, and
// in battle its laser snipers zigzag their lasers and bullets through a
// file of enemies while a lodge's sniper locks on with its red laser.
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
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 1e7;
      s.defend.owned.revolutionary = 1; s.defend.owned.sniperLodge = 1; s.defend.owned.cityTile = 8;
      s.defend.revolutionaryRanks = { squad: 2, chain: 2, critChance: 2, critDamage: 3, splash: 2 };
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      l = placeStructure(l, 'revolutionary', l.keep.tx, l.keep.ty - 1) ?? l;
      l = placeStructure(l, 'sniperLodge', l.keep.tx - 1, l.keep.ty) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('revolutionary-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('revolutionary-fixture-seeded', 'yes');
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
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
    const rev = s.defend.layout.structures.find(x => x.kind === 'revolutionary');
    assert.ok(rev, 'the Revolutionary stands');
    assert.ok(s.defend.layout.structures.some(x => x.kind === 'sniperLodge'), 'the lodge stands');
    const zoomKeep = z => page.evaluate(z => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 8, (k.ty) * 8); dp.renderer.zoomAt(p.x, p.y, z); }, z);
    await zoomKeep(phone ? 2 : 2.5);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/revolutionary-${width}-city.png` });

    // Its tree: the building's lineage, the shared branches grafted on its node.
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const p = await page.evaluate(uid => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, rev.uid);
    if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    const tree = await panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => `${e.dataset.node}=${['owned', 'next', 'locked'].find(c => e.classList.contains(c))}`));
    for (const n of ['k:sniperLodge=owned', 'k:revolutionary=owned', 'q:squad:2=owned', 'q:chain:2=owned', 'q:chain:3=next', 'q:critChance:3=next', 'q:critDamage:4=next', 'q:splash:3=next']) assert.ok(tree.includes(n), `${n} in ${tree}`);
    await press(panel.locator('[data-node="q:chain:3"]'));
    await panel.locator('.ug-card [data-ug-buy="q:chain:3"]').waitFor();
    await page.waitForTimeout(700); await page.screenshot({ path: `${out}/revolutionary-${width}-tree.png` });
    await press(panel.locator('.ug-card [data-ug-buy="q:chain:3"]'));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('towerdefense.v1')).defend.revolutionaryRanks?.chain === 3);
    assert.match(await panel.locator('.ug-card').innerText(), /Owned/);
    await press(panel.locator('[data-specialty-close]'));

    // In battle: three laser snipers and a lodge's sniper.
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.defendDebug?.(30));
    const counts = await page.evaluate(() => { const ks = window.__dp.sim.soldiers.map(s => s.kind); return { rail: ks.filter(k => k === 'railSniper').length, sniper: ks.filter(k => k === 'sniper').length }; });
    assert.equal(counts.rail, 3, 'the squad of three');
    assert.ok(counts.sniper >= 1, 'the lodge trains snipers');
    // A file of enemies east of the first laser sniper; one shot zigzags through them.
    const struck = await page.evaluate(() => {
      const sim = window.__dp.sim, m = sim.soldiers.find(s => s.kind === 'railSniper');
      const proto = { jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false };
      sim.enemies = sim.enemies.filter(e => e.hp <= 0);
      const file = [];
      for (let i = 0; i < 9; i++) {
        const e = { ...proto, kind: 'orc', id: sim.newId(), x: m.x + 2 + i * 1.3, y: m.y + (i % 2 ? 1 : -1) * 0.8, hp: 1e6, maxHp: 1e6, cd: 0, flash: 0 };
        sim.enemies.push(e); file.push(e);
      }
      for (const s of sim.soldiers) if (s.kind === 'railSniper' || s.kind === 'sniper') s.cd = 9;
      m.cd = 0;
      window.defendDebug(0.8);
      return file.filter(e => e.hp < e.maxHp).length;
    });
    assert.ok(struck >= 7, `one bullet struck ${struck} of the file`);
    // Mid lock-on, then just after a shot: the lasers and the beam flash.
    await page.evaluate(() => {
      const dp = window.__dp, m = dp.sim.soldiers.find(s => s.kind === 'railSniper');
      for (const s of dp.sim.soldiers) if (s.kind === 'railSniper' || s.kind === 'sniper') s.cd = 1;
      for (let i = 0; i < 5; i++) { const p = dp.renderer.toClient(m.x + 4, m.y); dp.renderer.zoomAt(p.x, p.y, 1.4); }
    });
    await page.waitForTimeout(300); await page.screenshot({ path: `${out}/revolutionary-${width}-lock.png` });
    await page.evaluate(() => { for (const s of window.__dp.sim.soldiers) if (s.kind === 'railSniper') s.cd = 0; window.defendDebug(0.1); });
    await page.waitForTimeout(100); await page.screenshot({ path: `${out}/revolutionary-${width}-flash.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: the Revolutionary, its tree and its lasers passed`);
    await context.close();
  }
} finally { await browser.close(); }
