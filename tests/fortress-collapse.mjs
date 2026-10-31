// Native fortress states on desktop/phone; never reads a player's save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium' });
mkdirSync('test-results', { recursive: true });
const results = [];
try {
  for (const phone of [false, true]) {
    const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1500, height: 950 }, deviceScaleFactor: phone ? 2 : 1 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/performance.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    const result = await page.evaluate(async () => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { defaultLayout, fitLayout } = await import('/src/defend/layout.ts');
      const { ENEMIES, UPGRADES } = await import('/src/defend/catalog.ts');
      const { stepFortressCore, syncFortress, finishFortressStep, FORTRESS_FALL } = await import('/src/defend/fortress.ts');
      const { drawUnits } = await import('/src/defend/battle-art.ts');
      const { UnitOutline } = await import('/src/defend/unit-outline.ts');
      const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
      document.body.innerHTML = '<h2>Walking fortresses: raised, falling, dragging</h2>';
      document.body.style.cssText = 'margin:0;padding:16px;background:#242229;color:#e4c698;font:16px monospace;box-sizing:border-box';
      const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px'; document.body.append(gallery);
      const kinds = ['fortressHut', 'fortress', 'fortressSovereign', 'blightCannon', 'blightLance', 'blightFortress'];
      const hash = cv => { let h = 0; for (const v of cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data) h = (Math.imul(h, 31) + v) >>> 0; return h; };
      const probes = [];
      for (const kind of kinds) {
        const sim = new DefendSim(generateCity(fitLayout(defaultLayout()), 3), Object.fromEntries(UPGRADES.map(u => [u.id, 0])), 4);
        sim.breakT = 1e9; sim.soldiers = []; sim.civilians = []; sim.spawnEnemy(kind);
        const core = sim.enemies[0], def = ENEMIES[kind];
        const px = def.size <= 2 ? 64 : def.size <= 3.5 ? 42 : 28;
        core.x = 167 / px; core.y = 125 / px; core.walker.x = core.x; core.walker.y = core.y; syncFortress(core);
        const legs = core.fortressParts.filter(p => p.fortressPart.role === 'leg');
        const turrets = core.fortressParts.filter(p => p.fortressPart.role === 'turret');
        for (const turret of turrets) { turret.cd = .8; turret.aim = { x: turret.x + 2, y: turret.y - 1.5 }; }
        const card = document.createElement('div'); card.style.cssText = 'width:350px;padding:8px;box-sizing:border-box;background:#343039'; gallery.append(card);
        const title = document.createElement('div'); title.textContent = `${def.name} · ${legs.length} legs`; card.append(title);
        const canvas = document.createElement('canvas'); canvas.width = 334; canvas.height = 250;
        const c = canvas.getContext('2d'), outline = new UnitOutline();
        const paint = (reduced = false, simple = false, legacy = false, seconds = 1) => {
          sim.time = seconds; setPixelArt(!legacy); c.clearRect(0, 0, 334, 250);
          const state = JSON.stringify(sim.enemies); sim.rand = () => { throw Error('art must not roll'); };
          drawUnits({ c, px }, sim, null, false, undefined, { reduceMotion: reduced, enemies: simple }, outline, undefined, { defer: true });
          outline.drawContours(c, reduced ? 0 : seconds);
          if (state !== JSON.stringify(sim.enemies)) throw Error('art mutated gameplay state');
          return hash(canvas);
        };
        const saveFrame = label => {
          paint(); const caption = document.createElement('div'); caption.textContent = label; card.append(caption);
          const frame = document.createElement('canvas'); frame.width = 334; frame.height = 250;
          frame.getContext('2d').drawImage(canvas, 0, 0); card.append(frame);
        };
        const idle0 = paint(true, false, false, 0), idle1 = paint(true, false, false, 10);
        const walk0 = paint(); core.walker.walk += .2; const walk1 = paint();
        saveFrame('Raised — air-only turrets, vulnerable legs');
        for (const leg of legs.slice(2)) sim.hurtEnemy(leg, 1e9, true, 'melee');
        stepFortressCore(sim, core, FORTRESS_FALL * .65); sim.effects = []; saveFrame('Falling — chassis still immune');
        stepFortressCore(sim, core, FORTRESS_FALL);
        const dust = sim.effects.some(f => f.kind === 'dust');
        // Leave rubble by actual movement, then show the one-legged drag and landing plume.
        for (let n = 0; n < 4; n++) { core.y += .2; finishFortressStep(sim, core); }
        sim.hurtEnemy(legs[1], 1e9, true, 'melee');
        const hp = turrets.map(t => t.hp), hit = Math.min(5, ...hp.map(h => h / 2)); sim.hurtEnemy(core, hit, true, 'melee');
        const bodyDamage = turrets.every((t, n) => t.hp === hp[n] - hit);
        saveFrame('Grounded — one leg pulling, body hit and dust');
        const modes = [];
        for (const simple of [false, true]) for (const legacy of [false, true]) modes.push(paint(true, simple, legacy));
        probes.push({ kind, legs: legs.length, idle0, idle1, walk0, walk1, dust, bodyDamage, rubble: sim.fortressRubble.length, modes });
      }
      return { probes, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    await page.screenshot({ path: `test-results/fortress-collapse-${phone ? 'phone' : 'desktop'}.png`, fullPage: true });
    assert.equal(result.overflow, false);
    for (const p of result.probes) {
      assert.equal(p.idle0, p.idle1); assert.notEqual(p.walk0, p.walk1);
      assert.ok(p.dust && p.bodyDamage && p.rubble > 0, JSON.stringify(p)); assert.ok(p.modes.every(h => h !== 0));
    }
    assert.deepEqual(errors, []); results.push({ phone, ...result }); await page.close();
  }
  writeFileSync('test-results/fortress-collapse.json', JSON.stringify(results, null, 2));
  console.log('Fortress raised/falling/dragging states, 6/8/12 legs, aim, body damage, dust, rubble, settings and desktop/phone passed.');
} finally { await browser.close(); }
