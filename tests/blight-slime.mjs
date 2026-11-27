// Blight Slime art check: one hop drawn frame by frame (take-off, the
// arc, the landing squash and splat, the crouch), a hop in place, the death
// splat and the journal portrait, drawn through the battle's unit pass with
// the portal contour. Writes test-results/blight-slime.png. Vite required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 2 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
  const result = await page.evaluate(async () => {
    const { DefendSim } = await import('/src/defend/sim.ts');
    const { generateCity } = await import('/src/defend/citygen.ts');
    const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
    const { UPGRADES } = await import('/src/defend/catalog.ts');
    const { drawUnits } = await import('/src/defend/battle-art.ts');
    const { UnitOutline } = await import('/src/defend/unit-outline.ts');
    const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
    const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
    const { BLIGHT_SLIME } = await import('/src/defend/blight-slime.ts');
    document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;padding:16px;background:#211d26;color:#eacb96;font:14px monospace';
    const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px'; document.body.append(gallery);
    const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
    sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
    const S = 240, px = 64, P = BLIGHT_SLIME.period;
    setPixelArt(true);
    const outline = new UnitOutline();
    let drawn = 0;
    const card = (label, paint) => {
      const box = document.createElement('div'); box.style.cssText = 'background:#302b32;padding:6px';
      const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.style.cssText = `width:${S / 2}px;height:${S / 2}px;background:#4a5a3a;image-rendering:pixelated`;
      const c = cv.getContext('2d'); paint(c);
      const d = c.getImageData(0, 0, S, S).data; for (let i = 3; i < d.length; i += 4) if (d[i]) { drawn++; break; }
      const t = document.createElement('div'); t.textContent = label; box.append(t, cv); gallery.append(box);
    };
    // One slime walking right: frames sampled through a single hop.
    const mid = S / px / 2;
    const slime = { id: 0, kind: 'blightSlime', x: mid - .3, y: mid + .2, hp: 1, maxHp: 1, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0 };
    // Its phase offset is fixed per id: find the time a hop starts.
    const phase = ((Math.imul(0x51ed, 0x9e3779b1) >>> 0) / 4294967296);
    const start = (10 - phase) * P;
    const speed = .8;
    const frames = [[-.02, 'crouch'], [.04, 'take-off'], [.13, 'rising'], [.25, 'top of the hop'], [.4, 'coming down'], [.52, 'landing: squash'], [.6, 'splat'], [.72, 'wobbling back'], [.95, 'crouch again']];
    // Prime the hop: it left from mid - .3 - travel and lands on mid - .3.
    sim.enemies = [slime];
    slime.x = mid - .3 - speed * P; sim.time = start - P + .01; drawUnits({ c: document.createElement('canvas').getContext('2d'), px }, sim, null, false, undefined, { merged: true }, outline, undefined, {});
    slime.x = mid - .3;
    for (const [u, label] of frames) card(label, c => { sim.time = start + u * P; drawUnits({ c, px }, sim, null, false, undefined, { merged: true }, outline, undefined, {}); });
    // Biting in place: small hops.
    const biter = { ...slime, id: 5, x: mid, y: mid + .2 };
    card('biting: hop in place', c => { sim.enemies = [biter]; for (let i = 0; i < 40; i++) { sim.time = 30 + i * .05; } sim.time = 30.15; drawUnits({ c, px }, sim, null, false, undefined, { merged: true }, outline, undefined, {}); });
    // A crowd mid-march.
    card('a crowd', c => {
      const crowd = Array.from({ length: 6 }, (_, i) => ({ ...slime, id: 20 + i, x: .7 + (i % 3) * 1.1, y: 1 + Math.floor(i / 3) * 1.4 }));
      sim.enemies = crowd; for (let k = 0; k <= 30; k++) { for (const e of crowd) e.x += speed * .033; sim.time = 50 + k * .033; drawUnits({ c: document.createElement('canvas').getContext('2d'), px }, sim, null, false, undefined, { merged: true }, outline, undefined, {}); }
      drawUnits({ c, px }, sim, null, false, undefined, { merged: true }, outline, undefined, {});
    });
    // The death splat at three moments.
    for (const t of [.05, .2, .4]) card(`death splat ${t}s`, c => { sim.enemies = []; sim.effects = [{ kind: 'splat', x: mid, y: mid, t, r: 7 / 8 }]; drawUnits({ c, px }, sim, null, false, undefined, { merged: true }, outline, undefined, {}); sim.effects = []; });
    const p = document.createElement('canvas'); paintPortrait(p, 'blightSlime'); p.style.cssText = 'width:96px;height:96px;image-rendering:pixelated';
    const box = document.createElement('div'); box.style.cssText = 'background:#302b32;padding:6px'; box.append('journal', document.createElement('br'), p); gallery.append(box);
    return { drawn };
  });
  assert.deepEqual(errors, []);
  assert.ok(result.drawn >= 12, `drawn ${result.drawn}`);
  await page.screenshot({ path: 'test-results/blight-slime.png', fullPage: true });
  console.log('blight-slime: ok, test-results/blight-slime.png');
} finally { await browser.close(); }
