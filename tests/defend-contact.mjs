// Real board rendering/contact fixture, isolated from saves.
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
    const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
    const { approachBuildingContact, structureContactRect } = await import('/src/defend/contact.ts');
    const { cellIndex } = await import('/src/defend/grid.ts');
    const map = generateCity(fitLayout(defaultLayout()), 3), levels = Object.fromEntries(UPGRADES.map(u => [u.id, 0]));
    const sim = new DefendSim(map, levels, 4); sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
    const wall = map.buildings.filter(b => b.kind === 'wall' && !b.fence && !map.wall[cellIndex(b.rect.x, b.rect.y - 1)]).sort((a, b) => a.rect.y - b.rect.y)[0];
    const board = document.querySelector('canvas'); board.style.cssText = 'width:1000px;height:750px'; board.width = 1000; board.height = 750;
    const gc = board.getContext('2d'); gc.fillStyle = '#211f24'; gc.fillRect(0, 0, 1000, 750);
    const rows = [], pictures = [];
    for (const [index, kind] of ['miniDarkling', 'darkling', 'largeDarkling'].entries()) {
      const e = sim.spawnAuxiliary(kind, wall.rect.x + .5, wall.rect.y - .45); sim.enemies = [e];
      let ticks = 0;
      while (!approachBuildingContact(sim, e, wall, 1 / 30) && ticks++ < 90) {}
      const body = structureContactRect(sim, wall);
      const gap = (body.y - (e.y + ENEMIES[kind].size / 2)) * 8;
      for (const px of [8, 11, 16]) for (const zoom of [1, 2.5, 4]) for (const simple of [false, true]) {
        const cv = document.createElement('canvas'); cv.style.cssText = 'width:500px;height:250px'; document.body.append(cv);
        const renderer = new DefendRenderer(cv); renderer.resize(500, 250); renderer.px = px;
        renderer.cam.s = zoom; renderer.cam.x = 250 - e.x * px * zoom; renderer.cam.y = 110 - wall.rect.y * px * zoom;
        renderer.draw(map, sim, null, { grid: 0, weather: null, night: 0, now: 1000, reduceMotion: true, effects: false, simpleEnemies: simple, mergedOutlines: false });
        const c = cv.getContext('2d'), profile = [];
        for (let y = 101; y <= 114; y++) profile.push([...c.getImageData(250, y, 1, 1).data].slice(0, 3));
        // Interior cardinal boundaries touch at y=110. Pixel centers immediately
        // on either side must be covered by the unit or masonry contour.
        const above = profile[108 - 101], below = profile[110 - 101];
        rows.push({ kind, px, zoom, simple, gap, ticks, above, below, profile });
        if (px === 8 && zoom === 4 && !simple) {
          gc.drawImage(cv, 0, index * 250, 1000, 250);
          gc.fillStyle = '#fff0d5'; gc.font = '18px monospace'; gc.fillText(`${ENEMIES[kind].name}: half crimson + half black = one art pixel`, 20, index * 250 + 30);
        }
        cv.remove();
      }
    }
    return rows;
  });
  mkdirSync('test-results', { recursive: true }); writeFileSync('test-results/contact.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/contact.png' });
  for (const row of result) {
    assert.ok(row.ticks < 90); assert.ok(Math.abs(row.gap - 1) < 1e-8, JSON.stringify(row));
    assert.ok(row.below.every(v => v < 100), `wall contour missing ${JSON.stringify(row)}`);
    if (row.px === 8 && row.zoom === 4) assert.deepEqual(row.above, [255, 36, 84], `red must meet black without an empty row: ${JSON.stringify(row)}`);
  }
  assert.deepEqual(errors, []);
  console.log(`Verified ${result.length} native body/contact renders at 8/11/16 px per cell, three zooms and both enemy graphics settings.`);
} finally { await browser.close(); }
