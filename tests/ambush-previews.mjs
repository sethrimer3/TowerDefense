import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium',headless:true});
try{for(const [width,height] of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('towerdefense.v1',JSON.stringify({version:7,profile:{name:'Preview Warden',flag:{base:3,layers:[]}},settings:{reduceMotion:true},campaigns:{ambush:{cleared:3}}}));});
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');await page.locator('nav [data-tab="defend"]').click();
 await page.waitForFunction(()=>document.querySelector('#ambush [data-preview="0"]')?.dataset.ready==='true');
 assert.ok(await page.locator('#ambush canvas[data-preview]:not([data-ready])').count()>0,'Offscreen previews stay lazy.');
 for(let zone=0;zone<10;zone++){
  const canvas=page.locator('#ambush [data-preview="'+zone*3+'"]');await canvas.scrollIntoViewIfNeeded();
  await page.waitForFunction(i=>document.querySelector('#ambush [data-preview="'+i+'"]')?.dataset.ready==='true',zone*3);
  assert.ok(await canvas.evaluate(c=>c.width>100&&c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4!==3&&v>80)));
 }
 await page.locator('#ambush [data-level="3"]').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/ambush-previews-'+width+'.png'});
 await page.locator('#ambush [data-level="3"]').click();assert.equal(await page.locator('#ambush .ambush-level-name').innerText(),'Sandway');
 await page.screenshot({path:'test-results/ambush-desert-'+width+'.png'});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
}console.log('Lazy native previews for all zones and generated desert battle maps pass at desktop/phone sizes.');}finally{await browser.close();}
