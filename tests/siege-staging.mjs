import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium', headless: true });
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: width === 390 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('tests/siege-entry.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => window.siegeFixture);
    await page.locator('[data-action="find"]').click();
    await page.waitForFunction(() => document.querySelector('.siege-castle-preview')?.dataset.ready === 'true');
    await page.locator('[data-action="attack"]').click();
    await page.locator('[data-action="start"]').click(); // Pause real-time stepping.
    const initial = await page.evaluate(() => {
      const { page, seconds } = window.siegeFixture, sim = page.sim, renderer = page.renderer;
      const keep = sim.map.buildings[sim.raid.field.defenderKeep].rect;
      return {
        seconds, elapsed: sim.elapsed, zoom: renderer.cam.s,
        keep: renderer.toClient(keep.x + keep.w / 2, keep.y + keep.h / 2),
        approach: renderer.toClient(36, 65),
        copies: sim.layout.length,
        homes: [...sim.raid.field.attackerIds].map(id => {
          const b = sim.map.buildings[id];
          return { hidden: b.hidden, cells: b.cells.length, inCity: sim.map.structures.some(s => s.uid === b.structureUid) };
        }),
      };
    });
    assert.equal(initial.seconds, 120);
    assert.match(await page.locator('.campaign-status').innerText(), new RegExp(`${120 - Math.floor(initial.elapsed)}s$`));
    assert.ok(initial.zoom > 1, 'The camera focuses on the castle and approach');
    assert.ok(initial.copies > 0 && initial.homes.length === initial.copies);
    assert.ok(initial.homes.every(home => home.hidden && home.cells === 0 && !home.inCity));
    const board = await page.locator('.campaign-board > canvas').boundingBox();
    for (const point of [initial.keep, initial.approach]) {
      assert.ok(point.x > board.x && point.x < board.x + board.width && point.y > board.y && point.y < board.y + board.height);
    }
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.siegeFixture.page.sim.elapsed), initial.elapsed, 'Pausing freezes the two-minute timer');
    const army = await page.evaluate(() => {
      const { page } = window.siegeFixture, sim = page.sim;
      for (let n = 0; n < 90; n++) sim.step(1 / 30);
      page.frame(performance.now());
      return { units: sim.allies.length, advancing: sim.allies.some(s => s.y < 102), buildingTargets: sim.raid.defense.enemies.filter(e => e.raidBuilding).length };
    });
    assert.ok(army.units >= initial.copies && army.advancing, 'The hidden homes recruit troops who march from the edge');
    assert.equal(army.buildingTargets, 0, 'Defenders never attack the hidden staging homes');
    await page.screenshot({ path: `test-results/siege-staging-${width}.png` });
    // Zoom out to the actual entry edge and tap a staging point: no inspector.
    const entry = await page.evaluate(() => {
      const { page } = window.siegeFixture;
      page.renderer.resetCam();
      page.frame(performance.now());
      const at = page.sim.raid.field.pads.at(-1);
      return page.renderer.toClient(at.x, at.y);
    });
    if (width === 390) await page.touchscreen.tap(entry.x, entry.y);
    else await page.mouse.click(entry.x, entry.y);
    assert.equal(await page.locator('.siege-level').isHidden(), true);
    await page.screenshot({ path: `test-results/siege-staging-edge-${width}.png` });
    const record = await page.evaluate(() => {
      const { page, save, seconds } = window.siegeFixture, games = save.siege.games;
      page.sim.elapsed = seconds - 1 / 30;
      page.sim.step(1 / 30);
      page.frame(performance.now());
      return { phase: page.sim.phase, elapsed: page.sim.elapsed, games: save.siege.games - games };
    });
    assert.deepEqual(record, { phase: 'lost', elapsed: 120, games: 1 });
    assert.equal(await page.locator('#siege').getAttribute('data-siege-view'), 'entry');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Two-minute Siege, paused timer, hidden staging homes, troop entry, inspection and camera framing pass on desktop and phone.');
} finally {
  await browser.close();
}
