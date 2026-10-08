// Isolated browser contexts: never access a player's save or browser profile.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  for (const [width, height] of [[1040, 800], [390, 844], [360, 640]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#developer-mode').isChecked(), false);
    assert.equal(await page.locator('#dev-all').count(), 0);
    await page.locator('#developer-mode').check();
    assert.equal(await page.locator('#dev-mode').isChecked(), false);
    await page.locator('#dev-all').check();
    await page.locator('#developer-mode').uncheck();
    assert.equal(await page.locator('#dev-all').count(), 0);
    const disabled = await page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')).settings);
    for (const key of ['developerMode', 'devMode', 'devTowers', 'instantResearch', 'devSmithy', 'devCommand', 'devStewardship', 'devMine', 'devLibrary']) assert.equal(disabled[key], false, key);
    await page.locator('nav [data-tab="defend"]').click();
    await page.locator('#defend-wave').click();
    assert.equal(await page.locator('[data-unit-tester]').count(), 0);
    await page.locator('[data-wave-close]').click();
    await page.locator('nav [data-tab="settings"]').click();
    await page.locator('#developer-mode').check();
    await page.reload();
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#developer-mode').isChecked(), true, 'master switch persists');
    await page.locator('nav [data-tab="defend"]').click();
    await page.locator('#defend-wave').click();
    await page.locator('[data-unit-tester]').click();
    assert.equal(await page.locator('#defend-start').textContent(), 'Start Tester');
    await page.locator('#defend-start').click();
    await page.locator('#defend-side-toggle').click();
    const catalog = await page.evaluate(async () => Object.keys((await import('/src/defend/catalog.ts')).ENEMIES));
    assert.equal(await page.locator('[data-enemy]').count(), catalog.length);
    assert.equal(await page.locator('[data-item]').count(), 0);
    assert.equal(await page.locator('[data-enemy] canvas[data-portrait]').count(), catalog.length);
    const names = await page.locator('[data-enemy] span').evaluateAll(nodes => nodes.every(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0));
    assert.equal(names, true, 'enemy names remain visible on mobile');
    await page.locator('[data-enemy="fernMantis"]').click();
    await page.screenshot({ path: `test-results/defend-unit-tester-${width}.png` });
    const fits = await page.evaluate(() => {
      const head = document.querySelector('.defend-head').getBoundingClientRect();
      const ids = ['#defend-side-toggle', '#defend-abandon', '#defend-hud', '#defend-speed', '#defend-journal', '#defend-cog'];
      const boxes = ids.map(id => document.querySelector(id).getBoundingClientRect());
      return boxes.every((r, i) => r.x >= head.x - 1 && r.right <= head.right + 1 && (!i || r.x >= boxes[i - 1].right - 1));
    });
    assert.equal(fits, true, `tester header fits at ${width}`);
    await page.locator('nav [data-tab="settings"]').click();
    await page.locator('#developer-mode').uncheck();
    await page.locator('nav [data-tab="defend"]').click();
    assert.equal(await page.locator('#defend-start').textContent(), 'Start Defense', 'disabling master exits tester');
    assert.equal(await page.locator('[data-enemy]').count(), 0);
    assert.deepEqual(errors, []);
    await context.close();
  }

  // Inspect simulation counts through the existing standalone Defend fixture.
  const context = await browser.newContext({ viewport: { width: 1040, height: 800 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + 'tests/defend-stress.html?manual&enemies=100');
  await page.waitForFunction(() => window.stressPage);
  await page.evaluate(() => {
    const p = window.stressPage;
    p.phase = 'build'; p.sim = null; p.host.devMode = () => true;
    p.renderChrome(); p.relayout();
    requestAnimationFrame(function frame(now) { p.frame(now); requestAnimationFrame(frame); });
  });
  await page.locator('#defend-wave').click();
  await page.locator('[data-unit-tester]').click();
  await page.locator('#defend-start').click();
  await page.locator('#defend-side-toggle').click();
  const count = () => page.evaluate(() => window.stressPage.sim.enemies.length);
  await page.waitForTimeout(1800);
  assert.equal(await count(), 0, 'empty tester has no automatic spawns');
  const mantis = page.locator('[data-enemy="fernMantis"]');
  await mantis.click();
  assert.equal(await count(), 1, 'single click summons exactly one');
  const box = await mantis.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(820);
  await page.mouse.up();
  const held = await count();
  assert.ok(held >= 5, `hold summons repeatedly: ${held}`);
  await page.waitForTimeout(350);
  assert.equal(await count(), held, 'release stops repeats and adds no click duplicate');
  await mantis.focus();
  await page.keyboard.press('Enter');
  assert.equal(await count(), held + 1, 'keyboard activation summons one');
  await page.mouse.down();
  await page.evaluate(() => window.stressPage.pause());
  const paused = await count();
  await page.waitForTimeout(450);
  await page.mouse.up();
  assert.equal(await count(), paused, 'leaving the tab cancels hold');
  await page.mouse.down();
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const blurred = await count();
  await page.waitForTimeout(450); await page.mouse.up();
  assert.equal(await count(), blurred, 'blur cancels hold');
  await page.mouse.down();
  await mantis.dispatchEvent('pointercancel');
  const cancelled = await count();
  await page.waitForTimeout(450); await page.mouse.up();
  assert.equal(await count(), cancelled, 'pointer cancellation stops hold');
  await page.evaluate(() => {
    const p = window.stressPage;
    for (const e of p.sim.enemies) e.hp = 0;
    p.host.earnWave = () => { throw new Error('tester paid a wave'); };
  });
  await page.waitForTimeout(1800);
  assert.equal(await count(), 0, 'tester remains empty after kills');
  assert.equal(await page.evaluate(() => window.stressPage.save.discovered.length), 0, 'tester does not discover enemies');
  assert.equal(await page.evaluate(() => window.stressPage.save.bestWave), 0, 'tester does not advance best wave');
  await mantis.click();
  assert.equal(await count(), 1, 'summoning can resume after clearing enemies');
  await page.locator('#defend-abandon').click(); await page.locator('#defend-abandon').click();
  await page.locator('[data-defeat-close]').first().click();
  await page.locator('#defend-wave').click(); await page.locator('[data-wave="1"]').click();
  assert.equal(await page.locator('#defend-start').textContent(), 'Start Defense');
  await page.locator('#defend-start').click();
  assert.equal(await page.locator('[data-enemy]').count(), 0, 'normal battle restores skills palette');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('Developer gate, tester selection, all portraits, mobile fit, summons, hold cancellation and reward isolation passed.');
} finally { await browser.close(); }
