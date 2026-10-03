// Manual browser benchmark: real simulation + renderer, isolated from saves.
// Start npm run dev first. Output is deliberately not a CI timing assertion.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(process.env.TEST_URL || 'http://127.0.0.1:5173/');
  // Remove the app loop: benchmark only the imported battle and full renderer.
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  const cdp = await page.context().newCDPSession(page);
  if (process.env.PERF_PROFILE) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const rows = [];
  for (let wave = Number(process.env.PERF_WAVE || 1); wave <= Number(process.env.PERF_WAVE || 20); wave++) {
    // Release previous renderers and their canvases between samples.
    await page.reload();
    await cdp.send('HeapProfiler.collectGarbage');
    const row = await page.evaluate(async ({ wave, scene, realtime, mixed, frames }) => {
      const { DefendSim } = await import('/src/defend/sim.ts');
      const { DefendRenderer } = await import('/src/defend/render.ts');
      const { defaultLayout, fitLayout, placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const { generateCity } = await import('/src/defend/citygen.ts');
      const { UPGRADES } = await import('/src/defend/catalog.ts');
      let layout = defaultLayout();
      const { tx, ty } = layout.keep;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]])
        layout = placeCityTile(layout, tx + dx, ty + dy) ?? layout;
      for (const [kind, dx, dy] of [['barracks',1,1],['archerTower',-1,1],['cannonTower',1,-1],['wizardTower',-1,-1]])
        layout = placeStructure(layout, kind, tx + dx, ty + dy) ?? layout;
      const map = generateCity(fitLayout(layout), 5);
      const sim = new DefendSim(map, Object.fromEntries(UPGRADES.map(u => [u.id, u.maxLevel])), 42);
      sim.wave = wave;
      // Identical crowd mix at every wave, independently of wave unlocks.
      for (let i = 0; i < wave * 500; i++) {
        const k = i % 100;
        sim.spawnEnemy(!mixed || k < 65 ? 'roach' : k < 80 ? 'orc' : k < 90 ? 'bat' : k < 95 ? 'mother' : k < 99 ? 'ogre' : 'warlord');
      }
      if (scene === 'city') {
        const { CELLS_W } = await import('/src/defend/grid.ts');
        const cells = [...map.city.keys()].filter(i => map.city[i] && !sim.solid[i]);
        for (let i = 0; i < sim.enemies.length; i++) {
          const e = sim.enemies[i], cell = cells[i % cells.length];
          e.x = cell % CELLS_W + .5 + e.jx;
          e.y = Math.floor(cell / CELLS_W) + .5 + e.jy;
        }
        // Keep fighting for the whole sample, without skipping damage/AI/render work.
        sim.hp[sim.keepId] = sim.maxHp[sim.keepId] = 1e12;
      }
      const canvas = document.querySelector('canvas');
      const renderer = new DefendRenderer(canvas);
      renderer.resize(720, 840);
      const step = [], draw = [], frame = [], population = [];
      let last = 0;
      for (let i = 0; i < frames; i++) {
        const now = await new Promise(requestAnimationFrame);
        const start = performance.now();
        sim.update(realtime && last ? (now - last) / 1000 : 1 / 60);
        const mid = performance.now();
        renderer.draw(map, sim, null, { grid: false, weather: { rain: true }, night: 1, now, reduceMotion: false, effects: true });
        const end = performance.now();
        if (i >= 30) { step.push(mid-start); draw.push(end-mid); frame.push(now-last); population.push(sim.enemies.length); }
        last = now;
      }
      const mean = a => +(a.reduce((s,v)=>s+v,0)/a.length).toFixed(2);
      const p95 = a => +a.toSorted((a,b)=>a-b)[Math.floor(a.length*.95)].toFixed(2);
      return { wave, scene, realtime, mixed, initialEnemies: wave * 500, enemies: sim.enemies.length, averageEnemies: mean(population), updateMs: mean(step), drawMs: mean(draw), frameP95Ms: p95(frame), fps: +(1000/mean(frame)).toFixed(1) };
    }, { wave, scene: process.env.PERF_SCENE || 'spawn', realtime: process.env.PERF_REALTIME === '1', mixed: process.env.PERF_MIX === '1', frames: Math.max(31, Number(process.env.PERF_FRAMES || 150)) });
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/performance-${process.env.PERF_LABEL || 'latest'}.json`, JSON.stringify(rows, null, 2));
  await page.screenshot({ path: 'test-results/performance.png' });
  if (process.env.PERF_PROFILE) {
    const { profile } = await cdp.send('Profiler.stop');
    writeFileSync('test-results/defend.cpuprofile', JSON.stringify(profile));
    console.table(profile.nodes.toSorted((a,b) => (b.hitCount || 0)-(a.hitCount || 0)).slice(0,20).map(n => ({ function: n.callFrame.functionName, hits: n.hitCount, file: n.callFrame.url.split('/').at(-1) })));
  }
} finally { await browser.close(); }
