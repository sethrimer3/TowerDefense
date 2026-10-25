import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of [1170,390]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/archer-towers.html',base).href);await page.waitForFunction(()=>window.archerGallery);
  const gallery=await page.evaluate(()=>{
   const f=window.archerGallery,w=f.scenes[2].sim.wisps[0],pixels=()=>Array.from(f.c.getImageData(0,0,f.canvas.width,f.canvas.height).data);
   f.draw();const on=pixels();f.draw({pixel:false});const off=pixels();f.draw({reduced:true});const reduced=pixels().some(v=>v!==0);
   const start=[w.x,w.y];f.advance(30);const moved=start[0]!==w.x||start[1]!==w.y;
   return {same:on.every((v,i)=>v===off[i]),reduced,moved,singular:f.scenes[2].sim.wisps.length===1&&f.scenes[2].sim.wisps[0]===w,hits:f.scenes[2].sim.enemies.filter(e=>e.hp<e.maxHp).length};
  });assert.ok(gallery.same&&gallery.reduced&&gallery.moved&&gallery.singular&&gallery.hits>1,JSON.stringify(gallery));
  await page.evaluate(()=>window.archerGallery.draw());await page.locator('canvas').screenshot({path:`test-results/archer-towers-${width}.png`});
  await page.goto(base);await page.waitForSelector('#defend-start');
  const save=await page.evaluate(async()=>{
   const{defaults}=await import('/src/save.ts'),{placeCityTile,placeStructure}=await import('/src/defend/layout.ts');const s=defaults();
   s.knowledge=1e6;s.settings.reduceMotion=true;s.settings.soundOff=s.settings.ambienceOff=true;s.defend.owned.archerTower=3;s.defend.owned.cityTile=4;
   let l=s.defend.layout;for(const[dx,dy]of[[0,-1],[-1,0],[1,0]]){l=placeCityTile(l,l.keep.tx+dx,l.keep.ty+dy);l=placeStructure(l,'archerTower',l.keep.tx+dx,l.keep.ty+dy);}s.defend.layout=l;return s;
  });
  await context.addInitScript(save=>{if(!sessionStorage.getItem('archer-towers-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('archer-towers-seeded','1');}},save);
  await page.reload();await page.waitForSelector('#defend-start');
  await page.evaluate(async()=>{
   const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
   for(const url of urls){const{DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
  });await page.waitForFunction(()=>window.__dp);
  const panel=page.locator('#defend-specialty');
  for(const[kind,path]of[['wispTower',null],['hawkTower','sharpshooters'],['brazierTower','fireArrows']]){
   const uid=await page.evaluate(()=>window.__dp.host.save().layout.structures.find(b=>b.kind==='archerTower').uid);
   await page.evaluate(uid=>window.__dp.openTree({uid}),uid);await panel.waitFor({state:'visible'});await page.waitForTimeout(150);
   for(const k of['brazierTower','hawkTower','wispTower'])assert.equal(await panel.locator(`[data-node="k:${k}"]`).count(),1);
   await panel.locator(`[data-node="k:${kind}"]`).click();await panel.locator('[data-ug-buy]').click();
   await page.waitForFunction(({uid,kind})=>window.__dp.host.save().layout.structures.some(b=>b.uid===uid&&b.kind===kind),{uid,kind});
   if(!path){assert.equal(await panel.locator('[data-node^="p:wispArrow:"]').count(),0);assert.equal(await panel.locator('[data-ug-buy]').count(),0);await page.screenshot({path:`test-results/wisp-tree-${width}.png`});}
   else for(let rank=1;rank<=3;rank++){
    await panel.locator(`[data-node="p:${path}:${rank}"]`).click();await panel.locator('[data-ug-buy]').click();
    await page.waitForFunction(({uid,rank})=>window.__dp.host.save().layout.structures.some(b=>b.uid===uid&&b.rank===rank),{uid,rank});
   }
   if(kind==='hawkTower')assert.match(await panel.textContent(),/1000%.*10x/s);
   await panel.locator('[data-specialty-close]').click();
  }
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.map(b=>[b.kind,b.path??null,b.rank??0]).sort());
  assert.deepEqual(stored,[['brazierTower','fireArrows',3],['hawkTower','sharpshooters',3],['wispTower',null,0]]);
  await page.locator('#defend-start').click();await page.waitForFunction(()=>window.__dp.sim?.wisps.length===1);
  assert.equal(await page.evaluate(()=>{window.__dp.sim.speed=0;return window.__dp.sim.wispOwners.size;}),1);
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}px: gallery, persistent slicing/trails, graphics settings, Reduce Motion, all attunements, saved ranks and live Wisp battle passed`);
 }
}finally{await browser.close();}
