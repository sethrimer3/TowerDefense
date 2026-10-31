// Real Tiles UI plus isolated room renders. Fresh browser contexts only;
// no player saves. Checks soft edges, motion, night, Reduce Motion and the legacy-graphics window toggle.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1280, 390, 360]) {
    const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Midmorning: visible daylight and a modest diagonal solar heading.
    await page.addInitScript(() => {
      Date.now = () => 1100000;
      localStorage.setItem('towerdefense.v1', JSON.stringify({ version: 7,
        profile: { name: 'Window Tester', flag: { base: 3, layers: [] } },
        settings: { soundOff: true, ambienceOff: true },
      }));
    });
    await page.goto(base); await page.waitForSelector('#defend-start');
    await page.locator('[data-tab="tiles"]').click();
    await page.waitForSelector('.tiles-grid .tile');
    await page.waitForTimeout(600); // Let the existing tab-entry animation settle.
    await page.screenshot({ path: `test-results/tiles-sunlight-${width}.png` });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const checks = await page.evaluate(async () => {
      const { HallBackdrop, ROSES, setRose, roseOn } = await import('/src/ui/hall-art.ts');
      // Pin the rose so the timed draws below compare one glazing.
      setRose('flower');
      const setLegacy = on => document.documentElement.classList.toggle('legacy-graphics', on);
      const { SoftSunlight } = await import('/src/soft-sunlight.ts');
      const canvas = document.createElement('canvas');
      canvas.style = `position:fixed;inset:20px;width:${Math.min(600, innerWidth - 40)}px;height:700px;image-rendering:pixelated;z-index:1000`;
      document.body.append(canvas);
      const room = new HallBackdrop(canvas, 'keep'), ctx = canvas.getContext('2d');
      // The shafts and dust are their own layer, screened over the menu.
      const light = document.createElement('canvas');
      light.style = canvas.style.cssText; document.body.append(light);
      const pixels = () => Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
      const lit = () => Array.from(light.getContext('2d').getImageData(0, 0, light.width, light.height).data);
      const both = (now, day, reduced) => { room.draw(now, [], day, reduced); room.drawLight(light, now, day, reduced); return [...pixels(), ...lit()]; };
      const first = both(140000, 1, false);
      const moved = both(141500, 1, false);
      const still = both(200000, 1, true);
      const stillLater = both(230000, 1, true), stillWall = pixels();
      room.drawLight(light, 141500, 1, false);
      let shaft = 0; for (const [i, v] of lit().entries()) if (i % 4 === 3) shaft = Math.max(shaft, v);
      room.drawLight(light, 260000, 0, false); const night = lit();
      room.drawLight(light, 290000, 0, false); const nightLater = lit();
      setLegacy(true); room.draw(320000, [], 1, true); const legacy = pixels();
      setLegacy(false); room.draw(350000, [], 1, true); const restored = pixels();
      setLegacy(true); room.draw(380000, [], 1, true); const legacyAgain = pixels();
      setLegacy(false); room.draw(140000, [], 1, false);
      // Symmetric native leadwork, including both halves of the rose/lancets.
      // Every rose glazing too, each its own leadwork, and the nights pick several.
      let asymmetric = 0;
      const roseLead = {};
      for (const rose of ROSES) {
        setRose(rose); room.draw(140000, [], 1, false);
        let lead = 0;
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width / 2; x++) {
          const a = room.part[y * canvas.width + x] === 2;
          if (a !== (room.part[y * canvas.width + canvas.width - x - 1] === 2)) asymmetric++;
          if (a) lead += x * 7 + y;
        }
        roseLead[rose] = lead;
      }
      setRose(null);
      const nights = new Set(Array.from({ length: 40 }, (_, n) => roseOn(n * 480000)));
      // While the room stays in view the glazing holds across the day's turn;
      // after a gap (the tab hidden) it takes the new day's.
      const turn = [...Array(40).keys()].map(n => (n + 1) * 300000 - 75000).find(t => roseOn(t - 1) !== roseOn(t + 1));
      room.draw(turn - 5000, [], 1, true); const held = room.rose;
      for (let t = turn - 4100; t < turn + 5000; t += 900) room.draw(t, [], 1, true);
      const stays = room.rose === held;
      room.draw(turn + 9000, [], 1, true);
      const changesAway = room.rose === roseOn(turn + 9000) && room.rose !== held;
      const holdsInView = turn > 0 && stays && changesAway;
      setRose('flower'); room.draw(140000, [], 1, false);
      const distinctRoses = new Set(Object.values(roseLead)).size === ROSES.length && nights.size >= 4 && !nights.has('flower');
      const probe = document.createElement('canvas'); probe.width = 240; probe.height = 240;
      const field = new SoftSunlight(), c = probe.getContext('2d');
      field.draw(c, 120, 0, 40, 240, 0, 1);
      const row = c.getImageData(0, 70, 240, 1).data;
      let maxStep = 0; const shades = new Set();
      for (let x = 1; x < 240; x++) { shades.add(row[x * 4 + 3]); maxStep = Math.max(maxStep, Math.abs(row[x * 4 + 3] - row[(x - 1) * 4 + 3])); }
      const samples = [];
      for (let k = 0; k < 45; k++) { const start = performance.now(); room.draw(141000 + k * 80, [], 1, false); samples.push(performance.now() - start); }
      samples.sort((a,b) => a-b);
      const same = (a,b) => a.every((v,i) => v === b[i]);
      const dark = night.every((v, i) => i % 4 !== 3 || v === 0);
      return { shaft, dark, moved: !same(first,moved), still: same(still,stillLater), night: same(night,nightLater), gated: !same(stillWall,legacy), restored: same(stillWall,restored), legacy: same(legacy,legacyAgain), asymmetric, distinctRoses, holdsInView, maxStep, shades: shades.size, p95: samples[Math.floor(samples.length * .95)] };
    });
    assert.equal(checks.moved, true, 'sunlight/dust move over time');
    assert.equal(checks.still, true, 'Reduce Motion freezes decorative movement');
    assert.equal(checks.night && checks.dark, true, 'night has no sunlight or lit dust');
    assert.ok(checks.shaft > 90, `shafts are plainly visible (peak alpha ${checks.shaft})`);
    assert.equal(checks.gated && checks.restored && checks.legacy, true, 'window art toggles/rebakes without resizing');
    assert.equal(checks.asymmetric, 0, 'leadwork stays symmetric on the native grid, every rose glazing');
    assert.equal(checks.distinctRoses, true, 'each rose glazing has its own leadwork and the nights change it');
    assert.equal(checks.holdsInView, true, 'the rose holds while in view and changes only after the room was hidden');
    assert.ok(checks.maxStep <= 4 && checks.shades >= 16, 'light edges feather smoothly to transparent');
    const clip = await page.locator('body > canvas').first().boundingBox();
    await page.screenshot({ path: `test-results/tiles-window-detail-${width}.png`, clip });
    assert.deepEqual(errors, []);
    console.log(`${width}px: soft edges, solar/dust motion, night, reduced motion, art toggle and leadwork passed; room draw p95 ${checks.p95.toFixed(2)}ms`);
    await context.close();
  }
} finally { await browser.close(); }
