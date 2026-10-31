// Native rendering, portraits, weapon colors and motion on desktop/phone. Vite required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async () => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { drawUnits } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { stepEnemy } = await import('/src/defend/enemies.ts');
      const { syncFortress } = await import('/src/defend/fortress.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { basicUnitPieces, basicName } = await import('/src/defend/basic-unit-art.ts');
      document.body.innerHTML = '<h2>Blight walking fortresses</h2>';
      document.body.style.cssText = 'margin:0;padding:16px;box-sizing:border-box;background:#211d26;color:#eacb96;font:16px monospace';
      const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(gallery);
      const kinds = ['blightCannon', 'blightLance', 'blightFortress'];
      const probes = [];
      const inspect = (cv, rect = [0, 0, cv.width, cv.height]) => {
        const data = cv.getContext('2d').getImageData(...rect).data;
        let hash = 0, black = 0, orange = 0;
        for (let i = 0; i < data.length; i += 4) {
          for (let j = 0; j < 4; j++) hash = (Math.imul(hash, 31) + data[i + j]) >>> 0;
          if (data[i + 3] === 255 && data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0) black++;
          if (data[i + 3] > 32 && data[i] > 110 && data[i + 1] > 30 && data[i + 1] < data[i] * .8 && data[i + 2] < 50) orange++;
        }
        return { hash, black, orange };
      };
      for (const kind of kinds) {
        const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
        sim.breakT = 1e9; sim.civilians = []; sim.soldiers = [];
        sim.spawnEnemy(kind);
        const core = sim.enemies[0]; core.x = 2.7; core.y = 2.6; syncFortress(core);
        const card = document.createElement('div'); card.style.cssText = 'width:350px;background:#302b32;padding:8px;box-sizing:border-box';
        const title = document.createElement('div'); title.textContent = ENEMIES[kind].name; card.append(title);
        const cv = document.createElement('canvas'); cv.width = 334; cv.height = 300; card.append(cv);
        const c = cv.getContext('2d'), outline = new UnitOutline();
        const paint = (seconds, reduced = false, simple = false, legacy = false, merged = true) => {
          sim.time = seconds; setPixelArt(!legacy); c.clearRect(0, 0, cv.width, cv.height);
          const before = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('drawing rolled battle RNG'); };
          drawUnits({ c, px: 60 }, sim, null, false, undefined, { reduceMotion: reduced, enemies: simple, merged }, outline, undefined, { defer: true });
          outline.drawContours(c, reduced ? 0 : seconds);
          const size = ENEMIES[kind].size * 60;
          const interior = inspect(cv, [core.x * 60 - size / 2 + 10, core.y * 60 - size / 2 + 10, size - 20, size - 20]);
          return { ...inspect(cv), interior, immutable: before === JSON.stringify(sim.enemies) };
        };
        const a = paint(0), b = paint(.5), reduced0 = paint(0, true), reduced1 = paint(3, true);
        const modes = [];
        for (const simple of [false, true]) for (const legacy of [false, true]) for (const merged of [false, true]) modes.push(paint(0, true, simple, legacy, merged));
        const portrait = document.createElement('canvas'); portrait.width = portrait.height = 80; paintPortrait(portrait, kind); card.append(portrait);
        const turrets = core.fortressParts.filter(p => p.fortressPart.role === 'turret');
        const target = { id: 1000, x: core.x, y: core.y + 1.5, hp: 1000, flash: 0, kind: 'sword' };
        sim.soldiers.push(target);
        for (const turret of turrets) { turret.cd = 0; stepEnemy(sim, turret, 1 / 30); }
        sim.soldiers = [];
        for (const shot of sim.siegeShots) shot.t = shot.dur * .45;
        const fired = paint(1.5);
        gallery.append(card);
        probes.push({ kind, a, b, reduced0, reduced1, modes, portrait: inspect(portrait), fired,
          cannonballs: sim.siegeShots.length, lasers: sim.blightLasers.length,
          exported: basicUnitPieces().some(p => p.name === basicName(kind, true)) });
      }
      return { probes, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await page.screenshot({ path: `test-results/blight-fortresses-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    assert.equal(result.overflow, false);
    for (const probe of result.probes) {
      assert.ok(probe.a.black > 100 && probe.a.orange > 0 && probe.portrait.orange > 0);
      assert.notEqual(probe.a.hash, probe.b.hash, 'particles and portal animate');
      assert.ok(probe.a.interior.orange > 0, 'orange particles appear inside the main body');
      assert.notEqual(probe.a.interior.hash, probe.b.interior.hash, 'internal particles move independently of the portal contour');
      assert.equal(probe.reduced0.hash, probe.reduced1.hash, 'Reduce Motion is still');
      for (const mode of probe.modes) assert.ok(mode.black > 100 && mode.orange > 0 && mode.immutable);
      assert.equal(probe.cannonballs, probe.kind === 'blightLance' ? 0 : 1);
      assert.equal(probe.lasers, probe.kind === 'blightCannon' ? 0 : 1);
      assert.ok(probe.exported);
    }
    assert.deepEqual(errors, []); results.push({ phone, ...result }); await page.close();
  }
  writeFileSync('test-results/blight-fortresses.json', JSON.stringify(results, null, 2));
  console.log('Blight fortress desktop/phone rendering, motion, settings, portraits, exports and weapons passed.');
} finally { await browser.close(); }
