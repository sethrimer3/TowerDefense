// Chrome CPU profile + Performance-panel trace, with a fixed simulation clock.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const label = process.env.PERF_LABEL || 'latest';
const frames = Math.max(60, Number(process.env.PERF_FRAMES || 360));
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: Number(process.env.PERF_DPR || 1) });
  await page.addInitScript(() => { globalThis.__pinnedSeeds = { rolls: 42, effects: 73 }; });
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  console.log('Preparing stress scene');
  page.on('console', msg => { if (msg.text().startsWith('[stress]')) console.log(msg.text()); });
  await page.evaluate(async count => {
    const { stressScene } = await import('/tests/defend-stress-scene.ts');
    const { DefendRenderer } = await import('/src/defend/render.ts');
    const { map, sim } = stressScene(count);
    console.log('[stress] scene ready', sim.soldiers.length);
    const renderer = new DefendRenderer(document.querySelector('canvas'));
    renderer.resize(720, 840);
    const costs = {};
    // Inclusive pass timings: drill down into effects without double counting.
    for (const [object, names] of [[renderer, ['refreshLayer','drawCity','advanceWizard','drawBattleGround','drawLighting','drawGroundRelief','drawBattleUnits','drawTrees','drawRain']],
      [renderer.relief, ['draw']], [renderer.lighting, ['drawUnitShadows','drawLight']],
      [renderer.wizard, ['drawIce','drawChill','drawFire']], [renderer.dark, ['draw']],
      [sim, ['computeField','stepUnits','enemiesNear','followPath']]]) {
      for (const name of names) {
        const original = object[name];
        const key = object === renderer.relief ? 'groundRelief' : object === renderer.dark ? 'darkBolts' : name;
        object[name] = function(...args) { const start = performance.now(); const result = original.apply(this, args); costs[key] = (costs[key] || 0) + performance.now() - start; return result; };
      }
    }
    const opts = { grid:false, weather:{rain:true}, night:1, now:0, reduceMotion:false, effects:true, healthbars:true, timings:true };
    window.bench = { map, sim, renderer, costs, opts };
    for (let i=0;i<30;i++) { await new Promise(requestAnimationFrame); sim.update(1/60); opts.now=sim.time*1000; renderer.draw(map,sim,null,opts); }
    console.log('[stress] warmup complete');
    for (const key in costs) costs[key]=0;
  }, Number(process.env.PERF_ENEMIES || 2500));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  if (process.env.PERF_CPU_RATE) await cdp.send('Emulation.setCPUThrottlingRate', { rate:Number(process.env.PERF_CPU_RATE) });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  console.log('Recording');
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => events.push(...value));
  if (process.env.PERF_TRACE) await cdp.send('Tracing.start', { categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline,disabled-by-default-v8.gc', options:'sampling-frequency=1000' });
  const row = await page.evaluate(async frames => {
    const {map,sim,renderer,costs,opts}=window.bench;
    const update=[],draw=[],interval=[],populations=[],entities=[],effects=[],activity={}; let last=0;
    for (let i=0;i<frames;i++) {
      const now=await new Promise(requestAnimationFrame); const start=performance.now();
      sim.update(1/60); const mid=performance.now(); opts.now=sim.time*1000;
      renderer.draw(map,sim,null,opts); const end=performance.now();
      update.push(mid-start); draw.push(end-mid); if(last) interval.push(now-last); last=now;
      entities.push(renderer.timings.entityMs); effects.push(renderer.timings.effectsMs);
      populations.push(sim.enemies.length);
      for(const key of ['soldiers','arrows','shells','flames','frosts','fireballs','blazes','bolts','floods','effects']) activity[key]=Math.max(activity[key]||0,sim[key].length);
    }
    const mean=a=>a.reduce((s,v)=>s+v,0)/a.length, p95=a=>a.toSorted((a,b)=>a-b)[Math.floor(a.length*.95)];
    return {frames,updateMs:mean(update),drawMs:mean(draw),entityMs:mean(entities),effectsMs:mean(effects),workP95Ms:p95(update.map((v,i)=>v+draw[i])),frameMs:mean(interval),frameP95Ms:p95(interval),fps:1000/mean(interval),averageEnemies:mean(populations),activity,passes:Object.fromEntries(Object.entries(costs).map(([k,v])=>[k,v/frames]))};
  }, frames);
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(`test-results/stress-${label}.cpuprofile`, JSON.stringify(profile));
  if (process.env.PERF_TRACE) {
    const complete = new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));
    await cdp.send('Tracing.end'); await complete;
    writeFileSync(`test-results/stress-${label}.trace.json`,JSON.stringify({traceEvents:events}));
  }
  row.browser=browser.version(); row.dpr=Number(process.env.PERF_DPR || 1); row.cpuRate=Number(process.env.PERF_CPU_RATE || 1);
  writeFileSync(`test-results/stress-${label}.json`, JSON.stringify(row,null,2));
  await page.screenshot({path:`test-results/stress-${label}.png`});
  console.log(JSON.stringify(row,null,2));
  const counts=new Map(); for(const id of profile.samples||[]) counts.set(id,(counts.get(id)||0)+1);
  console.table(profile.nodes.map(n=>({function:n.callFrame.functionName,file:n.callFrame.url.split('/').at(-1),samples:counts.get(n.id)||0})).toSorted((a,b)=>b.samples-a.samples).slice(0,25));
} finally { await browser.close(); }
