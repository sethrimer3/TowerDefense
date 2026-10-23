import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of [1140,390]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/mage-attunements.html',base).href);await page.waitForFunction(()=>window.mageGallery);
  const gallery=await page.evaluate(()=>{
   const f=window.mageGallery,pixels=()=>Array.from(f.c.getImageData(0,0,f.canvas.width,f.canvas.height).data);
   f.draw();const on=pixels(),storm=f.scenes[0].sim,fire=f.scenes[1].sim,cold=f.scenes[2].sim;
   const effects={chain:storm.mageBolts[0].critical.every(Boolean),burn:fire.blazes[0].clingFor===4,frost:cold.enemies.some(e=>e.freeze===1&&e.mageChills[0].speed===.35)};
   f.draw({pixel:false});const off=pixels();f.draw({reduced:true});const reduced=pixels().some(v=>v!==0);
   return {same:on.every((v,i)=>v===off[i]),reduced,...effects};
  });
  assert.ok(gallery.same&&gallery.reduced&&gallery.chain&&gallery.burn&&gallery.frost,JSON.stringify(gallery));
  await page.evaluate(()=>window.mageGallery.draw());await page.locator('canvas').screenshot({path:`test-results/mage-attunements-${width}.png`});
  await page.evaluate(()=>window.mageGallery.draw({flight:true,reduced:true}));await page.locator('canvas').screenshot({path:`test-results/mage-projectiles-${width}.png`});
  await page.goto(base);await page.waitForSelector('#defend-start');
  const save=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts'),{placeCityTile,placeStructure}=await import('/src/defend/layout.ts');const s=defaults();
   s.knowledge=1e6;s.settings.devMode=true;s.settings.soundOff=s.settings.ambienceOff=true;s.defend.owned.mageGuild=3;s.defend.owned.cityTile=4;
   let l=s.defend.layout;for(const [dx,dy]of [[0,-1],[-1,0],[1,0]]){l=placeCityTile(l,l.keep.tx+dx,l.keep.ty+dy);l=placeStructure(l,'mageGuild',l.keep.tx+dx,l.keep.ty+dy);}s.defend.layout=l;return s;
  });
  await context.addInitScript(save=>{if(!sessionStorage.getItem('mages-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('mages-seeded','1');}},save);
  await page.reload();await page.waitForSelector('#defend-start');
  await page.evaluate(async()=>{
   const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
   for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
  });await page.waitForFunction(()=>window.__dp);
  const panel=page.locator('#defend-specialty');
  for(const [kind,path,label]of [['stormHall','conduction','Storm'],['infernoHall','pyroclasm','Inferno'],['cinderHall','cinders','Frost']]){
   const uid=await page.evaluate(()=>window.__dp.host.save().layout.structures.find(b=>b.kind==='mageGuild').uid);
   await page.evaluate(uid=>window.__dp.openTree({uid}),uid);await panel.waitFor({state:'visible'});await page.waitForTimeout(750);
   const nodes=await panel.locator('.ug-node:not(.withering)').evaluateAll(els=>els.filter(e=>e.classList.contains('next')).map(e=>e.dataset.node));
   for(const k of ['infernoHall','cinderHall','stormHall'])assert.ok(nodes.includes(`k:${k}`),nodes.join(','));
   if(kind==='stormHall')await page.screenshot({path:`test-results/mage-tree-${width}.png`});
   await panel.locator(`[data-node="k:${kind}"]`).click();await page.waitForTimeout(400);assert.match(await panel.textContent(),new RegExp(label));
   await panel.locator('[data-ug-buy]').click();await page.waitForFunction(({uid,kind})=>window.__dp.host.save().layout.structures.some(b=>b.uid===uid&&b.kind===kind),{uid,kind});await page.waitForTimeout(650);
   for(let rank=1;rank<=3;rank++){
    await panel.locator(`[data-node="p:${path}:${rank}"]`).click();await page.waitForTimeout(350);await panel.locator('[data-ug-buy]').click();
    await page.waitForFunction(({uid,rank})=>window.__dp.host.save().layout.structures.some(b=>b.uid===uid&&b.rank===rank),{uid,rank});await page.waitForTimeout(550);
   }
   const text=await panel.textContent();assert.match(text,kind==='stormHall'?/35%/:kind==='cinderHall'?/65%/:/130%/);
   await panel.locator('[data-specialty-close]').click();
  }
  await page.locator('#defend-start').click();await page.waitForFunction(()=>window.__dp.sim?.soldiers.length>=3);
  const trained=await page.evaluate(()=>{const sim=window.__dp.sim;sim.speed=0;return sim.soldiers.filter(s=>s.kind==='mage').map(s=>sim.map.buildings[s.home].kind).sort();});
  assert.deepEqual(trained,['cinderHall','infernoHall','stormHall']);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.map(b=>[b.kind,b.path,b.rank]).sort());
  assert.deepEqual(stored,[['cinderHall','cinders',3],['infernoHall','pyroclasm',3],['stormHall','conduction',3]]);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`${width}px: elemental hall/troop/projectile gallery, critical chains, burn/freeze, graphics settings, Reduce Motion, all three tree purchases and saved tiers passed`);
 }
}finally{await browser.close();}
