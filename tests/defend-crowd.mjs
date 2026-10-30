// Isolated Blight formation/contour checks and simulation crowd timings.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES, enemySize } = await import('/src/defend/catalog.ts');
    const { routeToBuilding, stepEnemy, prepareCrowdAttacks, transferCrowdAttacks } = await import('/src/defend/enemies.ts');
    const { buildingContactPoint } = await import('/src/defend/contact.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const make = () => new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    const phase = (s, b) => { s.time += 1 / 30; s.crowd.begin(s); prepareCrowdAttacks(s); for (const e of s.enemies) stepEnemy(s, e, 1 / 30); transferCrowdAttacks(s); s.crowd.end(); s.flash.fill(0); };
    const gallery = document.querySelector('canvas'); gallery.width = 1000; gallery.height = 750; gallery.style.cssText = 'width:1000px;height:750px';
    const gc = gallery.getContext('2d'); const frames = [];
    for (const [index, simple] of [false, true].entries()) {
      const s = make(); s.soldiers = []; s.civilians = [];
      const b = s.map.buildings.filter(b => b.kind === 'wall' && !b.fence).sort((a, b) => a.rect.y - b.rect.y)[0]; s.hp[b.id] = 1e6; s.computeField(); const field = s.targetField(b.cells);
      s.scenario = { manualWaves: true, noCivilians: true, routeEnemy(e, dt) { routeToBuilding(s, e, b.id, dt, field); return true; } };
      for (let i = 0; i < 64; i++) { const e = s.spawnAuxiliary('darkling', b.rect.x + .5 + (i % 8 - 3.5) * .26, b.rect.y - 1.5 - Math.floor(i / 8) * .27); e.jx = e.jy = 0; }
      for (let i = 0; i < 180; i++) phase(s, b);
      let overlaps = 0;
      for (let i = 0; i < s.enemies.length; i++) for (let j = 0; j < i; j++) {
        const a = s.enemies[i], o = s.enemies[j], h = (enemySize(a) + enemySize(o)) / 2;
        if (Math.abs(a.x - o.x) < h - 1e-8 && Math.abs(a.y - o.y) < h - 1e-8) overlaps++;
      }
      const hp = s.hp[b.id]; for (const e of s.enemies) e.cd = 0; phase(s, b);
      const cv = document.createElement('canvas'); cv.style.cssText = 'width:500px;height:750px'; document.body.append(cv);
      const renderer = new DefendRenderer(cv); renderer.resize(500, 750); renderer.px = 12;
      renderer.cam.s = 4; renderer.cam.x = 250 - (b.rect.x + .5) * 12 * 4; renderer.cam.y = 470 - b.rect.y * 12 * 4;
      renderer.draw(s.map, s, null, { grid: 0, weather: null, night: index, now: 1000, reduceMotion: true, effects: false, simpleEnemies: simple });
      gc.drawImage(cv, index * 500, 0, 500, 750); cv.remove();
      gc.fillStyle = '#fff0db'; gc.font = '18px monospace'; gc.fillText(`${simple ? 'Simple / night' : 'Normal / day'} · 64 Darklings`, index * 500 + 18, 32);
      frames.push({ simple, overlaps, damage: hp - s.hp[b.id], relayVisits: s.crowd.work.relayVisits, bodies: s.enemies.length, waiting: s.crowd.work.waiting });
    }
    // A fractional camera must not reveal red seams between flush body fills.
    const seams = [];
    for (const simple of [false, true]) {
      const s = make(); s.soldiers = []; s.civilians = [];
      for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) s.spawnAuxiliary('darkling', 10 + col * .25, 10 + row * .25);
      const cv = Object.assign(document.createElement('canvas'), { width: 200, height: 180 }), c = cv.getContext('2d');
      c.setTransform(1.3, 0, 0, 1.3, -190.3, -190.3); const outline = new UnitOutline();
      drawUnits({ c, px: 20 }, s, null, false, undefined, { enemies: simple, troops: true }, outline, undefined, { defer: true }); outline.drawContours(c);
      const start = (10 - .125) * 20 * 1.3 - 190.3, endX = (11.25 + .125) * 20 * 1.3 - 190.3, endY = (11 + .125) * 20 * 1.3 - 190.3;
      let nonBlack = 0;
      for (let y = Math.ceil(start + 1); y < Math.floor(endY - 1); y++) for (let x = Math.ceil(start + 1); x < Math.floor(endX - 1); x++) {
        const p = c.getImageData(x, y, 1, 1).data; if (p[0] || p[1] || p[2] || p[3] !== 255) nonBlack++;
      }
      seams.push({ simple, nonBlack });
    }
    const gaps = [];
    for (const simple of [false, true]) {
      const s = make(); s.soldiers = []; s.civilians = [];
      for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) s.spawnAuxiliary('darkling', 10 + col * .27, 10 + row * .25);
      const cv = Object.assign(document.createElement('canvas'), { width: 200, height: 180 }), c = cv.getContext('2d');
      c.fillStyle = '#347b2a'; c.fillRect(0, 0, 200, 180); c.setTransform(2, 0, 0, 2, -350, -350);
      const outline = new UnitOutline(); drawUnits({ c, px: 20 }, s, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true }); outline.drawContours(c);
      let interiorCrimson = 0;
      for (let y = 50; y < 75; y++) for (let x = 50; x < 75; x++) {
        const p = c.getImageData(x, y, 1, 1).data; if (p[0] > 50 && p[0] > p[1] * 2) interiorCrimson++;
      }
      gaps.push({ simple, interiorCrimson });
    }
    const timings = [];
    for (const n of [1000, 5000, 10000]) {
      const s = make(); s.soldiers = []; s.civilians = [];
      const b = s.map.buildings.filter(b => b.kind === 'wall' && !b.fence).sort((a, b) => a.rect.y - b.rect.y)[0]; s.hp[b.id] = 1e6;
      const first = s.spawnAuxiliary('miniDarkling', b.rect.x + .5, b.rect.y - .125); Object.assign(first, buildingContactPoint(s, first, b));
      // This stress fixture exceeds the native 5,000 release cap deliberately.
      s.enemies = Array.from({ length: n }, (_, i) => ({ ...first, id: i + 1, x: first.x + i % 100 * .125, y: first.y - Math.floor(i / 100) * .125 }));
      const samples = [];
      for (let round = 0; round < 15; round++) {
        const t = performance.now(); s.crowd.begin(s); prepareCrowdAttacks(s);
        // first is a template, use the indexed front as the actual source.
        routeToBuilding(s, s.enemies[0], b.id, 0, s.field); transferCrowdAttacks(s); s.crowd.end();
        if (round >= 5) samples.push(performance.now() - t);
      }
      samples.sort((a, b) => a - b); timings.push({ n, medianMs: samples[5], p95Ms: samples[9], ...s.crowd.work });
    }
    return { frames, seams, gaps, timings };
  });
  mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/crowd.json', JSON.stringify(result, null, 2)); await page.screenshot({ path: 'test-results/crowd.png' });
  for (const row of result.frames) { assert.equal(row.overlaps, 0, JSON.stringify(row)); assert.equal(row.waiting, 0); assert.ok(row.damage > 8, JSON.stringify(row)); }
  for (const row of result.seams) assert.equal(row.nonBlack, 0, JSON.stringify(row));
  for (const row of result.gaps) assert.equal(row.interiorCrimson, 0, JSON.stringify(row));
  for (const row of result.timings) { assert.ok(row.candidates < row.n * 160, JSON.stringify(row)); assert.equal(row.relayVisits, row.n); }
  assert.deepEqual(errors, []); console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
