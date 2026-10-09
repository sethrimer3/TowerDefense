// Isolated browser contexts only: never reads or changes a player's saved game.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
const state = page => page.evaluate(() => JSON.parse(localStorage.getItem('towerdefense.v1')));
try {
  for (const width of [1280, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width > 500 ? 900 : 844 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { syncCards, equipCard } = await import('/src/cards.ts');
      const { learnPath } = await import('/src/knowledge-paths.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true;
      s.settings.instantResearch = true; s.settings.devMode = true;
      s.defend.owned.archerTower = 5; s.defend.owned.wizardTower = 3; s.defend.owned.barracks = 2;
      for (const p of ['fireArrows', 'sharpshooters', 'pyromancy', 'rime', 'storm', 'crusaders', 'assassins'])
        for (let n = 0; n < 3; n++) learnPath(s, p);
      syncCards(s.defend);
      const cards = s.defend.cards.filter(c => c.kind === 'wizardTower');
      ['pyromancy', 'rime', 'storm'].forEach((p, i) => equipCard(s, cards[i].id, p));
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('card-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('card-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.locator('nav [data-tab="library"]').click(); await page.locator('#library-study').click();
    const room = page.locator('#library-chamber');
    await room.locator('[data-subject="towers"]').click();
    await page.screenshot({ path: `test-results/cards-${width}-stacked.png` });
    const before = await room.locator('[data-ledger-stack="archerTower"]').boundingBox();
    await room.locator('[data-ledger-stack="archerTower"]').click();
    assert.equal(await room.locator('[data-ledger-card][data-card-topic="archerTower"]').count(), 5);
    assert.equal(await room.locator('.tile-detail').count(), 0, 'Study does not open a Tiles stack panel');
    const motion = await room.locator('[data-ledger-card]').first().evaluate(el => el.getAnimations().map(a => a.effect.getKeyframes()));
    assert.ok(motion.length > 0, 'copies actually animate out of the stack');
    assert.ok(motion.some(frames => frames[0].transform?.includes('translate')), 'FLIP uses the stack origin');
    await page.waitForTimeout(500);
    const boxes = await room.locator('[data-ledger-card][data-card-topic="archerTower"]').evaluateAll(els => els.map(e => {
      const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height };
    }));
    assert.equal(new Set(boxes.map(b => `${b.x}:${b.y}`)).size, 5, 'each copy has its own grid position');
    for (const b of boxes) assert.ok(b.x >= 0 && b.x + b.w <= width, 'all cards fit horizontally');
    await page.screenshot({ path: `test-results/cards-${width}-spread.png` });
    const archerCards = room.locator('[data-ledger-card][data-card-topic="archerTower"]');
    const first = Number(await archerCards.first().getAttribute('data-ledger-card'));
    const second = Number(await archerCards.nth(1).getAttribute('data-ledger-card'));
    await archerCards.first().click();
    // The specialty circle unfolds: its sigil draws itself and the paths sit evenly round it.
    assert.equal(await room.locator('.spec-circle.unfold').count(), 1, 'a newly selected card unfolds its circle');
    const nodes = await room.locator('.spec-node').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    await page.waitForTimeout(1500);
    const settled = await room.locator('.spec-node').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
    const centre = await room.locator('.spec-center').evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const radii = settled.map(n => Math.hypot(n.x - centre.x, n.y - centre.y));
    assert.equal(settled.length, 2, 'archer towers have two paths');
    assert.ok(Math.abs(radii[0] - radii[1]) < 2, `paths are equidistant from the card (${radii})`);
    assert.ok(nodes.some((n, i) => Math.hypot(n.x - settled[i].x, n.y - settled[i].y) > 5), 'medallions fly out from the centre');
    await page.screenshot({ path: `test-results/cards-${width}-circle.png` });
    await room.locator(`[data-equip-card="${first}"][data-equip-path="fireArrows"]`).click();
    assert.equal(await room.locator('.spec-circle.unfold').count(), 0, 'equipping does not unfold the circle again');
    await room.locator(`[data-ledger-card="${second}"]`).click();
    await room.locator(`[data-equip-card="${second}"][data-equip-path="sharpshooters"]`).click();
    let s = await state(page);
    assert.equal(s.defend.cards.find(c => c.id === first).path, 'fireArrows');
    assert.equal(s.defend.cards.find(c => c.id === first).rank, 3, 'a path is equipped at its furthest researched rank');
    assert.equal(s.defend.cards.find(c => c.id === second).path, 'sharpshooters');
    assert.equal(await room.locator(`[data-ledger-card="${first}"] .path-badge canvas[data-path-icon="volley:ember"]`).count(), 1, 'the card shows its rank icon as a badge');
    assert.equal(s.defend.cards.filter(c => c.kind === 'archerTower' && !c.path).length, 3);
    await page.screenshot({ path: `test-results/cards-${width}-selected.png` });
    await room.locator('[data-gather="archerTower"]').click();
    assert.equal(await room.locator('.ledger-tiles [data-ledger-card][data-card-topic="archerTower"]').count(), 0);
    await room.locator('[data-ledger-stack="wizardTower"]').click();
    const wizard = room.locator('[data-ledger-card][data-card-topic="wizardTower"]').last();
    const wizardId = Number(await wizard.getAttribute('data-ledger-card')); await wizard.click();
    await room.locator('[data-pick="storm:crown"]').click(); await room.locator('[data-evolve="storm"]').click();
    await room.locator(`[data-evolve-card="${wizardId}"]`).click();
    s = await state(page); assert.equal(s.defend.owned.wizardTower, 2); assert.equal(s.defend.owned.darkKeep, 1);
    await page.locator('nav [data-tab="defend"]').click();
    assert.ok(await page.locator('#defend-palette [data-item^="archerTower#"]').count() >= 2, 'build palette distinguishes specialized copies');
    await page.evaluate(async () => {
      const urls = new Set(['/src/defend/ui.ts']);
      for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
      for (const url of urls) {
        const { DefendPage } = await import(url), real = DefendPage.prototype.frame;
        DefendPage.prototype.frame = function(t) { window.__cardsDp = this; return real.call(this, t); };
      }
    });
    await page.waitForFunction(() => window.__cardsDp);
    const palette = await page.locator(`#defend-palette [data-item="archerTower#${first}"]`).boundingBox();
    await page.mouse.move(palette.x + palette.width / 2, palette.y + palette.height / 2); await page.mouse.down();
    const destination = await page.evaluate(() => {
      const dp = window.__cardsDp, r = dp.renderer, box = r.canvas.getBoundingClientRect();
      const entries = [...dp.pointers.session.legal].sort((a, b) => {
        const [ax, ay] = a[0].split(',').map(Number), [bx, by] = b[0].split(',').map(Number), k = dp.host.save().layout.keep;
        return Math.abs(ax - k.tx) + Math.abs(ay - k.ty + 2) - Math.abs(bx - k.tx) - Math.abs(by - k.ty + 2);
      });
      for (const [key] of entries) {
        const [tx, ty] = key.split(',').map(Number);
        const x = box.left + (((tx + 0.5) * 7 * r.px * r.cam.s + r.cam.x) / r.canvas.width) * box.width;
        const y = box.top + (((ty + 0.5) * 7 * r.px * r.cam.s + r.cam.y) / r.canvas.height) * box.height;
        if (x > box.left && x < box.right && y > box.top && y < box.bottom) return { x, y };
      }
      throw new Error('No visible legal tower destination');
    });
    await page.mouse.move(destination.x, destination.y, { steps: 5 }); await page.mouse.up();
    s = await state(page);
    assert.ok(s.defend.cards.find(c => c.id === first).placement?.startsWith('structure:'), 'drag places the chosen specialized identity');
    assert.equal(s.defend.cards.find(c => c.id === second).placement, undefined, 'other specialization stays ready');
    await page.locator('nav [data-tab="mine"]').click(); await page.locator('#mine-smithy').click();
    await page.locator('#mine-chamber [data-subject="towers"]').click();
    await page.locator('#mine-chamber [data-ledger-stack="archerTower"]').click();
    assert.match(await page.locator('#mine-chamber .ledger-scope').textContent(), /GLOBAL EQUIPMENT.*Every Archer tower card/);
    assert.equal(await page.locator('#mine-chamber .ledger-tiles [data-ledger-card]').count(), 0);
    await page.screenshot({ path: `test-results/cards-${width}-smithy.png` });
    await page.locator('nav [data-tab="tiles"]').click();
    await page.locator('.tiles-hall [data-key="archerTower"]').click();
    await page.locator(`.tile-copies [data-copy-card="${first}"]`).click();
    assert.match(await page.locator(`[data-card-detail="${first}"]`).textContent(), /Fire arrows III/);
    await page.locator('[data-stacking]').click();
    await page.locator(`.tiles-grid > [data-copy-card="${first}"]`).click();
    assert.match(await page.locator(`[data-card-detail="${first}"]`).textContent(), /Fire arrows III/);
    await page.reload(); await page.waitForSelector('#defend-start');
    s = await state(page); assert.equal(s.defend.cards.find(c => c.id === first).path, 'fireArrows');
    assert.equal(s.defend.cards.find(c => c.id === wizardId).evolved, 'storm');
    // Reduced motion follows the same flow with no spread animation.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('nav [data-tab="library"]').click(); await page.locator('#library-study').click();
    await page.locator('#library-chamber [data-subject="towers"]').click();
    await page.locator('#library-chamber [data-ledger-stack="archerTower"]').click();
    assert.equal(await page.locator('#library-chamber [data-ledger-card]').first().evaluate(el => el.getAnimations().length), 0);
    assert.deepEqual(errors, []); console.log(`${width}px: spread, animation, separate builds, evolution, palette, Smithy, Tiles, reload and reduced motion passed`);
    await context.close();
  }
} finally { await browser.close(); }
