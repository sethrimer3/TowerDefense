import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of [1000,390]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/archer-attunements.html',base).href);
  await page.waitForFunction(()=>{const f=window.archerFixture;return f&&f.ARCHER_PNGS.every(f.pixelSprite)&&f.pixelSprite('archer')&&f.pixelSprite('enemy-orc');});
  await page.evaluate(()=>window.archerFixture.draw());await page.locator('canvas').screenshot({path:`test-results/archer-attunements-${width}.png`});
  const checks=await page.evaluate(()=>{
   const f=window.archerFixture,c=f.c,data=()=>Array.from(c.getImageData(0,0,f.canvas.width,f.canvas.height).data),same=(a,b)=>a.every((v,i)=>v===b[i]);
   f.draw();const on=data();f.draw({pixel:false});const off=data();f.draw();const restored=same(on,data());
   const j=f.scenes[0].sim.arrows.find(a=>a.bowJavelin);const carried=j?.bowJavelin.carried.length>0;
   const {sim,u}=f.make('skyrangerLodge');
   sim.enemies=sim.enemies.slice(0,2);sim.reindexAfterDisplacement();u.skyShots=4;f.stepArcher(sim,u,0);
   const rain=sim.arrows.filter(a=>a.sky?.rain),counts=sim.enemies.map(e=>rain.filter(a=>a.target===e.id).length);
   const a=sim.arrows.find(a=>a.sky&&!a.sky.rain);f.stepArrows(sim,.25);const hidden=f.skyArrowView(a)===null;f.stepArrows(sim,.25);const down=f.skyArrowView(a);const falling=down&&!down.up;
   f.draw({reduced:true});const reduced=data().some(v=>v!==0);f.draw();
   return{changed:!same(on,off),restored,carried,counts,hidden,falling,reduced};
  });
  assert.ok(checks.changed&&checks.restored&&checks.carried&&checks.hidden&&checks.falling&&checks.reduced);assert.deepEqual(checks.counts,[14,14]);assert.deepEqual(errors,[]);
  // Real Defend tree: three sibling attunements and readable rank details.
  await page.goto(base);await page.waitForSelector('#defend-start');
  const save=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts'),{placeCityTile,placeStructure}=await import('/src/defend/layout.ts');const s=defaults();
   s.knowledge=1e6;s.settings.soundOff=s.settings.ambienceOff=true;s.defend.owned.archerBarracks=1;s.defend.owned.cityTile=2;
   let l=s.defend.layout;l=placeCityTile(l,l.keep.tx,l.keep.ty-1);l=placeStructure(l,'archerBarracks',l.keep.tx,l.keep.ty-1);s.defend.layout=l;return s;
  });
  await context.addInitScript(save=>{if(!sessionStorage.getItem('archer-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('archer-seeded','1');}},save);
  await page.reload();await page.waitForSelector('#defend-start');
  await page.evaluate(async()=>{
   const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
   for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
  });await page.waitForFunction(()=>window.__dp);
  await page.evaluate(()=>{const dp=window.__dp,b=dp.host.save().layout.structures.find(b=>b.kind==='archerBarracks');dp.openTree({uid:b.uid});});
  const panel=page.locator('#defend-specialty');await panel.waitFor({state:'visible'});await page.waitForTimeout(800);
  const nodes=await panel.locator('.ug-node:not(.withering)').evaluateAll(els=>els.map(e=>`${e.dataset.node}=${['owned','next','locked'].find(c=>e.classList.contains(c))}`));
  for(const kind of ['rangerLodge','skirmishCamp','skyrangerLodge'])assert.ok(nodes.includes(`k:${kind}=next`),nodes.join(','));
  await panel.locator('[data-node="k:skyrangerLodge"]').click();await page.waitForTimeout(600);
  assert.match(await panel.textContent(),/Skyranger/);assert.match(await panel.textContent(),/unlimited|anywhere/i);
  await page.screenshot({path:`test-results/archer-attunements-tree-${width}.png`});
  await panel.locator('[data-ug-buy]').click();
  await page.waitForFunction(()=>window.__dp.host.save().layout.structures.some(b=>b.kind==='skyrangerLodge'));
  await page.waitForTimeout(700);
  await panel.locator('[data-node="p:skyranger:1"]').click();
  await page.waitForTimeout(400);await panel.locator('[data-ug-buy]').click();
  await page.waitForFunction(()=>window.__dp.host.save().layout.structures.some(b=>b.kind==='skyrangerLodge'&&b.rank===1));
  assert.match(await panel.textContent(),/12 arrows|12 rain arrows/);
  await panel.locator('[data-specialty-close]').click();
  await page.locator('#defend-start').click();await page.evaluate(()=>window.defendDebug?.(8));
  assert.ok(await page.evaluate(()=>{const sim=window.__dp.sim;return sim.soldiers.some(u=>u.kind==='archer'&&sim.map.buildings[u.home]?.kind==='skyrangerLodge');}));
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}px: projectile gallery, carrying, vertical fade/descent, targeted rain, PNG toggle, Reduce Motion and real three-branch tree passed`);
 }
 const context=await browser.newContext(),page=await context.newPage();await page.route('**/assets/pixel/v2/**',route=>route.abort());
 await page.goto(new URL('tests/archer-attunements.html',base).href);await page.waitForFunction(()=>window.archerFixture);
 assert.ok(await page.evaluate(()=>{const f=window.archerFixture;return f.scenes.every(s=>{f.c.clearRect(0,0,f.canvas.width,f.canvas.height);f.paintStructureArt(f.c,s.kind,{x:0,y:0,w:64,h:64,px:16},0,0,s.path);return f.c.getImageData(0,0,64,64).data.some(v=>v!==0);});}));await context.close();
}finally{await browser.close();}
