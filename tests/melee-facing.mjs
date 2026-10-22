// Isolated directional render checks; no player saves. Requires Vite.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
 ?{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE}
 :{headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';
mkdirSync('test-results',{recursive:true});
try{
 for(const width of [960,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/melee-facing.html',base).href);
  await page.waitForFunction(()=>{
   const f=window.facingFixture;
   return f&&f.pixelSprite('v2/units/melee-facing')&&f.pixelSprite('swordsman');
  });
  await page.evaluate(()=>window.facingFixture.draw());
  await page.locator('canvas').screenshot({path:`test-results/melee-facing-${width}.png`});
  const result=await page.evaluate(async()=>{
   const f=window.facingFixture,{ctx:c,canvas:cv,sim}=f;
   // Use the fixture's module instances, including Vite's HMR timestamps.
   const {meleeFacing,meleeBody,setPixelArt,BODY_FRAMES,BODY_DIRECTIONS}=f;
   const pixels=()=>Array.from(c.getImageData(0,0,cv.width,220).data);
   const equal=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
   // Every cached native PNG crop must match its procedural fallback exactly.
   let crops=true;
   for(const frame of BODY_FRAMES)for(const dir of BODY_DIRECTIONS){
    const [kind,look,struck,ghost,stood]=frame.key.split(':');
    const options={look,struck:struck==='true',ghost:ghost==='true',stood:stood==='true'};
    const dump=()=>{const b=meleeBody(kind,dir,options);return Array.from(b.getContext('2d').getImageData(0,0,b.width,b.height).data);};
    setPixelArt(true);const a=dump();setPixelArt(false);crops&&=equal(a,dump());
   }
   const failures=[];
   for(const pixel of [false,true])for(const kind of f.kinds){
    setPixelArt(pixel);const seen=[];
    for(const [dir,dx,dy] of f.dirs){
     const u=f.make(kind,2-dx*.1,2-dy*.1);sim.time=0;sim.enemies=[];meleeFacing(sim,u);
     u.x=u.y=2;sim.time=.1;c.clearRect(0,0,cv.width,cv.height);
     const before=JSON.stringify(u);f.paint(u);const a=pixels();
     if(meleeFacing(sim,u).direction!==dir)failures.push(`${kind}/${pixel}/${dir}: wrong heading`);
     if(before!==JSON.stringify(u))failures.push(`${kind}: renderer changed simulation`);
     if(!a.some(v=>v!==0))failures.push(`${kind}: invisible`);
     seen.push(a);
     // Check live target turning through the real renderer while stationary.
     sim.time=.2;sim.enemies=[{id:20,kind:'roach',x:2.5,y:2,hp:10,flash:0}];u.target=20;
     f.paint(u);if(meleeFacing(sim,u).direction!=='east')failures.push(`${kind}: combat turn`);
     sim.time=.3;sim.enemies=[];u.target=-1;f.paint(u,{merged:true});
     if(meleeFacing(sim,u).direction!=='east')failures.push(`${kind}: idle turn`);
    }
    for(let i=0;i<seen.length;i++)for(let j=0;j<i;j++)if(equal(seen[i],seen[j]))failures.push(`${kind}/${pixel}: identical directions ${i}/${j}`);
   }
   // Simple Troops remains independent of the PNG setting.
   f.draw({simple:true,pixel:true});const simple=pixels();f.draw({simple:true,pixel:false});
   const simpleStable=equal(simple,pixels());
   // Repeated graphics toggles restore the same frame and never duplicate layers.
   f.draw();const on=pixels();f.draw({pixel:false});const off=pixels();f.draw();
   const toggle=equal(on,pixels())&&!equal(on,off);
   return{crops,failures,simpleStable,toggle,frames:BODY_FRAMES.length*4};
  });
  assert.deepEqual(result.failures,[]);assert.ok(result.crops,'PNG/fallback parity');assert.ok(result.simpleStable);assert.ok(result.toggle);assert.deepEqual(errors,[]);
  console.log(`${width}px: all melee families, four walking views, combat/idle, Pixel Art on/off, ${result.frames} PNG frames, toggles and merged/Simple Troops passed`);
  await context.close();
 }
 // Failed atlas request retains complete procedural heroes/summons and the
 // previous swordsman PNG, rather than leaving bodies blank.
 const context=await browser.newContext(),page=await context.newPage();
 await page.route('**/v2/units/melee-facing.png',route=>route.abort());
 await page.goto(new URL('tests/melee-facing.html',base).href);await page.waitForFunction(()=>window.facingFixture);
 await page.waitForFunction(()=>!!window.facingFixture.pixelSprite('swordsman'));
 const visible=await page.evaluate(()=>{
  const f=window.facingFixture;
  return f.kinds.every(kind=>{f.ctx.clearRect(0,0,f.canvas.width,f.canvas.height);f.sim.time++;f.paint(f.make(kind,2,2));return f.ctx.getImageData(0,0,f.canvas.width,220).data.some(v=>v!==0);});
 });
 assert.ok(visible,'failed atlas keeps every unit visible');await context.close();
}finally{await browser.close();}
