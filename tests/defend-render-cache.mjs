// Browser regression checks: real pixels, cache invalidation and bounded memory.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { makeReference } from './defend-render-reference.mjs';
import { writeFileSync } from 'node:fs';
makeReference();
const browser = await chromium.launch({ headless:true, channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  await page.route('**/@vite/client', route=>route.fulfill({contentType:'application/javascript',body:'export const injectQuery = (url) => url;'}));
  await page.addInitScript(()=>{ globalThis.__pinnedSeeds={defend:3182828918,game:3887091088}; });
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/')+'tests/performance.html');
  const results = await page.evaluate(async () => {
    const {GroundRelief}=await import('/src/defend/ground-relief.ts');
    const {GroundRelief:ReferenceRelief}=await import('/test-results/reference/ground-relief.ts');
    const {DefendRenderer}=await import('/src/defend/render.ts');
    const {stressScene}=await import('/tests/defend-stress-scene.ts');
    const {drawBlazes}=await import('/src/defend/mage-art.ts');
    const {drawBlazes:referenceBlazes}=await import('/test-results/reference/mage-art.ts');
    const {map,sim}=stressScene(100);
    const make=(w=504,h=728)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
    const compare=(a,b)=>{
      const aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
      const bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
      let max=0,total=0,different=0;
      for(let i=0;i<aa.length;i++){const delta=Math.abs(aa[i]-bb[i]);max=Math.max(max,delta);total+=delta;if(delta)different++;}
      return {max,mean:total/aa.length,different};
    };
    const reports=[];
    // Exact original compositing order, including clipped lights and fading.
    for(const px of [6,9.23076923076923,18]){
      const w=Math.round(63*px),h=Math.round(91*px),a=make(w,h),b=make(w,h);
      const old=new ReferenceRelief(),fresh=new GroundRelief();
      old.sync(map,px,w,h);fresh.sync(map,px,w,h);
      const lights=[{x:2.23,y:3.17,r:4.3,k:.77,color:'#e0213b'},{x:30.12,y:32.4,r:6,k:.5,color:'#ffb36b'},{x:63,y:85,r:8,k:.9,color:'#ffc68a'}];
      for(const k of [1,.8,.3]){
        for(const c of [a,b]){const g=c.getContext('2d');g.fillStyle='#73615a';g.fillRect(0,0,w,h);}
        old.draw(a.getContext('2d'),px,{version:'0',lights:()=>lights},lights.map(l=>({...l,k:l.k*k})),.85);
        fresh.draw(b.getContext('2d'),px,{version:'0',lights:()=>lights},lights.map(l=>({...l,k:l.k*k})),.85);
        reports.push({check:'relief',px,k,...compare(a,b)});
      }
      // Keys exclude brightness; map and scale invalidation must discard masks.
      const before=fresh.sprites.size;
      fresh.sync({...map},px,w,h);
      if(!before||fresh.sprites.size!==0)throw new Error('relief cache invalidation');
      for(let i=0;i<300;i++)fresh.light(b.getContext('2d'),px,{...lights[0],x:2+i*.03});
      if(fresh.sprites.size>256||fresh.spritePixels>8*1024*1024)throw new Error('unbounded relief cache');
    }
    // Fractional board scales preserve the scorch's rounded art-pixel edges.
    for(const px of [6,9.23076923076923,18]){
      const a=make(400,400),b=make(400,400);
      const blaze={x:15.35,y:15.12,r:2.1,t:.4,life:6,seed:73};
      for(const time of [1,1.01,1.13,4.2]){
        blaze.t=time;
        for(const c of [a,b]){const g=c.getContext('2d');g.fillStyle='#73615a';g.fillRect(0,0,400,400);}
        referenceBlazes(a.getContext('2d'),px,{blazes:[blaze],time});
        drawBlazes(b.getContext('2d'),px,{blazes:[blaze],time});
        reports.push({check:'scorch',px,time,...compare(a,b)});
      }
    }
    const canvas=document.querySelector('canvas'),r=new DefendRenderer(canvas);
    r.resize(720,840);
    const opts={grid:false,weather:{rain:false},night:1,now:1000,reduceMotion:true,effects:true,healthbars:true};
    const capture=()=>{const copy=make(canvas.width,canvas.height);copy.getContext('2d').drawImage(canvas,0,0);return copy;};
    for(const [zoom,x,y] of [[1,0,0],[2.5,-300,-500]]){
      Object.assign(r.cam,{s:zoom,x,y});
      r.draw(map,sim,null,opts);const a=capture();
      r.draw(map,sim,null,opts);const b=capture();
      r.combatKey='';r.draw(map,sim,null,opts);const direct=capture();
      reports.push({check:'combat reuse',zoom,...compare(b,direct)});
      // A repeated frame should be identical once staged light baking settles.
      r.lighting.bakePending(sim.solid,1000);
      r.draw(map,sim,null,opts);const settled=capture();r.draw(map,sim,null,opts);
      reports.push({check:'settled repeat',zoom,...compare(settled,capture())});
      if(!a.width)throw new Error('empty capture');
    }
    return reports;
  });
  writeFileSync('test-results/render-cache.json',JSON.stringify(results,null,2));
  console.table(results);
  for(const result of results){
    // Alpha rounding across a transparent intermediate can differ by one byte.
    assert.ok(result.max<=3 && result.mean<.03,JSON.stringify(result));
  }
  console.log('Renderer cache pixel, invalidation and memory checks passed');
} finally { await browser.close(); }
