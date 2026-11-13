// Dark Blade art check: idle, wind-up, the cut, recovery and its tear in
// space closing, drawn through the battle's unit pass with the portal
// contour. Writes test-results/dark-blade.png. Vite required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES, ENEMIES } = await import('/src/defend/catalog.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
    const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
    const { DARK_BLADE } = await import('/src/defend/dark-blade.ts');
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;padding:16px;background:#211d26;color:#eacb96;font:16px monospace';
    const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'; document.body.append(gallery);
    const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
    const S = 280, px = 48, cd = ENEMIES.darkBlade.cooldown;
    const knight = (extra) => ({ id: 3, kind: 'darkBlade', x: S / px / 2, y: S / px / 2, hp: 1, maxHp: 1, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0, facing: { x: 0, y: 1 }, ...extra });
    const tear = (t) => ({ x: S / px / 2, y: S / px / 2, dx: 0, dy: 1, r: DARK_BLADE.reach, t, life: DARK_BLADE.tearLife, seed: 7919 });
    const frames = [
      ['idle, facing down', knight({}), []],
      ['idle, facing right', knight({ facing: { x: 1, y: 0 } }), []],
      ['winding up', knight({ blade: { wind: .6, dx: 0, dy: 1, lx: 0, ly: 0 } }), []],
      ['the cut', knight({ blade: { wind: 0, dx: 0, dy: 1, lx: 0, ly: 0 }, cd: cd - .18 }), [tear(.18)]],
      ['recovering', knight({ blade: { wind: 0, dx: 0, dy: 1, lx: 0, ly: 0 }, cd: cd - .8 }), [tear(.8)]],
      ['tear at 3 s', knight({ blade: { wind: 0, dx: 0, dy: 1, lx: 0, ly: 0 }, cd: cd - 3 }), [tear(3)]],
      ['tear at 6 s', knight({ facing: { x: -.7, y: .7 } }), [tear(6)]],
      ['tear at 8.5 s', knight({ facing: { x: -1, y: 0 } }), [tear(8.5)]],
    ];
    setPixelArt(true);
    const outline = new UnitOutline();
    let tearPixels = 0;
    for (const [label, e, tears] of frames) {
      const card = document.createElement('div'); card.style.cssText = 'background:#302b32;padding:6px';
      const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.style.cssText = `width:${S / 2}px;height:${S / 2}px;background:#4a5a3a;image-rendering:pixelated`;
      const c = cv.getContext('2d');
      sim.enemies = [e]; sim.tears = tears; sim.time = 1.2;
      drawUnits({ c, px }, sim, null, false, undefined, { merged: true }, outline, undefined, {});
      const d = c.getImageData(0, 0, S, S).data; for (let i = 3; i < d.length; i += 4) if (d[i]) tearPixels++;
      const t = document.createElement('div'); t.textContent = label; card.append(t, cv); gallery.append(card);
    }
    const p = document.createElement('canvas'); paintPortrait(p, 'darkBlade'); p.style.cssText = 'width:96px;height:96px;image-rendering:pixelated';
    const card = document.createElement('div'); card.style.cssText = 'background:#302b32;padding:6px'; card.append('journal', document.createElement('br'), p); gallery.append(card);
    return { tearPixels };
  });
  assert.deepEqual(errors, []);
  assert.ok(result.tearPixels > 0);
  await page.screenshot({ path: 'test-results/dark-blade.png', fullPage: true });
  console.log('dark-blade: ok, test-results/dark-blade.png');
} finally { await browser.close(); }
