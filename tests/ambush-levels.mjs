import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium',headless:true});
try{for(const [width,height] of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width,height},hasTouch:width===390}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('towerdefense.v1',JSON.stringify({version:7,profile:{name:'Level Warden',flag:{base:3,layers:[]}},settings:{reduceMotion:true},campaigns:{ambush:{cleared:2,layouts:[[{pad:0,kind:'watchTower'}]]}}}));});
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');const tab=page.locator('nav [data-tab="defend"]');await tab.click();
 assert.equal(await page.locator('#ambush .ambush-level-card').count(),30);assert.equal(await page.locator('#ambush .ambush-zone').count(),10);
 assert.equal(await page.locator('#ambush .ambush-level-card:not([disabled])').count(),3);
 assert.equal(await page.locator('#ambush .ambush-level-card[data-level="0"] .ambush-card-stars').getAttribute('data-stars'),'1');
 await page.screenshot({path:`test-results/ambush-levels-${width}.png`});await page.locator('#ambush [data-level="0"]').click();
 assert.ok(await page.locator('#ambush .campaign-board canvas').isVisible());await page.locator('#ambush [data-action="level-select"]').click();assert.equal(await page.locator('#ambush .ambush-level-card').count(),30);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
}console.log('Ambush 30-level selection, legacy unlock migration, stars and level navigation pass on desktop and phone.');}finally{await browser.close();}
