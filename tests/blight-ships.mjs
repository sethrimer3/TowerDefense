// Isolated native/Blight ship gallery; no player saves. Requires Vite.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 950 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async () => {
      const { BLIGHT_SHIPS, ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { drawUnits } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { boatPieces } = await import('/src/defend/boat-art.ts');
      const { ART_NAMES } = await import('/src/defend/art-overrides.ts');
      document.body.innerHTML = '<h2>Blight ships</h2><p>Original ships beside their Blight counterparts</p>';
      document.body.style.cssText = 'margin:0;padding:16px;box-sizing:border-box;background:#211d26;color:#eacb96;font:16px monospace';
      const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(gallery);
      const pieces = boatPieces(), probes = [];
      const inspect = cv => {
        const data = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let hash = 0, black = 0, orange = 0, red = 0;
        for (let i = 0; i < data.length; i += 4) {
          for (let k = 0; k < 4; k++) hash = (Math.imul(hash, 31) + data[i + k]) >>> 0;
          const [r, g, b, a] = data.subarray(i, i + 4);
          if (a > 128 && r === 0 && g === 0 && b === 0) black++;
          if (a > 128 && r > 150 && g > 50 && g < r * .8 && b < 60) orange++;
          if (a > 128 && r > 100 && g < 110 && r > g * 2 && b > g) red++;
        }
        return { hash, black, orange, red };
      };
      for (const [kind, source] of Object.entries(BLIGHT_SHIPS)) {
        const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
        sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
        for (const [n, k] of [source, kind].entries()) {
          const e = sim.newEnemy(k, n ? 7.8 : 2.6, 2.7); e.facing = { x: 0, y: -1 }; sim.enemies.push(e);
        }
        const card = document.createElement('div'); card.style.cssText = 'width:350px;padding:8px;box-sizing:border-box;background:#302b32';
        const label = document.createElement('div'); label.textContent = ENEMIES[kind].name; card.append(label);
        const cv = document.createElement('canvas'); cv.width = 334; cv.height = 185; card.append(cv);
        const c = cv.getContext('2d'), outline = new UnitOutline();
        const paint = (seconds, reduced = false, simple = false, legacy = false, merged = true) => {
          sim.time = seconds; setPixelArt(!legacy); c.clearRect(0, 0, cv.width, cv.height);
          const before = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('art consumed combat RNG'); };
          drawUnits({ c, px: 32 }, sim, null, false, undefined, { reduceMotion: reduced, enemies: simple, merged }, outline, undefined, { defer: true });
          outline.drawContours(c, reduced ? 0 : seconds);
          return { ...inspect(cv), immutable: before === JSON.stringify(sim.enemies) };
        };
        const initial = paint(0), animated = paint(.5), still0 = paint(0, true), still1 = paint(5, true);
        const modes = [];
        for (const simple of [false, true]) for (const legacy of [false, true]) for (const merged of [false, true]) modes.push(paint(0, true, simple, legacy, merged));
        const portrait = document.createElement('canvas'); portrait.width = portrait.height = 80; paintPortrait(portrait, kind); card.append(portrait);
        paint(1.25); gallery.append(card);
        probes.push({ kind, initial, animated, still0, still1, modes, portrait: inspect(portrait),
          exports: pieces.filter(p => p.name.startsWith(ART_NAMES.enemy(kind, 'boat-'))).length });
      }
      return { probes, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await page.screenshot({ path: `test-results/blight-ships-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    assert.equal(result.overflow, false); assert.equal(result.probes.length, 8);
    for (const probe of result.probes) {
      for (const image of [probe.initial, probe.portrait, ...probe.modes]) assert.ok(image.black > 0 && image.orange > 0 && image.red > 0, JSON.stringify(probe));
      assert.notEqual(probe.initial.hash, probe.animated.hash, 'runes, foam and portal animate');
      assert.equal(probe.still0.hash, probe.still1.hash, 'Reduce Motion freezes ship art');
      assert.ok(probe.modes.every(mode => mode.immutable)); assert.equal(probe.exports, 64);
    }
    assert.deepEqual(errors, []); results.push({ phone, ...result }); await page.close();
  }
  writeFileSync('test-results/blight-ships.json', JSON.stringify(results, null, 2));
  console.log('Eight Blight ships: desktop/phone, colors, motion, settings, portraits and 512 sprite exports passed.');
} finally { await browser.close(); }
