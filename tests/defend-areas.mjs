import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? {headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE}
  : {headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try {
  const page=await browser.newPage({viewport:{width:1040,height:1500}});
  const errors=[];page.on('pageerror',e=>errors.push(e.stack));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:5173/')+'tests/defend-areas.html');
  await page.waitForFunction(()=>window.areaFixture).catch(e=>{throw new Error(`${e.message}\n${errors.join('\n')}`)});
  mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/defend-areas.png',fullPage:true});
  const result=await page.evaluate(()=>{
    const {renderers,map,sim,opts}=window.areaFixture,r=renderers[0];
    const hash=c=>{let h=0;for(const v of c.getContext('2d').getImageData(0,0,c.width,c.height).data)h=(Math.imul(h,31)+v)|0;return h};
    const hashes=renderers.map(r=>hash(r.layer));
    const draw=(area,now,reduceMotion=false)=>r.draw(map,sim,null,{...opts,area,now,reduceMotion});
    // sample the same outside-city floor pixel, clear of flags and units
    const pixel=()=>Array.from(r.canvas.getContext('2d').getImageData(Math.round(r.cam.x+2*r.px),Math.round(r.cam.y+16*r.px),1,1).data);
    draw('moss',1000);const old=pixel();
    draw('desert',2000);const start=pixel(),startMix=r.areaMix;
    draw('desert',3500);const middle=pixel(),midMix=r.areaMix;
    draw('desert',5000);const end=pixel(),endMix=r.areaMix;
    draw('frozen',5100,true);const reduced=r.areaMix;
    return {hashes,old,start,middle,end,startMix,midMix,endMix,reduced};
  });
  assert.equal(new Set(result.hashes).size,9,'every area renders distinct terrain');
  assert.deepEqual(result.start,result.old,'fade starts on old terrain exactly');
  assert.equal(result.startMix,0);assert.equal(result.midMix,.5);assert.equal(result.endMix,1);assert.equal(result.reduced,1);
  assert.notDeepEqual(result.old,result.end,'new terrain has different pixels');
  for(let i=0;i<3;i++)assert.ok(Math.abs(result.middle[i]-(result.old[i]+result.end[i])/2)<=2,'midpoint pixels blend evenly');
  assert.deepEqual(errors,[]);
  await page.setViewportSize({width:390,height:844});
  await page.goto((process.env.TEST_URL||'http://127.0.0.1:5173/')+'tests/defend-stress.html?manual&enemies=100');
  await page.waitForFunction(()=>window.stressPage);
  const weather=await page.evaluate(()=>{
    const p=window.stressPage,sim=window.stressSim;
    sim.events.length=0;sim.wave=21;sim.events.push({type:'waveStart',wave:21});p.handleEvents();
    const desert={...p.weather};
    sim.wave=41;sim.events.push({type:'waveStart',wave:41});p.handleEvents();
    const frozen={...p.weather};
    p.save.startWave=41;p.save.unlockedWave=180;p.phase='build';p.sim=null;p.renderChrome();p.relayout();
    return {desert,frozen};
  });
  assert.equal(weather.desert.rain,false);assert.equal(weather.frozen.snow,true);assert.equal(weather.frozen.rain,false);
  await page.locator('#defend-wave').click();
  const rows=await page.evaluate(()=>[1,21,41].map(w=>{
    const row=document.querySelector(`[data-wave="${w}"]`),s=getComputedStyle(row);
    return {color:s.color,background:s.backgroundColor,area:row.title};
  }));
  assert.equal(new Set(rows.map(r=>r.background)).size,3);
  assert.deepEqual(rows.map(r=>r.area),['Mossbound Ruins','Amber Desert','Frozen Vault']);
  await page.screenshot({path:'test-results/defend-areas-mobile-picker.png'});
  await page.locator('[data-wave="21"]').click();
  const button=await page.locator('#defend-wave').evaluate(el=>({color:getComputedStyle(el).getPropertyValue('--area-color').trim(),width:el.getBoundingClientRect().width,scroll:document.documentElement.scrollWidth,view:innerWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>({tag:e.tagName,id:e.id,right:e.getBoundingClientRect().right})).slice(0,10)}));
  await page.screenshot({path:'test-results/defend-areas-mobile.png'});
  assert.equal(button.color,'#f1c263');assert.ok(button.width>20);assert.deepEqual(button.overflow,[],'mobile controls and board fit the viewport');
  await page.locator('#defend-start').click();
  assert.deepEqual(await page.evaluate(()=>({rain:window.stressPage.weather.rain,area:window.stressPage.renderer.area})),{rain:false,area:'desert'});
  await page.evaluate(()=>window.stressPage.fastForward(5));
  assert.equal(await page.evaluate(()=>window.stressPage.sim.wave),21);
  assert.deepEqual(errors,[]);
  console.log('Nine area renders, terrain fade pixels, reduced motion and asset loading passed.');
} finally {await browser.close();}
