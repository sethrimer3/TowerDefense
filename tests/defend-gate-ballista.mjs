// The city gate's and the wall ballistas' trees, on desktop and phones:
// tapping a gate opens the gates' tree and tapping a ballista the
// ballistas', ranks bought there reach the battle, where the gatehouse
// carries its small ballistas. Isolated browser contexts only: never reads
// or changes a player's saved game. Needs `npm run dev`. Screenshots go to
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
      const { placeCityTile, placeGate, placeBallista } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.knowledge = 100000; s.defend.owned.cityGate = 1; s.defend.owned.wallBallista = 1;
      let l = s.defend.layout;
      const k = l.keep;
      l = placeCityTile(l, k.tx, k.ty - 1) ?? l;
      l = placeGate(l, { tx: k.tx, ty: k.ty - 1, side: 'n' }) ?? l;
      l = placeBallista(l, { vx: k.tx + 1, vy: k.ty - 1 }) ?? l;
      s.defend.layout = l;
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('gate-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('gate-fixture-seeded', 'yes');
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
    await page.waitForTimeout(500);

    const spot = kind => page.evaluate(kind => {
      const b = window.__dp.currentMap().buildings.find(o => o.kind === kind);
      return window.__dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, kind);
    const tap = async p => phone ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y);
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const buy = async id => {
      await press(panel.locator(`[data-node="${id}"]`));
      await press(panel.locator(`[data-ug-buy="${id}"]`));
      await page.waitForTimeout(150);
    };

    // The gate's tree.
    await tap(await spot('gate'));
    await page.waitForSelector('#defend-specialty:not([hidden])');
    assert.match(await panel.locator('.ug-title').textContent(), /City gate/);
    assert.equal(await panel.locator('.ug-node.next').count(), 3, 'three branches from the gate');
    await buy('q:portcullis:1');
    await buy('q:gateTowers:1');
    await buy('q:gateTowers:2');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/gate-${width}-tree.png` });
    await press(panel.locator('[data-specialty-close]'));
    await page.waitForTimeout(200);

    // The ballistas' tree.
    await tap(await spot('wallBallista'));
    await page.waitForSelector('#defend-specialty:not([hidden])');
    assert.match(await panel.locator('.ug-title').textContent(), /Wall ballista/);
    await buy('q:fireBolts:1');
    await buy('q:windlass:1');
    await buy('q:windlass:2');
    await buy('q:windlass:3');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/ballista-${width}-tree.png` });
    let s = await state(page);
    assert.deepEqual(s.defend.gateRanks, { portcullis: 1, gateTowers: 2 });
    assert.deepEqual(s.defend.ballistaRanks, { fireBolts: 1, windlass: 3 });
    await press(panel.locator('[data-specialty-close]'));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/gate-${width}-build.png` });

    // In battle: a band of orcs north of the gate meets both.
    await page.locator('#defend-start').click();
    const fought = await page.evaluate(() => {
      const sim = window.__dp.sim, g = sim.gates[0].rect;
      for (let i = 0; i < 10; i++)
        sim.enemies.push({ id: sim.newId(), kind: 'orc', x: g.x - 3 + (i % 5) * 2.5, y: g.y - 7 - Math.floor(i / 5) * 2, hp: 400, maxHp: 400, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 });
      window.defendDebug?.(1.5);
      return { gate: sim.bonuses.gate, ballista: sim.bonuses.ballista, barred: sim.foeSolid === sim.solid, aims: sim.ballistaAim.size };
    });
    assert.deepEqual(fought.gate, { portcullis: 1, gateTowers: 2 });
    assert.deepEqual(fought.ballista, { fireBolts: 1, windlass: 3 });
    assert.ok(fought.barred, 'the portcullis bars the enemy');
    assert.ok(fought.aims >= 2, `the gate's ballistas and the wall's turned to shoot (${fought.aims})`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/gate-${width}-battle.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`gate and ballista ${width}: ok`);
  }
} finally {
  await browser.close();
}
