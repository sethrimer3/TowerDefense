// Fresh browser contexts and isolated simulation fixtures never access player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/library-idle.html', base).href);
    await page.waitForFunction(() => window.idleFixture);
    const settle = () => page.evaluate(() => { for (let n = 0; n < 180; n++) window.idleFixture.step(); });
    await page.evaluate(() => {
      const f = window.idleFixture, r = f.library.renderer;
      r.zoomBy(6, r.canvas.width / 2, r.canvas.height / 2);
      r.target = f.library.sim.librarians[0];
      f.draw();
    });
    await page.locator('#library-lab').click();
    // Reverse immediately, before the camera reaches the lab: label and action agree.
    await page.evaluate(() => window.idleFixture.step());
    assert.match(await page.locator('#library-lab').innerText(), /Nave/);
    await page.locator('#library-lab').click();
    await settle();
    assert.match(await page.locator('#library-lab').innerText(), /Lab/);
    const checkRoom = async lab => {
      const room = await page.evaluate(lab => {
        const r = window.idleFixture.library.renderer, { scale, ox, oy } = r.view;
        return { zoom: r.zoom, target: r.target, goal: r.goal, focusY: r.focus.y,
          left: ox + (lab ? -56 : 0) * scale,
          right: ox + (lab ? 248 : 192) * scale,
          top: oy + (lab ? 308 : 0) * scale,
          bottom: oy + (lab ? 430 : 300) * scale,
          w: r.canvas.width, h: r.canvas.height };
      }, lab);
      assert.equal(room.target, null); assert.equal(room.goal, null);
      assert.ok(Math.abs(room.focusY - (lab ? 369 : 150)) < 1, JSON.stringify(room));
      assert.ok(room.zoom < 6);
      assert.ok(room.left >= -1 && room.right <= room.w + 1, JSON.stringify(room));
      assert.ok(room.top >= -1 && room.bottom <= room.h + 1, JSON.stringify(room));
    };
    await checkRoom(false);
    await page.locator('#library-lab').click(); await settle(); await checkRoom(true);
    await page.screenshot({ path: `test-results/library-lab-${viewport.width}.png` });
    await page.locator('#library-lab').click(); await settle(); await checkRoom(false);
    await page.evaluate(() => window.idleFixture.show('mine'));
    assert.equal(await page.locator('#mine-follow').count(), 0);
    for (const id of ['shaft', 'barracks', 'warehouse', 'forge', 'smithy']) {
      await page.locator('#mine-buildings-toggle').click();
      await page.locator(`[data-building="${id}"]`).click();
      await page.evaluate(() => window.idleFixture.step());
      assert.equal(await page.evaluate(() => window.idleFixture.mine.renderer.picked), id);
      assert.ok(await page.locator('#mine-info').isVisible());
      assert.equal(await page.locator('#mine-buildings').getAttribute('aria-hidden'), 'true');
    }
    await page.screenshot({ path: `test-results/mine-buildings-${viewport.width}.png` });
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const f = window.idleFixture;
      f.mine.sim.weatherOverride = 'clear';
      f.mine.sim.tick = 0;
      f.mine.renderer.picked = null;
      f.mine.renderer.home(f.mine.sim);
      f.step(500);
    });
    await page.screenshot({ path: `test-results/mine-ground-${viewport.width}.png` });
    await page.goto(base);
    for (const [tab, door] of [['mine', '#mine-smithy'], ['library', '#library-study']]) {
      await page.locator(`[data-tab="${tab}"]`).click();
      const before = await page.locator(door).boundingBox();
      await page.locator(door).click();
      const motion = await page.evaluate(async tab => {
        const p = document.querySelector(`#${tab}`), w = p.querySelector('.descent-world');
        const samples = [];
        for (let n = 0; n < 15; n++) {
          await new Promise(requestAnimationFrame);
          samples.push(w.getBoundingClientRect().top - p.getBoundingClientRect().top);
        }
        return { samples, scroll: p.scrollTop, height: p.clientHeight };
      }, tab);
      assert.equal(motion.scroll, 0);
      assert.ok(motion.samples[0] > -motion.height / 2, JSON.stringify(motion));
      for (let n = 1; n < motion.samples.length; n++) assert.ok(motion.samples[n] <= motion.samples[n - 1] + 1);
      const back = page.locator(`#${tab} [data-up]`);
      await page.waitForTimeout(1200);
      const after = await back.boundingBox();
      assert.ok(Math.abs(before.x - after.x) < 1 && Math.abs(before.y - after.y) < 1, JSON.stringify({ before, after }));
      await back.click(); await page.waitForTimeout(1200);
      assert.ok(await page.locator(door).isVisible());
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Library room framing, interrupted glides, Mine buildings, shared corners and descent passed (desktop, mobile, landscape).');
} finally { await browser.close(); }
