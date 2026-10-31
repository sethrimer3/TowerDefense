// Native Mine pixels in an isolated page; no player saves are accessed.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? {headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE}
  : {headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'});
try {
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900},deviceScaleFactor:width<500?2:1}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/mine-sun-fixture',r=>r.fulfill({contentType:'text/html',body:'<style>body{margin:0;background:#080707}canvas{display:block;width:100vw;height:100vh;image-rendering:pixelated}</style><canvas></canvas>'}));
    await page.goto(new URL('/mine-sun-fixture',process.env.TEST_URL||'http://127.0.0.1:5173/').href);
    const result=await page.evaluate(async()=>{
      const [{MineSim},{MineRenderer},world,solar]=await Promise.all([
        import('/src/mine/sim.ts'),import('/src/mine/render.ts'),import('/src/mine/world.ts'),import('/src/daylight.ts')]);
      const {W,AIR,idx,hash01}=world,canvas=document.querySelector('canvas'),r=new MineRenderer(canvas),sim=new MineSim(99);
      sim.strata.surface.fill(70);sim.world.cells.fill(AIR,0,70*W);r.resize();
      let reference=null,starsCovered=0,samples=0;
      for(const zoom of [1,2.3,8]) {
        r.lookAt(160,35,zoom);
        for(let step=0;step<80;step++) {
          r.camX=50+step/13;
          const sky=solar.skyAtTime(solar.DAY_MS*(.05+step*.0055));
          r.dayScene=sky;r.skyNow={...sim.sky,daylight:sky.daylight,clouds:0};
          r.paint(sim,0,80,1000+step*137);
          const sx=Math.round((r.camX+(r.size.w/r.scale)*(.1+(sky.sunX+1)*.4))*2),sy=Math.round((64-Math.max(0,sky.altitude)*26)*2);
          const color=sky.warmth>.1?[255,204,122]:[255,244,198];
          const disc=(0xff000000|(color[2]<<16)|(color[1]<<8)|color[0])>>>0;
          const mask=[];
          for(let y=-8;y<8;y++)for(let x=-8;x<8;x++) {
            const px=sx+x,py=sy+y,on=r.pixels[py*W*2+px]===disc;
            mask.push(+on);
            if(on&&1-sky.daylight>.05) {
              const cx=px>>1,cy=py>>1,i=idx(cx,cy),star=hash01(cx,cy,sim.seed+5);
              if(star<.014 && cy<64 && (r.shade[i]&1)===(px&1) && ((r.shade[i]>>1)&1)===(py&1))starsCovered++;
            }
          }
          const key=mask.join('');
          if(sky.altitude<=0) {
            if(mask.some(Boolean))throw new Error('Sun remains visible below the horizon');
            continue;
          }
          if(reference===null)reference=key;
          if(key!==reference)throw new Error(`Sun silhouette changed at zoom ${zoom}, solar time ${sky.time}`);
          samples++;
        }
      }
      const rows=Array.from({length:16},(_,y)=>reference.slice(y*16,y*16+16));
      if(rows.some(row=>row!==[...row].reverse().join(''))||rows.join('')!==[...rows].reverse().join(''))throw new Error('Sun is not a symmetric circle');
      const natural=new MineSim(99),clock=new solar.DayClock(solar.DAY_MS*.47);
      natural.weatherOverride='clear';solar.useDayClock(clock,()=>({dayNightCycle:true,timeOfDay:'day'}));
      r.lookAt(natural.shaftX,30,3);r.home(natural);r.draw(natural,2000,false);
      window.mineSun={r,sim:natural,clock,solar};
      return{samples,discPixels:[...reference].filter(c=>c==='1').length,starsCovered};
    });
    assert.ok(result.discPixels>100);assert.ok(result.starsCovered>0,'the samples exercise stars directly behind the sun');
    await page.screenshot({path:`test-results/mine-sun-${width}.png`});
    // Pixel-perfect enlargement of the native sun, taken from the real scene.
    await page.evaluate(()=>{
      const {r,sim,solar}=window.mineSun,sky=solar.worldSky();
      const x=r.camX+(r.size.w/r.scale)*(.1+(sky.sunX+1)*.4),y=sim.strata.surface[Math.floor(x)]-6-Math.max(0,sky.altitude)*26;
      const c=document.createElement('canvas');c.width=192;c.height=192;c.style='width:192px;height:192px;position:fixed;top:10px;left:10px;border:1px solid #444';
      const g=c.getContext('2d');g.imageSmoothingEnabled=false;g.drawImage(r.off,Math.round(x*2)-16,Math.round(y*2)-16,32,32,0,0,192,192);document.body.append(c);
    });
    await page.screenshot({path:`test-results/mine-sun-close-${width}.png`});
    assert.deepEqual(errors,[]);console.log(JSON.stringify({width,...result}));await page.close();
  }
} finally {await browser.close();}
