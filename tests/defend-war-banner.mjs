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
      const s = defaults(); s.knowledge = 100000; s.settings.instantResearch = true; s.settings.reduceMotion = true;
      const root = document.createElement('div'); root.id = 'banner-study';
      root.style.height = '780px'; document.querySelector('main').append(root);
      document.querySelector('#stress').hidden = true;
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('warBanner'); ledger.render();
      window.bannerStudy = ledger; window.bannerSave = s;
    });
    assert.equal(await page.locator('[data-subject="spells"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.banner-tree [data-node]').count(), 8);
    async function pick(id) { await page.locator(`.banner-tree [data-node="${id}"]`).click(); }
    await pick('bannerDefense');
    assert.equal(await page.locator('[data-learn="bannerDefense"]').isDisabled(), true);
    await pick('warBanner');
    assert.equal(await page.locator('[data-learn="warBanner"]').isDisabled(), false, 'banner research needs no tower skills');
    await page.locator('[data-learn="warBanner"]').click();
    await pick('bannerCooldown');
    for (let rank = 0; rank < 3; rank++) await page.locator('[data-learn="bannerCooldown"]').click();
    await pick('bannerDefense');
    await page.locator('[data-learn="bannerDefense"]').click();
    await pick('bannerReach');
    await page.locator('[data-learn="bannerReach"]').click();
    for (const id of ['bannerDamage', 'bannerMarch', 'bannerLife']) {
      await pick(id);
      assert.equal(await page.locator(`[data-learn="${id}"]`).isDisabled(), false);
      await page.locator(`[data-learn="${id}"]`).click();
    }
    // Keyboard activation chooses a node too.
    await page.locator('.banner-tree [data-node="bannerRegen"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-learn="bannerRegen"]').isDisabled(), false);
    await page.locator('[data-learn="bannerRegen"]').click();
    await page.locator('[data-subject="realm"]').click();
    assert.equal(await page.locator('[data-ledger-stack="warBanner"]').count(), 0);
    assert.equal(await page.getByRole('button', {name: 'Battle', exact: true}).count(), 0);
    await page.locator('[data-ledger-stack="battle"]').click();
    assert.equal(await page.locator('[data-learn="gunpowder"]').count(), 1, 'important bomb research stays accessible');
    assert.equal(await page.locator('.banner-tree').count(), 0);
    await page.locator('[data-subject="spells"]').click();
    await page.locator('[data-ledger-stack="warBanner"]').click();
    await pick('warBanner');
    await page.evaluate(() => { window.bannerSave.settings.instantResearch = false; window.bannerStudy.render(); });
    await page.locator('[data-learn="warBanner"]').click();
    assert.equal(await page.locator('.banner-tree').count(), 0, 'tree disappears during timed research');
    assert.equal(await page.locator('.research-stage').count(), 1);
    await page.locator('[data-cancel-research]').click();
    await page.locator('[data-cancel-research]').click();
    assert.equal(await page.locator('.banner-tree [data-node]').count(), 8, 'tree returns on cancellation');
    const geometry = await page.locator('.banner-tree').evaluate(host => {
      const box = host.getBoundingClientRect();
      return { host: {top:box.top,bottom:box.bottom,left:box.left,right:box.right}, nodes: [...host.querySelectorAll('[data-node]')].map(node => { const b = node.getBoundingClientRect(); return {id:node.dataset.node,top:b.top,bottom:b.bottom,left:b.left,right:b.right}; }) };
    });
    assert.ok(geometry.nodes.every(n => n.top >= geometry.host.top && n.bottom <= geometry.host.bottom && n.left >= geometry.host.left && n.right <= geometry.host.right), `all nodes fit the tree: ${JSON.stringify(geometry)}`);
    const overflow = await page.locator('.banner-research').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert.equal(overflow, false, `research overflows at ${width}`);
    await page.screenshot({ path: `test-results/defend-banner-study-${width}.png` });
    // The real Library room uses the same tree and persists purchases.
    await page.evaluate(() => {
      window.bannerSave.settings.instantResearch = true;
      window.bannerSave.settings.developerMode = true;
      localStorage.setItem('towerdefense.v1', JSON.stringify(window.bannerSave));
    });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
    await page.waitForSelector('#defend-start');
    await page.locator('nav [data-tab="library"]').click();
    await page.locator('#library-study').click();
    await page.locator('#library-chamber [data-subject="spells"]').click();
    await page.locator('#library-chamber [data-ledger-stack="warBanner"]').click();
    assert.equal(await page.locator('#library-chamber .banner-tree [data-node]').count(), 8);
    assert.equal(await page.locator('#library-chamber [data-banner-tree] > .magic-circle').count(), 1, 'circle belongs behind the banner tree');
    await page.locator('#library-chamber .banner-tree [data-node="warBanner"]').click();
    assert.equal(await page.locator('#library-chamber [data-learn="warBanner"]').isDisabled(), false, await page.locator('#library-chamber .banner-tree-detail').textContent());
    await page.locator('#library-chamber [data-learn="warBanner"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')).skills.warBanner), 2);
    await page.locator('#library-chamber .banner-tree').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/defend-banner-library-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('War banner pointer placement, cooldown fill, ready outline and research branches passed on desktop/mobile.');
} finally { await browser.close(); }
