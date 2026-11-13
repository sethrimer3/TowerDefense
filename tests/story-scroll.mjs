// Browser check for zone story scrolls and wave unlocks
// (src/ui/story-scroll.ts, src/defend/zone-stories.ts, recordWaveCleared):
// Start on an unread zone's first wave unrolls the scroll and scribbles the
// story; a tap fills it, the next fades it and starts the run; a read story
// never shows again. Mid-run, a defeated wave shows "Wave N unlocked!" in
// gold, and first reaching a new zone holds the battle on its scroll.
// Phone and desktop. Screenshots go to test-results/story-scroll-*.png.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
async function open(width,height,setup){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,deviceScaleFactor:Number(process.env.SCALE??1)}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{window.showStories=true;});
 await page.goto(base);await page.waitForSelector('#defend-start');
 const save=await page.evaluate(async(setup)=>{const {defaults}=await import('/src/save.ts');const s=defaults();s.profile={name:'Story tester',flag:{base:3,layers:[]}};s.settings.soundOff=s.settings.ambienceOff=true;Object.assign(s.defend,setup);return s;},setup);
 await context.addInitScript(save=>{if(!sessionStorage.getItem('story-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('story-seeded','1');}},save);
 await page.reload();await page.waitForSelector('#defend-start');
 await page.evaluate(async()=>{
  const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
  for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
 });await page.waitForFunction(()=>window.__dp);
 return {context,page,errors};
}
const start=page=>page.locator('#defend-start').evaluate(b=>b.click());
const seen=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.storiesSeen);
try{
 for(const [width,height] of [[390,844],[1280,800]]){
  // Each of the first four zones' scrolls, from Start.
  for(const wave of [1,21,41,61]){
   const {context,page,errors}=await open(width,height,{bestWave:Math.max(0,wave-1),startWave:wave});
   assert.equal(await page.locator('#defend-wave b').textContent(),String(wave));
   await start(page);
   await page.waitForSelector('.story-scroll.unrolled');
   await page.waitForTimeout(2000);
   assert.equal(await page.locator('#defend-abandon').count(),0,'the run waits for the scroll');
   assert.equal(await page.locator('.story-quill').count(),1,'the quill is writing');
   const tag=`${width}-wave${wave}`;
   if(wave===1)await page.screenshot({path:`test-results/story-scroll-${tag}-writing.png`});
   await page.locator('.story-scroll').click();
   assert.equal(await page.locator('.story-scroll.filled').count(),1,'one tap fills the scroll');
   assert.equal(await page.locator('.story-unwritten').evaluateAll(els=>els.map(e=>e.textContent).join('')),'');
   const box=await page.locator('.story-scroll-body').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,`scroll fits the window ${JSON.stringify(box)}`);
   assert.equal(await page.locator('.story-scroll-page').evaluate(e=>e.scrollHeight-e.clientHeight),0,'the story fits its sheet');
   await page.screenshot({path:`test-results/story-scroll-${tag}.png`});
   await page.locator('.story-scroll').click();
   await page.waitForSelector('.story-scroll',{state:'detached'});
   await page.waitForSelector('#defend-abandon');
   assert.equal((await seen(page)).length,1,'the story is marked read');
   if(wave===1){
    // A read story never shows again.
    await page.evaluate(()=>{const p=window.__dp;p.endRun();});
    await page.locator('.defeat-actions button').click();
    await start(page);await page.waitForSelector('#defend-abandon');
    assert.equal(await page.locator('.story-scroll').count(),0,'no scroll the second time');
   }
   assert.deepEqual(errors,[]);
   await context.close();
  }
  // Mid-run: unlock text, then the first arrival in a new zone holds the battle.
  const {context,page,errors}=await open(width,height,{bestWave:18,startWave:18,storiesSeen:['moss']});
  await start(page);await page.waitForSelector('#defend-abandon');
  assert.equal(await page.locator('.story-scroll').count(),0,'wave 18 has no story');
  await page.evaluate(()=>window.__dp.sim.events.push({type:'waveCleared',wave:19}));
  await page.waitForSelector('.defend-unlocked');
  assert.equal(await page.locator('.defend-unlocked').textContent(),'Wave 19 unlocked!');
  await page.waitForTimeout(500);
  await page.screenshot({path:`test-results/story-scroll-${width}-unlocked.png`});
  await page.evaluate(()=>window.__dp.sim.events.push({type:'waveCleared',wave:20}));
  await page.waitForSelector('.story-scroll.unrolled');
  assert.equal(await page.locator('.defend-unlocked').textContent(),'Waves 20 and 21 unlocked!');
  const t0=await page.evaluate(()=>window.__dp.sim.time??window.__dp.sim.elapsed??window.__dp.sim.breakT);
  await page.waitForTimeout(700);
  const t1=await page.evaluate(()=>window.__dp.sim.time??window.__dp.sim.elapsed??window.__dp.sim.breakT);
  assert.equal(t1,t0,'the battle holds while the scroll is open');
  await page.locator('.story-scroll').click();await page.locator('.story-scroll').click();
  await page.waitForSelector('.story-scroll',{state:'detached'});
  await page.waitForTimeout(300);
  const t2=await page.evaluate(()=>window.__dp.sim.time??window.__dp.sim.elapsed??window.__dp.sim.breakT);
  assert.notEqual(t2,t1,'the battle resumes');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend);
  assert.deepEqual(stored.storiesSeen,['moss','desert']);
  assert.equal(stored.bestWave,20);assert.equal(stored.startWave,21);
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('story scroll ok');
}finally{await browser.close();}
