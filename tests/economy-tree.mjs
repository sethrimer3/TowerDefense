import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
try{
 for(const width of [1280,390]){
  const phone=width<500,context=await browser.newContext({viewport:{width,height:900},hasTouch:phone,isMobile:phone});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/tests/performance.html');
  const fixture=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {placeCityTile,placeStructure}=await import('/src/defend/layout.ts');
   const {LibrarySim}=await import('/src/library/sim.ts');
   const library=new LibrarySim(17);library.furnish(40);library.upgradeLab();library.hire('researcher');
   const s=defaults(),k=s.defend.layout.keep;s.library=library.save(Date.now());s.profile={name:'Tree tester',flag:{base:12,layers:[]}};
   s.settings.reduceMotion=true;s.settings.soundOff=true;s.settings.ambienceOff=true;s.settings.developerMode=true;s.settings.instantResearch=true;s.knowledge=10000;
   for(const [n,kind] of ['mine','library'].entries()){
    s.defend.layout=placeCityTile(s.defend.layout,k.tx+n,k.ty-1);
    s.defend.layout=placeStructure(s.defend.layout,kind,k.tx+n,k.ty-1);
   }
   return s;
  });
  await context.addInitScript(s=>{if(!sessionStorage.getItem('economy-tree-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(s));sessionStorage.setItem('economy-tree-seeded','1');}},fixture);
  const hook=async()=>{
   await page.waitForSelector('#defend-start');
   await page.evaluate(async()=>{
    const urls=new Set(['/src/defend/ui.ts']);
    for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
    for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;
     DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
   });await page.waitForFunction(()=>window.__dp);await page.waitForTimeout(300);
  };
  await page.goto('http://127.0.0.1:5173/');await hook();
  const panel=page.locator('#defend-specialty');
  for(const [kind,skill] of [['mine','coffee'],['library','fireproofWood']]){
   if(kind==='library')await page.evaluate(()=>{window.__dp.host.game().settings.instantResearch=false;});
   const point=await page.evaluate(kind=>{const d=window.__dp,b=d.currentMap().buildings.find(b=>b.kind===kind);return d.renderer.toClient(b.rect.x+b.rect.w/2,b.rect.y+b.rect.h/2);},kind);
   if(phone){await page.touchscreen.tap(point.x,point.y);await page.touchscreen.tap(point.x,point.y);}else await page.mouse.dblclick(point.x,point.y);
   await panel.waitFor({state:'visible'});
   assert.equal(await panel.getAttribute('aria-label'),`Upgrade tree: ${kind==='mine'?'Mine':'Library'}`);
   assert.ok(await panel.locator('.ug-node:not(.withering)').count()>4);
   const node=panel.locator(`[data-node="economy:${skill}:1"]`);
   await node.click();
   await panel.locator(`[data-economy-buy="economy:${skill}:1"]`).click();
   if(kind==='library'){
    const job=await page.evaluate(()=>window.__dp.host.game().researchJob);assert.equal(job.id,skill);assert.ok(job.left>0);
    assert.equal(await panel.locator('[data-economy-buy]').isDisabled(),true);
    await page.evaluate(()=>{window.__dp.host.game().researchClock-=300000;});
   }
   await page.waitForFunction(skill=>JSON.parse(localStorage.getItem('towerdefense.v1')).skills[skill]===1,skill);
   await panel.locator(`[data-node="economy:${skill}:1"].owned`).waitFor({state:"visible"});
   await page.screenshot({path:`work/economy-tree-${kind}-${width}.png`});
   await panel.locator(`[data-node="k:${kind}"]`).click();
   await panel.locator('[data-economy-smithy]').click();
   await page.locator(`#mine-chamber [data-train=${kind==='mine'?'minerPower':'librarianPower'}]`).waitFor({state:'visible'});
   await page.locator('nav [data-tab=defend]').click();
   await panel.locator('[data-specialty-close]').click();
  }
  await page.locator('nav [data-tab=library]').click();await page.locator('#library-study').click();
  const study=page.locator('#library-chamber');await study.locator('[data-ledger-stack=mine]').click();
  await page.screenshot({path:`work/economy-study-${width}.png`});
  assert.ok(await study.locator('[data-node="economy:coffee:1"].owned').count());
  assert.ok(await study.locator('[data-node="economy:coffee:2"].next').count());
  await study.locator('[data-node="economy:coffee:2"]').click();
  const balance=await page.evaluate(()=>window.__dp.host.game().knowledge);
  await study.locator('[data-economy-buy="economy:coffee:2"]').click();
  await study.locator('.research-stage').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__dp.host.game().researchJob.rank),1);
  assert.equal(await page.evaluate(()=>window.__dp.host.game().skills.coffee),1);
  await study.locator('[data-cancel-research]').click();
  await study.locator('[data-cancel-research]').press('Enter');
  await study.locator('[data-economy-tree]').waitFor({state:'visible'});
  assert.equal(await page.evaluate(()=>window.__dp.host.game().knowledge),balance);
  await study.locator('[data-ledger-stack=library]').click();
  assert.ok(await study.locator('[data-node="economy:fireproofWood:1"].owned').count());
  await page.reload();await page.waitForSelector('nav [data-tab]');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).skills.coffee),1);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).skills.fireproofWood),1);
  assert.deepEqual(errors,[]);await context.close();console.log(`Economy city/Study trees, purchases and reload pass at ${width}px.`);
 }
}finally{await browser.close();}
