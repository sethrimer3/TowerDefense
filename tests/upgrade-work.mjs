// Real app, fresh browser contexts: never opens a player save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
const tab = (page, id) => page.locator(`nav [data-tab="${id}"]`).click();
async function study(page, subject = 'city', topic = 'walls') {
  await tab(page, 'library');
  if (!await page.locator('#library').evaluate(el => el.classList.contains('descended'))) await page.locator('#library-study').click();
  if (await page.locator('#library-chamber .research-stage').count()) return;
  await page.locator('#library-chamber [data-subject="' + subject + '"]').click();
  const choice = page.locator('#library-chamber [data-ledger-stack="' + topic + '"]');
  if (await choice.count()) await choice.click();
}
async function smithy(page) { await tab(page, 'mine'); await page.locator('#mine-smithy').click(); }
async function reloadWith(page, mutate, value) {
  await page.evaluate(({ mutate, value }) => {
    sessionStorage.setItem('work-clock-adjustment', JSON.stringify({ mutate, value }));
  }, { mutate, value });
  await page.reload(); await page.waitForSelector('#defend-start');
}
try {
  for (const width of [1280, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { MineSim } = await import('/src/mine/sim.ts');
      const { LibrarySim } = await import('/src/library/sim.ts');
      const { BUILDINGS } = await import('/src/mine/buildings.ts');
      const now = Date.now(), s = defaults();
      s.smithy = { copper: 100000, silver: 100000, gold: 100000 }; s.knowledge = 1000000;
      s.settings.reduceMotion = true; s.settings.soundOff = true; s.settings.ambienceOff = true;
      const mine = new MineSim(7); for (const b of BUILDINGS) mine.setLevel(b, 5);
      while (mine.miners.length < 10) mine.hire(); mine.setJobs(2, 3);
      s.mine = mine.save(now);
      const library = new LibrarySim(7); library.furnish(40); library.upgradeLab(); library.upgradeLab();
      for (let n = 0; n < 3; n++) library.hire('researcher'); library.hire('professor'); library.hire('shelver');
      s.library = library.save(now); s.training.troopHp = 49;
      return s;
    });
    // Seed after the previous page's pagehide handler saves its live state.
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('work-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('work-fixture-seeded', 'yes');
      }
      const adjustment = sessionStorage.getItem('work-clock-adjustment');
      if (adjustment) {
        const { mutate, value } = JSON.parse(adjustment);
        const s = JSON.parse(localStorage.getItem('towerdefense.v1'));
        if (mutate === 'crew') {
          if (!value) sessionStorage.setItem('work-researchers', JSON.stringify(s.library.crew.filter(c => c.role === 'researcher').map(c => c.name)));
          const names = JSON.parse(sessionStorage.getItem('work-researchers'));
          for (const c of s.library.crew) if (names.includes(c.name)) c.role = value ? 'researcher' : 'shelver';
        } else s[mutate === 'research' ? 'researchClock' : 'forgeClock'] -= value;
        localStorage.setItem('towerdefense.v1', JSON.stringify(s));
        sessionStorage.removeItem('work-clock-adjustment');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await study(page);
    await page.locator('#library-chamber .magic-circle').evaluate(c => window.__workCircle = c);
    const originalFormation = await page.locator('#library-chamber .magic-circle').getAttribute('data-formation');
    assert.match(await page.locator('[data-learn="masonry"]').textContent(), /1m 40s with 3 researchers/);
    await page.locator('[data-learn="masonry"]').click();
    assert.equal((await state(page)).skills.masonry, 0);
    assert.equal((await state(page)).researchJob.kind, 'skill');
    assert.equal((await state(page)).researchJob.paid, 1);
    assert.equal(await page.locator('[data-learn="bastions"]').count(), 0, 'the tree is removed during research');
    assert.equal(await page.locator('#library-chamber .ledger-collection').count(), 0, 'collection is removed during research');
    assert.equal(await page.locator('#library-chamber .magic-circle').evaluate(c => c === window.__workCircle), true, 'research reuses the live circle');
    assert.equal(await page.locator('#library-chamber .magic-circle').getAttribute('data-formation'), originalFormation, 'pending research grants no Knowledge early');
    const centered = await page.locator('.research-orbit').evaluate(el => {
      const a = el.querySelector('.magic-circle').getBoundingClientRect(), b = el.querySelector('.research-upgrade').getBoundingClientRect();
      return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) < 1 && Math.abs(a.y + a.height / 2 - b.y - b.height / 2) < 1;
    });
    assert.equal(centered, true, 'upgrade is at the circle center');
    await page.screenshot({ path: `test-results/research-focus-skill-${width}.png` });
    const progress = await page.locator('[data-research-progress]').evaluate(p => p.value);
    const before = (await state(page)).researchJob.left;
    await page.waitForTimeout(1300);
    await page.waitForFunction(before => document.querySelector('[data-research-progress]').value > before, progress);
    assert.ok((await page.locator('[data-research-timer]').first().textContent()).includes('remaining'));
    await reloadWith(page, 'research', before / 3 + 10000);
    assert.equal((await state(page)).skills.masonry, 1, 'offline completion once');
    assert.equal((await state(page)).researchJob, null);
    await study(page);
    assert.equal(await page.locator('.research-stage').count(), 0, 'completion restores the tree');
    assert.equal(await page.locator('[data-learn="bastions"]').isDisabled(), false);
    await page.locator('[data-learn="masonry"]').click();
    const paid = (await state(page)).researchJob.paid;
    assert.equal(paid, 1001);
    await page.locator('[data-cancel-research]').click();
    assert.equal(await page.locator('.research-stage').count(), 0, 'cancellation restores the tree');
    assert.equal(await page.locator('[data-learn="masonry"]').evaluate(b => b === document.activeElement), true, 'cancel returns keyboard focus');
    assert.equal((await state(page)).researchJob, null);
    assert.equal((await state(page)).skills.masonry, 1);

    await study(page, 'spells', 'meteor');
    await page.locator('[data-pick="starfall:0"]').click();
    await page.locator('[data-learn-path="starfall"]').click();
    assert.equal((await state(page)).pathResearch.starfall, undefined);
    assert.equal((await state(page)).researchJob.kind, 'path');
    assert.equal(await page.locator('.path-tree').count(), 0, 'spell tree disappears');
    assert.equal(await page.locator('.research-stage').evaluate(el => el.scrollTop), 0, 'research starts at the top of its new view');
    assert.equal(await page.locator('.research-title h3').textContent(), 'Shattered sky');
    await reloadWith(page, 'crew', 0); await study(page);
    await page.waitForFunction(() => document.querySelector('[data-research-timer]').textContent.includes('Paused'));
    assert.equal(await page.locator('#library-chamber .magic-circle').getAttribute('data-motif'), 'triangles', 'reload restores the project topic');
    const paused = await page.locator('[data-research-progress]').evaluate(p => p.value);
    await page.waitForTimeout(1200);
    assert.equal(await page.locator('[data-research-progress]').evaluate(p => p.value), paused, 'no crew preserves progress');
    await page.screenshot({ path: `test-results/research-focus-paused-${width}.png` });
    await reloadWith(page, 'crew', 3); await study(page);
    await page.waitForFunction(() => document.querySelector('[data-research-timer]').textContent.includes('remaining'));
    await page.screenshot({ path: `test-results/research-focus-spell-${width}.png` });
    await reloadWith(page, 'research', 200000);
    assert.equal((await state(page)).pathResearch.starfall.rank, 1);

    await smithy(page);
    const high = page.locator('[data-train="troopHp"]');
    assert.match(await high.textContent(), /12006/);
    assert.equal(await high.locator('[aria-label="12006 gold"]').count(), 1, 'high rank uses the gold bill');
    await high.click();
    assert.equal((await state(page)).training.troopHp, 49);
    await page.locator('[data-upgrade="soldierArms"]').click();
    const s = await state(page);
    assert.equal(s.defend.levels.soldierArms, 0); assert.ok(s.forgeJob);
    assert.equal(s.forgeJob.smiths.length, 1);
    assert.notEqual(s.forgeJob.smiths[0], s.trainingJobs[0].smiths[0]);
    await page.locator('[data-more-forge]').click();
    assert.equal((await state(page)).forgeJob.smiths.length, 2);
    await reloadWith(page, 'forge', 120000);
    assert.equal((await state(page)).defend.levels.soldierArms, 1);
    assert.equal((await state(page)).forgeJob, null);
    await smithy(page);
    assert.equal(await page.locator('[data-upgrade="soldierArms"]').isDisabled(), false);
    await page.screenshot({ path: `test-results/upgrade-work-smithy-${width}.png` });
    await study(page);
    await page.locator('[data-learn="masonry"]').click();
    const fit = await page.locator('.research-stage').evaluate(el => {
      const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && el.scrollWidth <= el.clientWidth + 1;
    });
    assert.equal(fit, true, 'project controls fit');
    await page.screenshot({ path: `test-results/upgrade-work-study-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Timed Knowledge, paths and Forge; shared smiths; offline completion; refund controls and mobile layout passed.');
} finally { await browser.close(); }
