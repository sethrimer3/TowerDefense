// The Sigil tower in the real game: the Wizard tower's tree offers it as a
// fourth branch, and in battle it charges (fireflies round its roof), draws
// its magic circle on the ground and bursts. Needs `npm run dev`; writes
// screenshots to test-results/.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });

async function open(width, kind, rank) {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 800 }, deviceScaleFactor: 2, hasTouch: width < 500 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForSelector('#defend-start');
  const save = await page.evaluate(async ({ kind, rank }) => {
    const { defaults } = await import('/src/save.ts');
    const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
    const s = defaults(); s.profile = { name: "Sigil tester", flag: { base: 3, layers: [] } }; s.knowledge = 1e6; s.settings.devMode = true;
    s.settings.soundOff = s.settings.ambienceOff = true; s.defend.owned[kind] = 1; s.defend.owned.cityTile = 2;
    let l = s.defend.layout; l = placeCityTile(l, l.keep.tx, l.keep.ty - 1); l = placeStructure(l, kind, l.keep.tx, l.keep.ty - 1);
    if (rank) Object.assign(l.structures.find(o => o.kind === kind), { path: 'sigils', rank });
    s.defend.layout = l; return s;
  }, { kind, rank });
  await context.addInitScript(save => {
    if (!sessionStorage.getItem('sigil-seeded')) { localStorage.setItem('towerdefense.v1', JSON.stringify(save)); sessionStorage.setItem('sigil-seeded', '1'); }
  }, save);
  await page.reload(); await page.waitForSelector('#defend-start');
  await page.evaluate(async () => {
    for (const e of [...performance.getEntriesByType('resource').map(e => e.name), '/src/defend/ui.ts']) {
      if (new URL(e, location.href).pathname !== '/src/defend/ui.ts') continue;
      const { DefendPage } = await import(e), frame = DefendPage.prototype.frame;
      if (frame.__hooked) continue;
      DefendPage.prototype.frame = function (t) { window.__dp = this; return frame.call(this, t); };
      DefendPage.prototype.frame.__hooked = true;
    }
  });
  await page.waitForFunction(() => window.__dp);
  return { context, page, errors };
}

try {
  for (const width of [1280, 390]) {
    // The tree: the Sigil tower is the wizard tower's fourth branch.
    {
      const { context, page, errors } = await open(width, 'wizardTower', 0);
      await page.evaluate(() => { const dp = window.__dp, b = dp.host.save().layout.structures.find(b => b.kind === 'wizardTower'); dp.openTree({ uid: b.uid }); });
      const panel = page.locator('#defend-specialty'); await panel.waitFor({ state: 'visible' }); await page.waitForTimeout(900);
      const nodes = await panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.filter(e => e.classList.contains('next')).map(e => e.dataset.node));
      for (const k of ['pyreTower', 'frostTower', 'stormTower', 'sigilTower']) assert.ok(nodes.includes(`k:${k}`), nodes.join(','));
      await panel.locator('[data-node="k:sigilTower"]').click(); await page.waitForTimeout(500);
      assert.match(await panel.textContent(), /Sigil tower/);
      await page.screenshot({ path: `test-results/sigil-tree-${width}.png` });
      await panel.locator('[data-ug-buy]').click();
      await page.waitForFunction(() => window.__dp.host.save().layout.structures.some(b => b.kind === 'sigilTower'));
      await page.waitForTimeout(900);
      await page.screenshot({ path: `test-results/sigil-tree-bought-${width}.png` });
      assert.deepEqual(errors, []);
      await context.close();
    }
    // The battle, at each rank: charging, the circle drawing, the burst.
    for (const rank of [0, 1, 3]) {
      const { context, page, errors } = await open(width, 'sigilTower', rank);
      await page.locator('#defend-start').click();
      await page.evaluate(() => { const d = window.__dp, b = d.sim.map.buildings.find(o => o.kind === 'sigilTower'), p = d.renderer.toClient(b.rect.x + 1, b.rect.y - 2); d.renderer.zoomAt(p.x, p.y, 2.2); });
      await page.waitForFunction(() => window.__dp.sim?.sigils.some(s => s.t > s.draw * 0.6), null, { timeout: 60000 });
      await page.evaluate(() => { window.__dp.sim.speed = 0; });
      await page.waitForTimeout(600);
      const at = await page.evaluate(() => { const d = window.__dp, s = d.sim.sigils[0], b = d.sim.map.buildings.find(o => o.kind === 'sigilTower'); return { s: d.renderer.toClient(s.x, s.y), b: d.renderer.toClient(b.rect.x + 1, b.rect.y + 1) }; });
      const clip = (p, r) => ({ x: Math.max(0, p.x - r), y: Math.max(0, p.y - r), width: 2 * r, height: 2 * r });
      await page.screenshot({ path: `test-results/sigil-battle-${rank}-${width}.png` });
      await page.screenshot({ path: `test-results/sigil-circle-${rank}-${width}.png`, clip: clip(at.s, 90) });
      await page.evaluate(() => { window.__dp.sim.speed = 1; });
      await page.waitForFunction(() => window.__dp.sim.effects.some(fx => fx.kind === 'boom' && fx.t > 0.12), null, { timeout: 20000 });
      await page.evaluate(() => { window.__dp.sim.speed = 0; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `test-results/sigil-burst-${rank}-${width}.png`, clip: clip(at.s, 90) });
      await page.evaluate(() => { window.__dp.sim.speed = 1; });
      await page.waitForFunction(() => { const d = window.__dp, b = d.sim.map.buildings.find(o => o.kind === 'sigilTower'); return d.sim.sigilTowers.charged(b.id) > 0.8; }, null, { timeout: 20000 });
      await page.evaluate(() => { window.__dp.sim.speed = 0; });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `test-results/sigil-charge-${rank}-${width}.png`, clip: clip(at.b, 70) });
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log('sigil tower: tree, charge, circle and burst checked');
} finally {
  await browser.close();
}
