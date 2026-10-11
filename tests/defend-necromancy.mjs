import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// The Necromancy spell in the browser, on the isolated stress fixture (no
// player save): the Skills palette's button, aiming over the fallen, the
// cast through the real pointer controls, the risen drawn, the cooldown,
// and the Study's spell setup.
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
    const spell = page.locator('[data-item="necromancy"]');
    assert.equal(await spell.isDisabled(), false);
    // Bury a crowd under the middle of the view.
    const canvas = await page.locator('#defend-canvas').boundingBox();
    const mid = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
    const at = await page.evaluate(({ x, y }) => {
      const { fx, fy } = window.stressPage.renderer.toCell(x, y);
      return { x: fx, y: fy };
    }, mid);
    await page.evaluate((cell) => {
      const sim = window.stressSim;
      const c = cell;
      for (let i = 0; i < 6; i++) sim.graves.push({ x: c.x + (i % 3) - 1, y: c.y + Math.floor(i / 3) - 0.5, difficulty: 4 + i * 6, life: 30 });
    }, at);
    const b = await spell.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(mid.x, mid.y, { steps: 8 });
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-necromancy-aim-${width}.png` });
    const before = await page.evaluate(() => window.stressSim.soldiers.filter(s => s.risen).length);
    await page.mouse.up();
    const after = await page.evaluate(() => window.stressSim.soldiers.filter(s => s.risen).length);
    assert.ok(after > before, `the fallen rose (${before} → ${after})`);
    await page.evaluate(() => { window.stressSim.time += 0.3; window.stressPage.draw(false); window.stressPage.updateSkillCooldowns(); });
    await page.screenshot({ path: `test-results/defend-necromancy-cast-${width}.png` });
    assert.equal(await spell.isDisabled(), true);
    assert.match(await spell.getAttribute('class'), /skill-loading/);
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 1e7; s.settings.instantResearch = true;
      const root = document.createElement('div'); root.id = 'necro-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, openChamber: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('necromancy'); ledger.render();
      window.necroStudy = { ledger, s };
    });
    assert.equal(await page.locator('[data-spell-path]').count(), 1, 'only Plain before research');
    await page.locator('[data-pick="amalgam:0"]').click();
    await page.locator('[data-learn-path="amalgam"]').click();
    await page.locator('[data-pick="boneArchers:0"]').click();
    await page.locator('[data-learn-path="boneArchers"]').click();
    assert.equal(await page.locator('[data-spell-path]').count(), 3);
    assert.equal(await page.locator('[data-spell-path="amalgam"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-spell-path="boneArchers"]').click();
    assert.equal(await page.evaluate(() => window.necroStudy.s.spellPaths.necromancy), 'boneArchers');
    const overflow = await page.locator('#necro-study .chamber-list').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `study overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-necromancy-study-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Necromancy palette, aim, cast, risen art, cooldown and Study setup passed on desktop/mobile.');
} finally { await browser.close(); }
