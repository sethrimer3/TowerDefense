// Native gate simulation and door animation, with isolated desktop/phone canvases.
// Requires npm run dev; never reads or writes a player's save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: width < 500 });
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async width => {
      const { defaultLayout, placeCityTile, placeGate, fitLayout } = await import('/src/defend/layout.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaults } = await import('/src/save.ts');
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const { stepGates } = await import('/src/defend/gates.ts');
      const { cellAt, findPath } = await import('/src/defend/pathing.ts');
      let l = defaultLayout(); l = placeCityTile(l, l.keep.tx, l.keep.ty - 1);
      l = placeGate(l, { tx: l.keep.tx, ty: l.keep.ty - 1, side: 'n' });
      const map = generateCity(fitLayout(l), 11), sim = new DefendSim(map, defaults().defend.levels, 3);
      const b = sim.gates[0], r = b.rect;
      const renderer = new DefendRenderer(document.querySelector('canvas'));renderer.resize(width, 900);
      renderer.cityLife.sync(map, sim, false);
      for (const p of renderer.cityLife.people) p.hidden = true;
      const u = { x: r.x + 1.5, y: r.y + r.h + .5, hp: 10, path: [] };
      sim.civilians.push(u);
      const tick = (seconds, battle = sim, reduced = false) => {
        for (let i = 0; i < seconds * 30; i++) {
          if (battle) stepGates(battle, 1 / 30);
          renderer.drawGates(map, battle, { reduceMotion: reduced }, 1 / 30);
        }
        return renderer.gateOpen.get(b.id) || 0;
      };
      const values = [];
      values.push(tick(.6)); // idle beside it
      u.path = [cellAt(u.x + 1, u.y)];values.push(tick(.6)); // parallel
      u.path = findPath(sim.ownSolid, u, { x: u.x, y: r.y - 1.5 }, { maxCost: 40 });
      values.push(tick(.6));
      const foeCanPass = b.cells.every(c => !sim.foeSolid[c]);
      u.path = [];values.push(tick(2.5)); // cancelled but still beside it
      const foeBarred = b.cells.every(c => sim.foeSolid[c]);
      // Cosmetic residents use the same intent for build-phase animation.
      const p = renderer.cityLife.people[0];Object.assign(p, { x: u.x, y: u.y, hidden: false, path: [] });
      values.push(tick(.6, null));
      p.path = findPath(renderer.cityLife.solid, p, { x: p.x, y: r.y - 1.5 }, { maxCost: 40 });
      values.push(tick(.6, null));
      p.path = [];values.push(tick(.6, null, true));
      return { values, foeCanPass, foeBarred };
    }, width);
    assert.deepEqual(result.values, [0, 0, 1, 0, 0, 1, 0]);
    assert.equal(result.foeCanPass, true);assert.equal(result.foeBarred, true);
    await page.close();
  }
  console.log('Gate simulation and animation require crossing intent on desktop/phone; idle, parallel, cancelled and cosmetic routes pass.');
} finally { await browser.close(); }
