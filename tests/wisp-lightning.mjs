import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of[1170,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/wisp-lightning.html',base).href);await page.waitForFunction(()=>window.wispLightning);
  const flight=await page.evaluate(()=>{const f=window.wispLightning;return{x:f.w.x,y:f.w.y,aim:f.w.ray.b,segments:f.sim.wispLightningTrails[0].segments.length};});
  assert.equal(flight.x,36);assert.equal(flight.y,50);assert.deepEqual(flight.aim,{x:36,y:0});assert.ok(flight.segments>0);
  await page.locator('canvas').screenshot({path:`test-results/wisp-lightning-flight-${width}.png`});
  const exit=await page.evaluate(()=>{
   const f=window.wispLightning;f.advance(1.3);return{x:f.w.x,y:f.w.y,count:f.owner.lightning.arrows.length,trail:f.sim.wispLightningTrails.length,
    hit:f.sim.enemies.filter(e=>e.x===36&&e.hp<e.maxHp).length,miss:f.sim.enemies.filter(e=>e.x===41&&e.hp===e.maxHp).length};
  });assert.deepEqual(exit,{x:36,y:0,count:0,trail:1,hit:6,miss:6});
  await page.locator('canvas').screenshot({path:`test-results/wisp-lightning-map-${width}.png`});
  const settings=await page.evaluate(()=>{
   const f=window.wispLightning,before=JSON.stringify(f.sim.wispLightningTrails),pixels=()=>Array.from(f.c.getImageData(0,0,f.canvas.width,f.canvas.height).data);
   f.draw(true);const first=pixels();f.sim.wispFireTime+=.04;f.draw(true);const second=pixels();f.sim.wispFireTime-=.04;
   return{same:first.every((v,i)=>v===second[i]),unmutated:before===JSON.stringify(f.sim.wispLightningTrails)};
  });assert.ok(settings.same&&settings.unmutated,JSON.stringify(settings));
  await page.locator('canvas').screenshot({path:`test-results/wisp-lightning-reduced-${width}.png`});
  const expired=await page.evaluate(()=>{const f=window.wispLightning;f.sim.enemies=[];f.sim.reindexAfterDisplacement();f.advance(5.1);return f.sim.wispLightningTrails.length;});
  assert.equal(expired,0);assert.deepEqual(errors,[]);await page.close();console.log(`${width}px: full-map straight strike, beyond-range hits, purple art, sizes, Reduce Motion and trail expiry passed`);
 }
}finally{await browser.close();}
