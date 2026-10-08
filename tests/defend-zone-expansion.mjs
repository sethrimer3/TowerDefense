// Isolated native art and journal gallery; never loads or modifies player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  mkdirSync('test-results', { recursive: true });
  for (const [label, width] of [['desktop', 1100], ['mobile', 390]]) {
    const page = await browser.newPage({ viewport: { width, height: 1100 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
    const result = await page.evaluate(async () => {
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { AREA_ENEMIES } = await import('/src/defend/area-enemies.ts');
      const { AREAS } = await import('/src/defend/areas.ts');
      const { drawEnemyArt } = await import('/src/defend/battle-art.ts');
      const { zoneEnemyRows } = await import('/src/defend/zone-enemy-art.ts');
      const { paintPortrait } = await import('/src/defend/journal-portrait.ts');
      const { journalHTML } = await import('/src/defend/journal.ts');
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const kinds = Object.keys(ENEMIES).filter(k => zoneEnemyRows(k));
      document.body.innerHTML = '<h1>New zone enemies</h1><p>Intact · Damaged · Hit · Marked, plus the journal portrait</p><main></main>';
      const css = document.createElement('style');
      css.textContent = 'body{margin:16px;background:#181923;color:#eee2c3;font:14px sans-serif}h1{font-size:24px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}section{background:#292a36;padding:12px;border:1px solid #705c47}h2{font-size:16px;margin:0 0 8px}p{margin:0 0 10px}canvas{max-width:100%;image-rendering:pixelated}.portraits{display:flex;align-items:center;gap:12px}.portrait{width:80px;height:80px}@media(max-width:600px){main{grid-template-columns:1fr}}';
      document.head.append(css);
      const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
      const probe = document.createElement('canvas'); probe.width = probe.height = 128;
      const pc = probe.getContext('2d'), checks = [];
      for (const kind of kinds) {
        const def = ENEMIES[kind], area = AREAS.find(a => a.id !== 'nadir' && AREA_ENEMIES[a.id].includes(kind));
        const section = document.createElement('section');
        section.innerHTML = `<h2>${def.name}</h2><p>${area.name} · Difficulty ${def.cost}</p>`;
        const canvas = document.createElement('canvas'); canvas.width = 288; canvas.height = 76;
        const c = canvas.getContext('2d');
        for (const [n, state] of ['intact', 'damaged', 'hit', 'marked'].entries()) {
          const e = sim.newEnemy(kind, (36 + n * 72) / 42, 36 / 42);
          if (state === 'damaged') e.hp *= .3;
          if (state === 'hit') e.flash = .1;
          if (state === 'marked') e.marked = true;
          // Gallery isolates the body; verify the live shield rendering separately below.
          e.shieldHp = 0;
          drawEnemyArt({ c, px: 42 }, e, sim);
          for (const px of [6, 24, 64]) {
            pc.clearRect(0, 0, 128, 128);
            drawEnemyArt({ c: pc, px }, { ...e, x: 64 / px, y: 64 / px }, sim);
            const visible = new Uint32Array(pc.getImageData(0, 0, 128, 128).data.buffer).filter(v => v >>> 24).length;
            if (!visible) throw Error(`${kind}/${state}/${px} invisible`);
            checks.push({ kind, state, px, visible });
          }
        }
        section.append(canvas);
        const row = document.createElement('div'); row.className = 'portraits';
        const portrait = document.createElement('canvas'); portrait.className = 'portrait';
        paintPortrait(portrait, kind);
        const center = portrait.getContext('2d').getImageData(10, 10, 60, 60).data;
        const bright = new Uint32Array(center.buffer).filter(v => (v & 255) > 100 || ((v >>> 8) & 255) > 100 || ((v >>> 16) & 255) > 100).length;
        if (bright < 20) throw Error(`${kind} portrait missing`);
        const description = document.createElement('span'); description.textContent = def.description;
        row.append(portrait, description); section.append(row); document.querySelector('main').append(section);
        if (def.shield) {
          pc.clearRect(0, 0, 128, 128);
          const e = sim.newEnemy(kind, 4, 4);
          drawEnemyArt({ c: pc, px: 16 }, e, sim);
          if (!pc.getImageData(64 + Math.floor(def.shield.radius * 8), 64, 1, 1).data[3]) throw Error(`${kind} shield missing`);
        }
      }
      const journal = document.createElement('div'); journal.innerHTML = journalHTML(kinds);
      for (const area of AREAS.filter(a => ['moss', 'desert', 'fungal', 'crystal', 'astral'].includes(a.id))) {
        if (journal.querySelectorAll(`[data-zone="${area.id}"] article`).length !== 3) throw Error(`${area.id} journal roster incomplete`);
      }
      if (journal.querySelectorAll('[data-zone="nadir"] article').length !== 15) throw Error('Nadir journal incomplete');
      const overflow = [...document.querySelectorAll('main,section,canvas')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).length;
      return { species: kinds.length, checks: checks.length, overflow };
    });
    assert.equal(result.species, 15); assert.equal(result.checks, 180); assert.equal(result.overflow, 0);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `test-results/defend-zone-expansion-${label}.png`, fullPage: true });
    console.log(label, result);
    await page.close();
  }
} finally { await browser.close(); }
