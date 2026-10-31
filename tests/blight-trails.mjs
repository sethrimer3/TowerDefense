// Run against Vite; isolated browser contexts, no player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const out = process.env.SHOTS || 'test-results'; mkdirSync(out, { recursive: true });
try {
  for (const width of [1280, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, hasTouch: width < 500, isMobile: width < 500 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
    await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      const urls = new Set(['/src/defend/ui.ts']);
      for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
      for (const url of urls) {
        const { DefendPage } = await import(url), real = DefendPage.prototype.frame;
        if (real.__blightHook) continue;
        DefendPage.prototype.frame = function(t) { window.__dp = this; return real.call(this, t); };
        DefendPage.prototype.frame.__blightHook = true;
      }
    });
    await page.waitForFunction(() => window.__dp);
    const results = await page.evaluate(async () => {
      const { BlightTrail } = await import('/src/defend/blight-trail.ts');
      const { treeSprite } = await import('/src/defend/forest-art.ts');
      const { witheredTreeSprite } = await import('/src/defend/blight-art.ts');
      const { spriteCanvas, drawSprite } = await import('/src/defend/damage-art.ts');
      const { ParkTrees } = await import('/src/defend/park-trees.ts');
      const { CellType } = await import('/src/defend/citygen.ts');
      const { canopyRadius } = await import('/src/defend/forest.ts');
      const dp = window.__dp; dp.startRun(); const sim = dp.sim, r = dp.renderer;
      sim.speed = 0; sim.breakT = 1e9; sim.enemies = [];
      const opts = { area: 'moss', grid: 0, weather: null, night: 0, now: 1000, reduceMotion: true, effects: true };
      r.draw(sim.map, sim, null, opts);
      const tree = r.forest.forestPlan.trees.find(t => t.size === 3 && t.x > 7 && t.x < 65 && t.y > 7 && t.y < 95);
      Object.assign(r.cam, { s: 4, x: r.canvas.width / 2 - tree.x * r.px * 4, y: r.canvas.height / 2 - tree.y * r.px * 4 });
      const snap = (time, extra = {}) => { sim.time = time; r.draw(sim.map, sim, null, { ...opts, now: time * 1000, ...extra }); return r.canvas.toDataURL(); };
      const before = snap(1);
      // Passing directly under the huge crown, then through the surrounding grass.
      const walk = (kind, count) => {
        for (let n = 0; n < count; n++) for (let k = 0; k < 40; k++) {
          const x = tree.x - 5 + (k + 1) * .25, y = tree.y;
          sim.blight.travel({ kind, x, y, hp: 100 }, x - .25, y);
        }
      };
      walk('miniDarkling', 20);
      const weakStage = sim.blight.treeStage(tree.x, tree.y, tree.r), weak = snap(2);
      walk('significantDarkling', 30);
      const strongStage = sim.blight.treeStage(tree.x, tree.y, tree.r), dead = snap(3);
      const still = snap(3), effectsOff = snap(4, { effects: false, simpleEnemies: true });
      // All stages of the actual procedural sprites, at an integer pixel zoom.
      const gallery = Object.assign(document.createElement('canvas'), { width: 900, height: 510 });
      const c = gallery.getContext('2d'); c.fillStyle = '#283326'; c.fillRect(0, 0, 900, 510);
      c.font = '18px sans-serif'; c.fillStyle = '#eee2c1';
      ['Living', 'Withered', 'Thinning', 'Dead'].forEach((s, i) => c.fillText(s, 155 + i * 175, 28));
      for (const [row, kind] of ['oak', 'pine', 'bush'].entries()) {
        const size = kind === 'bush' ? 0 : 3, radius = canopyRadius(kind, 1, size), source = treeSprite(kind, 1, 0, size);
        c.fillStyle = '#eee2c1'; c.fillText(kind, 12, 105 + row * 155);
        for (let stage = 0; stage < 4; stage++) {
          const s = witheredTreeSprite(source, stage, radius, 1), cv = spriteCanvas(s.px, s.w, s.h);
          const scale = kind === 'bush' ? 6 : 2.5;
          drawSprite(c, cv, 200 + stage * 175 - s.ox * scale, 110 + row * 155 - s.oy * scale, s.w * scale, s.h * scale);
        }
      }
      // Park canopy path, including dead source-canvas caching.
      const park = new ParkTrees(), parkMap = { ...sim.map, type: sim.map.type.slice() };
      // Always exercise parks even if this run's generated starter city has none.
      for (let y = 30; y < 35; y++) for (let x = 30; x < 35; x++) parkMap.type[y * 72 + x] = CellType.PARK;
      park.sync(parkMap);
      for (const t of park.trees) for (let n = 0; n < 20; n++) sim.blight.travel({ kind: 'significantDarkling', hp: 100, x: t.cx + .5, y: t.cy }, t.cx - .5, t.cy);
      snap(5);
      park.draw(r.ctx, r.px, undefined, sim.blight);
      return { before, weak, dead, still, effectsOff, gallery: gallery.toDataURL(), weakStage, strongStage, samples: sim.blight.touched.length, parkTrees: park.trees.length };
    });
    assert.ok(results.weakStage < 3, 'large tree survives a small group');
    assert.equal(results.strongStage, 3, 'strong group kills the large tree');
    assert.notEqual(results.before, results.weak, 'dead grass changes actual game pixels');
    assert.notEqual(results.weak, results.dead, 'dead crown changes actual game pixels');
    assert.equal(results.dead, results.still, 'paused Reduce Motion frames retain identical vegetation pixels');
    assert.ok(results.samples > 0); assert.ok(results.parkTrees > 0);
    for (const name of ['before', 'weak', 'dead', 'effectsOff', 'gallery']) writeFileSync(`${out}/blight-${width}-${name}.png`, Buffer.from(results[name].split(',')[1], 'base64'));
    assert.deepEqual(errors, []);
    console.log(`blight ${width}: grass trails, huge-tree resistance, dead crown, park trees, Reduce Motion and Effects Off passed`);
    await context.close();
  }
} finally { await browser.close(); }
