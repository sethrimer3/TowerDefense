// Manual: frame times while many buildings are struck, fall and are rebuilt
// at once (a boss worm through a big city with masons at work), with the
// shared sky on as in the live game. CHURN_HITS (20 a frame), CHURN_PHASE
// (night, day, ...). CHURN_PROFILE=1 writes a CPU profile.
// Needs `npm run dev`. PLAYWRIGHT_EXECUTABLE / TEST_URL supported.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(base + 'tests/performance.html');
  const cdp = await page.context().newCDPSession(page);
  if (process.env.CHURN_PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const out = await page.evaluate(async ([hits, phase]) => {
    const { stressScene } = await import('/tests/defend-stress-scene.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { DayClock, useDayClock } = await import('/src/daylight.ts');
    useDayClock(new DayClock(60_000), () => ({ dayNightCycle: false, timeOfDay: phase }));
    const s = stressScene(150), sim = s.sim;
    const cv = document.createElement('canvas'), r = new DefendRenderer(cv);
    r.resize(1280, 800);
    const opts = now => ({ grid: 0, weather: { rain: false }, night: 1, now, reduceMotion: false, effects: true, mergedOutlines: true, area: 'moss' });
    const wrap = (name, into) => { const f = r[name].bind(r); r[name] = (...a) => { const t = performance.now(); const v = f(...a); into.ms += performance.now() - t; return v; }; };
    const layer = { ms: 0 }, full = { ms: 0, n: 0 }; wrap('refreshLayer', layer); { const f = r.paintMasks.bind(r); r.paintMasks = (...a) => { full.n++; return f(...a); }; }
    for (let i = 0; i < 5; i++) r.draw(s.map, sim, null, opts(i * 16));
    let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const targets = s.map.buildings.filter(b => b.kind !== 'keep' && !b.hidden && sim.intact(b));
    const frames = [], phases = { idle: [], churn: [] };
    for (let f = 0; f < 120; f++) {
      const churn = f >= 20;
      if (churn) {
        // A worm strikes ~20 buildings a frame; some fall; masons rebuild
        // a few cells of fallen ones.
        for (let k = 0; k < hits; k++) { const b = targets[Math.floor(rand() * targets.length)]; if (sim.hp[b.id] > 0) sim.damageBuilding(b.id, sim.maxHp[b.id] * 0.35); }
        let n = 0;
        for (const b of targets) if (!sim.intact(b) && n < 6) for (const c of b.cells) if (!sim.solid[c] && n < 6) { sim.rebuildCell(c); n++; }
      }
      sim.time += 1 / 60;
      const t = performance.now(); layer.ms = 0;
      r.draw(s.map, sim, null, opts(100 + f * 16));
      const ms = performance.now() - t;
      frames.push(ms); (phases[churn ? 'layerChurn' : 'layerIdle'] ??= []).push(layer.ms); phases[churn ? 'churn' : 'idle'].push(ms);
    }
    const stat = a => { const s = [...a].sort((x, y) => x - y); return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1), p95: +s[Math.floor(s.length * .95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
    return { idle: stat(phases.idle), churn: stat(phases.churn), layerIdle: stat(phases.layerIdle), layerChurn: stat(phases.layerChurn), buildings: s.map.buildings.length, fullRepaints: full.n, mapVersion: sim.mapVersion };
  }, [Number(process.env.CHURN_HITS ?? 20), process.env.CHURN_PHASE ?? 'night']);
  console.log(JSON.stringify(out));
  if (process.env.CHURN_PROFILE) { const { profile } = await cdp.send('Profiler.stop'); writeFileSync(`test-results/structure-churn-${process.env.CHURN_LABEL ?? 'run'}.cpuprofile`, JSON.stringify(profile)); }
} finally { await browser.close(); }
