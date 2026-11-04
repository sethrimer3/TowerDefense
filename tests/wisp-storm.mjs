// The Wisp tower's arrow storm on desktop and phone: a full quiver of 30
// arrows circling the tower and moving, the 30-degree spray loosed at an
// enemy, and a still ring under Reduce Motion (needs dev server).
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of [1200,390]){
  const page=await browser.newPage({viewport:{width,height:width<500?1170:400}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/wisp-storm.html',base).href);await page.waitForFunction(()=>window.stormGallery);
  const state=await page.evaluate(()=>{const[a,b]=window.stormGallery.scenes,q=s=>s.sim.wispOwners.values().next().value.quiver;
   return{full:q(a).arrows.length,loosed:b.sim.arrows.filter(x=>x.release).length,empty:q(b).arrows.length};});
  assert.deepEqual(state,{full:30,loosed:30,empty:0});
  await page.screenshot({path:`test-results/wisp-storm-${width}.png`});
  const moved=await page.evaluate(()=>{const s=window.stormGallery.scenes[0],a=s.sim.wispOwners.values().next().value.quiver.arrows[0],x=a.x;window.stormGallery.step(15);return a.x!==x;});
  assert.ok(moved);
  await page.evaluate(()=>window.stormGallery.draw(true));await page.screenshot({path:`test-results/wisp-storm-reduced-${width}.png`});
  assert.deepEqual(errors,[]);await page.close();console.log(`${width}px: full quiver circling, 30-arrow spray, Reduce Motion ring`);
 }
}finally{await browser.close();}
