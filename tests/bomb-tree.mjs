// Real Study, isolated saves: ordered bomb research, cancellation and reload.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? {executablePath:process.env.PLAYWRIGHT_EXECUTABLE}
  : {channel:process.env.PLAYWRIGHT_CHANNEL ?? 'chrome'});
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', {recursive:true});
try {
 for (const width of [1100,390]) {
  const context = await browser.newContext({viewport:{width,height:width<500?844:1000},hasTouch:width<500});
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForSelector('#defend-start');
  const fixture = await page.evaluate(async () => {
   const {defaults} = await import('/src/save.ts'), {LibrarySim} = await import('/src/library/sim.ts');
   const s = defaults(), library = new LibrarySim(7);
   s.knowledge = 100000; s.settings.reduceMotion = s.settings.soundOff = s.settings.ambienceOff = true;
   library.furnish(16); library.upgradeLab(); library.hire('researcher');
   s.library = library.save(Date.now()); return s;
  });
  await context.addInitScript(fixture => {
   if (!sessionStorage.getItem('bomb-seeded')) {
    localStorage.setItem('towerdefense.v1', JSON.stringify(fixture)); sessionStorage.setItem('bomb-seeded','1');
   }
   const elapsed = sessionStorage.getItem('bomb-elapsed');
   if (elapsed) {
    const s = JSON.parse(localStorage.getItem('towerdefense.v1'));
    s.researchClock -= Number(elapsed); localStorage.setItem('towerdefense.v1',JSON.stringify(s));
    sessionStorage.removeItem('bomb-elapsed');
   }
  }, fixture);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
  async function study() {
   await page.locator('nav [data-tab="library"]').click(); await page.locator('#library-study').click();
   if (!await page.locator('#library-chamber .research-stage').count()) {
    await page.locator('#library-chamber [data-subject="spells"]').click();
    await page.locator('#library-chamber [data-ledger-stack="battle"]').click();
   }
  }
  async function reload() { await page.reload(); await page.waitForSelector('#defend-start'); await study(); }
  const node = rank => page.locator(`#library-chamber .bomb-tree [data-node="gunpowder:${rank}"]`);
  await reload();
  await page.locator('#library-chamber [data-subject="realm"]').click();
  assert.equal(await page.locator('#library-chamber [data-ledger-stack="battle"]').count(),0);
  await page.locator('#library-chamber [data-subject="spells"]').click();
  await page.locator('#library-chamber [data-ledger-stack="battle"]').click();
  assert.equal(await page.locator('#library-chamber .bomb-tree [data-node]').count(),4);
  assert.equal(await page.locator('#library-chamber [data-bomb-tree] > .magic-circle').getAttribute('data-motif'),'triangles');
  await node(2).click();
  assert.match(await page.locator('#library-chamber .banner-tree-detail').textContent(),/Learn the previous rank first/);
  assert.equal(await page.locator('#library-chamber [data-learn="gunpowder"]').count(),0);
  await node(0).click();
  const knowledge = (await stored()).knowledge;
  await page.locator('#library-chamber [data-learn="gunpowder"]').click();
  assert.equal((await stored()).skills.gunpowder,0,'pending research grants no rank');
  assert.equal((await stored()).researchJob.paid,2);
  assert.equal(await page.locator('#library-chamber .bomb-tree').count(),0);
  await reload(); assert.equal(await page.locator('#library-chamber .research-stage').count(),1,'pending project restores');
  await page.locator('#library-chamber [data-cancel-research]').click();
  assert.ok((await stored()).researchJob,'first cancellation click only asks');
  await page.locator('#library-chamber [data-cancel-research]').click();
  assert.equal((await stored()).knowledge,knowledge,'confirmed cancellation refunds actual cost');
  for (let rank=0;rank<3;rank++) {
   await node(rank).click(); await page.locator('#library-chamber [data-learn="gunpowder"]').click();
   const job = (await stored()).researchJob;
   assert.equal(job.rank,rank);
   await page.evaluate(elapsed => sessionStorage.setItem('bomb-elapsed',String(elapsed)),job.left+5000);
   await reload(); assert.equal((await stored()).skills.gunpowder,rank+1);
   assert.match(await node(rank).getAttribute('class'),/owned/);
   if(rank<2) assert.match(await node(rank+1).getAttribute('class'),/next/);
  }
  await node(0).click();
  assert.match(await page.locator('#library-chamber .banner-tree-detail').textContent(),/Researched/);
  assert.equal(await page.locator('#library-chamber [data-learn="gunpowder"]').count(),0,'completed ranks cannot buy another rank');
  const fit = await page.locator('#library-chamber .bomb-tree').evaluate(host => {
   const h=host.getBoundingClientRect(); return [...host.querySelectorAll('[data-node]')].every(n=>{const b=n.getBoundingClientRect();return b.left>=h.left&&b.right<=h.right&&b.top>=h.top&&b.bottom<=h.bottom;});
  }); assert.ok(fit,'all four nodes fit');
  await page.locator('#library-chamber .bomb-tree').scrollIntoViewIfNeeded();
  await page.screenshot({path:`test-results/bomb-tree-${width}.png`});
  await page.locator('nav [data-tab="mine"]').click(); await page.locator('#mine-smithy').click();
  await page.locator('#mine-chamber [data-subject="spells"]').click();
  await page.locator('#mine-chamber [data-ledger-stack="battle"]').click();
  assert.equal(await page.locator('#mine-chamber [data-upgrade="bombSafe"]').count(),1);
  assert.equal(await page.locator('#mine-chamber [data-train="bombDamage"]').count(),1);
  await page.locator('#mine-chamber [data-subject="realm"]').click();
  await page.locator('#mine-chamber [data-ledger-stack="troops"]').click();
  assert.equal(await page.locator('#mine-chamber [data-buy-speed3]').count(),1,'War drums remains available');
  assert.deepEqual(errors,[]); await context.close();
  console.log(`${width}px: bomb Knowledge tree, ordered ranks, timed research, cancellation, reload and Smithy access passed`);
 }
} finally {await browser.close();}
