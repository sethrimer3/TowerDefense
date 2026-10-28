// Golden motes round the upgrade trees: the keep's living tree in Defend
// and a strike spell's path tree in the Study draw gold pixel squares of
// three sizes that drift over time, burst on a purchase, and draw nothing
// under Reduce Motion, desktop and phone. Isolated browser contexts only:
// never reads or changes a player's saved game. Needs `npm run dev`.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
mkdirSync('test-results/tree-motes', { recursive: true });
/** The gold pixels on `selector`'s canvas: how many, and the squares' sides
 * in device pixels (runs of gold along a row). */
const gold = (page, selector) => page.evaluate(sel => {
  const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let count = 0; const sides = new Set();
  for (let y = 0; y < c.height; y++) {
    let run = 0;
    for (let x = 0; x <= c.width; x++) {
      const i = (y * c.width + x) * 4, on = x < c.width && d[i + 3] > 0 && d[i] > 180 && d[i + 1] > 140 && d[i + 2] < 200;
      if (on) { count++; run++; } else if (run) { sides.add(run); run = 0; }
    }
  }
  return { count, sides: [...sides].sort((a, b) => a - b), hash: d.reduce((h, v, i) => (h * 31 + v * (i % 7 + 1)) | 0, 7) };
}, selector);
try {
  for (const [name, viewport, touch] of [['desktop', { width: 1280, height: 900 }, false], ['phone', { width: 390, height: 780 }, true]]) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true; s.knowledge = 1e6;
      s.profile = { name: 'Mote Warden', flag: { base: 3, layers: [] } };
      return s;
    });
    await context.addInitScript(f => { if (!sessionStorage.getItem('motes')) { localStorage.setItem('towerdefense.v1', JSON.stringify(f)); sessionStorage.setItem('motes', '1'); } }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      const { DefendPage } = await import('/src/defend/ui.ts'), real = DefendPage.prototype.frame;
      DefendPage.prototype.frame = function (t) { window.__dp = this; return real.call(this, t); };
    });
    await page.waitForFunction(() => window.__dp);
    // The keep's tree.
    await page.evaluate(() => window.__dp.openSpecialty({ side: 'keep' }));
    await page.waitForSelector('#defend-specialty .ug-motes');
    await page.waitForTimeout(1500);
    const a = await gold(page, '#defend-specialty .ug-motes');
    assert.ok(a.count > 40, `gold motes drawn: ${a.count}`);
    assert.ok(a.sides.length >= 3, `three sizes of square: ${a.sides}`);
    await page.waitForTimeout(500);
    const b = await gold(page, '#defend-specialty .ug-motes');
    assert.notEqual(a.hash, b.hash, 'the motes move');
    await page.screenshot({ path: `test-results/tree-motes/${name}-keep.png` });
    // Panning: the view stops a fifth of the tree's size past it, and the motes go with the tree.
    const host = page.locator('#defend-specialty .ug-host');
    const box = await host.boundingBox();
    const view = () => page.evaluate(() => { const t = window.__dp.tree; return { pan: { ...t.pan }, area: t.area, w: t.el.clientWidth, h: t.el.clientHeight }; });
    const start = await view();
    assert.ok(start.area, 'the pan area is known');
    const drag = async (dx, dy) => {
      const x = box.x + 6, y = box.y + 6;
      if (touch) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let k = 1; k <= 10; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (dx * k) / 10, y: y + (dy * k) / 10 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 10 }); await page.mouse.up();
      }
    };
    await drag(3000, 3000);
    assert.ok(await page.evaluate(() => window.__dp.tree.steered), 'the background drag panned the view');
    const far = await view();
    for (const [p, a0, len, size] of [[far.pan.x, far.area.x, far.area.w, far.w], [far.pan.y, far.area.y, far.area.h, far.h]]) {
      if (len * far.pan.s <= size) assert.ok(Math.abs(p - (size / 2 - (a0 + len / 2) * far.pan.s)) < 1, `centred when it fits: ${JSON.stringify(far)}`);
      else assert.ok(p + a0 * far.pan.s <= 0.5, `the area's near edge never comes inside the view: ${p + a0 * far.pan.s}`);
    }
    assert.ok(far.pan.x !== start.pan.x || far.pan.y !== start.pan.y || start.area.w * start.pan.s <= start.w, 'it panned');
    await page.screenshot({ path: `test-results/tree-motes/${name}-panned.png` });
    const moved = await gold(page, '#defend-specialty .ug-motes');
    assert.ok(moved.count > 20, `motes still fill the panned view: ${moved.count}`);
    // Zooming far out stops a quarter past fitting the tree, and the motes still fill the view, corners too.
    if (!touch) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      for (let k = 0; k < 30; k++) await page.mouse.wheel(0, 400);
      await page.waitForTimeout(1200);
      const out = await page.evaluate(() => { const t = window.__dp.tree; return { s: t.pan.s, fit: t.fit.s }; });
      assert.ok(Math.abs(out.s - out.fit / 1.25) < 1e-6, `zoom out stops a quarter past the fit: ${JSON.stringify(out)}`);
      const corners = await page.evaluate(() => {
        const c = document.querySelector('#defend-specialty .ug-motes'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const q = [0, 0, 0, 0];
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i + 3] > 0 && d[i] > 180) q[(y < c.height / 2 ? 0 : 2) + (x < c.width / 2 ? 0 : 1)]++;
        }
        return q;
      });
      assert.ok(corners.every(n => n > 10), `motes in every quarter of the zoomed-out view: ${corners}`);
      await page.screenshot({ path: `test-results/tree-motes/${name}-zoomed-out.png` });
    }
    // A purchase bursts them (the keep's first rank).
    const first = await page.locator('#defend-specialty .ug-node.next').first().getAttribute('data-node');
    await page.evaluate(id => window.__dp.tree.burst(id), first);
    await page.waitForTimeout(150);
    await page.screenshot({ path: `test-results/tree-motes/${name}-burst.png` });
    // Reduce Motion: none.
    await page.evaluate(() => { const dp = window.__dp; dp.host.reduceMotion = () => true; });
    await page.waitForTimeout(200);
    assert.equal((await gold(page, '#defend-specialty .ug-motes')).count, 0, 'none under Reduce Motion');
    // The Study's spell path tree, drawn by the frame loop's drawCircle.
    await page.evaluate(async () => {
      const { Ledger } = await import('/src/ui/ledger.ts');
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.knowledge = 1e7; s.settings.instantResearch = true;
      const root = document.createElement('div'); root.id = 'motes-study';
      Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: 99, background: '#120e0a', overflow: 'auto' });
      document.body.append(root);
      const ctx = { clock: () => Date.now(), save: () => s, researchers: () => 1, smiths: () => [], update: () => {}, researched: () => {}, openChamber: () => {}, modal: document.createElement('dialog') };
      const ledger = new Ledger(ctx, root, 'study', () => {}); ledger.focus('necromancy'); ledger.render();
      requestAnimationFrame(function f(t) { ledger.drawCircle(t, false); requestAnimationFrame(f); });
    });
    await page.locator('#motes-study [data-pick="amalgam:0"]').click();
    await page.locator('#motes-study [data-learn-path="amalgam"]').click();
    await page.waitForTimeout(1500);
    const c = await gold(page, '#motes-study .path-motes');
    assert.ok(c.count > 40, `gold motes round the spell tree: ${c.count}`);
    assert.ok(c.sides.length >= 3, `three sizes: ${c.sides}`);
    await page.locator('#motes-study .path-tree').screenshot({ path: `test-results/tree-motes/${name}-spell.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('tree motes passed on desktop and phone');
} finally { await browser.close(); }
