import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium',headless:true});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('tests/campaign-native.html',process.env.TEST_URL||'http://127.0.0.1:5173/').href);await page.waitForFunction(()=>window.nativeModes);
 await page.evaluate(()=>{const f=window.nativeModes;f.save.settings.reduceMotion=false;f.ambush.sim.phase='won';f.ambush.frame(performance.now());});
 assert.equal(await page.locator('.ambush-result-stars .star-award').count(),3);assert.equal(await page.locator('.sparks.gold').count(),1);
 await page.screenshot({path:'test-results/ambush-star-flourish-'+width+'.png'});
 await page.locator('.ambush-result [data-action="retry"]').click();await page.evaluate(()=>{document.querySelectorAll('.sparks').forEach(el=>el.remove());const f=window.nativeModes;f.save.settings.reduceMotion=true;f.ambush.sim.phase='won';f.ambush.frame(performance.now());});
 assert.equal(await page.locator('.star-award').count(),0);assert.equal(await page.locator('.sparks.gold').count(),0);
 assert.deepEqual(errors,[]);await page.close();
}console.log('Native victory sparks, sequential stars and Reduce Motion pass at both widths.');}finally{await browser.close();}
