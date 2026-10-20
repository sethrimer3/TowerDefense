// The upgrade map in Defend, on desktop and phones: a placed building's
// tree has a little Map button that swaps it for a web of its whole line
// round the basic building, showing only what any building of the line has
// discovered (this one's own in gold), with undiscovered branches trailing
// off; a tap picks a node and shows its card, read only; Developer mode
// shows every upgrade; Tree goes back. Isolated browser contexts only:
// never reads or changes a player's saved game. Needs `npm run dev`.
// Screenshots go to test-results/.
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
    for (const dev of [false, true]) {
      const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(base); await page.waitForSelector('#defend-start');
      const fixture = await page.evaluate(async (dev) => {
        const { defaults } = await import('/src/save.ts');
        const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
        const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
        s.settings.developerMode = dev;
        s.knowledge = 100;
        s.defend.owned.rangedGuild = 1; s.defend.owned.archerBarracks = 1;
        let l = s.defend.layout;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
        l = placeStructure(l, 'rangedGuild', l.keep.tx, l.keep.ty - 1) ?? l;
        s.defend.layout = l;
        // Another guild of the line once became a Mage Guild and climbed Pyroclasm.
        s.defend.upgradesFound = ['k:rangedGuild', 'k:mageGuild', 'p:pyroclasm:1', 'p:pyroclasm:2'];
        // ...and one waits as archers, held now.
        s.defend.kept = [{ kind: 'archerBarracks', path: 'rangers', rank: 1 }];
        return s;
      }, dev);
      await context.addInitScript(fixture => {
        if (!sessionStorage.getItem('map-fixture-seeded')) {
          localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
          sessionStorage.setItem('map-fixture-seeded', 'yes');
        }
      }, fixture);
      await page.reload(); await page.waitForSelector('#defend-start');
      await page.evaluate(async () => {
        window.__dp = null;
        // The module as the page loaded it (Vite may have stamped its url).
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
      await page.evaluate(() => {
        const dp = window.__dp, uid = dp.host.save().layout.structures.find(s => s.kind === 'rangedGuild').uid;
        dp.openSpecialty({ uid });
      });
      const panel = page.locator('#defend-specialty');
      await panel.waitFor();
      const toggle = panel.locator('[data-ug-map]');
      assert.equal(await toggle.textContent(), 'Map');
      await toggle.click();
      await page.waitForTimeout(900);
      assert.equal(await toggle.textContent(), 'Tree');
      assert.equal(await panel.locator('.ug-title small').textContent(), 'UPGRADE MAP');
      const nodes = await panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.map(e => [e.dataset.node, e.classList.contains('owned') ? 'owned' : e.classList.contains('next') ? 'found' : 'unseen']));
      const ids = Object.fromEntries(nodes);
      if (!dev) {
        assert.deepEqual(Object.keys(ids).sort(), ['k:archerBarracks', 'k:mageGuild', 'k:rangedGuild', 'p:pyroclasm:1', 'p:pyroclasm:2', 'p:rangers:1'].sort());
        assert.equal(ids['k:rangedGuild'], 'owned');
        assert.equal(ids['p:pyroclasm:2'], 'found');
        assert.ok(Number(await panel.locator('.ug-branches').getAttribute('data-hidden')) > 0, 'undiscovered branches trail off');
      } else {
        assert.ok(Object.keys(ids).length > 30, 'every upgrade of the line');
        assert.ok(Object.values(ids).includes('unseen'));
      }
      assert.ok(!(await panel.locator('.ug-respec').isVisible()));
      await page.screenshot({ path: `${out}/upgrade-map-${width}${dev ? '-dev' : ''}.png` });
      // A tap shows the card, read only.
      await panel.locator('[data-node="p:pyroclasm:2"]').click();
      await page.waitForTimeout(200);
      const card = await panel.locator('.ug-card').textContent();
      assert.match(card, /Pyroclasm II/);
      assert.match(card, /Discovered/);
      assert.equal(await panel.locator('.ug-card .ug-buy').count(), 0);
      if (!dev) await page.screenshot({ path: `${out}/upgrade-map-${width}-card.png` });
      // Back to the tree.
      await toggle.click();
      await page.waitForTimeout(300);
      assert.equal(await panel.locator('.ug-title small').textContent(), 'UPGRADE TREE');
      assert.ok(await panel.locator('.ug-respec').isVisible());
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log('upgrade map: ok');
} finally {
  await browser.close();
}
