// Real contour masks across walking cycles, plus footfall dust; no player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5175/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
    const { syncFortress } = await import('/src/defend/fortress.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { PORTAL_UNIT_INK, NEUTRAL_UNIT_INK } = await import('/src/defend/art-scale.ts');
    const { fortressFootfalls, drawFortressFootfalls } = await import('/src/defend/fortress-footfall-art.ts');
    const cv = document.querySelector('canvas'); cv.width = cv.height = 384;
    const c = cv.getContext('2d'), probes = [], examples = [];
    // Square dilation bounds the contour in each direction. A knee miter can
    // project many times beyond this native rim width as the leg folds.
    const spikes = (outline, ink) => {
      const channel = outline.contours.channels.get(ink), r = Math.ceil(channel.radius) + 2;
      const body = outline.layer.c.getImageData(0, 0, 384, 384).data;
      const rim = channel.c.getImageData(0, 0, 384, 384).data;
      const horizontal = new Uint8Array(384 * 384), dilated = new Uint8Array(384 * 384);
      for (let y = 0; y < 384; y++) {
        let n = 0;
        for (let x = -r; x < 384; x++) {
          if (x + r < 384 && body[(y * 384 + x + r) * 4 + 3] >= 128) n++;
          if (x - r - 1 >= 0 && body[(y * 384 + x - r - 1) * 4 + 3] >= 128) n--;
          if (x >= 0) horizontal[y * 384 + x] = n > 0 ? 1 : 0;
        }
      }
      for (let x = 0; x < 384; x++) {
        let n = 0;
        for (let y = -r; y < 384; y++) {
          if (y + r < 384) n += horizontal[(y + r) * 384 + x];
          if (y - r - 1 >= 0) n -= horizontal[(y - r - 1) * 384 + x];
          if (y >= 0) dilated[y * 384 + x] = n > 0 ? 1 : 0;
        }
      }
      let count = 0;
      for (let i = 0; i < dilated.length; i++) if (!dilated[i] && rim[i * 4 + 3] >= 64) count++;
      return count;
    };
    for (const kind of ['blightCannon', 'blightFortress', 'blightPlasmaFortress', 'fortressHut', 'fortress', 'fortressSovereign']) {
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.breakT = 1e9; sim.soldiers = []; sim.civilians = []; sim.spawnEnemy(kind);
      const core = sim.enemies[0], def = ENEMIES[kind], px = 160 / def.size, outline = new UnitOutline();
      core.x = core.y = 192 / px; syncFortress(core);
      let count = 0, worst = 0;
      for (const simple of [false, true]) for (const facing of [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: .6, y: -.8 }]) for (let n = 0; n < 32; n++) {
        core.facing = facing; core.walker.walk = n / 32 * .65 * (def.fortress.partScale ?? 1); sim.time = n / 30;
        c.clearRect(0, 0, 384, 384);
        drawUnits({ c, px }, sim, null, false, undefined, { enemies: simple }, outline, undefined, { defer: true });
        const bad = spikes(outline, def.blightFortress ? PORTAL_UNIT_INK : NEUTRAL_UNIT_INK);
        count += bad; worst = Math.max(worst, bad);
      }
      core.facing = { x: 0, y: 1 };
      const stride = .65 * (def.fortress.partScale ?? 1);
      core.walker.walk = 0; fortressFootfalls(core, 2);
      core.walker.walk = stride * .49; fortressFootfalls(core, 2.1);
      core.walker.walk = stride * .51; sim.time = 2.12;
      const state = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('art must not roll'); };
      const dust = fortressFootfalls(core, sim.time).length;
      c.clearRect(0, 0, 384, 384); drawFortressFootfalls({ c, px }, sim);
      const pixels = c.getImageData(0, 0, 384, 384).data;
      const dustPixels = pixels.filter((v, i) => i % 4 === 3 && v > 0).length;
      c.clearRect(0, 0, 384, 384);
      drawUnits({ c, px }, sim, null, false, undefined, {}, outline, undefined, { defer: true }); outline.drawContours(c, 2.12);
      const body = outline.layer.c.getImageData(0, 0, 384, 384).data;
      const rim = outline.contours.channels.get(def.blightFortress ? PORTAL_UNIT_INK : NEUTRAL_UNIT_INK).c.getImageData(0, 0, 384, 384).data;
      let visibleDust = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8 && body[i] < 32 && rim[i] < 32) visibleDust++;
      examples.push({ label: def.name, url: cv.toDataURL() });
      const mutation = state !== JSON.stringify(sim.enemies);
      c.clearRect(0, 0, 384, 384); drawFortressFootfalls({ c, px }, sim, true);
      const reducedDust = c.getImageData(0, 0, 384, 384).data.some(v => v !== 0);
      sim.time = 3; c.clearRect(0, 0, 384, 384); drawFortressFootfalls({ c, px }, sim);
      const expiredDust = c.getImageData(0, 0, 384, 384).data.some(v => v !== 0);
      probes.push({ kind, count, worst, dust, dustPixels, visibleDust, reducedDust, expiredDust, mutation });
    }
    document.body.innerHTML = '<h2>Fortress stride: rounded joints and landing dust</h2><main></main>';
    document.body.style.cssText = 'margin:0;padding:12px;background:#343a30;color:#e6d8b5;font:16px monospace';
    const main = document.querySelector('main'); main.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    for (const { label, url } of examples) {
      const card = document.createElement('div'); card.style.cssText = 'width:min(100%,340px)'; card.textContent = label;
      const img = new Image(); img.src = url; img.style.cssText = 'display:block;width:100%;image-rendering:pixelated'; card.append(img); main.append(card);
    }
    return { probes };
  });
  writeFileSync('test-results/fortress-stride.json', JSON.stringify(result, null, 2));
  await page.screenshot({ path: 'test-results/fortress-stride.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/fortress-stride-phone.png', fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.ok(result.probes.every(p => p.count === 0), JSON.stringify(result.probes));
  assert.ok(result.probes.every(p => p.dust > 0 && p.dustPixels > 0 && p.visibleDust > 0 && !p.reducedDust && !p.expiredDust && !p.mutation), JSON.stringify(result.probes));
  assert.deepEqual(errors, []); console.log(JSON.stringify(result));
} finally { await browser.close(); }
