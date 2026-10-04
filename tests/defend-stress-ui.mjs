// Full DefendPage loop, including HUD, layout, overlay and wall-clock pacing.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const phone=process.env.PERF_PHONE==='1';
  const page=await browser.newPage({viewport:phone?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:phone?2:1,hasTouch:phone});
  await page.addInitScript(()=>{globalThis.__pinnedSeeds={defend:3182828918,game:3887091088};});
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/')+'tests/defend-stress.html?manual&enemies='+(process.env.PERF_ENEMIES || 2500));
  await page.waitForFunction(()=>window.stressPage);
  await page.evaluate(()=>document.fonts.ready);
  const cdp=await page.context().newCDPSession(page);
  if(process.env.PERF_CPU_RATE)await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PERF_CPU_RATE)});
  const result=await page.evaluate(async ({frames,realtime})=>{
    const p=window.stressPage,sim=window.stressSim;
    const originalSample=p.frameTimes.sample.bind(p.frameTimes);let actualFrame=0;
    p.frameTimes.sample=row=>originalSample({...row,frameMs:actualFrame});
    let update=0,draw=0;const originalUpdate=sim.update.bind(sim),originalDraw=p.renderer.draw.bind(p.renderer);
    sim.update=(dt)=>{const t=performance.now();originalUpdate(dt);update+=performance.now()-t;};
    p.renderer.draw=(...args)=>{const t=performance.now();originalDraw(...args);draw+=performance.now()-t;};
    const rows=[];let last=0,clock=1000;
    for(let i=0;i<frames+60;i++){
      const now=await new Promise(requestAnimationFrame);clock+=1000/60;update=draw=0;
      actualFrame=last?now-last:0;
      const start=performance.now();p.frame(realtime?now:clock);const end=performance.now();
      if(i>=60)rows.push({frame:now-last,update,draw,ui:end-start-update-draw});last=now;
    }
    const mean=key=>rows.reduce((s,r)=>s+r[key],0)/rows.length;
    return {frames,realtime,frameMs:mean('frame'),fps:1000/mean('frame'),frameP95Ms:rows.map(r=>r.frame).toSorted((a,b)=>a-b)[Math.floor(rows.length*.95)],updateMs:mean('update'),drawMs:mean('draw'),uiMs:mean('ui'),enemies:sim.enemies.length,soldiers:sim.soldiers.length,overlay:document.querySelector('.defend-frame-times')?.textContent};
  },{frames:Number(process.env.PERF_FRAMES || 180),realtime:process.env.PERF_REALTIME==='1'});
  const label=process.env.PERF_LABEL || 'ui';
  mkdirSync('test-results',{recursive:true});
  writeFileSync(`test-results/stress-${label}.json`,JSON.stringify({...result,phone,cpuRate:Number(process.env.PERF_CPU_RATE || 1)},null,2));
  await page.screenshot({path:`test-results/stress-${label}.png`});
  console.log(JSON.stringify(result,null,2));
  if(!result.overlay?.includes('Entities'))throw new Error('frame overlay was not rendered');
} finally {await browser.close();}
