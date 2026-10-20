// The Ranged Guild's gunner line in the browser, on desktop and phones: a
// Gunner hall's tree offers the Musket hall, Machine-gun nest and Rocket
// battery; the halls stand in the city and their gunners, Gatling gunners
// and rocketeers fight in battle. Isolated browser contexts only: never
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
const KINDS = ['gunHall', 'gunNest', 'gatlingNest', 'rocketBattery', 'musketHall'];
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async kinds => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 100000;
      for (const k of kinds) s.defend.owned[k] = 1;
      s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      const spots = [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]];
      kinds.forEach((kind, i) => { l = placeStructure(l, kind, k.tx + spots[i][0], k.ty + spots[i][1], kind === 'musketHall' ? { path: 'sharpMuskets', rank: 3 } : undefined) ?? l; });
      s.defend.layout = l;
      return s;
    }, KINDS);
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('gunner-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('gunner-fixture-seeded', 'yes');
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
    for (const k of KINDS) assert.ok(s.defend.layout.structures.some(x => x.kind === k), `${k} stands`);
    const zoomKeep = z => page.evaluate(z => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 7, (k.ty) * 7); dp.renderer.zoomAt(p.x, p.y, z); }, z);
    await zoomKeep(phone ? 2 : 2.5);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/gunners-${width}-halls.png` });

    // The Gunner hall's tree: muskets, machine guns and rockets.
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const hall = s.defend.layout.structures.find(x => x.kind === 'gunHall');
    const p = await page.evaluate(uid => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, hall.uid);
    if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#defend-specialty:not([hidden])');
    const tree = await panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => `${e.dataset.node}=${['owned', 'next', 'locked'].find(c => e.classList.contains(c))}`));
    for (const n of ['k:rangedGuild=owned', 'k:gunHall=owned', 'k:musketHall=next', 'k:gunNest=next', 'k:rocketBattery=next']) assert.ok(tree.includes(n), `${n} in ${tree}`);
    await press(panel.locator('[data-node="k:gunNest"]'));
    await page.waitForTimeout(900); await page.screenshot({ path: `${out}/gunners-${width}-tree.png` });
    await press(panel.locator('[data-specialty-close]'));

    // In battle.
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.defendDebug?.(20));
    const kinds = await page.evaluate(() => [...new Set(window.__dp.sim.soldiers.map(s => s.kind))]);
    for (const k of ['gunner', 'machineGunner', 'gatlingGunner', 'rocketeer', 'musketeer']) assert.ok(kinds.includes(k), `${k} in battle: ${kinds}`);
    await page.evaluate(() => {
      const sim = window.__dp.sim, proto = sim.enemies[0] ?? { jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false };
      for (const u of sim.soldiers.slice(0, 16)) for (const [dx, dy] of [[2.2, 0.3], [-1.4, 2.3]]) {
        const e = { ...proto, kind: 'orc', id: sim.newId(), x: u.x + dx, y: u.y + dy, hp: 400, maxHp: 400, cd: 0, flash: 0 };
        for (const key of ['venom', 'chill', 'freeze', 'burn', 'burnDps', 'fortressPart', 'fortressParts', 'blink', 'aim', 'stagger']) delete e[key];
        sim.enemies.push(e);
      }
      window.__dp.inspect = null;
    });
    await page.evaluate(() => window.defendDebug?.(0.6));
    const hurt = await page.evaluate(() => window.__dp.sim.enemies.filter(e => e.hp < e.maxHp).length + window.__dp.sim.enemies.filter(e => e.hp <= 0).length);
    assert.ok(hurt > 0, 'the gunners hit them');
    // Close on the city's gunners.
    await page.evaluate(() => {
      const dp = window.__dp, g = dp.sim.soldiers.find(s => s.kind === 'gatlingGunner') ?? dp.sim.soldiers[0];
      for (let i = 0; i < 6; i++) { const p = dp.renderer.toClient(g.x, g.y); dp.renderer.zoomAt(p.x, p.y, 1.5); }
    });
    await page.waitForTimeout(600); await page.screenshot({ path: `${out}/gunners-${width}-battle.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: halls, the tree and battle passed`);
    await context.close();
  }
} finally { await browser.close(); }
