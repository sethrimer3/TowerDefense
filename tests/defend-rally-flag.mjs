import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

// A double tap on the board in battle plants the free blue rally flag, which
// and the war banner replace each other; a double tap on the flag takes it
// away; with the triple tap setting it takes three. It drops in with a ring and flies off fading. Isolated stress fixture, no player saves.
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  for (const [width, touch] of [[1040, false], [390, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-stress.html?manual&enemies=100');
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(async () => {
      const p = window.stressPage;
      p.sim.plantBanner({ x: 30, y: 45 });
      for (let i = 0; i < 20; i++) await new Promise(requestAnimationFrame);
      p.fitView(); p.draw(false);
    });
    const canvas = await page.locator('#defend-canvas').boundingBox();
    const tapAt = async (x, y) => {
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    };
    const x = canvas.x + canvas.width * 0.6, y = canvas.y + canvas.height * 0.4;
    // One tap plants nothing.
    await tapAt(x, y);
    assert.equal(await page.evaluate(() => window.stressSim.warBanner.flag), false);
    await page.waitForTimeout(500);
    // Two quick taps plant the flag in the banner's place, again and again.
    for (const dx of [0, 120]) {
      await tapAt(x + dx, y); await page.waitForTimeout(80); await tapAt(x + dx, y);
      if (dx) {
        // Mid-fall, then landed with its ring spreading.
        await page.evaluate(() => window.stressPage.draw(false));
        await page.screenshot({ path: `test-results/defend-rally-flag-drop-${width}.png` });
      }
      const flag = await page.evaluate(() => { const b = window.stressSim.warBanner; return b && { flag: b.flag, x: b.x, y: b.y }; });
      assert.equal(flag?.flag, true, `double tap ${dx} at ${width}`);
      const want = await page.evaluate(([cx, cy]) => window.stressPage.renderer.toCell(cx, cy), [x + dx, y]);
      assert.ok(Math.abs(flag.x - want.fx) < 0.01 && Math.abs(flag.y - want.fy) < 0.01);
      await page.waitForTimeout(400);
    }
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-rally-flag-${width}.png` });
    // A double tap on the flag takes it away; it flies off.
    const fx = x + 128, fy = y - 6;
    await tapAt(fx, fy); await page.waitForTimeout(80); await tapAt(fx, fy);
    assert.equal(await page.evaluate(() => window.stressSim.warBanner), null, `flag taken away at ${width}`);
    await page.evaluate(() => window.stressPage.draw(false));
    await page.screenshot({ path: `test-results/defend-rally-flag-lift-${width}.png` });
    await page.waitForTimeout(400);
    // With the triple tap setting, two taps plant nothing and three do.
    await page.evaluate(() => { window.tripleTapFlag = true; });
    await tapAt(x, y); await page.waitForTimeout(80); await tapAt(x, y);
    assert.equal(await page.evaluate(() => window.stressSim.warBanner), null, `double tap ignored at ${width}`);
    await page.waitForTimeout(400);
    await tapAt(x, y); await page.waitForTimeout(80); await tapAt(x, y); await page.waitForTimeout(80); await tapAt(x, y);
    assert.equal(await page.evaluate(() => window.stressSim.warBanner?.flag), true, `triple tap at ${width}`);
    await page.evaluate(() => { window.tripleTapFlag = false; });
    await page.waitForTimeout(400);
    // The banner, off cooldown, takes the flag's place.
    assert.equal(await page.evaluate(() => { window.stressSim.time += 60; return window.stressSim.plantBanner({ x: 20, y: 20 }) && window.stressSim.warBanner.flag; }), false);
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Rally flag: double tap plants it free over the banner, again on it takes it away, the triple tap setting asks for three, and the banner replaces it, desktop and touch.');
} finally { await browser.close(); }
