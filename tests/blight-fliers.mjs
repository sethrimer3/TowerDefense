// Isolated production art/splitting fixture. No player saves; Vite required.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async phone => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { UPGRADES, ENEMIES } = await import('/src/defend/catalog.ts');
      const { drawUnits } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { stepEnemy } = await import('/src/defend/enemies.ts');
      const { basicUnitPixels, basicName } = await import('/src/defend/basic-unit-art.ts');
      const { setArtOverride } = await import('/src/defend/art-overrides.ts');
      const { clearSprites } = await import('/src/defend/damage-art.ts');
      const { extraArtPieces } = await import('/src/defend/art-export-extra.ts');
      document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;padding:16px;box-sizing:border-box;background:#211d26;color:#eacb96;font:16px monospace';
      const title = document.createElement('h2'); title.textContent = 'Flying Blight'; document.body.append(title);
      const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(gallery);
      const kinds = ['blightDart', 'blightPrism', 'greaterBlightPrism'];
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
      const stand = (kind, id = 1) => ({ id, kind, x: 2, y: 2, hp: ENEMIES[kind].hp, maxHp: ENEMIES[kind].hp, cd: 0, jx: 0, jy: 0, distract: -1, distractT: 0, rollT: 0, marked: false, flash: 0, facing: { x: 0, y: -1 } });
      const hash = cv => {
        const p = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let hash = 0; for (const v of p) hash = (Math.imul(hash, 31) + v) >>> 0; return hash;
      };
      const pixels = cv => {
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let fire = 0, black = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] >= 128 && d[i] > 110 && d[i] > d[i + 1] && d[i + 1] > d[i + 2] && d[i + 1] > 25 && d[i] - d[i + 2] > 80) fire++;
          if (d[i + 3] === 255 && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) black++;
        }
        return { fire, black };
      };
      const cv = document.createElement('canvas'); cv.width = cv.height = 256;
      const c = cv.getContext('2d'), outline = new UnitOutline();
      const draw = (kind, t = 0, reduceMotion = false, simple = false, pixelArt = true, merged = true) => {
        c.clearRect(0, 0, 256, 256); setPixelArt(pixelArt); sim.enemies = [stand(kind)]; sim.time = t;
        const before = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('drawing must not roll'); };
        drawUnits({ c, px: 64 }, sim, null, false, undefined, { enemies: simple, reduceMotion, merged }, outline, undefined, {});
        return { ...pixels(cv), hash: hash(cv), immutable: before === JSON.stringify(sim.enemies) };
      };
      const probes = [];
      for (const kind of kinds) {
        const card = document.createElement('div'); card.style.cssText = `width:${phone ? 350 : 390}px;background:#302b32;padding:10px;box-sizing:border-box`;
        const label = document.createElement('div'); label.textContent = ENEMIES[kind].name; card.append(label);
        const frames = document.createElement('div'); frames.style.cssText = 'display:flex;gap:4px'; card.append(frames);
        for (const t of [0, 2.5, 5]) {
          draw(kind, t);
          const frame = document.createElement('canvas'); frame.width = frame.height = 256; frame.style.cssText = `width:${phone ? 105 : 118}px;height:${phone ? 105 : 118}px;background:#48433e;image-rendering:pixelated`;
          frame.getContext('2d').drawImage(cv, 0, 0); frames.append(frame);
        }
        const portrait = document.createElement('canvas'); paintPortrait(portrait, kind); portrait.style.cssText = 'width:64px;height:64px;image-rendering:pixelated'; card.append(portrait);
        gallery.append(card);
        const first = draw(kind, 0), next = draw(kind, 2.5), aligned = draw(kind, 48);
        const reduced0 = draw(kind, 0, true), reduced1 = draw(kind, 2.5, true);
        probes.push({ kind, first, next, aligned, reduced0, reduced1, portrait: pixels(portrait) });
        for (const pixelArt of [false, true]) for (const simple of [false, true]) for (const merged of [false, true]) {
          const r = draw(kind, 2, false, simple, pixelArt, merged); probes.push({ kind, pixelArt, simple, merged, ...r });
        }
      }
      // PNG replacement shares native silhouette/portal path and preserves transparency.
      const kind = 'blightDart', source = basicUnitPixels(kind, true), blue = source.data.map(v => v ? 0xffdd4400 : 0);
      setArtOverride(basicName(kind, true), { w: source.w, h: source.h, data: blue }); clearSprites(); draw(kind);
      const overrideBlue = c.getImageData(0, 0, 256, 256).data.some((v, i, a) => i % 4 === 0 && v === 0 && a[i + 1] === 68 && a[i + 2] === 221 && a[i + 3] === 255);
      setArtOverride(basicName(kind, true), null); clearSprites();
      // Use native death/sweep and flight; show the three separated rays.
      sim.enemies = []; sim.rand = () => .5;
      const parent = sim.spawnAuxiliary('greaterBlightPrism', 5, 5); parent.facing = { x: 0, y: -1 }; parent.hp = 0; sim.sweepAway();
      for (const e of sim.enemies) for (let i = 0; i < 15; i++) stepEnemy(sim, e, .02);
      const children = sim.enemies.map(e => ({ kind: e.kind, x: e.x, y: e.y, burst: e.dartBurst }));
      const split = document.createElement('canvas'); split.width = 350; split.height = 230; split.style.cssText = 'width:350px;height:230px;background:#48433e;image-rendering:pixelated';
      const sc = split.getContext('2d'); sc.translate(175 - 5 * 40, 115 - 5 * 40);
      drawUnits({ c: sc, px: 40 }, sim, null, false, undefined, {}, new UnitOutline(), undefined, {});
      const caption = document.createElement('div'); caption.textContent = 'Prism death · three darts at 120°'; document.body.append(caption, split);
      // Bounded warm render work: no per-enemy canvases or readbacks.
      sim.enemies = Array.from({ length: 400 }, (_, id) => ({ ...stand(kinds[id % 3], id + 1), x: (id % 20) * 3 + 3, y: Math.floor(id / 20) * 4 + 3 }));
      const stressCanvas = document.createElement('canvas'); stressCanvas.width = 576; stressCanvas.height = 832;
      const stressContext = stressCanvas.getContext('2d'), stressOutline = new UnitOutline();
      const paint = () => { stressContext.clearRect(0, 0, 576, 832); drawUnits({ c: stressContext, px: 8 }, sim, null, false, undefined, {}, stressOutline, undefined, {}); };
      for (let i = 0; i < 5; i++) { sim.time += .03; paint(); }
      let creates = 0, reads = 0;
      const oldCreate = document.createElement, oldRead = CanvasRenderingContext2D.prototype.getImageData;
      document.createElement = function (...args) { if (args[0] === 'canvas') creates++; return oldCreate.apply(this, args); };
      CanvasRenderingContext2D.prototype.getImageData = function (...args) { reads++; return oldRead.apply(this, args); };
      let outlineMs = 0;
      const end = stressOutline.end.bind(stressOutline);
      stressOutline.end = (...args) => { const t = performance.now(); end(...args); outlineMs += performance.now() - t; };
      const start = performance.now();
      try { for (let i = 0; i < 20; i++) { sim.time += .03; paint(); } }
      finally { document.createElement = oldCreate; CanvasRenderingContext2D.prototype.getImageData = oldRead; }
      const drawMs = (performance.now() - start) / 20;
      const pieces = extraArtPieces();
      return { phone, probes, children, overrideBlue, exports: kinds.map(k => pieces.some(p => p.name === basicName(k, true))), stress: { count: 400, drawMs, outlineMs: outlineMs / 20, creates, reads } };
    }, phone);
    await page.screenshot({ path: `test-results/blight-fliers-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    for (const p of result.probes) {
      if (p.first) {
        assert.ok(p.first.fire > 0 && p.first.black > 0 && p.portrait.fire > 0, JSON.stringify(p));
        assert.equal(p.first.hash, p.aligned.hash, 'all nested triangles realign');
        assert.equal(p.reduced0.hash, p.reduced1.hash, 'Reduce Motion holds the artwork still');
        if (p.kind !== 'blightDart') assert.notEqual(p.first.hash, p.next.hash, 'nested triangles animate');
      } else { assert.ok(p.fire > 0 && p.black > 0); assert.ok(p.immutable); }
    }
    assert.equal(result.children.length, 3); assert.ok(result.children.every(e => e.kind === 'blightDart' && e.burst));
    assert.ok(result.overrideBlue); assert.ok(result.exports.every(Boolean));
    console.log(JSON.stringify({phone, stress: result.stress})); assert.equal(result.stress.creates, 0); assert.equal(result.stress.reads, 0); assert.ok(result.stress.drawMs < 200);
    assert.deepEqual(errors, []); results.push(result); await page.close();
  }
  writeFileSync('test-results/blight-fliers.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(r => ({ phone: r.phone, stress: r.stress, probes: r.probes.length, children: r.children })), null, 2));
} finally { await browser.close(); }
