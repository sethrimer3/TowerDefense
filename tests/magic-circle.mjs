// Actual app, isolated saves. Run with dev server and PLAYWRIGHT_EXECUTABLE.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
const tab = (page, id) => page.locator(`nav [data-tab="${id}"]`).click();
const study = async page => { await tab(page, 'library'); if (!await page.locator('#library').evaluate(el => el.classList.contains('descended'))) await page.locator('#library-study').click(); };
const pixels = page => page.locator('#library-chamber .magic-circle').evaluate(c => c.toDataURL());
try {
 for (const width of [1280, 390, 360]) {
  const context = await browser.newContext({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base); await page.waitForSelector('#defend-start');
  const fixture = await page.evaluate(async () => {
   const { defaults } = await import('/src/save.ts'); const s = defaults();
   Object.assign(s.settings, { developerMode: true, devMode: true, instantResearch: true, soundOff: true, ambienceOff: true });
   s.knowledge = 100000; s.smithy.copper = 100;
   s.defend.owned.barracks = 1; s.defend.kept = [{ kind: "barracks", path: "crusaders", rank: 1 }]; return s;
  });
  await context.addInitScript(fixture => {
   if (!sessionStorage.getItem('circle-seed')) { localStorage.setItem('towerdefense.v1', JSON.stringify(fixture)); sessionStorage.setItem('circle-seed', 'yes'); }
  }, fixture);
  await page.reload(); await page.waitForSelector('#defend-start');
  await page.evaluate(async () => {
   const urls = new Set(['/src/ui/ledger.ts']);
   for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/ui/ledger.ts') urls.add(e.name);
   for (const url of urls) {
    const { Ledger } = await import(url), render = Ledger.prototype.render;
    Ledger.prototype.render = function() { if (this.kind === 'study') window.__circleStudy = this; return render.call(this); };
   }
  });
  await study(page);
  await page.locator('#library-chamber [data-subject="spells"]').click();
  await page.locator('#library-chamber [data-ledger-stack="meteor"]').click();
  const canvas = page.locator('#library-chamber .magic-circle');
  await page.waitForTimeout(1900);
  assert.equal(await canvas.count(), 1);
  await canvas.evaluate(c => window.__originalCircle = c);
  assert.equal(await canvas.getAttribute('data-motif'), 'triangles');
  const original = await canvas.getAttribute('data-formation');
  const first = await pixels(page); await page.waitForTimeout(150);
  assert.notEqual(await pixels(page), first, 'idle animation moves');
  await page.screenshot({ path: `test-results/magic-study-${width}.png` });
  await page.locator('[data-pick="starfall:0"]').click();
  await page.locator('[data-learn-path="starfall"]').click();
  const upgraded = await canvas.getAttribute('data-formation'); assert.notEqual(upgraded, original);
  // A second purchase during the transformation must reuse canvas and state.
  await page.locator('[data-pick="starfall:1"]').click();
  await page.locator('[data-learn-path="starfall"]').click();
  assert.equal(await canvas.evaluate(c => c === window.__originalCircle), true);
  assert.equal(await canvas.count(), 1);
  await page.waitForTimeout(1900);
  await page.screenshot({ path: `test-results/magic-upgraded-${width}.png` });
  // The current UI has no unlearn button; exercise its existing handler.
  await page.evaluate(() => window.__circleStudy.unlearn('meteor'));
  await page.waitForTimeout(1900);
  assert.equal(await canvas.getAttribute('data-formation'), original, 'unlearning restores original DNA');
  // Starting timed research pulses now, but grants no visual rank early.
  await page.evaluate(() => {
   const ledger = window.__circleStudy;
   ledger.ctx.save().settings.instantResearch = false;
   window.__researchers = ledger.ctx.researchers;
   ledger.ctx.researchers = () => 1;
  });
  await page.locator('[data-pick="starfall:0"]').click();
  await page.locator('[data-learn-path="starfall"]').click();
  assert.equal(await canvas.getAttribute('data-formation'), original);
  assert.equal(await page.evaluate(() => window.__circleStudy.circle.transition.active), true);
  await page.locator('[data-cancel-research]').click();
  await page.evaluate(() => {
   const ledger = window.__circleStudy;
   ledger.ctx.save().settings.instantResearch = true;
   ledger.ctx.researchers = window.__researchers;
  });
  // Platform reduced-motion setting must freeze pixels, including on redraw.
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(250);
  const staticImage = await pixels(page); await page.waitForTimeout(200);
  assert.equal(await pixels(page), staticImage);
  await page.locator('[data-pick="starfall:0"]').click();
  await page.waitForTimeout(200); assert.equal(await pixels(page), staticImage, 'redraw leaves static formation alone');
  for (let n = 0; n < 4; n++) { await tab(page, 'defend'); await study(page); }
  assert.equal(await canvas.count(), 1); assert.equal(await canvas.evaluate(c => c === window.__originalCircle), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await tab(page, 'mine'); await page.locator('#mine-smithy').click();
  assert.equal(await page.locator('#mine-chamber .magic-circle').count(), 0);
  await tab(page, 'defend');
  // Capture the existing page instance using the same method as other browser tests.
  await page.evaluate(async () => {
   const urls = new Set(['/src/defend/ui.ts']);
   for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
   for (const url of urls) {
    const { DefendPage } = await import(url), frame = DefendPage.prototype.frame;
    DefendPage.prototype.frame = function(t) { window.__circlePage = this; return frame.call(this, t); };
   }
  });
  await page.waitForFunction(() => window.__circlePage);
  await page.evaluate(() => window.__circlePage.openSpecialty({ keep: true }));
  await page.waitForTimeout(250);
  const keep = page.locator('#defend-specialty .magic-circle');
  assert.equal(await keep.count(), 1);
  assert.equal(await keep.getAttribute('data-motif'), 'tesseract');
  const plain = await keep.getAttribute('data-formation');
  await page.locator('#defend-specialty [data-node="q:arrowLoops:1"]').click();
  await page.locator('[data-ug-buy="q:arrowLoops:1"]').click();
  assert.notEqual(await keep.getAttribute('data-formation'), plain);
  await page.screenshot({ path: `test-results/magic-keep-${width}.png` });
  await page.locator('[data-ug-respec]').click();
  assert.equal(await keep.getAttribute('data-formation'), plain);
  await page.locator('[data-specialty-close]').click();
  assert.equal(await page.locator('#defend-specialty .magic-circle').count(), 0);
  // Reproduce the user's Defend Barracks / Crusaders screenshot, not just Study.
  await page.evaluate(() => window.__circlePage.openSpecialty({ copy: 'barracks', wear: { path: 'crusaders', rank: 1 } }));
  await page.waitForTimeout(250);
  const background = page.locator('#defend-specialty .magic-circle');
  assert.equal(await background.count(), 1);
  assert.equal(await background.getAttribute('data-motif'), 'voronoi');
  assert.equal(await background.evaluate(c => {
   const pixels = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
   let gold = 0;
   for(let i=0;i<pixels.length;i+=4) if(pixels[i]>130 && pixels[i+1]>70 && pixels[i]>pixels[i+1]*1.1) gold++;
   return gold>200;
  }), true, 'gold geometry is actually painted in the Defend background');
  await page.screenshot({ path: `test-results/magic-barracks-${width}.png` });
  const beforeUndo = await background.getAttribute('data-formation');
  await page.locator('#defend-specialty [data-node="p:crusaders:1"]').click();
  await page.locator('#defend-specialty [data-ug-undo]').click();
  assert.notEqual(await background.getAttribute('data-formation'), beforeUndo);
  await page.locator('[data-specialty-close]').click();
  await page.evaluate(() => window.__circlePage.openSpecialty({ walls: true }));
  const wallCircle = page.locator('#defend-specialty .magic-circle');
  await page.waitForTimeout(100);
  assert.equal(await wallCircle.getAttribute('data-motif'), 'tesseract');
  const bareWalls = await wallCircle.getAttribute('data-formation');
  await page.locator('#defend-specialty [data-node="q:stonework:1"]').click();
  await page.locator('[data-ug-buy="q:stonework:1"]').click();
  assert.notEqual(await wallCircle.getAttribute('data-formation'), bareWalls);
  await page.locator('[data-ug-respec]').click();
  assert.equal(await wallCircle.getAttribute('data-formation'), bareWalls);
  await page.locator('[data-specialty-close]').click();
  assert.deepEqual(errors, []);
  console.log(`${width}px: purchases, unlearning, reduced motion, canvas persistence, navigation, keep upgrade/respec and cleanup passed`);
  await context.close();
 }
 // Isolated renderer: bounded trails, no RAF registration, static redraw,
 // interruption/resize, and representative paint cost (not a phone benchmark).
 const page = await browser.newPage(); await page.goto(base);
 const stats = await page.evaluate(async () => {
  const { MagicCircle } = await import('/src/magic-circle/render.ts');
  const { CIRCLE } = await import('/src/magic-circle/formation.ts');
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;inset:0;width:800px;height:800px'; document.body.append(host);
  const renderer = new MagicCircle('high'); renderer.attach(host);
  const state = { topic:'benchmark', motif:'voronoi', upgrades:[] }; renderer.set(state);
  let rafs = 0; const realRAF = window.requestAnimationFrame; window.requestAnimationFrame = () => { rafs++; return 0; };
  const times = [];
  for (let i = 0; i < 300; i++) {
   if(i % 47 === 0) renderer.set({...state, upgrades:[{id:'path:starfall',rank:i % 3}]});
   const t = performance.now(); renderer.frame(i * 40, false); times.push(performance.now()-t);
  }
  const bounded = renderer.trails.agents.every(a=>a.history.length<=CIRCLE.maxHistory);
  const agentCount = renderer.trails.agents.length;
  host.style.width = '300px'; renderer.frame(12040,true);
  const still = renderer.canvas.toDataURL(); renderer.frame(12080,true);
  const stable = still === renderer.canvas.toDataURL();
  window.requestAnimationFrame = realRAF;
  renderer.destroy(); host.remove(); times.sort((a,b)=>a-b);
  return { bounded, agentCount, rafs, stable, medianMs:times[150], p95Ms:times[285] };
 });
 assert.equal(stats.bounded,true); assert.equal(stats.rafs,0); assert.equal(stats.stable,true); assert.ok(stats.agentCount<=12);
 console.log('Renderer bounds/performance:', stats); await page.close();
} finally { await browser.close(); }
