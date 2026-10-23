// The Tiles tab's upgrade marks and stacking, in a browser: buildings with
// their own Knowledge tree spread a tile a copy, each marked with the
// upgrades it carries (diamonds for buildings it became, pips for path
// ranks, its path's badge); Stacked gathers copies with the same upgrades;
// city tiles, walls and skills are always one stack. An opened tile shows
// its stats and its upgrades' abilities; a held one opens its tree in Defend. Uses an isolated
// fixture, never the player's saved game. Needs `npm run dev`. Screenshots
// go to test-results/.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge' });
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      const d = s.defend;
      Object.assign(d.owned, { cityTile: 6, watchTower: 2, archerTower: 1, brazierTower: 2, stormTower: 1, meleeGuild: 1, chapterHouse: 1 });
      d.wallRanks = { stonework: 2, trapped: 1 };
      let l = d.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      l = placeStructure(l, 'brazierTower', l.keep.tx, l.keep.ty - 1) ?? l;
      Object.assign(l.structures.at(-1), { path: 'fireArrows', rank: 2 });
      l = placeStructure(l, 'chapterHouse', l.keep.tx - 1, l.keep.ty) ?? l;
      Object.assign(l.structures.at(-1), { path: 'crusaders', rank: 1 });
      d.layout = l;
      d.kept = [{ kind: 'brazierTower', path: 'fireArrows', rank: 2 }, { kind: 'stormTower', path: 'storm', rank: 3 }];
      return s;
    });
    await context.addInitScript((fixture) => {
      if (!sessionStorage.getItem('tiles-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('tiles-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.locator('[data-tab="tiles"]').click();
    await page.waitForSelector('.tiles-grid .tile');
    await page.waitForTimeout(600);

    // Spread by default: two Brazier towers on Fire arrows II, a plain Archer tower.
    assert.equal(await page.locator('[data-stacking]').getAttribute('aria-pressed'), 'false');
    const archers = page.locator('.tile[data-tile="archerTower"]'), braziers = page.locator('.tile[data-tile="brazierTower"]');
    assert.equal(await archers.count(), 1);
    assert.equal(await braziers.count(), 2);
    const marks = await page.locator('.tile[data-tile="archerTower"], .tile[data-tile="brazierTower"]').evaluateAll((ts) => ts.map((t) => [t.querySelectorAll('.mark.became').length, t.querySelectorAll('.mark.rank').length, !!t.querySelector('.path-badge')]));
    assert.deepEqual(marks.sort(), [[1, 0, false], [2, 2, true], [2, 2, true]]);
    assert.match(await braziers.first().getAttribute('title'), /Watch tower → Archer tower → Brazier tower → Fire arrows II/);
    // Plain basic buildings say they have none; universal kinds stay one stack.
    assert.equal(await page.locator('.tile[data-tile="watchTower"]').count(), 2);
    assert.equal(await page.locator('.tile[data-tile="watchTower"] .tile-marks.none').count(), 2);
    assert.equal(await page.locator('.tile[data-tile="cityTile"]').count(), 1);
    assert.match(await page.locator('.tile[data-tile="cityTile"] .tile-count').textContent(), /^×[2-9]$/);
    // The Storm tower kept on Stormcalling III: became, three storm pips.
    assert.equal(await page.locator('.tile[data-tile="stormTower"] .mark.rank.hue-storm').count(), 3);
    await page.screenshot({ path: `test-results/tiles-marks-spread-${width}.png` });

    // Stacked: copies with the same upgrades share a stack.
    await page.locator('[data-stacking]').click();
    await page.waitForTimeout(600);
    assert.deepEqual(await braziers.evaluateAll((ts) => ts.map((t) => t.querySelector('.tile-count')?.textContent)), ['×2']);
    assert.equal(await page.locator('.tile[data-tile="watchTower"]').count(), 1);
    await page.screenshot({ path: `test-results/tiles-marks-stacked-${width}.png` });

    // Opening a stack shows its basic stats, then each upgrade it carries
    // as an ability in its path's colour; no description.
    await braziers.last().click();
    await page.waitForSelector('.tile-detail .tile-stats');
    assert.deepEqual((await page.locator('.tile-detail .tile-stats li').allTextContents()).map((t) => t.replace(/[\d.]+/g, 'n')), ['n damage', 'ns reload', 'n range', 'ns burn']);
    assert.equal(await page.locator('.tile-detail .tile-abilities li.hue-ember').count(), 2);
    assert.equal(await page.locator('.tile-detail p').count(), 0);
    const ember = await page.locator('.tile-detail .tile-abilities li').first().evaluate((li) => getComputedStyle(li).color);
    assert.equal(ember, 'rgb(243, 154, 42)', 'in the path\'s colour');
    await page.locator('.tile-detail').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/tiles-marks-open-${width}.png` });
    // The plain stack has no abilities.
    await archers.first().click();
    await page.waitForTimeout(600);
    assert.equal(await page.locator('.tile-detail .tile-abilities').count(), 0);
    assert.equal(await page.locator('.tile-detail .tile-stats li').count(), 3);

    // Press and hold a tile: Defend opens with that copy's upgrade tree.
    const wizard = page.locator('.tile[data-tile="stormTower"]').first();
    await wizard.scrollIntoViewIfNeeded();
    const box = await wizard.boundingBox();
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (phone) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
      await page.waitForTimeout(700);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await page.mouse.move(at.x, at.y); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    }
    await page.waitForSelector('#defend.active');
    await page.waitForSelector('#defend-specialty:not([hidden]) [data-node]');
    assert.ok(await page.locator('#defend-specialty [data-node="p:storm:3"]').count(), 'the Stormcalling III copy\'s tree');
    await page.screenshot({ path: `test-results/tiles-marks-hold-${width}.png` });
    await page.keyboard.press('Escape');
    await page.locator('[data-tab="tiles"]').click();
    await page.waitForTimeout(600);
    // A short tap still just opens the tile.
    await page.locator('.tile[data-tile="stormTower"]').first().click();
    await page.waitForSelector('.tile-detail .tile-abilities li.hue-storm');
    assert.ok(await page.locator('#tiles.active').count());

    // The walls carry their shared tree's ranks.
    await page.locator('[data-filter="city"]').click();
    await page.waitForTimeout(600);
    assert.match(await page.locator('.tile[data-tile="wallBlock"] .tile-marks').getAttribute('title'), /Stonework II → Trapped walls I/);
    assert.equal(await page.locator('.tile[data-tile="wallBlock"]').count(), 1);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`ok ${width}`);
  }
} finally {
  await browser.close();
}
