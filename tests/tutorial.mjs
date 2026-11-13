// Browser check for the first-time tutorial (src/ui/tutorial.ts): a fresh
// player gets the build lesson (Keep, build menu, Tiles, Start), then after
// the wave-1 story scroll the battle lesson (enemies, the Keep's strength,
// skills, journal) with the battle held still; placing the Mine and the
// Library teaches each, and first opening their tabs teaches their buttons.
// Taps in a step's first second are ignored, the lit window sits on its
// target, each lesson is saved and never shows again. Phone and desktop.
// Screenshots go to test-results/tutorial-*.png.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
async function open(width,height,realm){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<500,deviceScaleFactor:Number(process.env.SCALE??1)}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.waitForSelector('#defend-start');
 const save=await page.evaluate(async(realm)=>{
  const {defaults}=await import('/src/save.ts');const L=await import('/src/defend/layout.ts');
  const s=defaults();s.profile={name:'Tutorial tester',flag:{base:3,layers:[]}};s.settings.soundOff=s.settings.ambienceOff=true;
  if(realm){s.tutorial=['build','battle'];const k=s.defend.layout.keep;
   for(const [n,kind] of ['mine','library'].entries()){s.defend.layout=L.placeCityTile(s.defend.layout,k.tx+n,k.ty-1);s.defend.layout=L.placeStructure(s.defend.layout,kind,k.tx+n,k.ty-1);}}
  return s;},realm);
 await context.addInitScript(save=>{window.showTutorial=true;window.showStories=true;if(!sessionStorage.getItem('tutorial-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('tutorial-seeded','1');}},save);
 await page.reload();await page.waitForSelector('#defend-start');
 await page.evaluate(async()=>{
  const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
  for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
 });
 return {context,page,errors};
}
const title=page=>page.locator('.tutorial:not(.leaving) h2').textContent();
const tap=page=>page.locator('.tutorial:not(.leaving)').click({position:{x:4,y:4}});
const seen=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).tutorial);
/** Reads lesson `titles` step by step: a tap in the first second does nothing,
 * the lit window covers `targets[i]` (a selector) when given. */
async function lesson(page,tag,titles,targets={},during){
 await page.waitForSelector('.tutorial:not(.leaving)');
 for(const [i,want] of titles.entries()){
  assert.equal(await title(page),want);
  // Tapped from inside the page so a busy frame can't delay it past the second.
  await page.evaluate(()=>document.querySelector('.tutorial:not(.leaving)').click());
  assert.equal(await title(page),want,'a tap in the first second is ignored');
  await page.waitForSelector('.tutorial-card.ready');await page.waitForTimeout(500);
  if(targets[i]){
   const hole=await page.locator('.tutorial-hole').boundingBox(),box=await page.locator(targets[i]).first().boundingBox();
   assert.ok(hole.x<=box.x+1&&hole.y<=box.y+1&&hole.x+hole.width>=box.x+box.width-1&&hole.y+hole.height>=box.y+box.height-1,`${want}: the window covers ${targets[i]}`);
  }
  if(during)await during(i);
  const card=await page.locator('.tutorial-card').boundingBox(),vp=page.viewportSize();
  assert.ok(card.x>=0&&card.y>=0&&card.x+card.width<=vp.width&&card.y+card.height<=vp.height,`${want}: the card fits the window`);
  await page.screenshot({path:`test-results/tutorial-${tag}-${i}.png`});
  await tap(page);
 }
 await page.waitForFunction(last=>![...document.querySelectorAll('.tutorial:not(.leaving)')].some(t=>t.getAttribute('aria-label')===last),titles.at(-1));
 await page.waitForTimeout(400);
}
try{
 for(const [width,height] of [[390,844],[1280,800]]){
  {
   const {context,page,errors}=await open(width,height,false);
   await lesson(page,`${width}-build`,['The Keep','The Build Menu','The Tiles Shop','Sound the Horn'],{2:'#defend-upgrades',3:'#defend-start'});
   assert.deepEqual(await seen(page),['build']);
   await page.locator('#defend-start').evaluate(b=>b.click());
   await page.waitForSelector('.story-scroll.unrolled');
   assert.equal(await page.locator('.tutorial').count(),0,'the scroll comes first');
   await page.locator('.story-scroll').click();await page.locator('.story-scroll').click();
   await page.waitForSelector('.tutorial:not(.leaving)',{timeout:20000});
   await lesson(page,`${width}-battle`,['The Dark Ones','The Keep\'s Strength','Bombs and Spells','The Journal'],{1:'.defend-keep',3:'#defend-journal'},async()=>{
    // The battle holds still while the lesson is open.
    const at=()=>page.evaluate(()=>JSON.stringify(window.__dp.sim.enemies.map(e=>[e.x,e.y])));
    const a=await at();await page.waitForTimeout(400);assert.equal(await at(),a,'the board is still');
   });
   assert.deepEqual(await seen(page),['build','battle']);
   await page.reload();await page.waitForSelector('#defend-start');await page.waitForTimeout(1500);
   assert.equal(await page.locator('.tutorial').count(),0,'read lessons never show again');
   assert.deepEqual(errors,[]);await context.close();
  }
  {
   const {context,page,errors}=await open(width,height,true);
   await lesson(page,`${width}-mine-placed`,['The Mine','The Mine\'s Hall'],{1:'nav [data-tab=mine]'});
   await lesson(page,`${width}-library-placed`,['The Library','The Library\'s Hall'],{1:'nav [data-tab=library]'});
   await page.locator('nav [data-tab=mine]').click();
   await lesson(page,`${width}-mine-tab`,['Hire a Miner','The Crew','The Buildings','Your Metal','The Smithy'],{0:'#mine-hire',1:'#mine-crew-toggle',2:'#mine-buildings-toggle',4:'#mine-smithy'});
   await page.locator('nav [data-tab=library]').click();
   await lesson(page,`${width}-library-tab`,['Bookshelves','Librarians','The Alchemy Lab','The Staff','The Study'],{0:'#library-shelf',1:'#library-hire',2:'#library-lab-up',3:'#library-staff-toggle',4:'#library-study'});
   await page.locator('nav [data-tab=mine]').click();await page.waitForTimeout(1200);
   assert.equal(await page.locator('.tutorial').count(),0);
   assert.deepEqual(await seen(page),['build','battle','minePlaced','libraryPlaced','mineTab','libraryTab']);
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('ok',width);
 }
}finally{await browser.close();}
