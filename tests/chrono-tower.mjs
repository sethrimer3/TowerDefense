// Actual merging/purchases/save reload and a stopped, deterministic battle gallery.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
async function hook(page){await page.evaluate(async()=>{
 const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/defend/ui.ts').name;
 const{DefendPage}=await import(url),frame=DefendPage.prototype.frame;
 if(!frame.__chrono){DefendPage.prototype.frame=function(t){window.chronoPage=this;return frame.call(this,t);};DefendPage.prototype.frame.__chrono=true;}
});await page.waitForFunction(()=>window.chronoPage);}
try{
 for(const width of[1170,390]){
  const context=await browser.newContext({viewport:{width,height:width<500?780:900},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForSelector('#defend-start');
  const fixture=await page.evaluate(async()=>{
   const{defaults}=await import('/src/save.ts'),{placeCityTile,placeStructure}=await import('/src/defend/layout.ts');const save=defaults();
   save.knowledge=1e9;save.settings.reduceMotion=true;save.settings.soundOff=save.settings.ambienceOff=true;save.defend.owned.cityTile=5;
   let l=save.defend.layout;
   for(const[kind,path,dx,dy]of[['brazierTower','fireArrows',-1,0],['hawkTower','sharpshooters',0,-1],['wispTower','wispArrow',1,0],['archerTower',null,-1,0]]){
    if(kind!=='archerTower')l=placeCityTile(l,l.keep.tx+dx,l.keep.ty+dy);if(!l)throw Error('tile placement');
    l=placeStructure(l,kind,l.keep.tx+dx,l.keep.ty+dy,path?{path,rank:3}:undefined);if(!l)throw Error('building placement');save.defend.owned[kind]=1;
   }
   save.defend.layout=l;return save;
  });
  await context.addInitScript(save=>{if(!sessionStorage.getItem('chrono-fixture')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('chrono-fixture','1');}},fixture);
  await page.reload();await page.waitForSelector('#defend-start');await hook(page);
  await page.evaluate(()=>{const p=window.chronoPage,b=p.host.save().layout.structures.find(b=>b.kind==='brazierTower');p.openTree({uid:b.uid});});
  const panel=page.locator('#defend-specialty');await panel.waitFor({state:'visible'});
  await panel.locator('[data-node="k:chronoTower"]').click();await panel.locator('[data-ug-buy]').click();
  await page.waitForFunction(()=>window.chronoPage.host.save().layout.structures.some(b=>b.kind==='chronoTower'));
  for(const[id,max]of[['storage',2],['divine',5],['focus',2],['amplify',3]]){
   for(let rank=1;rank<=max;rank++){
    await panel.locator(`[data-node="q:${id}:${rank}"]`).click();await panel.locator('[data-ug-buy]').click();
    await page.waitForFunction(({id,rank})=>window.chronoPage.host.save().chronoRanks?.[id]===rank,{id,rank});
   }
  }
  assert.equal(await panel.locator('[data-node^="q:"]').count(),12);
  await page.screenshot({path:`test-results/chrono-tree-${width}.png`});await panel.locator('[data-specialty-close]').click();
  await page.reload();await page.waitForSelector('#defend-start');await hook(page);
  const saved=await page.evaluate(()=>window.chronoPage.host.save());assert.deepEqual(saved.chronoRanks,{storage:2,divine:5,focus:2,amplify:3});
  assert.equal(saved.owned.chronoTower,1);assert.ok(['brazierTower','hawkTower','wispTower'].every(k=>saved.owned[k]===0));
  await page.locator('#defend-start').click();await page.waitForFunction(()=>window.chronoPage.sim);
  const state=await page.evaluate(async()=>{
   const p=window.chronoPage,s=p.sim,{stepArrows}=await import('/src/defend/towers.ts'),{storeDivine}=await import('/src/defend/chrono.ts');
   s.speed=0;s.enemies=[];s.spawnQueue=[];s.reindexAfterDisplacement();
   for(let i=0;i<650;i++){s.time+=.25;s.towers.step(s,.25);stepArrows(s,.25);}
   const entry=[...s.chrono.entries()][0];if(!entry)throw Error('missing chrono state');
   const[id,state]=entry,b=s.map.buildings[id],c={x:b.rect.x+b.rect.w/2,y:b.rect.y+b.rect.h/2};
   for(let i=0;i<250;i++)storeDivine(s,id,10);
   p.renderer.zoomAt(...Object.values(p.renderer.toClient(c.x,c.y)),2.5);
   window.chronoGallery={id,c};return{shots:state.shots.length,hits:state.hits,damage:state.damage};
  });
  assert.equal(state.shots,90);assert.equal(state.hits,250);assert.equal(state.damage,2500);
  await page.waitForTimeout(250);await page.screenshot({path:`test-results/chrono-orbits-${width}.png`});
  const release=await page.evaluate(async()=>{
   const s=window.chronoPage.sim,{c}=window.chronoGallery,{stepChrono}=await import('/src/defend/chrono.ts'),{stepArrows}=await import('/src/defend/towers.ts');
   const e={id:s.newId(),kind:'orc',x:c.x+4,y:c.y,hp:1000000,maxHp:1000000,cd:0,jx:0,jy:0,distract:-1,distractT:0,rollT:0,marked:false,flash:0};s.enemies.push(e);s.reindexAfterDisplacement();
   stepChrono(s,.05);stepArrows(s,.05);const state=[...s.chrono.values()][0];return{damage:e.maxHp-e.hp,reserve:state.damage,hits:state.hits,queued:state.queue.length,ray:s.divineArrows.length};
  });
  assert.equal(release.damage,25000);assert.equal(release.reserve,0);assert.equal(release.hits,0);assert.ok(release.queued>0&&release.ray===1);
  await page.waitForTimeout(250);await page.screenshot({path:`test-results/chrono-divine-${width}.png`});
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}px: three-way merge, four independent trees, reload, 90 orbiting shots, 250-hit Divine Arrow and 10× piercing release passed`);
 }
}finally{await browser.close();}
