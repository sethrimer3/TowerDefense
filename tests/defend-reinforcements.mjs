import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// The Reinforcements in the browser, on the isolated stress fixture (no
// player save): the Skills palette's button, aiming with its landing spots,
// the cast through the real pointer controls, the squad dropping in, landing
// with Hammerfall's shockwaves and champion, fighting, the cooldown, and the
// Study's spell setup.
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
      // Cast as Hammerfall III, so the shockwaves and the champion are drawn too.
      const sim = window.stressSim; sim.bonuses = { ...sim.bonuses, reinforcements: { path: 'hammerfall', rank: 3 } };
    });
    const spell = page.locator('[data-item="reinforcements"]');
    assert.equal(await spell.isDisabled(), false);
    const canvas = await page.locator('#defend-canvas').boundingBox();
    // Aim on open ground where the most of the squad can land, among enemies.
    const aim = await page.evaluate(async () => {
      const { dropSpots } = await import('/src/defend/reinforcements.ts');
      const s = window.stressSim, p = window.stressPage;
      let best = s.enemies[0], most = -1;
      for (const e of s.enemies) {
        const n = dropSpots(s, e).length * 100 + s.enemies.filter(o => (o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 4).length;
        if (n > most) { most = n; best = e; }
      }
      return p.renderer.toClient(best.x, best.y);
    });
    const b = await spell.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(aim.x ?? canvas.x + canvas.width / 2, aim.y ?? canvas.y + canvas.height / 2, { steps: 8 });
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-reinforce-aim-${width}.png` });
    await page.mouse.up();
    const falling = await page.evaluate(() => {
      const s = window.stressSim;
      s.update(1 / 30);
      s.drops.forEach(d => { d.t = d.fall * 0.6; });
      window.stressPage.draw(false); window.stressPage.updateSkillCooldowns();
      return s.drops.length;
    });
    assert.ok(falling >= 1, 'the squad is coming down');
    await page.screenshot({ path: `test-results/defend-reinforce-drop-${width}.png` });
    const cast = await page.evaluate(() => {
      const s = window.stressSim;
      for (let i = 0; i < 24; i++) s.update(1 / 30);
      s.landings.forEach(l => { l.t = 0.15; });
      window.stressPage.draw(false);
      return { looks: s.soldiers.filter(x => x.called).map(x => x.called.look), drops: s.drops.length, called: s.soldiers.filter(x => x.called).length, champion: s.soldiers.some(x => x.called?.look === 'champion'), staggered: s.enemies.filter(e => e.stagger).length };
    });
    assert.ok(cast.called >= 2, 'the squad landed');
    assert.ok(cast.champion, 'with a champion ' + JSON.stringify(cast));
    await page.screenshot({ path: `test-results/defend-reinforce-land-${width}.png` });
    assert.equal(await spell.isDisabled(), true);
    assert.match(await spell.getAttribute('class'), /skill-loading/);
    await page.evaluate(() => { const s = window.stressSim; for (let i = 0; i < 60; i++) s.update(1 / 30); window.stressPage.draw(false); });
    await page.screenshot({ path: `test-results/defend-reinforce-fight-${width}.png` });
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 1e7; s.settings.instantResearch = true;
      const root = document.createElement('div'); root.id = 'reinforce-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, openChamber: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('reinforcements'); ledger.render();
      window.reinforceStudy = { ledger, s };
    });
    assert.equal(await page.locator('[data-spell-path]').count(), 1, 'only Plain before research');
    await page.locator('[data-pick="hammerfall:0"]').click();
    await page.locator('[data-learn-path="hammerfall"]').click();
    await page.locator('[data-pick="oathsworn:0"]').click();
    await page.locator('[data-learn-path="oathsworn"]').click();
    assert.equal(await page.locator('[data-spell-path]').count(), 3);
    assert.equal(await page.locator('[data-spell-path="hammerfall"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-spell-path="oathsworn"]').click();
    assert.equal(await page.evaluate(() => window.reinforceStudy.s.spellPaths.reinforcements), 'oathsworn');
    const overflow = await page.locator('#reinforce-study .chamber-list').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `study overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-reinforce-study-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Reinforcements palette, aim, drop, landing, champion and Study setup passed on desktop/mobile.');
} finally { await browser.close(); }
