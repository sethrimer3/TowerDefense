import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// The Meteor strike in the browser, on the isolated stress fixture (no
// player save): the Skills palette's button, aiming, the cast through the
// real pointer controls, the meteor falling and landing, the cooldown, and
// the Study's spell setup.
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
    });
    const spell = page.locator('[data-item="meteor"]');
    assert.equal(await spell.isDisabled(), false);
    const canvas = await page.locator('#defend-canvas').boundingBox();
    const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    const b = await spell.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(mid.x, mid.y, { steps: 8 });
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-meteor-aim-${width}.png` });
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.stressSim.meteors.length), 1, 'a meteor falls');
    await page.evaluate(() => { const s = window.stressSim; s.meteors[0].t = s.meteors[0].fall * 0.55; window.stressPage.draw(false); window.stressPage.updateSkillCooldowns(); });
    await page.screenshot({ path: `test-results/defend-meteor-fall-${width}.png` });
    assert.equal(await spell.isDisabled(), true);
    assert.match(await spell.getAttribute('class'), /skill-loading/);
    const landed = await page.evaluate(() => {
      const s = window.stressSim, m = s.meteors[0];
      const before = s.enemies.reduce((n, e) => n + e.hp, 0);
      m.t = m.fall - 1 / 120;
      s.update(1 / 30);
      s.impacts.forEach(i => { i.t = 0.15; });
      window.stressPage.draw(false);
      return { impacts: s.impacts.length, meteors: s.meteors.length, before, after: s.enemies.reduce((n, e) => n + e.hp, 0) };
    });
    assert.equal(landed.meteors, 0);
    assert.equal(landed.impacts, 1, 'it landed');
    await page.screenshot({ path: `test-results/defend-meteor-land-${width}.png` });
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 1e7; s.settings.instantResearch = true;
      const root = document.createElement('div'); root.id = 'meteor-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, openChamber: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('meteor'); ledger.render();
      window.meteorStudy = { ledger, s };
    });
    assert.equal(await page.locator('[data-spell-path]').count(), 1, 'only Plain before research');
    await page.locator('[data-pick="starfall:0"]').click();
    await page.locator('[data-learn-path="starfall"]').click();
    await page.locator('[data-pick="frostComet:0"]').click();
    await page.locator('[data-learn-path="frostComet"]').click();
    assert.equal(await page.locator('[data-spell-path]').count(), 3);
    assert.equal(await page.locator('[data-spell-path="starfall"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-spell-path="frostComet"]').click();
    assert.equal(await page.evaluate(() => window.meteorStudy.s.spellPaths.meteor), 'frostComet');
    const overflow = await page.locator('#meteor-study .chamber-list').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `study overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-meteor-study-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Meteor strike palette, aim, fall, landing, cooldown and Study setup passed on desktop/mobile.');
} finally { await browser.close(); }
