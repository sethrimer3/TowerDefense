// Browser check for the zone story scroll (src/ui/story-scroll.ts): Start on
// a zone's first wave unrolls the scroll and scribbles the story; a tap fills
// it, the next fades it and starts the run. Phone and desktop, zones 1-4.
// Screenshots go to test-results/story-scroll-*.png.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const [width,height] of [[390,844],[1280,800]]){
  for(const wave of [1,21,41,61]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,deviceScaleFactor:Number(process.env.SCALE??1)}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await context.addInitScript(()=>{window.showStories=true;});
   await page.goto(base);await page.waitForSelector('#defend-start');
   const save=await page.evaluate(async(wave)=>{const {defaults}=await import('/src/save.ts');const s=defaults();s.profile={name:'Story tester',flag:{base:3,layers:[]}};s.settings.soundOff=s.settings.ambienceOff=true;s.defend.bestWave=wave+5;s.defend.furthestWave=wave+6;s.defend.startWave=wave;return s;},wave);
   await context.addInitScript(save=>{if(!sessionStorage.getItem('story-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('story-seeded','1');}},save);
   await page.reload();await page.waitForSelector('#defend-start');
   assert.equal(await page.locator('#defend-wave b').textContent(),String(wave));
   await page.locator('#defend-start').evaluate(b=>b.click());
   await page.waitForSelector('.story-scroll.unrolled');
   await page.waitForTimeout(2200);
   assert.equal(await page.locator('#defend-abandon').count(),0,'the run waits for the scroll');
   assert.equal(await page.locator('.story-quill').count(),1,'the quill is writing');
   const tag=`${width}-wave${wave}`;
   if(wave===1)await page.screenshot({path:`test-results/story-scroll-${tag}-writing.png`});
   await page.locator('.story-scroll').click();
   assert.equal(await page.locator('.story-scroll.filled').count(),1,'one tap fills the scroll');
   assert.equal(await page.locator('.story-unwritten').evaluateAll(els=>els.map(e=>e.textContent).join('')),'');
   const box=await page.locator('.story-scroll-body').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,`scroll fits the window ${JSON.stringify(box)}`);
   const page2=await page.locator('.story-scroll-page').evaluate(e=>({over:e.scrollHeight-e.clientHeight}));
   console.log(tag,'box',box,'overflow',page2.over);
   await page.screenshot({path:`test-results/story-scroll-${tag}.png`});
   await page.locator('.story-scroll').click();
   await page.waitForSelector('.story-scroll',{state:'detached'});
   await page.waitForSelector('#defend-abandon');
   assert.deepEqual(errors,[]);
   await context.close();
  }
 }
 console.log('story scroll ok');
}finally{await browser.close();}
