import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// The Frost nova in the browser, on the isolated stress fixture (no player
// save): the Skills palette's button, aiming, the cast through the real
// pointer controls, the burst freezing the enemies, the rime and a wandering
// blizzard's snow, the cooldown, and the Study's spell setup.
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [1040, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-stress.html?manual&enemies=60');
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(async () => {
      const p = window.stressPage;
      p.sideOpen.sim = true; p.renderChrome(); p.relayout();
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      p.fitView(); p.draw(false);
      // Cast as a wandering blizzard, so its snow is drawn too.
      window.stressSim.bonuses.frostNova = { path: 'blizzard', rank: 3 };
    });
    const spell = page.locator('[data-item="frostNova"]');
    assert.equal(await spell.isDisabled(), false);
    const canvas = await page.locator('#defend-canvas').boundingBox();
    // Aim where the enemies are thickest.
    const aim = await page.evaluate(() => {
      const s = window.stressSim, p = window.stressPage;
      let best = s.enemies[0], most = -1;
      for (const e of s.enemies) { const n = s.enemies.filter(o => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 9).length; if (n > most) { most = n; best = e; } }
      return p.renderer.toClient(best.x, best.y);
    });
    const b = await spell.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(aim.x ?? canvas.x + canvas.width / 2, aim.y ?? canvas.y + canvas.height / 2, { steps: 8 });
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-frost-aim-${width}.png` });
    await page.mouse.up();
    const cast = await page.evaluate(() => {
      const s = window.stressSim;
      s.update(1 / 30);
      s.frostBursts.forEach(x => { x.t = 0.2; });
      s.rime.forEach(f => { f.t = 0.5; });
      window.stressPage.draw(false); window.stressPage.updateSkillCooldowns();
      return { rime: s.rime.length, frozen: s.enemies.filter(e => e.freeze).length };
    });
    assert.equal(cast.rime, 1, 'rime lies where it was cast');
    assert.ok(cast.frozen > 0, 'the burst froze enemies');
    await page.screenshot({ path: `test-results/defend-frost-burst-${width}.png` });
    assert.equal(await spell.isDisabled(), true);
    assert.match(await spell.getAttribute('class'), /skill-loading/);
    await page.evaluate(() => { const s = window.stressSim; for (let i = 0; i < 60; i++) s.update(1 / 30); window.stressPage.draw(false); });
    await page.screenshot({ path: `test-results/defend-frost-rime-${width}.png` });
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 1e7; s.settings.instantResearch = true;
      const root = document.createElement('div'); root.id = 'frost-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, openChamber: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('frostNova'); ledger.render();
      window.frostStudy = { ledger, s };
    });
    assert.equal(await page.locator('[data-spell-path]').count(), 1, 'only Plain before research');
    await page.locator('[data-pick="shatter:0"]').click();
    await page.locator('[data-learn-path="shatter"]').click();
    await page.locator('[data-pick="rimeWard:0"]').click();
    await page.locator('[data-learn-path="rimeWard"]').click();
    assert.equal(await page.locator('[data-spell-path]').count(), 3);
    assert.equal(await page.locator('[data-spell-path="shatter"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-spell-path="rimeWard"]').click();
    assert.equal(await page.evaluate(() => window.frostStudy.s.spellPaths.frostNova), 'rimeWard');
    const overflow = await page.locator('#frost-study .chamber-list').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `study overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-frost-study-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Frost nova palette, aim, burst, rime, blizzard and Study setup passed on desktop/mobile.');
} finally { await browser.close(); }
