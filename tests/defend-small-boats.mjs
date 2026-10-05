// Isolated hull/water fixture; never opens the game or reads player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 660 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  const result = await page.evaluate(async () => {
    const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { drawBoat } = await import('/src/defend/boat-art.ts');
    const { stepBoat, wetAt } = await import('/src/defend/boats.ts');
    const { FloodArt } = await import('/src/defend/flood-art.ts');
    const kinds = ['boatDinghy', 'boatSailboat', 'boatCutter', 'boatCog', 'boatLesser'];
    const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    const canvas = document.querySelector('canvas'); canvas.width = 1000; canvas.height = 660;
    canvas.style.cssText = 'width:1000px;height:660px';
    const c = canvas.getContext('2d'); c.fillStyle = '#211f24'; c.fillRect(0, 0, 1000, 660);
    const heading = [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: .707, y: .707 }];
    const boats = [];
    heading.forEach((facing, row) => kinds.forEach((kind, col) => {
      const e = sim.newEnemy(kind, (col * 200 + 100) / 32, (row * 220 + 115) / 32);
      sim.enemies.push(e); e.cd = 99; stepBoat(sim, e, 0); e.facing = facing;
      boats.push({ e, row, col });
    }));
    const layer = document.createElement('canvas'); layer.width = 1000; layer.height = 660;
    new FloodArt().draw({ c, px: 32, sim, rain: false, reduceMotion: false, reflections: false, layer, layerScale: 1 });
    const waterPixels = [...new Uint32Array(c.getImageData(0, 0, 1000, 660).data.buffer)].filter(p => p !== 0xff241f21).length;
    for (const { e, row, col } of boats) {
      drawBoat({ c, px: 32 }, e, 2);
      c.fillStyle = '#e8d8b5'; c.font = '14px monospace'; c.textAlign = 'center';
      c.fillText(ENEMIES[e.kind].name, col * 200 + 100, row * 220 + 25);
      c.fillText(`${ENEMIES[e.kind].cost} difficulty`, col * 200 + 100, row * 220 + 45);
      c.fillText(ENEMIES[e.kind].boat.decorativeWater ? 'Visual water / normal ram' : 'Sinking water', col * 200 + 100, row * 220 + 192);
    }
    // Exercise every heading and hit-flash sprite at mobile and desktop scales.
    const probe = document.createElement('canvas'); probe.width = probe.height = 100;
    const g = probe.getContext('2d'), checks = [];
    for (const kind of kinds.slice(0, 4)) for (let dir = 0; dir < 16; dir++) for (const px of [6, 24]) for (const flash of [0, .1]) {
      const e = sim.newEnemy(kind, 50 / px, 50 / px);
      e.facing = { x: Math.cos(dir * Math.PI / 8), y: Math.sin(dir * Math.PI / 8) }; e.flash = flash;
      g.clearRect(0, 0, 100, 100); drawBoat({ c: g, px }, e, 2);
      const opaque = [...new Uint32Array(g.getImageData(0, 0, 100, 100).data.buffer)].filter(p => p >>> 24).length;
      checks.push({ kind, dir, px, flash, opaque });
    }
    return { waterPixels, checks, decorative: sim.floods.filter(f => f.decorative).length, dry: boats.filter(({ e }) => ENEMIES[e.kind].boat.decorativeWater && !wetAt(sim, e.x, e.y)).length };
  });
  assert.deepEqual(errors, []);
  assert.equal(result.decorative, 12); assert.equal(result.dry, 12);
  assert.ok(result.waterPixels > 1000, 'visible water surrounds the hulls');
  for (const check of result.checks) assert.ok(check.opaque >= 8, JSON.stringify(check));
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/small-boats.png' });
  console.log(`Verified visible harmless water and ${result.checks.length} heading/flash/scale renders; test-results/small-boats.png`);
} finally { await browser.close(); }
