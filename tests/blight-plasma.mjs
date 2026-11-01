// Isolated production plasma gallery; no player save access. Requires Vite.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
mkdirSync('test-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 950 }, deviceScaleFactor: phone ? 2 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5174/').href);
    const result = await page.evaluate(async () => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { BLIGHT_PLASMA, plasmaBallRadius, stepPlasma } = await import('/src/defend/blight-plasma.ts');
      const { syncFortress } = await import('/src/defend/fortress.ts');
      const { drawUnits, drawScorches } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { basicUnitPieces, basicName } = await import('/src/defend/basic-unit-art.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      document.body.innerHTML = '<h2>Blight Plasma Fortress</h2><p>15-second charge · arcing plasma · pulsing destruction</p>';
      document.body.style.cssText = 'margin:0;padding:16px;box-sizing:border-box;background:#221e25;color:#e9c797;font:16px monospace';
      const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(gallery);
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.breakT = 1e9; sim.soldiers = []; sim.civilians = []; sim.spawnEnemy('blightPlasmaFortress');
      const core = sim.enemies[0], turret = core.fortressParts.find(p => p.fortressPart.role === 'turret');
      const cv = document.createElement('canvas'); cv.width = 334; cv.height = 300;
      const c = cv.getContext('2d'), outline = new UnitOutline();
      const inspect = canvas => {
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let hash = 0, orange = 0, black = 0;
        for (let n = 0; n < data.length; n += 4) {
          for (let j = 0; j < 4; j++) hash = (Math.imul(hash, 31) + data[n + j]) >>> 0;
          if (data[n + 3] > 100 && data[n] > 130 && data[n + 1] > 30 && data[n + 1] < data[n] * .9 && data[n + 2] < 90) orange++;
          if (data[n + 3] === 255 && !data[n] && !data[n + 1] && !data[n + 2]) black++;
        }
        return { hash, orange, black };
      };
      const paint = (px, reduced = false, simple = false, legacy = false, seconds = 2) => {
        sim.time = seconds; setPixelArt(!legacy); c.clearRect(0, 0, 334, 300);
        const before = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('rendering consumed combat RNG'); };
        drawScorches({ c, px }, sim);
        drawUnits({ c, px }, sim, null, false, undefined, { reduceMotion: reduced, enemies: simple }, outline, undefined, { defer: true });
        outline.drawContours(c, reduced ? 0 : seconds);
        if (before !== JSON.stringify(sim.enemies)) throw Error('rendering changed gameplay state');
        return inspect(cv);
      };
      const saveFrame = title => {
        const card = document.createElement('div'); card.style.cssText = 'width:350px;padding:8px;box-sizing:border-box;background:#342e36';
        const label = document.createElement('div'); label.textContent = title; card.append(label);
        const frame = document.createElement('canvas'); frame.width = 334; frame.height = 300; frame.getContext('2d').drawImage(cv, 0, 0); card.append(frame); gallery.append(card);
      };
      core.x = 167 / 46; core.y = 150 / 46; syncFortress(core);
      const charges = [];
      for (const elapsed of [0, 7.5, 14.99]) {
        turret.plasmaCharge = { elapsed, x: core.x + 8, y: core.y };
        charges.push(paint(46)); saveFrame(`Charging: ${elapsed.toFixed(1)} / 15 seconds`);
      }
      const still0 = paint(46, true, false, false, 0), still1 = paint(46, true, false, false, 10);
      const modes = [];
      for (const simple of [false, true]) for (const legacy of [false, true]) modes.push(paint(46, true, simple, legacy));
      const portrait = document.createElement('canvas'); portrait.width = portrait.height = 80; paintPortrait(portrait, 'blightPlasmaFortress'); document.body.append(portrait);
      sim.enemies = []; sim.effects = [];
      const flight = { x0: 4, y0: 11.5, x1: 14, y1: 11.5, t: 1.5, dur: 3, ballRadius: plasmaBallRadius('blightPlasmaFortress', 1), damage: 10, seed: 91 };
      sim.plasmaShots.push(flight); const flying = paint(18); saveFrame('Full-sized plasma lobbed through a high arc');
      sim.plasmaShots = [{ ...flight, t: 0, dur: 1, x1: 167 / 18, y1: 150 / 18 }];
      stepPlasma(sim, 1.25); const field = paint(18); saveFrame('Massive sphere: repeated damage pulses');
      const sphereStill0 = paint(18, true, false, false, 0), sphereStill1 = paint(18, true, false, false, 10);
      sim.plasmaSpheres = []; sim.effects = [];
      for (const scorch of sim.scorches) scorch.t = 3;
      const aftermath = paint(18); saveFrame('Aftermath: dense glowing cracks, slowly cooling');
      // Compare native scorch factory output at identical size/seed/heat.
      const scorch = sim.scorches[0]; scorch.t = 0;
      sim.scorches = [{ ...scorch, plasma: undefined }]; const regular = paint(18);
      sim.scorches = [{ ...scorch, plasma: true }]; const dense = paint(18);
      return { charges, modes, still0, still1, sphereStill0, sphereStill1, flying, field, aftermath, regular, dense,
        portrait: inspect(portrait), ratio: plasmaBallRadius(core.kind, 1) * 2 / ENEMIES[core.kind].size,
        exported: basicUnitPieces().some(p => p.name === basicName(core.kind, true)),
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await page.screenshot({ path: `test-results/blight-plasma-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    assert.equal(result.overflow, false); assert.equal(result.ratio, .75);
    assert.ok(result.charges[0].orange < result.charges[1].orange && result.charges[1].orange < result.charges[2].orange);
    assert.equal(result.still0.hash, result.still1.hash); assert.equal(result.sphereStill0.hash, result.sphereStill1.hash);
    assert.ok(result.modes.every(p => p.orange > 100 && p.black > 100));
    assert.ok(result.flying.orange > 100 && result.field.orange > 100 && result.aftermath.orange > 100);
    assert.ok(result.dense.orange > result.regular.orange * 1.5, 'plasma leaves substantially denser glowing cracks');
    assert.ok(result.portrait.orange > 0 && result.exported); assert.deepEqual(errors, []);
    results.push({ phone, ...result }); await page.close();
  }
  writeFileSync('test-results/blight-plasma.json', JSON.stringify(results, null, 2));
  console.log('Plasma fortress desktop/phone: charge growth, arc, pulsing sphere, dense cracks, settings, portraits and exports passed.');
} finally { await browser.close(); }
