// Browser regression checks: real pixels, cache invalidation and bounded memory.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { makeReference } from './defend-render-reference.mjs';
import { writeFileSync } from 'node:fs';
const referenceRoot=makeReference();
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
try {
  const page = await browser.newPage({ viewport:{width:1280,height:900} });
  await page.route('**/@vite/client', route=>route.fulfill({contentType:'application/javascript',body:'export const injectQuery = (url) => url;'}));
  await page.addInitScript(()=>{ globalThis.__pinnedSeeds={defend:3182828918,game:3887091088}; });
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/')+'tests/performance.html');
  page.on('console',msg=>{if(msg.text().startsWith('Sparse lightning'))console.log(msg.text());});
  const results = await page.evaluate(async referenceRoot => {
    const {GroundRelief}=await import('/src/defend/ground-relief.ts');
    const {GroundRelief:ReferenceRelief}=await import(`${referenceRoot}/ground-relief.ts`);
    const {DefendRenderer}=await import('/src/defend/render.ts');
    const {stressScene}=await import('/tests/defend-stress-scene.ts');
    const {drawBlazes}=await import('/src/defend/mage-art.ts');
    const {drawBlazes:referenceBlazes}=await import(`${referenceRoot}/mage-art.ts`);
    const referenceBattle=await import(`${referenceRoot}/battle-art.ts`);
    const {WizardArt:ReferenceWizard}=await import(`${referenceRoot}/wizard-art.ts`);
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
    const {FloodArt}=await import('/src/defend/flood-art.ts');
    const {FloodArt:OriginalFlood}=await import(`${referenceRoot}/flood-art.ts`);
    const flood=new FloodArt(), originalFlood=new OriginalFlood();
    const waterSim={...sim,floods:[],sinkings:[]};
    const waterLayer=make();
    const waterBrush=waterLayer.getContext('2d');
    waterBrush.fillStyle='#765432';waterBrush.fillRect(0,0,waterLayer.width,waterLayer.height);
    let reused;
    for(const [n,radius] of [4,4,1,8,2,0,4].entries()) {
      waterSim.time=1+n/10;
      waterSim.floods=radius ? [{x:30,y:35,r:radius,t:1,life:10,boat:7}] : [];
      for(const rain of [false,true])for(const reduceMotion of [false,true]){
        const a=make(),b=make();
        const frame={px:6,sim:waterSim,rain,reduceMotion,reflections:true,layer:waterLayer,layerScale:1};
        for(const cv of [a,b]){const c=cv.getContext('2d');c.fillStyle='#73615a';c.fillRect(0,0,cv.width,cv.height);}
        originalFlood.draw({...frame,c:a.getContext('2d')});
        flood.draw({...frame,c:b.getContext('2d')});
        reports.push({check:`water buffers ${n}, rain ${rain}, motion ${!reduceMotion}`,...compare(a,b)});
      }
      if(n===0)reused=flood.rasters.top.pixels.buffer;
      if(n===1 && reused!==flood.rasters.top.pixels.buffer)throw new Error('water buffer was not reused');
      for(const raster of Object.values(flood.rasters))if(raster.pixels.length>63*91*64)throw new Error('water capacity exceeds the board');
    }
    const {BoltBuffer}=await import('/src/defend/dark-art.ts');
    const {BoltBuffer:OriginalBolts}=await import(`${referenceRoot}/dark-art.ts`);
    const bolts=new BoltBuffer(), originalBolts=new OriginalBolts();
    const near={pts:[2,2,3,3,4,2],from:[0,1],t:0,life:.32,seed:7};
    const far={pts:[58,85,59,86,60,85],from:[0,1],t:0,life:.32,seed:13};
    const clipped={pts:[-2,-2,1,1,65,93],from:[0,1],t:.02,life:.32,seed:9};
    const chain={pts:[5,5],from:[],t:0,life:.32,seed:3};
    for(let i=0;i<250;i++){chain.pts.push(5+(i%25)*.6,5+Math.floor(i/25)*.6);chain.from.push(i);}
    const sequence=[[near,far],[near,near,far],[chain],[clipped],[],[],[far]];
    for(const t of [0,.04,.08,.19,.28,.33]) {
      for(const input of sequence) {
        const frame=input.map(b=>({...b,t}));
        const a=originalBolts.raster(frame),b=bolts.raster(frame);
        if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('bolt dirty bounds changed');
        for(let i=0;i<bolts.rgba.length;i++)if(bolts.rgba[i]!==originalBolts.rgba[i])throw new Error(`bolt pixel mismatch at ${i}, age ${t}`);
      }
    }
    reports.push({check:'sparse bolt overlap, clipping, fading and clearing',max:0,mean:0,different:0});
    const bench=Type=>{
      const buf=new Type();
      for(let i=0;i<50;i++)buf.raster([near,far]);
      const start=performance.now();
      for(let i=0;i<500;i++)buf.raster([near,far]);
      return (performance.now()-start)/500;
    };
    console.log('Sparse lightning ms/frame',JSON.stringify({before:bench(OriginalBolts),after:bench(BoltBuffer)}));
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
    // The light field sums each pool where the canvas once drew it scaled up:
    // close to the original, not exact (pools meeting a wall's edge are
    // multiplied before they are smoothed, not after).
    const {DefendLighting}=await import('/src/defend/lighting.ts');
    const {DefendLighting:ReferenceLighting}=await import(`${referenceRoot}/lighting.ts`);
    const {carriedLights}=await import('/src/defend/battle-art.ts');
    const {ambientFor}=await import('/src/defend/weather.ts');
    const {paintCityLayer}=await import('/src/defend/city-layer.ts');
    const intact=id=>sim.intact(map.buildings[id]);
    for(const px of [6,9.23076923076923,18])for(const [night,rain] of [[1,true],[0.3,false]]){
      const w=Math.round(63*px),h=Math.round(91*px),shots=[];
      for(const L of [new ReferenceLighting(),new DefendLighting()]){
        L.setMap(map);L.update(sim.solid,[],intact);L.bakePending(sim.solid,1e4);L.update(sim.solid,[],intact);
        const cv=make(w,h),g=cv.getContext('2d');
        paintCityLayer(g,px,{map,sim,lights:L.lights,stones:L.roadStones});
        L.drawLight(g,{px,now:1234,reduceMotion:false,intact},ambientFor({rain},night),{torches:carriedLights(sim),solid:sim.solid,version:sim.mapVersion});
        shots.push(cv);
      }
      reports.push({check:'light field',px,night,...compare(...shots),limit:{max:40,mean:1.2}});
    }
    // Shading only the trees' own box leaves every pixel as it was.
    const {ParkTrees}=await import('/src/defend/park-trees.ts');
    const {ParkTrees:ReferenceTrees}=await import(`${referenceRoot}/park-trees.ts`);
    for(const [zoom,x,y] of [[1,0,0],[2.5,-300,-500]]){
      const shots=[];
      for(const T of [ReferenceTrees,ParkTrees]){
        const trees=new T();trees.sync(map);trees.update([],1,true);
        const cv=make(720,840),g=cv.getContext('2d');
        g.fillStyle='#73615a';g.fillRect(0,0,720,840);g.setTransform(zoom,0,0,zoom,x,y);
        trees.draw(g,9.23076923076923,o=>{o.fillStyle='rgba(118,118,118,0.2)';o.fillRect(0,0,581,840);o.fillStyle='rgba(7,10,24,0.5)';o.fillRect(100,100,300,300);});
        shots.push(cv);
      }
      reports.push({check:'tree shading box',zoom,...compare(...shots)});
    }
    const canvas=document.querySelector('canvas'),r=new DefendRenderer(canvas);
    r.resize(720,840);
    const opts={grid:false,weather:{rain:false},night:1,now:1000,reduceMotion:true,effects:true,healthbars:true};
    // Lights bake a few a frame: settle them first, or consecutive frames
    // differ in their lighting rather than their combat.
    r.draw(map,sim,null,opts);r.lighting.bakePending(sim.solid,1000);
    const capture=()=>{const copy=make(canvas.width,canvas.height);copy.getContext('2d').drawImage(canvas,0,0);return copy;};
    for(const [zoom,x,y] of [[1,0,0],[2.5,-300,-500]]){
      Object.assign(r.cam,{s:zoom,x,y});
      r.draw(map,sim,null,opts);const a=capture();
      const original=make(canvas.width,canvas.height),fresh=make(canvas.width,canvas.height);
      for(const cv of [original,fresh]){
        const g=cv.getContext('2d');g.setTransform(zoom,0,0,zoom,x,y);g.imageSmoothingEnabled=false;
      }
      const g=original.getContext('2d'),brush={c:g,px:r.px};
      referenceBattle.drawScorches(brush,sim);
      referenceBlazes(g,r.px,sim);
      const {flameLights}=await import('/src/defend/wizard-art.ts');
      const oldWizard=new ReferenceWizard();
      Object.assign(oldWizard,{clusters:r.wizard.clusters,fire:r.wizard.fire,glints:r.wizard.glints});
      oldWizard.drawIce(g,r.px,sim.frosts,sim.time*1000,flameLights(sim).relief);
      referenceBattle.drawUnits(brush,sim,()=>1,true);
      r.dark.draw(g,r.px,sim);
      r.paintCombat(fresh.getContext('2d'),sim,()=>1,opts);
      reports.push({check:'original combat pixels',zoom,...compare(original,fresh)});
      r.draw(map,sim,null,opts);const b=capture();
      r.combatKey='';r.draw(map,sim,null,opts);const direct=capture();
      reports.push({check:'combat reuse',zoom,...compare(b,direct)});
      // A repeated frame should be identical once staged light baking settles.
      r.lighting.bakePending(sim.solid,1000);
      r.draw(map,sim,null,opts);const settled=capture();r.draw(map,sim,null,opts);
      reports.push({check:'settled repeat',zoom,...compare(settled,capture())});
      if(!a.width)throw new Error('empty capture');
    }
    // A dropped bomb changes combat between ticks. It must not leave a cached
    // pre-blast frame on screen while a journal has paused the simulation.
    r.draw(map,sim,null,opts);
    const time=sim.time;
    sim.dropBomb(30,35);
    if(sim.time!==time)throw new Error('bomb advanced battle time');
    r.draw(map,sim,null,opts);const bomb=capture();
    r.combatKey='';r.draw(map,sim,null,opts);
    reports.push({check:'same-tick bomb',...compare(bomb,capture())});
    // Settings and canvas dimensions independently invalidate screen pixels.
    opts.healthbars=false;
    canvas.width-=17;
    r.draw(map,sim,null,opts);const resized=capture();
    r.combatKey='';r.draw(map,sim,null,opts);
    reports.push({check:'resize and healthbars',...compare(resized,capture())});
    return reports;
  },referenceRoot);
  writeFileSync('test-results/render-cache.json',JSON.stringify(results,null,2));
  console.table(results);
  for(const result of results){
    // Alpha rounding across a transparent intermediate can differ by one byte.
    const limit=result.limit ?? {max:3,mean:.03};
    assert.ok(result.max<=limit.max && result.mean<limit.mean,JSON.stringify(result));
  }
  console.log('Renderer cache pixel, invalidation and memory checks passed');
} finally { await browser.close(); }
