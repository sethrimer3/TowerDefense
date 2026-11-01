// Native worm family art, collapse and multi-worm frame work; no player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' }) });
mkdirSync('test-results', { recursive: true }); const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }, deviceScaleFactor: phone ? 3 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async phone => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity, CellType } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { wormTuning } = await import('/src/defend/blight-worm-tuning.ts');
      const { drawUnits } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { stepEnemy } = await import('/src/defend/enemies.ts');
      const { buildWave } = await import('/src/defend/waves.ts');
      document.body.innerHTML = ''; document.body.style.cssText = 'margin:0;padding:16px;background:#211d26;color:#ebca90;font:16px monospace';
      const title = document.createElement('h2'); title.textContent = 'Blight Worm Broods'; document.body.append(title);
      const cards = document.createElement('div'); cards.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(cards);
      const fixture = () => {
        const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
        sim.beginManualWave(40, 4800, 3); sim.breakT = 1e9; sim.soldiers = []; sim.civilians = [];
        sim.solid.fill(0); sim.foeSolid.fill(0); sim.ownSolid.fill(0); sim.rocks.fill(0); sim.map.type.fill(CellType.OUT); sim.map.owner.fill(-1);
        return sim;
      };
      const pixelCounts = canvas => {
        const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let fire = 0, black = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] >= 128 && d[i] > 110 && d[i] > d[i + 1] && d[i + 1] > d[i + 2] && d[i + 1] > 25 && d[i] - d[i + 2] > 80) fire++;
          if (d[i + 3] === 255 && d[i] === 0 && d[i + 1] === 0 && d[i + 2] === 0) black++;
        }
        return { fire, black };
      };
      const rows = [];
      for (const kind of ['smallBlightWorm', 'mediumBlightWorm', 'blightWorm']) {
        const sim = fixture(), tuning = wormTuning(kind), headY = 20 + tuning.segments * tuning.spacing / 2;
        sim.releaseEnemy(kind, { x: 20, y: headY }); const segments = sim.enemies.slice();
        const card = document.createElement('div'); card.style.cssText = 'width:350px;padding:8px;box-sizing:border-box;background:#302b32';
        const label = document.createElement('div'); label.textContent = `${ENEMIES[kind].name} · ${tuning.segments} segments`; card.append(label);
        const canvas = document.createElement('canvas'); canvas.width = 332; canvas.height = 300; canvas.style.cssText = 'width:332px;height:300px;background:#48433e;image-rendering:pixelated';
        const c = canvas.getContext('2d'), px = kind === 'blightWorm' ? 8 : 32, outline = new UnitOutline();
        c.translate(166 - 20 * px, 150 - (headY - (segments.length - 1) * tuning.spacing / 2) * px);
        const paint = (simple = false) => { c.save(); c.resetTransform(); c.clearRect(0, 0, 332, 300); c.restore(); drawUnits({ c, px }, sim, null, false, undefined, { enemies: simple, reduceMotion: true }, outline, undefined, {}); };
        sim.rand = () => { throw Error('drawing must not roll'); };
        const probes = [];
        for (const pixelArt of [false, true]) for (const simple of [false, true]) {
          setPixelArt(pixelArt); paint(simple);
          const m = c.getTransform(), joinX = 20 * px + m.e, joinY = (headY - tuning.spacing / 2) * px + m.f;
          const join = [...c.getImageData(Math.floor(joinX), Math.floor(joinY), 1, 1).data];
          probes.push({ pixelArt, simple, join, ...pixelCounts(canvas) });
        }
        paint(); card.append(canvas);
        const portrait = document.createElement('canvas'); paintPortrait(portrait, kind); portrait.style.cssText = 'width:80px;height:80px;image-rendering:pixelated'; card.append(portrait);
        const portraitFire = pixelCounts(portrait).fire;
        segments.forEach(e => e.burrow = 1); paint(); const under = pixelCounts(canvas);
        const shadow = document.createElement('canvas'); shadow.width = 332; shadow.height = 300; shadow.style.cssText = canvas.style.cssText;
        shadow.getContext('2d').drawImage(canvas, 0, 0); const note = document.createElement('div'); note.textContent = 'Burrow shadow + dirt'; card.append(note, shadow);
        segments.forEach(e => delete e.burrow); sim.rand = () => .5;
        segments[3].hp = 0; sim.sweepAway(); paint();
        const cut = document.createElement('canvas'); cut.width = 332; cut.height = 300; cut.style.cssText = canvas.style.cssText; cut.getContext('2d').drawImage(canvas, 0, 0);
        const cutLabel = document.createElement('div'); cutLabel.textContent = 'After cut: short pieces become Darklings'; card.append(cutLabel, cut); cards.append(card);
        // Restore the intact surface picture without changing the saved shadow/cut canvases.
        sim.enemies = segments; segments.forEach(e => e.hp = e.maxHp); paint();
        rows.push({ kind, count: segments.length, probes, under, portraitFire, slain: sim.slain[kind] });
      }
      // Native wave 40 assembly and mixed-family work at board scale.
      const sim = fixture(); for (const [i, kind] of buildWave(40, () => 0).entries()) sim.releaseEnemy(kind, { x: 15 + i * 20, y: 35 });
      const bosses = sim.enemies.length, trails = new Set(sim.enemies.map(e => e.worm.trail)).size;
      for (const [i, kind] of buildWave(39, () => 0).entries()) sim.releaseEnemy(kind, { x: 4 + i * 3, y: 55 });
      for (const e of sim.enemies) if (e.worm.head) e.worm.head.surfaceT = 1e6;
      const cv = document.createElement('canvas'); cv.width = 576; cv.height = 832; const c = cv.getContext('2d'), outline = new UnitOutline();
      const paint = () => { c.clearRect(0, 0, 576, 832); drawUnits({ c, px: 8 }, sim, null, false, undefined, { reduceMotion: true }, outline, undefined, {}); };
      for (let i = 0; i < 5; i++) { sim.time += 1 / 30; sim.enemies.forEach(e => stepEnemy(sim, e, 1 / 30)); paint(); }
      let creates = 0, reads = 0, updateMs = 0, drawMs = 0;
      const create = document.createElement, read = CanvasRenderingContext2D.prototype.getImageData;
      document.createElement = function (...args) { if (args[0] === 'canvas') creates++; return create.apply(this, args); };
      CanvasRenderingContext2D.prototype.getImageData = function (...args) { reads++; return read.apply(this, args); };
      try { for (let i = 0; i < 30; i++) {
        let t = performance.now(); sim.time += 1 / 30; sim.enemies.forEach(e => stepEnemy(sim, e, 1 / 30)); updateMs += performance.now() - t;
        t = performance.now(); paint(); drawMs += performance.now() - t;
      } } finally { document.createElement = create; CanvasRenderingContext2D.prototype.getImageData = read; }
      return { phone, rows, bosses, trails, stress: { count: sim.enemies.length, updateMs: updateMs / 30, drawMs: drawMs / 30, creates, reads } };
    }, phone);
    await page.screenshot({ path: `test-results/worm-broods-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    for (const r of result.rows) {
      for (const p of r.probes) { assert.deepEqual(p.join, [0, 0, 0, 255]); assert.ok(p.fire > 0 && p.black > 0); }
      assert.ok(r.portraitFire > 0); assert.equal(r.under.black, 0); assert.equal(r.under.fire, 0);
      assert.equal(r.slain, r.kind === 'smallBlightWorm' ? 7 : 4);
    }
    assert.equal(result.bosses, 150); assert.equal(result.trails, 3);
    assert.equal(result.stress.creates, 0); assert.equal(result.stress.reads, 0); assert.ok(result.stress.drawMs < 200);
    assert.deepEqual(errors, []); results.push(result); await page.close();
  }
  writeFileSync('test-results/worm-broods.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results.map(r => ({ phone: r.phone, rows: r.rows.map(x => ({ kind: x.kind, count: x.count, slain: x.slain })), stress: r.stress })), null, 2));
} finally { await browser.close(); }
