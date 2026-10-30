// Production worm motion and art, isolated from player saves. Vite required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' }) });
mkdirSync('test-results', { recursive: true });
const rows = [];
try {
  for (const phone of [false, true]) {
    const label = phone ? 'phone' : 'desktop';
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const initial = await page.evaluate(async phone => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const { generateCity, CellType } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { stepEnemy } = await import('/src/defend/enemies.ts');
      const { drawUnits, drawEnemyArt } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { cellIndex } = await import('/src/defend/grid.ts');
      const { BLIGHT_WORM: W } = await import('/src/defend/blight-worm.ts');
      const { drawWormShadow } = await import('/src/defend/blight-worm-art.ts');
      document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;background:#18151a';
      const width = phone ? 390 : 1280, height = phone ? 844 : 800;
      const cv = document.createElement('canvas'); cv.style.cssText = `width:${width}px;height:${height}px;display:block`;
      document.body.append(cv);
      const map = generateCity(fitLayout(defaultLayout()), 3);
      const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.beginManualWave(20, 1600, 1); sim.breakT = 1e9; sim.civilians = []; sim.soldiers = [];
      sim.scenario = { manualWaves: true, noCivilians: true, ignoreKeepLoss: true };
      sim.rocks.fill(0);
      for (let i = 0; i < map.type.length; i++) if (map.type[i] === CellType.WATER) {
        map.type[i] = CellType.OUT; sim.solid[i] = sim.foeSolid[i] = sim.ownSolid[i] = 0;
      }
      const wall = map.buildings.filter(b => b.kind === 'wall' && !b.fence && !map.wall[cellIndex(b.rect.x, b.rect.y - 1)])
        .sort((a, b) => a.rect.y - b.rect.y || Math.abs(a.rect.x - 36) - Math.abs(b.rect.x - 36))[0];
      sim.hp[wall.id] = sim.maxHp[wall.id] = 1e6;
      sim.releaseEnemy('blightWorm', { x: wall.rect.x + .5, y: wall.rect.y - 5 });
      const segments = sim.enemies.slice(), head = segments[0];
      head.worm.head.surfaceT = head.worm.head.turnT = 1e6;
      const renderer = new DefendRenderer(cv); renderer.resize(width, height);
      const render = (focus = head, scale = phone ? 3 : 2, reduceMotion = true, effects = true) => {
        renderer.cam.s = scale;
        renderer.cam.x = cv.width / 2 - focus.x * renderer.px * scale;
        renderer.cam.y = cv.height / 2 - focus.y * renderer.px * scale;
        renderer.draw(map, sim, null, { grid: 0, weather: null, night: 0, now: sim.time * 1000 + 2000, reduceMotion, effects, enemyHealthbars: true, mergedOutlines: true });
      };
      const tick = (count = 1) => {
        for (let i = 0; i < count; i++) { sim.time += 1 / 120; for (const e of sim.enemies) if (e.hp > 0) stepEnemy(sim, e, 1 / 120); }
      };
      // Pixel proof through the real unit/contour painter, both graphics modes
      // and both Simple settings. Six touching segments must have black joins.
      const joins = [], fireCount = canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let fire = 0; for (let i = 0; i < data.length; i += 4)
          if (data[i + 3] >= 128 && data[i] > 110 && data[i] > data[i + 1] && data[i + 1] > data[i + 2] && data[i + 1] > 25 && data[i] - data[i + 2] > 80) fire++;
        return fire;
      };
      for (const pixelArt of [false, true]) for (const simple of [false, true]) {
        setPixelArt(pixelArt);
        const probe = document.createElement('canvas'); probe.width = 320; probe.height = 320;
        const c = probe.getContext('2d'), px = 64;
        c.translate(160 - head.x * px, 50 - head.y * px);
        const all = sim.enemies; sim.enemies = segments.slice(0, 6);
        drawUnits({ c, px }, sim, null, false, undefined, { enemies: simple }, new UnitOutline(), undefined, {});
        sim.enemies = all;
        const pixels = c.getImageData(157, 28, 6, 8).data;
        joins.push({ pixelArt, simple, black: Array.from(pixels).every((v, i) => v === (i % 4 === 3 ? 255 : 0)), fire: fireCount(probe) });
      }
      // Source/journal paths also render a five-pixel standalone body and a
      // short portal-outlined worm, without any battle state.
      const portraits = [];
      for (const kind of ['significantDarkling', 'blightWorm']) {
        const portrait = document.createElement('canvas'); paintPortrait(portrait, kind);
        portraits.push({ kind, fire: fireCount(portrait) });
      }
      window.wormFixture = { sim, map, renderer, segments, head, wall, tick, render, W, fireCount, drawEnemyArt, drawWormShadow };
      render({ x: head.x, y: head.y - 8 }, phone ? 2 : 1.4);
      return { joins, portraits, segments: segments.length };
    }, phone);
    assert.equal(initial.segments, 50);
    for (const join of initial.joins) { assert.ok(join.black, JSON.stringify(join)); assert.ok(join.fire > 100); }
    for (const portrait of initial.portraits) assert.ok(portrait.fire > 10, JSON.stringify(portrait));
    await page.screenshot({ path: `test-results/blight-worm-trail-${label}.png` });
    const bounce = await page.evaluate(() => {
      const f = window.wormFixture, incoming = { ...f.head.worm.head };
      let ticks = 0;
      while (f.sim.hp[f.wall.id] === 1e6 && ticks++ < 600) f.tick();
      const h = f.head.worm.head;
      f.render({ x: f.wall.rect.x + .5, y: f.wall.rect.y - .7 });
      return { damage: 1e6 - f.sim.hp[f.wall.id], cosine: incoming.dx * h.dx + incoming.dy * h.dy };
    });
    assert.ok(bounce.damage > 0); assert.ok(bounce.cosine <= Math.SQRT1_2 + 1e-8);
    await page.screenshot({ path: `test-results/blight-worm-bounce-${label}.png` });
    const burrow = await page.evaluate(() => {
      const f = window.wormFixture; f.sim.rand = () => 0; f.head.worm.head.surfaceT = 0; f.tick(180);
      const underground = f.segments.filter(e => e.burrow);
      f.render(f.head);
      const probe = document.createElement('canvas'); probe.width = probe.height = 128;
      const c = probe.getContext('2d'); c.translate(64 - f.head.x * 64, 64 - f.head.y * 64);
      f.drawWormShadow({ c, px: 64 }, f.head, f.sim.time, false);
      const data = c.getImageData(40, 40, 48, 48).data;
      return { underground: underground.length, targetable: underground.filter(e => !e.untargetable).length,
        fire: f.fireCount(probe), opaque: Array.from(data).filter((v, i) => i % 4 === 3 && v === 255).length,
        shadow: Array.from(data).filter((v, i) => i % 4 === 3 && v > 0).length };
    });
    assert.ok(burrow.underground > 0 && burrow.shadow > 0); assert.equal(burrow.targetable, 0);
    assert.equal(burrow.fire, 0); assert.equal(burrow.opaque, 0);
    await page.screenshot({ path: `test-results/blight-worm-shadow-${label}.png` });
    const dirt = await page.evaluate(() => {
      const f = window.wormFixture;
      function sample(e, time, effects = true, reduced = false) {
        const probe = document.createElement('canvas'); probe.width = probe.height = 256;
        const c = probe.getContext('2d'); c.translate(128 - e.x * 64, 155 - e.y * 64);
        f.drawWormShadow({ c, px: 64 }, e, time, effects, reduced);
        const data = c.getImageData(0, 0, 256, 256).data;
        let brown = 0, black = 0, hash = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (!data[i + 3]) continue;
          if (data[i] > 50 && data[i] > data[i + 1] && data[i + 1] > data[i + 2]) brown++;
          if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 255) black++;
          hash = (hash * 31 + data[i] + data[i + 3] * 7) | 0;
        }
        return { brown, black, hash, fire: f.fireCount(probe) };
      }
      const body = f.segments.find(e => e.leader !== undefined && e.burrow);
      const result = { head: sample(f.head, 1), body: sample(body, 1), off: sample(f.head, 1, false),
        moving: sample(f.head, 1.3), still: [sample(f.head, 1, true, true), sample(f.head, 9, true, true)] };
      // A close-up on open ground makes the head fountain and body clods easy
      // to inspect, without scenery hiding their pixels in the larger scene.
      const cv = document.createElement('canvas'); cv.width = 640; cv.height = 240; cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;max-width:640px;background:#3e4b36';
      document.body.append(cv); const c = cv.getContext('2d');
      c.translate(150 - f.head.x * 64, 150 - f.head.y * 64); f.drawWormShadow({ c, px: 64 }, f.head, f.sim.time, true);
      c.setTransform(1,0,0,1,450 - body.x * 64,150 - body.y * 64); f.drawWormShadow({ c, px: 64 }, body, f.sim.time, true);
      return result;
    });
    assert.ok(dirt.head.brown > dirt.body.brown * 3 && dirt.body.brown > 0, JSON.stringify(dirt));
    assert.equal(dirt.head.black, 0); assert.equal(dirt.head.fire, 0, JSON.stringify(dirt)); assert.equal(dirt.off.brown, 0, JSON.stringify(dirt));
    assert.notEqual(dirt.head.hash, dirt.moving.hash); assert.deepEqual(dirt.still[0], dirt.still[1]);
    await page.screenshot({ path: `test-results/blight-worm-dirt-${label}.png` });
    await page.evaluate(() => document.querySelector('canvas[style*="position: fixed"]')?.remove());
    const split = await page.evaluate(phone => {
      const f = window.wormFixture, cut = f.segments[24]; cut.hp = 0; f.sim.sweepAway(); f.tick(90);
      const heads = f.sim.enemies.filter(e => e.kind === 'blightWorm' && e.leader === undefined);
      f.render({ x: cut.x, y: cut.y }, phone ? 3 : 2);
      return { heads: heads.length, children: f.sim.enemies.filter(e => e.kind === 'significantDarkling').length };
    }, phone);
    assert.equal(split.heads, 2); assert.equal(split.children, 3);
    await page.screenshot({ path: `test-results/blight-worm-split-${label}.png` });
    await page.evaluate(() => {
      const f = window.wormFixture; f.sim.enemies = [];
      const significant = f.sim.spawnAuxiliary('significantDarkling', f.wall.rect.x - 3, f.wall.rect.y - 4);
      f.render(significant, 8);
    });
    await page.screenshot({ path: `test-results/significant-darkling-${label}.png` });
    const performance = await page.evaluate(async () => {
      const f = window.wormFixture;
      f.sim.enemies = []; f.sim.beginManualWave(20, 0, 1);
      f.sim.releaseEnemy('blightWorm', { x: 14, y: 35 });
      for (let i = 0; i < 400; i++) f.sim.spawnAuxiliary('significantDarkling', 8 + (i % 25) * .75, 10 + Math.floor(i / 25) * .75);
      const frames = [], updates = [], draws = []; let last = 0;
      for (let i = 0; i < 100; i++) {
        const now = await new Promise(requestAnimationFrame), start = performance.now();
        f.sim.update(1 / 60); const mid = performance.now();
        f.render({ x: 20, y: 23 }, 1); const end = performance.now();
        if (i >= 30) { frames.push(now - last); updates.push(mid - start); draws.push(end - mid); }
        last = now;
      }
      const mean = a => a.reduce((s, n) => s + n, 0) / a.length;
      return { enemies: f.sim.enemies.length, updateMs: mean(updates), drawMs: mean(draws), frameP95Ms: frames.sort((a,b) => a-b)[Math.floor(frames.length * .95)] };
    });
    assert.equal(performance.enemies, 450);
    assert.ok(performance.updateMs < 80 && performance.drawMs < 150, JSON.stringify(performance));
    await page.screenshot({ path: `test-results/blight-worm-stress-${label}.png` });
    const burrowPerformance = await page.evaluate(async () => {
      const f = window.wormFixture;
      f.sim.scenario.passiveEnemies = true;
      for (const e of f.sim.enemies) if (e.kind === 'blightWorm') { e.burrow = 1; e.untargetable = true; }
      const rows = [];
      // Isolate the new render work with all fifty segments underground; the
      // live movement/update benchmark above still runs normal native AI.
      for (const effects of [false, true]) {
        const draws = [];
        for (let i = 0; i < 45; i++) {
          await new Promise(requestAnimationFrame); f.sim.time += 1 / 60;
          const start = performance.now(); f.render({ x: 20, y: 23 }, 1, false, effects);
          if (i >= 15) draws.push(performance.now() - start);
        }
        rows.push({ effects, drawMs: draws.reduce((a,b) => a+b, 0) / draws.length });
      }
      return rows;
    });
    assert.ok(burrowPerformance.every(row => row.drawMs < 150), JSON.stringify(burrowPerformance));
    await page.screenshot({ path: `test-results/blight-worm-burrow-stress-${label}.png` });
    assert.deepEqual(errors, []); rows.push({ phone, ...initial, bounce, burrow, dirt, split, performance, burrowPerformance });
    await page.close();
  }
  writeFileSync('test-results/blight-worm.json', JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(rows, null, 2));
} finally { await browser.close(); }
