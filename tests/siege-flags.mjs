import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
try{for(const [width,height]of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('tests/siege-entry.html',process.env.TEST_URL||'http://127.0.0.1:5173/').href);
 await page.waitForFunction(()=>window.siegeFixture);await page.locator('[data-action="find"]').click();await page.waitForFunction(()=>document.querySelector('.siege-castle-preview')?.dataset.ready==='true');await page.locator('[data-action="attack"]').click();await page.locator('[data-action="start"]').click();
 const before=await page.evaluate(()=>{const p=window.siegeFixture.page;return {count:p.flags.poles.length,down:p.flags.poles.filter(p=>p.snapped!==undefined).length,face:p.flags.face};});
 assert.equal(before.count,8);assert.equal(before.down,0);
 await page.screenshot({path:`test-results/siege-flags-standing-${width}.png`});
 const after=await page.evaluate(()=>{const page=window.siegeFixture.page,p=page.flags.poles[0],sim=page.sim.renderSim;page.sim.engine.effects.push({kind:'boom',x:p.x,y:p.y,r:1,t:0});page.frame(performance.now());const at=page.renderer.toClient(p.x,p.y);page.renderer.zoomAt(at.x,at.y,2);page.frame(performance.now());return page.flags.poles.filter(p=>p.snapped!==undefined).length;});
 assert.equal(after,1);await page.screenshot({path:`test-results/siege-flags-snapped-${width}.png`});
 // A close-up gallery makes the owner face and toppled half readable at phone size.
 await page.evaluate(async()=>{const {drawFlag}=await import('/src/defend/structure-art.ts');const p=window.siegeFixture.page,cv=document.createElement('canvas');cv.width=600;cv.height=200;cv.style.cssText='width:100%;height:auto!important;aspect-ratio:auto;max-width:600px;background:#53623a;image-rendering:pixelated';const c=cv.getContext('2d');drawFlag(c,80,{x:150,y:70,t:.3,reduceMotion:true},true,p.flags.face);p.flags.poles.splice(0,p.flags.poles.length,{id:0,x:27,y:17},{id:1,x:46,y:17,snapped:0,dx:1,dy:0});p.flags.draw(c,10,{soldiers:[],time:1},1000,true);p.pause();p.view='entry';document.querySelector('#siege').replaceChildren(cv);});
 await page.screenshot({path:`test-results/siege-flags-gallery-${width}.png`});assert.deepEqual(errors,[]);await page.close();
}console.log('Owner keep flag, eight decorative poles, local blast, snapped state and desktop/phone galleries pass.');}finally{await browser.close();}
