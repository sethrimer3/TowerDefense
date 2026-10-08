// Fresh browser contexts check pointer behavior and real purchases without player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const count = page => page.evaluate(() => window.holdFixture.state.times.length);
async function press(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
}
try {
  const fixture = await browser.newPage();
  await fixture.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await fixture.clock.pauseAt(new Date('2026-10-08T12:00:01Z'));
  const reset = async () => {
    await fixture.goto(new URL('tests/hold-repeat.html', base).href);
    await fixture.waitForFunction(() => window.holdFixture);
  };
  await reset();
  await fixture.locator('[data-buy]').click();
  assert.equal(await count(fixture), 1, 'short click buys once');
  await fixture.locator('[data-buy]').focus(); await fixture.keyboard.press('Enter');
  assert.equal(await count(fixture), 2, 'keyboard buys once');
  await reset();
  await press(fixture, '[data-buy]');
  await fixture.clock.runFor(449);
  assert.equal(await count(fixture), 0, 'hold starts slowly');
  await fixture.clock.runFor(3000);
  assert.equal(await fixture.evaluate(() => document.querySelector('#purchases').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))), false, 'captured long press blocks the context menu');
  const times = await fixture.evaluate(() => window.holdFixture.state.times);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.length > 15, 'hold continues across replaced buttons');
  assert.ok(gaps[0] >= 259 && gaps.at(-1) <= 36, `hold accelerates to its bounded fastest speed: ${gaps}`);
  for (let i = 1; i < gaps.length; i++) assert.ok(gaps[i] <= gaps[i - 1] + 1, 'gaps shrink');
  await fixture.mouse.up(); await fixture.clock.runFor(1000);
  assert.equal(await count(fixture), times.length, 'release buys nothing extra and stops');
  await fixture.locator('#other').click();
  assert.equal(await fixture.evaluate(() => window.holdFixture.state.other), 1, 'next action is not swallowed');
  await fixture.locator('[data-buy]').focus(); await fixture.keyboard.press('Space');
  assert.equal(await count(fixture), times.length + 1, 'keyboard still works after hold');
  await reset();
  await fixture.evaluate(() => { window.holdFixture.state.limit = 3; });
  await press(fixture, '[data-buy]'); await fixture.clock.runFor(3000); await fixture.mouse.up();
  assert.equal(await count(fixture), 3, 'availability reached during a hold stops at the limit');
  for (const mode of ['move', 'wheel', 'blur', 'cancel', 'hidden', 'inert', 'disabled', 'removed', 'stop']) {
    await reset(); await press(fixture, '[data-buy]'); await fixture.clock.runFor(800);
    if (mode === 'move') await fixture.mouse.move(280, 120);
    else if (mode === 'wheel') await fixture.evaluate(() => document.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 })));
    else await fixture.evaluate(mode => {
      const root = document.querySelector('#purchases'), b = root.querySelector('button');
      if (mode === 'blur') window.dispatchEvent(new Event('blur'));
      if (mode === 'cancel') document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }));
      if (mode === 'hidden') root.hidden = true;
      if (mode === 'inert') root.inert = true;
      if (mode === 'disabled') b.disabled = true;
      if (mode === 'removed') b.remove();
      if (mode === 'stop') window.holdFixture.stop();
    }, mode);
    const before = await count(fixture);
    await fixture.clock.runFor(1000); await fixture.mouse.up();
    assert.equal(await count(fixture), before, `${mode} stops purchases`);
    await fixture.locator('#other').click();
    assert.equal(await fixture.evaluate(() => window.holdFixture.state.other), 1, `${mode} leaves other clicks alone`);
  }
  await fixture.close();
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: { width: mobile ? 390 : 1040, height: 844 }, hasTouch: mobile });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.addInitScript(() => {
      if (!localStorage.getItem('towerdefense.v1')) localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 2,
        smithy: { copper: 1000000, silver: 1000000, gold: 1000000 }, knowledge: 1000000,
        settings: { soundOff: true, ambienceOff: true, reduceMotion: true } }));
    });
    await page.goto(base); await page.locator('#defend-start').waitFor();
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
    const tab = id => page.locator(`nav [data-tab="${id}"]`).click();
    const cdp = mobile ? await context.newCDPSession(page) : null;
    const hold = async (selector, ms = 1500, whileHeld) => {
      let touch;
      if (mobile) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const box = await page.locator(selector).boundingBox();
        touch = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch] });
      } else await press(page, selector);
      await page.waitForTimeout(ms / 2);
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...touch, x: touch.x + 2 }] });
      await page.waitForTimeout(ms / 2);
      if (whileHeld) await whileHeld();
      if (mobile) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    };
    await tab('mine');
    const miners = (await state()).mine.miners.length;
    await hold('#mine-hire');
    assert.ok((await state()).mine.miners.length >= miners + 3, 'holding hires miners');
    await page.locator('#mine-buildings-toggle').click(); await page.locator('[data-building="warehouse"]').click();
    const warehouse = (await state()).mine.buildingLevels.warehouse;
    await hold('[data-upgrade="warehouse"]');
    assert.equal((await state()).mine.buildingLevels.warehouse, warehouse + 1, 'holding upgrades Mine buildings once, then stops for rebuilding');
    await tab('library');
    await hold('#library-shelf');
    const shelfCount = s => s.library.units.filter(n => n >= 0).length;
    assert.ok(shelfCount(await state()) >= 4, 'holding buys shelves');
    await hold('#library-hire');
    assert.ok((await state()).library.crew.length >= 4, 'holding hires librarians');
    const lab = (await state()).library.lab;
    await hold('#library-lab-up');
    assert.ok((await state()).library.lab >= lab + 3, 'holding expands the lab');
    const shelves = shelfCount(await state());
    await hold('#library-shelf', 600, async () => {
      await page.evaluate(() => document.querySelector('nav [data-tab="mine"]').click());
      await page.waitForTimeout(700);
    });
    assert.equal(shelfCount(await state()), shelves + 1, 'leaving Library stops its hold');
    await tab('library');
    const hired = (await state()).library.crew.length;
    await page.locator('#library-hire').click();
    assert.equal((await state()).library.crew.length, hired + 1, 'click still works after canceled hold');
    await page.reload(); await page.locator('#defend-start').waitFor();
    assert.equal(shelfCount(await state()), shelves + 1, 'held purchases persist');
    await tab('tiles');
    await page.locator('[data-mode="shop"]').click();
    await page.locator('[data-filter="consumables"]').click();
    await page.locator('[data-tile="bomb"]').click();
    const bombs = (await state()).defend.bombs;
    await hold('[data-buy-tile="bomb"]');
    assert.ok((await state()).defend.bombs >= bombs + 3, 'existing tile holds survive redraws');
    const study = async () => {
      await tab('library');
      await page.locator('#library-study').click();
      await page.locator('#library-chamber [data-subject="city"]').click();
      await page.locator('#library-chamber [data-ledger-stack="walls"]').click();
      const card = page.locator('#library-chamber [data-ledger-card][data-card-topic="walls"]').first();
      if (await card.count()) await card.click();
    };
    await study();
    await hold('[data-learn="masonry"]');
    assert.equal((await state()).skills.masonry, 0, 'held timed research does not skip work');
    assert.equal((await state()).researchJob.id, 'masonry', 'held timed research starts one project');
    await context.addInitScript(() => {
      const s = JSON.parse(localStorage.getItem('towerdefense.v1'));
      s.settings.developerMode = true; s.settings.instantResearch = true;
      localStorage.setItem('towerdefense.v1', JSON.stringify(s));
    });
    await page.reload(); await page.locator('#defend-start').waitFor();
    await study();
    await page.locator('[data-cancel-research]').click();
    const masonry = (await state()).skills.masonry;
    await hold('[data-learn="masonry"]');
    assert.ok((await state()).skills.masonry >= masonry + 2, `holding repeats available instant Study ranks: ${JSON.stringify({ before: masonry, after: (await state()).skills.masonry, settings: (await state()).settings, project: (await state()).researchJob })}`);
    await tab('mine'); await page.locator('#mine-smithy').click();
    const trained = (await state()).training.troopHp;
    await hold('[data-train="troopHp"]');
    assert.ok((await state()).training.troopHp >= trained + 3, `holding repeats available Training ranks: ${JSON.stringify({ before: trained, after: (await state()).training.troopHp, job: (await state()).trainingJobs, enabled: await page.locator('[data-train="troopHp"]').isEnabled() })}`);
    const arms = (await state()).defend.levels.soldierArms;
    await hold('[data-upgrade="soldierArms"]');
    assert.ok((await state()).defend.levels.soldierArms >= arms + 2, 'existing Forge holds repeat available ranks');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Accelerating holds: mouse/touch purchases, redraws, release, cancellation, keyboard, real Mine/Library upgrades and persistence passed.');
} finally { await browser.close(); }

