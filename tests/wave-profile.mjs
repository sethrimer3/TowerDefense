// Manual: profile a real Defend battle in the full app at a chosen wave.
// PROFILE_WAVE (21), PROFILE_SECONDS (20), PROFILE_WIDTH (1280), PROFILE_LABEL.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const wave = Number(process.env.PROFILE_WAVE || 21), seconds = Number(process.env.PROFILE_SECONDS || 20);
const width = Number(process.env.PROFILE_WIDTH || 1280), label = process.env.PROFILE_LABEL || `wave${wave}`;
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 } });
  const page = await context.newPage();
  await page.goto(base); await page.waitForSelector('#defend-start');
  const save = await page.evaluate(async (wave) => {
    const { defaults } = await import('/src/save.ts'); const s = defaults();
    s.settings.soundOff = s.settings.ambienceOff = true;
    s.profile = { name: 'Bench', flag: { base: 0, layers: [] } };
    s.defend.bestWave = wave; s.defend.furthestWave = wave + 1; s.defend.startWave = wave; return s;
  }, wave);
  await context.addInitScript(save => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('towerdefense.v1', JSON.stringify(save)); sessionStorage.setItem('seeded', '1'); } }, save);
  await page.reload(); await page.waitForSelector('#defend-start');
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    const urls = new Set(['/src/defend/ui.ts']); for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
    for (const url of urls) { const { DefendPage } = await import(url), frame = DefendPage.prototype.frame; if (frame.__hooked) continue;
      DefendPage.prototype.frame = function (t) { window.__dp = this; const a = performance.now(); const r = frame.call(this, t); if (window.__rows && this.sim) window.__rows.push({ t, ms: performance.now() - a, sim: window.__simMs || 0,  enemies: this.sim.enemies.length, ...this.renderer?.timings }); return r; };
      DefendPage.prototype.frame.__hooked = true; }
    const { DefendSim } = await import('/src/defend/sim.ts'); const up = DefendSim.prototype.update; DefendSim.prototype.update = function (dt) { const a = performance.now(); const r = up.call(this, dt); window.__simMs = performance.now() - a; return r; };
  });
  await page.waitForFunction(() => window.__dp);
  await page.evaluate(k => { window.__kill = k; }, Number(process.env.PROFILE_KILL || 0));
  await page.locator('#defend-start').click({ force: true });
  await page.evaluate(() => { const p = window.__dp; p.sim.hp[p.sim.keepId] = p.sim.maxHp[p.sim.keepId] = 1e12; window.__rows = []; defendFrameTimes(true);
    // PROFILE_KILL: damage per second spread over enemies, standing in for a strong city so worms split into crowds.
    const kill = Number(window.__kill || 0); if (kill) setInterval(() => { const sim = p.sim; if (!sim) return; for (const e of sim.enemies) if (e.hp > 0 && Math.random() < .3) sim.hurtEnemy(e, kill / 10, false); }, 100); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start');
  await page.waitForTimeout(seconds * 1000);
  const { profile } = await cdp.send('Profiler.stop');
  const rows = await page.evaluate(() => window.__rows);
  writeFileSync(`test-results/${label}.cpuprofile`, JSON.stringify(profile));
  writeFileSync(`test-results/${label}-frames.json`, JSON.stringify(rows));
  await page.screenshot({ path: `test-results/${label}.png` });
  const gaps = rows.slice(1).map((r, i) => r.t - rows[i].t), sorted = gaps.toSorted((a, b) => a - b);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  console.log(JSON.stringify({ wave, frames: rows.length, fps: +(1000 / mean(gaps)).toFixed(1), p50: sorted[Math.floor(gaps.length * .5)].toFixed(1), p95: sorted[Math.floor(gaps.length * .95)].toFixed(1), max: sorted.at(-1).toFixed(1), over50ms: gaps.filter(g => g > 50).length, frameWorkMs: mean(rows.map(r => r.ms)).toFixed(1), peakEnemies: Math.max(...rows.map(r => r.enemies)) }));
  // Self time by function.
  const byId = new Map(profile.nodes.map(n => [n.id, n])), self = new Map(), dt = profile.timeDeltas; let total = 0;
  profile.samples.forEach((id, i) => { const n = byId.get(id), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').at(-1)}:${n.callFrame.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0)); total += dt[i] || 0; });
  console.table([...self].sort((a, b) => b[1] - a[1]).slice(0, 35).map(([k, v]) => ({ fn: k, ms: (v / 1000).toFixed(0), pct: (100 * v / total).toFixed(1) })));
} finally { await browser.close(); }
