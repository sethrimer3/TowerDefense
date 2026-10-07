import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const url = (process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-stress.html?manual&enemies=100';
  mkdirSync('test-results', { recursive: true });
  await page.goto(url);
  await page.waitForFunction(() => window.stressPage);
  const build = async () => page.evaluate(() => {
    const p = window.stressPage;
    p.phase = 'build'; p.sim = null; p.save.startWave = 1;
    p.save.speed3 = true; p.hideBanner(); p.renderChrome(); p.relayout();
  });
  const geometry = async ids => page.evaluate(ids => {
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, center: r.x + r.width / 2, width: r.width }; };
    return { head: rect(document.querySelector('.defend-head')), buttons: ids.map(id => rect(document.querySelector(id))) };
  }, ids);
  for (const [width, height] of [[1040, 800], [630, 565], [390, 844], [360, 640]]) {
    await page.setViewportSize({ width, height });
    await build();
    let g = await geometry(['#defend-side-toggle', '#defend-upgrades', '#defend-start', '#defend-wave', '#defend-journal', '#defend-cog']);
    for (let i = 1; i < g.buttons.length; i++) assert.ok(g.buttons[i].x >= g.buttons[i - 1].right - 1, `build controls overlap at ${width}: ${JSON.stringify(g)}`);
    assert.ok(Math.abs(g.buttons[2].center - g.head.center) < 1, 'Start Defense centered');
    assert.equal(await page.locator('#defend-start').textContent(), 'Start Defense');
    assert.equal(await page.locator('#defend-upgrades canvas').count(), 1);
    await page.waitForFunction(() => [...document.querySelector('.defend-wave-wall').getContext('2d').getImageData(0, 0, 64, 16).data].some(v => v));
    await page.screenshot({ path: `test-results/defend-controls-build-${width}.png` });
    await page.locator('#defend-start').click();
    assert.equal(await page.locator('#defend-side-toggle').count(), 1);
    g = await geometry(['#defend-side-toggle', '#defend-abandon', '#defend-hud', '#defend-speed', '#defend-journal', '#defend-cog']);
    for (let i = 1; i < g.buttons.length; i++) assert.ok(g.buttons[i].x >= g.buttons[i - 1].right - 1, `battle controls overlap at ${width}: ${JSON.stringify(g)}`);
    assert.ok(Math.abs(g.buttons[2].center - g.head.center) < 1, 'keep and wave centered');
    await page.evaluate(() => window.stressPage.keepBricks.step(0));
    await page.screenshot({ path: `test-results/defend-controls-battle-${width}.png` });
    await page.evaluate(() => { const p = window.stressPage; p.sim.wave = 1; p.sim.stats.begin(1, 20, 500); p.sim.stats.current.keep = 998; p.endRun(); });
    await page.locator('.defeat-chart').first().click();
    assert.equal(await page.evaluate(() => window.stressPage.phase), 'over', 'chart click must leave report open');
    await page.locator('#defend-canvas').click({ position: { x: 3, y: 3 } });
    assert.equal(await page.evaluate(() => window.stressPage.phase), 'over', 'board click must leave report open');
    await page.locator('.defeat-stat').first().click();
    assert.equal(await page.evaluate(() => window.stressPage.phase), 'over', 'stat click must leave report open');
    const fit = await page.locator('#defend-banner').evaluate(el => {
      const footer = el.querySelector('.defeat-actions').getBoundingClientRect(), r = el.getBoundingClientRect(), body = el.querySelector('.defeat-body');
      return { bottom: footer.bottom, top: footer.top, reportBottom: r.bottom, reportTop: r.top, scroll: body.scrollHeight, height: body.clientHeight };
    });
    assert.ok(fit.bottom <= fit.reportBottom && fit.top >= fit.reportTop, 'Close stays in report');
    assert.ok(fit.bottom <= height, 'Close stays in viewport');
    assert.ok(fit.scroll <= fit.height + 1, `compact report fits without scrolling at ${width}: ${JSON.stringify(fit)}`);
    await page.screenshot({ path: `test-results/defend-controls-defeat-${width}.png` });
    await page.locator('.defeat-actions button').click();
    assert.equal(await page.evaluate(() => window.stressPage.phase), 'build');
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.stressPage.endRun());
    await page.locator('.defeat-close').click();
    assert.equal(await page.evaluate(() => window.stressPage.phase), 'build');
  }
  await build();
  await page.evaluate(() => {
    window.stressPage.host.persist = () => { window.savedDefend = JSON.stringify(window.stressPage.save); };
    window.stressPage.save.battleSpeed = 1;
  });
  await page.locator('#defend-start').click();
  await page.locator('#defend-speed').click();
  assert.equal(await page.locator('#defend-speed').textContent(), '2×');
  await page.evaluate(() => window.stressPage.endRun());
  await page.locator('.defeat-actions button').click();
  await page.locator('#defend-start').click();
  assert.equal(await page.locator('#defend-speed').textContent(), '2×');
  await page.locator('#defend-speed').click();
  assert.equal(await page.locator('#defend-speed').textContent(), '3×');
  const saved = await page.evaluate(() => window.savedDefend);
  await page.reload(); await page.waitForFunction(() => window.stressPage);
  await build();
  await page.evaluate(async saved => {
    const { decodeDefendSave } = await import('/src/defend/progress.ts');
    Object.assign(window.stressPage.save, decodeDefendSave(JSON.parse(saved)));
    window.stressPage.renderChrome();
  }, saved);
  await page.locator('#defend-start').click();
  assert.equal(await page.locator('#defend-speed').textContent(), '3×');
  await page.locator('#defend-speed').click();
  assert.equal(await page.locator('#defend-speed').textContent(), '1×');
  await build();
  const wallHashes = await page.evaluate(() => {
    const p = window.stressPage, hashes = [];
    p.save.unlockedWave = 200;
    for (const wave of [21, 41, 61, 81, 101, 121, 141, 161, 181]) {
      p.save.startWave = wave; p.renderControls();
      const canvas = document.querySelector('.defend-wave-wall');
      let hash = 0;
      for (const byte of canvas.getContext('2d').getImageData(0, 0, 64, 16).data) hash = (Math.imul(hash, 31) + byte) | 0;
      hashes.push(hash);
    }
    return hashes;
  });
  assert.equal(new Set(wallHashes).size, 9, 'each later zone uses distinct wall artwork');
  await page.screenshot({ path: 'test-results/defend-controls-zone-wall.png' });
  // A fresh browser context checks the real shell and actual storage.
  const app = await browser.newPage({ viewport: { width: 390, height: 844 } });
  app.on('pageerror', e => errors.push(e.message));
  await app.addInitScript(() => {
    if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2, defend: { speed3: true, battleSpeed: 2 } }));
  });
  await app.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
  await app.locator('#defend-start').click();
  assert.match(await app.locator('#defend-speed').textContent(), /^2/);
  await app.locator('#defend-speed').click();
  assert.match(await app.locator('#defend-speed').textContent(), /^3/);
  assert.equal(await app.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')).defend.battleSpeed), 3);
  await app.reload(); await app.locator('#defend-start').click();
  assert.match(await app.locator('#defend-speed').textContent(), /^3/);
  assert.deepEqual(errors, []);
  console.log('Defend controls, centers, artwork, speed save/reload, explicit defeat closing and compact desktop/mobile reports passed.');
} finally { await browser.close(); }

