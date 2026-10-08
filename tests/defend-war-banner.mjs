import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [1040, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-stress.html?manual&enemies=100');
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(() => {
      const p = window.stressPage;
      p.sideOpen.sim = true; p.save.bombs = 3; p.renderChrome(); p.relayout();
      p.sim.plantBanner({ x: 30, y: 45 }); p.updateSkillCooldowns();
    });
    const banner = page.locator('[data-item="banner"]');
    assert.match(await page.locator('#defend-side-toggle').textContent(), /Skills/);
    assert.equal(await banner.isDisabled(), true);
    assert.match(await banner.getAttribute('class'), /skill-loading/);
    assert.equal(await page.locator('[data-item="bomb"]').isDisabled(), false);
    await page.evaluate(async () => {
      // The fixture has no frame loop; settle the sliding panel and refit its view.
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      window.stressPage.fitView(); window.stressPage.draw(false);
    });
    await page.evaluate(() => { window.stressSim.time += 5; window.stressPage.updateSkillCooldowns(); });
    assert.equal(await banner.evaluate(e => e.style.getPropertyValue('--skill-fill')), '50%');
    await page.screenshot({ path: `test-results/defend-banner-cooldown-${width}.png` });
    await page.evaluate(() => { window.stressSim.time += 5; window.stressPage.updateSkillCooldowns(); });
    assert.equal(await banner.isDisabled(), false);
    assert.match(await banner.getAttribute('class'), /skill-ready/);
    // Drag through the real pointer controls, then verify both UI and simulation lock relocation.
    const b = await banner.boundingBox(), canvas = await page.locator('#defend-canvas').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2, { steps: 8 });
    await page.mouse.up();
    await page.evaluate(() => window.stressPage.updateSkillCooldowns());
    assert.equal(await banner.isDisabled(), true);
    assert.equal(await page.evaluate(() => window.stressSim.plantBanner({ x: 1, y: 1 })), false);
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 100000; s.settings.instantResearch = true; s.skills.warBanner = 1;
      const root = document.createElement('div'); root.id = 'banner-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('warBanner'); ledger.render();
      window.bannerStudy = ledger;
    });
    assert.equal(await page.locator('.banner-research-branches section').count(), 3);
    assert.equal(await page.locator('[data-learn="bannerDefense"]').isDisabled(), true);
    for (let rank = 0; rank < 3; rank++) await page.locator('[data-learn="bannerCooldown"]').click();
    await page.locator('[data-learn="bannerDefense"]').click();
    await page.locator('[data-learn="bannerReach"]').click();
    for (const id of ['bannerDamage', 'bannerMarch', 'bannerLife']) {
      assert.equal(await page.locator(`[data-learn="${id}"]`).isDisabled(), false);
      await page.locator(`[data-learn="${id}"]`).click();
    }
    assert.equal(await page.locator('[data-learn="bannerRegen"]').isDisabled(), false);
    await page.locator('[data-learn="bannerRegen"]').click();
    const overflow = await page.locator('.banner-research').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `research overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-banner-study-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('War banner pointer placement, cooldown fill, ready outline and research branches passed on desktop/mobile.');
} finally { await browser.close(); }
