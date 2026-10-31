// Native art/lighting in an isolated page; never reads or writes a player save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? {headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE}
  : {headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try {
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/city-life-fixture',route=>route.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#131016}canvas{width:100vw;height:100vh;image-rendering:pixelated}</style><canvas></canvas>'}));
    await page.goto(new URL('/city-life-fixture',process.env.TEST_URL||'http://127.0.0.1:5173/').href);
    const setup=await page.evaluate(async()=>{
      const [{DefendRenderer},layout,{generateCity},solar,torches,{spriteFootprint},{heights},{ART}]=await Promise.all([
        import('/src/defend/render.ts'),import('/src/defend/layout.ts'),import('/src/defend/citygen.ts'),import('/src/daylight.ts'),
        import('/src/defend/city-torches.ts'),import('/src/defend/city-layer.ts'),import('/src/defend/shadow-art.ts'),import('/src/defend/art-scale.ts')]);
      let l=layout.defaultLayout();const {tx,ty}=l.keep;
      for(const[dx,dy]of [[0,-1],[1,0],[1,-1]])l=layout.placeCityTile(l,tx+dx,ty+dy);
      l=layout.placeGate(l,{tx,ty:ty-1,side:'n'});
      l=layout.placeStructure(l,'archerTower',tx+1,ty-1);
      const map=generateCity(layout.fitLayout(l),11),r=new DefendRenderer(document.querySelector('canvas'));
      r.resize(innerWidth,innerHeight);
      const center={x:(tx+1)*8,y:ty*8};
      r.cam.s=widthForZoom();r.cam.x=innerWidth/2-center.x*r.px*r.cam.s;r.cam.y=innerHeight/2-center.y*r.px*r.cam.s;
      function widthForZoom(){return innerWidth<500?2:3;}
      const clock=new solar.DayClock();solar.useDayClock(clock,()=>({dayNightCycle:true,timeOfDay:'day'}));
      let now=1000;
      const draw=(time,extra={})=>{clock.elapsed=time;r.draw(map,null,null,{grid:0,weather:{rain:false,clear:true},night:0,now:now+=33,reduceMotion:false,effects:true,...extra});};
      draw(60000);
      const keep=map.buildings.find(b=>b.kind==='keep'),f=spriteFootprint(map,keep);
      const h=heights(map,b=>b===keep,b=>spriteFootprint(map,b));
      let gap=0,edges=0;
      for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++)if(f.mask[y*f.w+x]){edges++;if(!h[(f.y0+y)*72*ART+f.x0+x])gap++;}
      const pixelMask=r.lighting.masks.pixels;
      let shaped=0;
      for(let y=keep.rect.y*ART;y<(keep.rect.y+keep.rect.h)*ART;y++)for(let x=keep.rect.x*ART;x<(keep.rect.x+keep.rect.w)*ART;x++)if(!pixelMask[y*72*ART+x])shaped++;
      window.fixture={map,r,draw,clock,torches,solar,keep};
      return {gap,edges,shaped,lights:r.lighting.lights.length};
    });
    assert.equal(setup.gap,0,'actual keep sprite has height all the way to its outline');
    assert.ok(setup.shaped>0,'light blockers retain actual transparent corners');
    const ignition=await page.evaluate(()=>{
      const {r,draw,torches}=window.fixture,samples=[];
      for(let d=-5001;d<=6000;d+=500){draw(torches.TORCH_DUSK+d);samples.push(r.lighting.lights.filter(l=>r.lighting.burn(l)>.5).length);}
      return samples;
    });
    assert.equal(ignition[0],0);assert.equal(ignition.at(-1),setup.lights);
    assert.ok(new Set(ignition).size>5,'torches ignite separately over ten seconds');
    await page.screenshot({path:`test-results/city-life-dusk-${width}.png`});
    const nighttime=await page.evaluate(async()=>{
      const {RES,FIELD_W}=await import('/src/defend/light-field.ts');
      const {r,map,draw}=window.fixture;
      for(let i=0;i<2400;i++)r.cityLife.update(1/30,220000,true,false,[]);
      for(let i=0;i<30;i++)draw(220000);
      const outside=r.lighting.lights.filter(l=>map.buildings[l.owner].kind==='wall');
      const field=r.lighting.field;
      const glow=outside.map(l=>field.glow[3][Math.floor(l.y*RES)*FIELD_W+Math.floor(l.x*RES)]);
      const tower=r.lighting.lights.find(l=>l.kind==='archerTower'),b=r.lighting.bakes.get(tower.id).pair[0];
      let towerReach=0;
      for(let y=0;y<b.rows;y++)for(let x=0;x<b.cols;x++) {
        const wx=b.left+(x+.5)/RES,wy=b.top+(y+.5)/RES,i=Math.floor(wy)*72+Math.floor(wx);
        if(map.owner[i]!==tower.owner&&Math.hypot(wx-tower.x,wy-tower.y)<3)towerReach=Math.max(towerReach,b.values[y*b.cols+x]);
      }
      return{visible:r.cityLife.visible.length,carried:r.cityLife.lights(220000).length,outside:outside.length,glow,towerReach};
    });
    assert.ok(nighttime.visible>0);assert.equal(nighttime.carried,nighttime.visible);
    assert.ok(nighttime.outside>=3);assert.ok(nighttime.glow.some(v=>v>0),'wall torches light the environment');
    assert.ok(nighttime.towerReach>.08,'tower fire still escapes its own outlined roof');
    await page.screenshot({path:`test-results/city-life-night-${width}.png`});
    await page.evaluate(()=>{
      const {r,keep,draw}=window.fixture;
      r.cam.s=6;r.cam.x=innerWidth/2-(keep.rect.x+keep.rect.w/2)*r.px*6;r.cam.y=innerHeight/2-(keep.rect.y+keep.rect.h/2)*r.px*6;
      draw(220000,{effects:false});
    });
    await page.screenshot({path:`test-results/city-life-keep-night-${width}.png`});
    for(const time of [90000,120000]) {
      await page.evaluate(time=>window.fixture.draw(time,{reduceMotion:true}),time);
      await page.screenshot({path:`test-results/city-life-keep-sun-${time}-${width}.png`});
    }
    const occlusion=await page.evaluate(async()=>{
      const {DefendLighting,MASK}=await import('/src/defend/lighting.ts');
      const {RES}=await import('/src/defend/light-field.ts');
      const map={...window.fixture.map,owner:new Int32Array(72*104).fill(-1)};
      map.owner[20*72+20]=0;
      const solid=new Uint8Array(72*104);solid[20*72+20]=1;
      const lamp={id:0,kind:'door',x:19.5,y:20+1/6,radius:5,strength:.9,owner:0,inside:false,pillars:[]};
      const sample=(rounded)=>{
        const L=new DefendLighting();L.setMap(map);L.lights=[lamp];L.queue=new Set([0]);
        const body=document.createElement('canvas');body.width=72*MASK;body.height=104*MASK;
        const rim=body.cloneNode(),c=body.getContext('2d');
        c.fillStyle='#fff';c.fillRect(20*MASK,(20+(rounded ? .25 : 0))*MASK,MASK,(rounded ? .75 : 1)*MASK);
        L.setMasks(body,rim);L.bakePending(solid,10);
        const b=L.bakes.get(0).pair[0];
        const at=(x,y)=>b.values[Math.floor((y-b.top)*RES)*b.cols+Math.floor((x-b.left)*RES)];
        return {clear:at(21.5,20+1/6),blocked:at(21.5,20+5/6)};
      };
      return {rounded:sample(true),square:sample(false)};
    });
    assert.ok(occlusion.rounded.clear>occlusion.square.clear+.01,'light passes through a cutout in a mostly covered cell');
    assert.ok(occlusion.rounded.blocked<occlusion.rounded.clear*.6,'the solid portion still casts a shadow');
    const pause=await page.evaluate(async()=>{
      const {DefendSim}=await import('/src/defend/sim.ts');
      const {defaultDefendSave}=await import('/src/defend/progress.ts');
      const {map,r,clock}=window.fixture,sim=new DefendSim(map,defaultDefendSave().levels,3);
      clock.elapsed=220000;
      let now=r.lastNow;
      const draw=()=>r.draw(map,sim,null,{grid:0,weather:{rain:false,clear:true},night:1,now:now+=33,reduceMotion:false,effects:false});
      draw();
      for(let i=0;i<90;i++){sim.time+=1/30;draw();}
      const pose=()=>r.cityLife.visible.map(p=>[p.id,p.x,p.y]);
      const before=pose();draw();draw();const frozen=JSON.stringify(before)===JSON.stringify(pose());
      sim.time+=.1;draw();const moving=JSON.stringify(before)!==JSON.stringify(pose());
      return{frozen,moving};
    });
    assert.ok(pause.frozen,'battle pause freezes cosmetic residents too');
    assert.ok(pause.moving,'cosmetic residents resume with battle time');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,setup,ignition,nighttime}));
    await page.close();
  }
} finally {await browser.close();}
