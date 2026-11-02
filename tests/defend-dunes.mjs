// The Amber Desert's dunes in a real battle page: the gentle one-colour swells over
// all the ground, trails walked into them, blast craters, no sand over the
// wall, and tumbleweeds of several sizes, desktop and phone. Isolated
// stress fixture, no player saves. Screenshots go to test-results/.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
mkdirSync('test-results', { recursive: true });
try {
  for (const [name, viewport] of [['1280', { width: 1280, height: 1400 }], ['390', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on('pageerror', e => errors.push(e.stack));
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-stress.html?enemies=100');
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(() => { const p = window.stressPage; p.save.startWave = 21; p.save.unlockedWave = 200; p.phase = 'build'; p.sim = null; p.renderChrome(); p.relayout(); });
    await page.locator('#defend-start').click();
    await page.evaluate(() => window.stressPage.fastForward(2));
    await page.evaluate(() => {
      const s = window.stressPage.sim;
      for (let k = 0; k < 5; k++) s.explode(8 + k * 12, 10 + (k % 2) * 8, { r: 1 + k * .4, damage: 0, friendlyFire: false });
      for (let k = 0; k < 30; k++) s.spawnAuxiliary('duneScorpion', 4 + k * 2, 2 + (k % 4));
    });
    await page.waitForTimeout(4000);
    const state = await page.evaluate(() => {
      const p = window.stressPage, env = p.sim.atmosphere, m = p.renderer.atmosphere.marks;
      return {
        mode: env.mode, grains: 'grains' in env, sizes: [...new Set(env.weeds.map(w => w.size))].length,
        wind: env.wind, active: m.active.size, dug: m.delta.some(v => v < -1), rims: m.delta.some(v => v > .5), spill: 'spill' in m,
      };
    });
    assert.equal(state.mode, 'sand'); assert.equal(state.grains, false);
    assert.ok(state.sizes > 1, 'tumbleweeds of several sizes');
    assert.ok(state.wind.x < 0 && state.wind.y > 0, 'the wind blows down and to the left');
    assert.ok(state.active > 0 && state.dug && state.rims, 'craters and trails in the sand');
    assert.equal(state.spill, false, 'no sand drawn over the wall');
    await page.screenshot({ path: `test-results/dunes-${name}.png` });
    // Through the day: one sand colour shaped by the sun's light and shadow,
    // then HD Sand's detailed dunes. No flagstone light over the sand.
    for (const [phase, hd] of [['day', false], ['sunset', false], ['night', false], ['day', true], ['sunset', true]]) {
      const shown = await page.evaluate(async ([phase, hd]) => {
        // The modules the page itself loaded (Vite may have stamped their URLs).
        const loaded = path => performance.getEntriesByType('resource').map(e => e.name).find(n => new URL(n).pathname === path) ?? path;
        const solar = await import(loaded('/src/daylight.ts')), art = await import(loaded('/src/defend/atmosphere-art.ts'));
        solar.useDayClock(new solar.DayClock(), () => ({ dayNightCycle: false, timeOfDay: phase }));
        const p = window.stressPage;
        p.host.hdSand = () => hd;
        for (let k = 0; k < 60; k++) { p.draw(false); await new Promise(r => requestAnimationFrame(r)); }
        let drew = 0; const relief = p.renderer.relief, was = relief.draw;
        relief.draw = (...a) => { drew++; return was.apply(relief, a); };
        p.draw(false); relief.draw = was;
        return { style: art.duneStyle(), drew };
      }, [phase, hd]);
      assert.equal(shown.style, hd ? 'hd' : 'simple');
      assert.equal(shown.drew, 0, 'no flagstone relief over the desert');
      await page.screenshot({ path: `test-results/dunes-${name}-${phase}${hd ? '-hd' : ''}.png` });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Gentle dunes, trails, craters, a clear wall and tumbleweeds passed on desktop and phone.');
} finally { await browser.close(); }
