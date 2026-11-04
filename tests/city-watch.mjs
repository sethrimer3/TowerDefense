// The keep's guards in a real Defend page, desktop and phone: 2 × 2 watchmen
// with spears and 1 × 1 townsfolk walking the streets while building, the
// watch mustering where they walked when a battle starts and fighting what
// gets in. Isolated browser contexts; never touches a player's save. Needs
// `npm run dev`. Screenshots go to test-results/ (or SHOTS).
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = process.env.SHOTS || 'test-results';
mkdirSync(out, { recursive: true });
try {
  for (const width of [1280, 390]) {
    const phone = width < 500;
    const context = await browser.newContext({ viewport: { width, height: phone ? 780 : 900 }, hasTouch: phone, isMobile: phone });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForSelector('#defend-start');
    const fixture = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const s = defaults(); s.settings.soundOff = true; s.settings.ambienceOff = true; s.settings.reduceMotion = false;
      s.defend.keepRanks = { watch: 3 };
      s.profile = { name: 'Watch Tester', flag: { base: 3, layers: [] } };
      return s;
    });
    await context.addInitScript(fixture => {
      if (!sessionStorage.getItem('watch-fixture-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(fixture));
        sessionStorage.setItem('watch-fixture-seeded', 'yes');
      }
    }, fixture);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      const { DefendPage } = await import('/src/defend/ui.ts'), real = DefendPage.prototype.frame;
      if (!real.__hooked) { DefendPage.prototype.frame = function(t) { window.__dp = this; return real.call(this, t); }; DefendPage.prototype.frame.__hooked = true; }
    });
    await page.waitForFunction(() => window.__dp?.renderer);
    if (phone && await page.locator('#defend-side-toggle[aria-pressed="true"]').count()) await page.locator('#defend-side-toggle').click();
    await page.waitForTimeout(2500);
    const zoom = () => page.evaluate(() => {
      const dp = window.__dp, k = dp.renderer.cityLife.people.find(p => !p.hidden && p.role === 'watchman') ?? { x: 72, y: 104 };
      for (let i = 0; i < 6; i++) { const p = dp.renderer.toClient(k.x, k.y); dp.renderer.zoomAt(p.x, p.y, 1.5); }
    });
    const build = await page.evaluate(() => window.__dp.renderer.cityLife.people.filter(p => p.role === 'watchman').length);
    assert.equal(build, 8, 'Muster roll: eight watchmen walk the city');
    await zoom(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/city-watch-${width}-build.png` });
    // Smooth walking: a watchman's drawn position changes by less than an art pixel between frames.
    const glide = await page.evaluate(async () => {
      const life = window.__dp.renderer.cityLife, p = life.people.find(q => !q.hidden && q.role === 'watchman' && q.path.length);
      if (!p) return null;
      const xs = [];
      for (let i = 0; i < 6; i++) { xs.push([p.x, p.y]); await new Promise(r => requestAnimationFrame(r)); }
      return xs;
    });
    if (glide) assert.ok(glide.some(([x, y], i) => i && Math.abs(x - glide[i - 1][0]) + Math.abs(y - glide[i - 1][1]) > 0 && Math.abs(x - glide[i - 1][0]) + Math.abs(y - glide[i - 1][1]) < 1 / 8), 'moves by less than an art pixel a frame');
    const spots = await page.evaluate(() => window.__dp.renderer.cityLife.watchmenAt());
    await page.locator('#defend-start').click();
    await page.waitForTimeout(300);
    const guards = await page.evaluate(() => window.__dp.sim.soldiers.filter(s => s.kind === 'watchman').map(s => ({ x: s.x, y: s.y })));
    assert.equal(guards.length, 8, 'the battle has the eight guards');
    assert.ok(spots.some(s => guards.some(g => Math.abs(g.x - s.x) + Math.abs(g.y - s.y) < 2)), 'mustered where the watchmen walked');
    assert.equal(await page.evaluate(() => window.__dp.renderer.cityLife.visible.filter(p => p.role === 'watchman').length), 0, 'the watchmen hand over to the guards');
    // An orc slips into the city beside a guard: the watch fights it.
    const fought = await page.evaluate(async () => {
      const sim = window.__dp.sim, g = sim.soldiers.find(s => s.kind === 'watchman'), W = (await import('/src/defend/grid.ts')).CELLS_W;
      let at = null;
      for (let d = 2; d < 6 && !at; d++) for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const x = Math.floor(g.x) + dx, y = Math.floor(g.y) + dy, i = y * W + x;
        if (!at && sim.map.city[i] && !sim.ownSolid[i]) at = { x: x + .5, y: y + .5 };
      }
      const e = sim.newEnemy('orc', at.x, at.y); e.hp = e.maxHp = 400; sim.enemies.push(e);
      for (let i = 0; i < 3 * 30; i++) sim.step(1 / 30);
      return e.hp < e.maxHp;
    });
    assert.ok(fought, 'a guard strikes the orc');
    await zoom(); await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/city-watch-${width}-battle.png` });
    console.log(width, 'guards in battle', guards.length, 'targeting', fought);
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
