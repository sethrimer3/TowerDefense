// Placing and specializing buildings in Defend, on desktop and phones:
// one palette entry a kind, the choice after a fresh placement (never after
// a move or for a kind with nothing researched), changing a building's
// path while building, persistence, mixed paths in battle, and Tiles' and
// the Study's simplified views. Isolated browser contexts only: never reads
// or changes a player's saved game. Needs `npm run dev`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1;
try {
  for (const width of [1280, 390, 360]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { learnPath } = await import('/src/knowledge-paths.ts');
      const { placeCityTile } = await import('/src/defend/layout.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true; s.settings.devMode = true;
      s.defend.owned.archerTower = 2; s.defend.owned.wizardTower = 4; s.defend.owned.cannonTower = 1; s.defend.owned.cityTile = 8;
      let l = s.defend.layout;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [-1, -1], [1, -1]]) l = placeCityTile(l, l.keep.tx + dx, l.keep.ty + dy) ?? l;
      s.defend.layout = l;
      for (const p of ['fireArrows', 'pyromancy', 'rime', 'storm']) for (let n = 0; n < 3; n++) learnPath(s, p);
      learnPath(s, 'sharpshooters');
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('spec-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('spec-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    const hook = async () => {
      await page.evaluate(async () => {
        window.__dp = null;
        const urls = new Set(['/src/defend/ui.ts']);
        for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
        for (const url of urls) {
          const { DefendPage } = await import(url), real = DefendPage.prototype.frame;
          if (real.__hooked) continue;
          DefendPage.prototype.frame = function(t) { window.__dp = this; return real.call(this, t); };
          DefendPage.prototype.frame.__hooked = true;
        }
      });
      await page.waitForFunction(() => window.__dp);
    };
    await hook();
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="false"]').count()) await page.locator('#defend-side-toggle').click();
    // One palette entry a kind, however many copies.
    assert.equal(await page.locator('#defend-palette [data-item="wizardTower"]').count(), 1);
    assert.match(await page.locator('#defend-palette [data-item="wizardTower"] b').textContent(), /×4/);
    assert.equal(await page.locator('#defend-palette [data-item*="#"]').count(), 0, 'no loadout entries');

    /** Drags palette `item` to the free legal tile nearest the keep that shows on screen. */
    const place = async (item, nth = 0) => {
      const from = await page.locator(`#defend-palette [data-item="${item}"]`).boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 4, from.y + from.height / 2 + 4);
      const to = await page.evaluate(nth => {
        const dp = window.__dp, r = dp.renderer, box = r.canvas.getBoundingClientRect(), k = dp.host.save().layout.keep;
        const keys = [...dp.pointers.session.legal.keys()].sort((a, b) => {
          const [ax, ay] = a.split(',').map(Number), [bx, by] = b.split(',').map(Number);
          return Math.abs(ax - k.tx) + Math.abs(ay - k.ty) - Math.abs(bx - k.tx) - Math.abs(by - k.ty) || a.localeCompare(b);
        });
        const shown = keys.map(key => { const [tx, ty] = key.split(',').map(Number); return r.toClient((tx + 0.5) * 7, (ty + 0.5) * 7); })
          .filter(p => p.x > box.left + 4 && p.x < box.right - 4 && p.y > box.top + 4 && p.y < box.bottom - 4);
        if (!shown.length) throw new Error('No visible legal destination');
        return shown[nth % shown.length];
      }, nth);
      await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
    };
    const panel = page.locator('#defend-specialty');
    const press = async locator => phone ? locator.tap() : locator.click();
    const newest = async kind => (await state(page)).defend.layout.structures.filter(s => s.kind === kind).at(-1);

    // A fresh Wizard tower asks; its choice shows beside it, inside the board.
    await place('wizardTower');
    await page.waitForSelector('#defend-specialty.choosing:not([hidden])');
    assert.equal(await panel.locator('[data-specialty]').count(), 4, 'unspecialized and three paths');
    assert.equal(await panel.locator('[data-specialty]:disabled').count(), 0);
    assert.match(await panel.textContent(), /Pyromancy III/);
    const pBox = await panel.boundingBox(), bBox = await page.locator('#defend-board').boundingBox();
    assert.ok(inside(pBox, bBox), `the panel stays inside the board (${JSON.stringify(pBox)} in ${JSON.stringify(bBox)})`);
    for (const h of await panel.locator('[data-specialty]').evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) assert.ok(h >= 40, `touch target ${h}px`);
    assert.equal(await panel.evaluate(el => el.contains(document.activeElement)), true, 'focus moves into the choice: ' + await page.evaluate(() => document.activeElement?.outerHTML.slice(0, 80)));
    await page.waitForTimeout(400); await page.screenshot({ path: `test-results/specialize-${width}-choose.png` });
    await press(panel.locator('[data-specialty="pyromancy"]'));
    await page.waitForSelector('#defend-specialty[hidden]', { state: 'attached' });
    assert.equal((await newest('wizardTower')).path, 'pyromancy');
    assert.equal(await page.evaluate(() => Object.values(window.__dp.looks())[0]), 'pyromancy', 'the board draws its path look');

    await place('wizardTower', 1);
    await page.waitForSelector('#defend-specialty.choosing:not([hidden])');
    await press(panel.locator('[data-specialty="rime"]'));
    // Dismissed: the tower stands, unspecialized.
    await place('wizardTower', 2);
    await page.waitForSelector('#defend-specialty.choosing:not([hidden])');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#defend-specialty[hidden]', { state: 'attached' });
    const plain = await newest('wizardTower');
    assert.equal(plain.path, undefined);
    // Nothing researched for cannons: no choice.
    await place('cannonTower');
    await page.waitForTimeout(150);
    assert.equal(await panel.isHidden(), true, 'no choice for a kind with nothing researched');
    assert.equal((await state(page)).defend.layout.structures.filter(s => s.kind === 'cannonTower').length, 1);

    // Tap the plain tower: its path, then change it to Stormcalling.
    const at = async uid => page.evaluate(uid => {
      const dp = window.__dp, b = dp.currentMap().buildings.find(b => b.structureUid === uid);
      return dp.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    }, uid);
    let p = await at(plain.uid);
    if (phone) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForSelector('#defend-specialty:not(.choosing):not([hidden])');
    assert.match(await panel.textContent(), /Current: Unspecialized/);
    await page.waitForTimeout(400); await page.screenshot({ path: `test-results/specialize-${width}-current.png` });
    await press(panel.locator('[data-specialty-change]'));
    await press(panel.locator('[data-specialty="storm"]'));
    await page.waitForSelector('#defend-specialty:not(.choosing):not([hidden])');
    assert.match(await panel.textContent(), /Current: Stormcalling III/, 'the change shows at once');
    await press(panel.locator('[data-specialty-close]'));
    let s = await state(page);
    assert.deepEqual(s.defend.layout.structures.filter(x => x.kind === 'wizardTower').map(x => x.path).sort(), ['pyromancy', 'rime', 'storm']);

    // Moving a specialized tower keeps its path and asks nothing.
    const pyro = s.defend.layout.structures.find(x => x.path === 'pyromancy');
    p = await at(pyro.uid);
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 5, p.y + 5);
    const dest = await page.evaluate(uid => {
      const dp = window.__dp, r = dp.renderer, box = r.canvas.getBoundingClientRect(), st = dp.host.save().layout.structures.find(s => s.uid === uid);
      for (const key of dp.pointers.session.legal.keys()) {
        const [tx, ty] = key.split(',').map(Number);
        if (tx === st.tx && ty === st.ty) continue;
        const q = r.toClient((tx + 0.5) * 7, (ty + 0.5) * 7);
        if (q.x > box.left + 4 && q.x < box.right - 4 && q.y > box.top + 4 && q.y < box.bottom - 4) return q;
      }
      return null;
    }, pyro.uid);
    if (dest) {
      await page.mouse.move(dest.x, dest.y, { steps: 6 }); await page.mouse.up();
      assert.equal(await panel.isHidden(), true, 'moving asks nothing');
      const moved = (await state(page)).defend.layout.structures.find(x => x.uid === pyro.uid);
      assert.equal(moved.path, 'pyromancy', 'moving keeps the path');
    } else await page.mouse.up();

    // Saved, reloaded, and fought with: three paths at once.
    await page.reload(); await page.waitForSelector('#defend-start'); await hook();
    s = await state(page);
    assert.deepEqual(s.defend.layout.structures.filter(x => x.kind === 'wizardTower').map(x => x.path).sort(), ['pyromancy', 'rime', 'storm']);
    await page.locator('#defend-start').click();
    const paths = await page.evaluate(() => Object.values(window.__dp.sim.bonuses.structurePaths).map(p => p.wizardTower?.path).sort());
    assert.deepEqual(paths, ['pyromancy', 'rime', 'storm']);
    assert.equal(await panel.isHidden(), true);
    await page.locator('#defend-abandon').click(); await page.locator('#defend-abandon').click();

    // Tiles: copies are plain; the kind's paths are previewed.
    await page.locator('nav [data-tab="tiles"]').click();
    await page.locator('.tiles-hall [data-key="archerTower"]').click();
    const preview = await page.locator('.tile-specialties').textContent();
    assert.match(preview, /Fire arrows III/); assert.match(preview, /Sharpshooters I/); assert.match(preview, /Unspecialized/);
    assert.equal(await page.locator('[data-copy-card], [data-equip-card]').count(), 0, 'no per-copy loadouts');
    await page.waitForTimeout(400); await page.screenshot({ path: `test-results/specialize-${width}-tiles.png` });
    // The Study: stacks and research only.
    await page.locator('nav [data-tab="library"]').click(); await page.locator('#library-study').click();
    const room = page.locator('#library-chamber');
    await room.locator('[data-subject="towers"]').click();
    await room.locator('[data-ledger-stack="wizardTower"]').click();
    assert.equal(await room.locator('[data-ledger-card], .spec-circle').count(), 0);
    assert.match(await room.locator('.ledger-scope').first().textContent(), /SHARED RESEARCH/);
    await page.screenshot({ path: `test-results/specialize-${width}-study.png` });
    assert.deepEqual(errors, []);
    console.log(`${width}px: palette, placement choice, dismissal, no-choice kinds, change, move, reload, battle, Tiles and Study passed`);
    await context.close();
  }
} finally { await browser.close(); }
