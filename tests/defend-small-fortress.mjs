// Isolated art fixture: no game page or player-save access.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  const checks = await page.evaluate(async () => {
    const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { drawFortress } = await import('/src/defend/fortress-art.ts');
    const { syncFortress } = await import('/src/defend/fortress.ts');
    const kinds = ['fortressHut', 'fortressOutpost', 'fortressTower', 'fortressKeep', 'fortressLesser'];
    const states = ['Armored', 'Exposed core', 'Damaged', 'Dismantled'];
    const canvas = document.querySelector('canvas');
    canvas.width = 1000; canvas.height = 760;
    canvas.style.cssText = 'width:1000px;height:760px';
    const c = canvas.getContext('2d');
    c.fillStyle = '#211f24'; c.fillRect(0, 0, canvas.width, canvas.height);
    const checks = [];
    states.forEach((state, row) => kinds.forEach((kind, col) => {
      const def = ENEMIES[kind], fort = def.fortress;
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.spawnEnemy(kind);
      const core = sim.enemies[0];
      // Every core uses the same sprite seed: this exposes dimension cache collisions.
      core.id = 4; core.x = (col * 200 + 100) / 24; core.y = (row * 185 + 100) / 24;
      syncFortress(core); sim.time = 2;
      if (row === 1) for (const part of core.fortressParts) if (part.fortressPart.role === 'armor') part.hp = 0;
      if (row === 2) { core.hp *= .3; for (const part of core.fortressParts) part.hp *= .3; }
      if (row === 3) for (const part of core.fortressParts) part.hp = 0;
      const bodies = [];
      const originalDraw = c.drawImage.bind(c);
      c.drawImage = (image, ...args) => {
        if (image.width !== 4 && image.width !== 7 && image.width !== 11) bodies.push([image.width, image.height]);
        originalDraw(image, ...args);
      };
      drawFortress({ c, px: 24 }, core, sim);
      c.drawImage = originalDraw;
      checks.push({ kind, state, bodies, expected: [def.size * 8, fort.height * 8] });
      c.fillStyle = '#e8d8b5'; c.font = '14px monospace'; c.textAlign = 'center';
      c.fillText(def.name, col * 200 + 100, row * 185 + 25);
      c.fillText(`${def.cost} difficulty`, col * 200 + 100, row * 185 + 45);
      c.fillText(state, col * 200 + 100, row * 185 + 169);
    }));
    return checks;
  });
  for (const check of checks) assert.deepEqual(check.bodies, [check.expected], `${check.kind}: ${check.state} body cache`);
  assert.deepEqual(errors, []);
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/small-fortresses.png' });
  console.log(`Verified ${checks.length} fortress renders and body cache dimensions; test-results/small-fortresses.png`);
} finally {
  await browser.close();
}
