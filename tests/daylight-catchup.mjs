// Real app settings and clock with queued idle work. Isolated saves only.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 7,
      profile: { name: 'Solar Catchup Tester', flag: { base: 3, layers: [] } },
      settings: { developerMode: true, soundOff: true, ambienceOff: true },
    })); });
    await page.goto(base); await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#faster-sun-catchup').isChecked(), true);
    assert.equal(await page.locator('#faster-sun-catchup').isDisabled(), false);
    await page.evaluate(async () => {
      const urls = performance.getEntriesByType('resource').map(e => e.name).filter(url => new URL(url).pathname === '/src/daylight.ts');
      for (const url of [...urls.reverse(), '/src/daylight.ts']) {
        const module = await import(url);
        if (module.worldSky()) { window.readSolar = module.worldSky; break; }
      }
    });
    const now = new Date(); await page.clock.install({ time: now });
    await page.clock.pauseAt(new Date(now.getTime() + 1000));
    // Queue a full day through the app's own developer control; clock options
    // must not alter how quickly that economic work is settled.
    await page.locator('#dev-idle-day').evaluate(el => el.click());
    await page.clock.runFor(32);
    const read = () => page.evaluate(() => ({ sky: window.readSolar(), save: JSON.parse(localStorage.getItem('towerdefense.v1')) }));
    const first = await read();
    assert.ok(first.save.library.idleMs > 5000 && first.save.mine.idleMs > 5000);
    await page.clock.runFor(1000); const boosted = await read();
    const difference = (a, b) => (b - a + 300000) % 300000;
    assert.ok(Math.abs(difference(first.sky.time, boosted.sky.time) - 5000) < 150, 'catch-up advances the shared sun at 5x');
    await page.locator('#faster-sun-catchup').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
    const off = await read(); assert.equal(off.save.settings.fasterSunCatchup, false);
    assert.ok(off.save.library.idleMs < first.save.library.idleMs, 'economic catch-up is running');
    await page.clock.runFor(1000); const normal = await read();
    assert.ok(Math.abs(difference(off.sky.time, normal.sky.time) - 1000) < 50, 'turning faster sun off keeps normal speed during catch-up');
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    const settled = await read();
    assert.ok(settled.save.library.idleMs < off.save.library.idleMs, 'disabling fast sun does not disable economic catch-up');
    await page.locator('#day-night-cycle').evaluate(el => { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(await page.locator('#faster-sun-catchup').isDisabled(), true);
    await page.locator('#time-of-day').evaluate(el => { el.value = 'sunset'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    const held = await read(); await page.clock.runFor(1000);
    assert.deepEqual((await read()).sky, held.sky, 'fixed sunset remains fixed during catch-up');
    await page.clock.resume(); await page.reload(); await page.locator('#loading-screen').waitFor({ state: 'detached' });
    await page.locator('nav [data-tab="settings"]').click();
    assert.equal(await page.locator('#faster-sun-catchup').isChecked(), false, 'the opt-out survives reload');
    assert.equal(await page.locator('#time-of-day').inputValue(), 'sunset');
    assert.deepEqual(errors, []);
    console.log(`solar catch-up ${width}: 5x on, normal speed off, economic work unchanged, fixed phases and persistence passed`);
    await page.close();
  }
} finally { await browser.close(); }
