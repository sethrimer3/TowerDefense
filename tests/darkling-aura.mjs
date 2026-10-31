// Isolated production-renderer and canvas checks; never opens player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DarkDrain } = await import('/src/defend/dark-drain.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { DARK_UNIT_INK } = await import('/src/defend/art-scale.ts');
    const make = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const color = (c, x, y) => [...c.getImageData(x, y, 1, 1).data].slice(0, 3);
    const crowd = n => Array.from({ length: n }, (_, id) => ({ id, kind: 'darkling', hp: 1, x: 20, y: 20 }));
    const gallery = document.querySelector('canvas'); gallery.width = 1200; gallery.height = 900; gallery.style.cssText = 'width:1200px;height:900px';
    const gc = gallery.getContext('2d'); gc.fillStyle = '#131a1c'; gc.fillRect(0, 0, 1200, 900);
    const direct = [];
    // A colored field with opaque actor/shot pixels and a black night panel.
    for (const night of [0, .5, 1]) for (const n of [1, 9, 10, 35, 60]) {
      const cv = make(500, 500), c = cv.getContext('2d'), actors = make(500, 500), ac = actors.getContext('2d');
      c.fillStyle = night ? '#10131b' : '#449b39'; c.fillRect(0, 0, 500, 500);
      ac.fillStyle = '#298de2'; ac.fillRect(198, 198, 4, 4);
      ac.fillStyle = '#f0ad35'; ac.fillRect(215, 198, 4, 4); c.drawImage(actors, 0, 0);
      const d = new DarkDrain(), sim = { enemies: crowd(n), time: 1 };
      d.draw(c, 10, sim, 1000, night, actors);
      direct.push({ n, night, center: color(c, 205, 200), edge: color(c, 280, 200), outside: color(c, 410, 200), unit: color(c, 200, 200), shot: color(c, 216, 200) });
    }
    const map = generateCity(fitLayout(defaultLayout()), 3), levels = Object.fromEntries(UPGRADES.map(u => [u.id, 0]));
    const wall = map.buildings.filter(b => b.kind === 'wall' && !b.fence).sort((a, b) => a.rect.y - b.rect.y)[0];
    const cx = wall.rect.x + 2, cy = wall.rect.y - .5;
    const frames = [], panels = [];
    for (const phone of [false, true]) for (const simple of [false, true]) for (const night of [0, 1]) {
      Object.defineProperty(window, "devicePixelRatio", { value: phone ? 2 : 1, configurable: true });
      const sim = new DefendSim(map, levels, 4); sim.breakT = 1e9; sim.civilians = [];
      for (let i = 0; i < 60; i++) sim.spawnAuxiliary(i % 7 ? 'miniDarkling' : 'darkling', cx - .4 + i % 10 * .12, cy - Math.floor(i / 10) * .18);
      sim.soldiers = [{ id: 900001, kind: 'mage', home: sim.keepId, x: cx + 1.2, y: cy - .2, hp: 22, maxHp: 22, damage: 1, cd: 99, target: -1, path: [], thinkT: 99, flash: 0 }];
      sim.arrows = [{ x: cx - .2, y: cy - 1.5, tx: cx + 1, ty: cy - 1.5, target: -1, damage: 1, life: 1, shot: 'bullet' }];
      sim.scorches = [{ x: cx - 1, y: cy, r: .8, t: 0, life: 10, seed: 3 }];
      const w = phone ? 390 : 600, h = 450, cv = make(w, h); cv.style.cssText = `width:${w}px;height:${h}px`; document.body.append(cv);
      const renderer = new DefendRenderer(cv); renderer.resize(w, h); renderer.px = 12 * (phone ? 2 : 1);
      renderer.cam.s = phone ? 2 : 2.5; renderer.cam.x = cv.width / 2 - cx * renderer.px * renderer.cam.s; renderer.cam.y = cv.height / 2 - cy * renderer.px * renderer.cam.s;
      const opts = { grid: 0, weather: { rain: false }, night, now: 1000, reduceMotion: true, effects: false, simpleEnemies: simple, simpleTroops: simple };
      renderer.draw(map, sim, null, opts);
      renderer.lighting.bakePending(sim.solid, 1000); renderer.draw(map, sim, null, opts);
      const c = cv.getContext('2d'), active = c.getImageData(0, 0, cv.width, cv.height).data, actor = renderer.actors.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const original = renderer.darkDrain.draw.bind(renderer.darkDrain); renderer.darkDrain.draw = () => {};
      renderer.draw(map, sim, null, opts); const plain = c.getImageData(0, 0, cv.width, cv.height).data; renderer.darkDrain.draw = original;
      let protectedPixels = 0, changedActor = 0, worldChanged = 0, maxChromaDrop = 0, maximumGray = 0;
      for (let i = 0; i < active.length; i += 4) {
        const delta = Math.max(...[0, 1, 2].map(k => Math.abs(active[i + k] - plain[i + k])));
        if (actor[i + 3] === 255) { protectedPixels++; if (delta > 1) changedActor++; }
        if (actor[i + 3] === 0 && delta > 2) {
          worldChanged++;
          const before = Math.max(...plain.slice(i, i + 3)) - Math.min(...plain.slice(i, i + 3));
          const after = Math.max(...active.slice(i, i + 3)) - Math.min(...active.slice(i, i + 3));
          maxChromaDrop = Math.max(maxChromaDrop, before - after);
          if (!night && before > 20 && after <= 2) maximumGray++;
        }
      }
      renderer.draw(map, sim, null, opts); const repeated = c.getImageData(0, 0, cv.width, cv.height).data;
      let changedRepeat = 0; for (let i = 0; i < active.length; i++) if (active[i] !== repeated[i]) changedRepeat++;
      frames.push({ phone, simple, night, protectedPixels, changedActor, worldChanged, maxChromaDrop, maximumGray, changedRepeat });
      if (!phone && !simple) {
        const copy = make(600, 450); copy.getContext('2d').drawImage(cv, 0, 0, 600, 450); panels.push({ night, active: copy });
        renderer.darkDrain.draw = () => {}; renderer.draw(map, sim, null, opts);
        const before = make(600, 450); before.getContext('2d').drawImage(cv, 0, 0, 600, 450); panels.push({ night, plain: before });
      }
      cv.remove();
    }
    for (const p of panels) {
      const x = p.plain ? 0 : 600, y = p.night ? 450 : 0; gc.drawImage(p.plain ?? p.active, x, y);
      gc.fillStyle = '#f4ead5'; gc.font = '19px monospace'; gc.fillText(`${p.night ? 'Night' : 'Day'}: ${p.plain ? 'without aura' : 'color drain + protected units/shots'}`, x + 15, y + 28);
    }
    // The world darkness scalar is nonzero at sunset/dusk/twilight/dawn.
    // A lone Blight isolates the halo from the thresholded grayscale effect.
    const solar = await import('/src/daylight.ts'); let phase = 'day';
    solar.useDayClock(new solar.DayClock(), () => ({ dayNightCycle: false, timeOfDay: phase }));
    const phases = [];
    for (phase of solar.TIMES_OF_DAY) {
      const sim = new DefendSim(map, levels, 4); sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
      sim.spawnAuxiliary('darkling', cx, cy);
      const cv = make(600, 450); cv.style.cssText = 'width:600px;height:450px'; document.body.append(cv);
      const r = new DefendRenderer(cv); r.resize(600, 450); r.px = 12;
      r.cam.s = 2.5; r.cam.x = cv.width / 2 - cx * r.px * r.cam.s; r.cam.y = cv.height / 2 - cy * r.px * r.cam.s;
      const opts = { grid: 0, weather: { rain: false }, night: 1, now: 1000, reduceMotion: true, effects: false };
      let glowNight;
      const draw = r.darkDrain.draw.bind(r.darkDrain);
      r.darkDrain.draw = (c, px, sim, now, night, actors) => { glowNight = night; draw(c, px, sim, now, night, actors); };
      r.draw(map, sim, null, opts); r.lighting.bakePending(sim.solid, 1000); r.draw(map, sim, null, opts);
      const c = cv.getContext('2d'), lit = c.getImageData(0, 0, cv.width, cv.height).data;
      r.darkDrain.draw = () => {}; r.draw(map, sim, null, opts);
      const bare = c.getImageData(0, 0, cv.width, cv.height).data;
      let changed = 0; for (let i = 0; i < lit.length; i += 4) if ([0, 1, 2].some(k => Math.abs(lit[i + k] - bare[i + k]) > 1)) changed++;
      phases.push({ phase, darkness: solar.worldSky().night, glowNight, changed }); cv.remove();
    }
    // Include density/raster/mask compositing in the crowd timing. A paused
    // repeat must allocate no new canvas and perform no scene reads.
    const cv = make(600, 450), c = cv.getContext('2d'), actors = make(600, 450), drain = new DarkDrain();
    const es = Array.from({ length: 10000 }, (_, i) => ({ ...crowd(1)[0], x: .5 + i * 7 % 71, y: .5 + i * 13 % 103 })), sim = { enemies: es, time: 1 };
    drain.draw(c, 6, sim, 1000, 1, actors);
    const saved = document.createElement.bind(document), get = CanvasRenderingContext2D.prototype.getImageData;
    let allocations = 0, reads = 0; document.createElement = (...args) => { if (args[0] === 'canvas') allocations++; return saved(...args); };
    CanvasRenderingContext2D.prototype.getImageData = function (...args) { reads++; return get.apply(this, args); };
    const times = [], steady = [];
    try {
      for (let i = 0; i < 30; i++) { sim.time++; const t = performance.now(); drain.draw(c, 6, sim, 1000 + (i + 1) * 100, 1, actors); times.push(performance.now() - t); }
      for (let i = 0; i < 30; i++) { const t = performance.now(); drain.draw(c, 6, sim, 10000, 1, actors); steady.push(performance.now() - t); }
    } finally { document.createElement = saved; CanvasRenderingContext2D.prototype.getImageData = get; }
    times.sort((a, b) => a - b); steady.sort((a, b) => a - b);
    return { ink: DARK_UNIT_INK, direct, frames, phases, crowd: { n: es.length, medianUpdateMs: times[15], p95UpdateMs: times[28], medianSteadyMs: steady[15], allocations, reads } };
  });
  mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/darkling-aura.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/darkling-aura.png' });
  assert.equal(result.ink, '#9c1235');
  for (const row of result.direct) { assert.deepEqual(row.unit, [41, 141, 226]); assert.deepEqual(row.shot, [240, 173, 53]); }
  const find = (n, night) => result.direct.find(r => r.n === n && r.night === night);
  assert.deepEqual(find(9, 0).center, [68, 155, 57]); assert.notDeepEqual(find(10, 0).center, find(9, 0).center);
  assert.equal(Math.max(...find(60, 0).center) - Math.min(...find(60, 0).center), 0);
  assert.ok(find(60, 1).center[0] > find(10, 1).center[0] && find(10, 1).center[0] > find(1, 1).center[0]);
  assert.deepEqual(find(60, 1).outside, [16, 19, 27]);
  const orange = find(60, 1).center; assert.ok(orange[0] > orange[1] * 2 && orange[1] > orange[2] && orange[0] < 100, 'dim deep orange at maximum density');
  for (const p of result.phases) {
    if (p.phase === 'night') { assert.ok(p.glowNight > 0 && p.changed > 20, JSON.stringify(p)); }
    else { assert.equal(p.glowNight, 0, JSON.stringify(p)); assert.equal(p.changed, 0, JSON.stringify(p)); }
  }
  for (const row of result.frames) {
    assert.ok(row.protectedPixels > 10, JSON.stringify(row)); assert.equal(row.changedActor, 0, JSON.stringify(row));
    assert.ok(row.worldChanged > 100 && row.maxChromaDrop > 10, JSON.stringify(row));
    if (!row.night) assert.ok(row.maximumGray > 10, JSON.stringify(row));
    assert.equal(row.changedRepeat, 0, JSON.stringify(row));
  }
  assert.equal(result.crowd.allocations, 0); assert.equal(result.crowd.reads, 0); assert.deepEqual(errors, []);
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
