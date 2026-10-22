// The Hero in the browser, on desktop and phones: a Barracks' tree offers
// the Hero, a Hero's hall's tree its three paths; the halls stand, wearing
// each path, in the city, and their heroes slash and spin through a crowd
// in battle. Isolated browser contexts only: never reads or changes a
// player's saved game. Needs `npm run dev`. Screenshots go to
// test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = process.env.SHOTS || 'test-results';
mkdirSync(out, { recursive: true });
// A Chapterhouse, a plain Hero's hall and one on each path, in its look.
const HALLS = [['chapterHouse'], ['heroHall'], ['heroHall', { path: 'whirlwind', rank: 3 }], ['heroHall', { path: 'bladeDance', rank: 3 }], ['heroHall', { path: 'legend', rank: 3 }]];
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async (halls) => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 100000;
      s.defend.owned.chapterHouse = 1; s.defend.owned.heroHall = 4;
      s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      const k = l.keep;
      const spots = [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]];
      halls.forEach(([kind, wear], i) => { l = placeStructure(l, kind, k.tx + spots[i][0], k.ty + spots[i][1], wear) ?? l; });
      s.defend.layout = l;
      return s;
    }, HALLS);
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('hero-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('hero-fixture-seeded', 'yes');
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
    for (const [k, wear] of HALLS) assert.ok(s.defend.layout.structures.some(x => x.kind === k && x.path === wear?.path), `${k} ${wear?.path ?? ''} stands`);
    const zoomKeep = z => page.evaluate(z => { const dp = window.__dp, k = dp.host.save().layout.keep, p = dp.renderer.toClient((k.tx + 0.5) * 7, (k.ty) * 7); dp.renderer.zoomAt(p.x, p.y, z); }, z);
    await zoomKeep(phone ? 2 : 2.5);
    await page.waitForTimeout(500); await page.screenshot({ path: `${out}/hero-${width}-halls.png` });

    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const open = async uid => {
      const p = await page.evaluate(uid => {
        const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
        return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
      }, uid);
      if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
      await page.waitForSelector('#defend-specialty:not([hidden])');
      await page.waitForTimeout(700);
      return panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => `${e.dataset.node}=${['owned', 'next', 'locked'].find(c => e.classList.contains(c))}`));
    };
    const close = async () => { await press(panel.locator('[data-specialty-close]')); await page.waitForSelector('#defend-specialty', { state: 'hidden' }); };
    // A Chapterhouse's tree: the barracks' Crusaders branch, the Hero merged at its top.
    const tree = await open(s.defend.layout.structures.find(x => x.kind === 'chapterHouse').uid);
    for (const n of ['k:meleeGuild=owned', 'k:barracks=owned', 'k:chapterHouse=owned', 'k:heroHall=locked', 'p:crusaders:1=next']) assert.ok(tree.includes(n), `${n} in ${tree}`);
    await press(panel.locator('[data-node="k:heroHall"]'));
    await page.waitForTimeout(900); await page.screenshot({ path: `${out}/hero-${width}-barracks-tree.png` });
    assert.match(await panel.textContent(), /Three Barracks buildings, each at the last rank of a different branch, merge into one Hero/);
    await close();
    // A plain Hero's hall offers its three paths.
    const own = await open(s.defend.layout.structures.find(x => x.kind === 'heroHall' && !x.path).uid);
    for (const n of ['k:barracks=owned', 'k:heroHall=owned', 'p:whirlwind:1=next', 'p:bladeDance:1=next', 'p:legend:1=next']) assert.ok(own.includes(n), `${n} in ${own}`);
    await press(panel.locator('[data-node="p:whirlwind:1"]'));
    await page.waitForTimeout(900); await page.screenshot({ path: `${out}/hero-${width}-tree.png` });
    await close();

    // In battle: one hero a hall, cutting through a crowd of small enemies.
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.defendDebug?.(12));
    const heroes = await page.evaluate(() => window.__dp.sim.soldiers.filter(s => s.kind === 'hero').length);
    assert.equal(heroes, 4, 'a hero for each hall');
    const crowd = () => page.evaluate(() => {
      const sim = window.__dp.sim, proto = sim.enemies[0] ?? { jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false };
      const made = [];
      for (const u of sim.soldiers.filter(s => s.kind === 'hero'))
        for (let i = 0; i < 10; i++) {
          const e = { ...proto, kind: 'roach', id: sim.newId(), x: u.x + Math.cos(i * 0.63) * 1.2, y: u.y + Math.sin(i * 0.63) * 1.2, hp: 60, maxHp: 60, cd: 0, flash: 0 };
          for (const key of ['venom', 'chill', 'freeze', 'burn', 'burnDps', 'fortressPart', 'fortressParts', 'blink', 'aim', 'stagger', 'slash', 'breath']) delete e[key];
          sim.enemies.push(e); made.push(e.id);
        }
      window.__dp.inspect = null;
      return made;
    });
    const made = await crowd();
    await page.evaluate(() => window.defendDebug?.(3));
    const left = await page.evaluate(ids => window.__dp.sim.enemies.filter(e => ids.includes(e.id) && e.hp > 0).length, made);
    assert.ok(left < made.length / 4, `the heroes cut down the crowd (${left} of ${made.length} left)`);
    // Up close on each, mid-combo, against a tougher crowd.
    await page.evaluate(() => { const dp = window.__dp, g = dp.sim.soldiers.find(s => s.kind === 'hero'); for (let i = 0; i < 6; i++) { const p = dp.renderer.toClient(g.x, g.y); dp.renderer.zoomAt(p.x, p.y, 1.5); } });
    for (let n = 0; n < 4; n++) {
      await crowd();
      await page.evaluate(() => { for (const e of window.__dp.sim.enemies) if (e.kind === 'roach') e.hp = e.maxHp = 5000; });
      const at = await page.evaluate(n => {
        const dp = window.__dp, u = dp.sim.soldiers.filter(s => s.kind === 'hero')[n];
        const r = dp.renderer.canvas.getBoundingClientRect(), p = dp.renderer.toClient(u.x, u.y);
        dp.renderer.panBy(r.left + r.width / 2 - p.x, r.top + r.height / 2 - p.y);
        return dp.renderer.toClient(u.x, u.y);
      }, n);
      await page.waitForTimeout(300);
      // Between strikes the swings fade; wait for the next.
      await page.waitForFunction(() => window.__dp.sim.swings.some(w => w.t < 0.08), null, { timeout: 5000, polling: 'raf' });
      await page.screenshot({ path: `${out}/hero-${width}-battle-${n}.png`, clip: { x: Math.max(0, at.x - 110), y: Math.max(0, at.y - 110), width: 220, height: 220 } });
    }
    assert.deepEqual(errors, []);
    console.log(`${width}px: halls, the trees and battle passed`);
    await context.close();
  }
} finally { await browser.close(); }
