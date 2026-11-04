import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
try{
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width<500});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#profile-editor').waitFor({state:'visible'});
  await page.locator('#profile-editor [type=submit]').click();
  assert.ok(await page.locator('nav [data-tab=mine]').isDisabled());
  assert.ok(await page.locator('nav [data-tab=library]').isDisabled());
  await page.goto('http://127.0.0.1:5173/tests/performance.html');
  await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {Ledger}=await import('/src/ui/ledger.ts');
   const save=defaults();save.settings.reduceMotion=true;save.settings.devMode=true;save.settings.instantResearch=true;save.defend.owned.watchTower=2;save.knowledge=1e6;
   const root=document.createElement('section');root.className='chamber-content';document.body.append(root);
   window.realmFixture={save,root,opened:[]};
   const ctx={save:()=>save,update:()=>{},clock:()=>1000,smiths:()=>['Ada'],researchers:()=>1,researched:()=>{},openTree:t=>{window.realmFixture.opened.push(t);return true;}};
   window.realmFixture.smithy=new Ledger(ctx,root,'smithy',()=>{});window.realmFixture.ctx=ctx;
   window.realmFixture.smithy.render();
  });
  const paused=await page.evaluate(async()=>{
   const {MinePage}=await import('/src/mine/ui.ts');const {LibraryPage}=await import('/src/library/ui.ts');
   let active=false;
   const common={active:()=>active,newSeed:()=>17,upgrades:()=>({coffee:0,waterproof:0,smiths:0,fireproof:0,fireTraining:0,nightWatch:0,enchant:0}),busySmiths:()=>new Set(),earn:()=>{},earnKnowledge:()=>{},clock:()=>1000};
   const mine=new MinePage(document.createElement('div'),common);mine.load(null,1000);
   const library=new LibraryPage(document.createElement('div'),common);library.load(null,1000);
   mine.advance(61000);library.advance(61000);
   return {mineOwed:mine.owedMs,libraryOwed:library.owedMs,mineIdle:mine.snapshot(62000).idleMs,libraryIdle:library.snapshot(62000).idleMs};
  });
  assert.deepEqual(paused,{mineOwed:0,libraryOwed:0,mineIdle:0,libraryIdle:0});
  const workshop=page.locator('.chamber-content');
  assert.equal(await workshop.locator('[data-subject=all]').count(),1);
  assert.equal(await workshop.locator('[data-subject=city]').count(),0);
  assert.equal(await workshop.locator('[data-ledger-stack=keep]').count(),1);
  assert.equal(await workshop.locator('[data-ledger-stack=mine]').count(),1);
  assert.equal(await workshop.locator('[data-ledger-copy]').count(),0);
  await workshop.locator('[data-ledger-stack=watchTower]').click();
  assert.equal(await workshop.locator('[data-ledger-copy]').count(),2);
  await workshop.locator('[data-ledger-copy]').nth(1).click();
  await workshop.locator('[data-gear=power]').click();
  assert.equal(await page.evaluate(()=>window.realmFixture.save.forgeJob.kind),'equipment');
  await page.evaluate(async()=>{
   const {Ledger}=await import('/src/ui/ledger.ts');const f=window.realmFixture;
   f.study=new Ledger(f.ctx,f.root,'study',()=>{});f.study.render();
  });
  await workshop.locator('[data-ledger-stack=watchTower]').click();
  await workshop.locator('[data-ledger-copy]').nth(1).click();
  assert.equal(await page.evaluate(()=>window.realmFixture.opened.length),1);
  await workshop.locator('[data-ledger-stack=mine]').click();
  assert.equal(await workshop.locator('[data-ledger-copy]').count(),0);
  assert.equal(await workshop.locator('[data-economy-tree] .ug-host').count(),1);
  await workshop.locator('[data-subject=realm]').click();
  assert.equal(await workshop.locator('[data-ledger-stack=watchTower]').count(),0);
  assert.equal(await workshop.locator('[data-ledger-stack=keep]').count(),1);
  // A shared tree (the keep's) opens at once in Defend, without unfolding copies.
  await workshop.locator('[data-ledger-stack=keep]').click();
  assert.deepEqual(await page.evaluate(()=>window.realmFixture.opened.at(-1)),{side:'keep'});
  const fixture=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {placeCityTile,placeStructure}=await import('/src/defend/layout.ts');
   const s=defaults();s.profile={name:'Realm tester',flag:{base:12,layers:[]}};s.settings.reduceMotion=true;
   const k=s.defend.layout.keep;
   for(const [n,kind] of ['mine','library'].entries()){
    s.defend.layout=placeCityTile(s.defend.layout,k.tx+n+1,k.ty);
    s.defend.layout=placeStructure(s.defend.layout,kind,k.tx+n+1,k.ty);
   }
   return s;
  });
  await page.addInitScript(s=>{if(!sessionStorage.getItem('realm-app-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(s));sessionStorage.setItem('realm-app-seeded','1');}},fixture);
  await page.goto('http://127.0.0.1:5173/');await page.locator('nav [data-tab=mine]').waitFor({state:'visible'});
  await page.waitForFunction(()=>!document.querySelector('nav [data-tab=mine]').disabled);
  assert.equal(await page.locator('nav [data-tab=library]').isDisabled(),false);
  await page.locator('nav [data-tab=mine]').click();await page.locator('#mine-smithy').click();
  await page.locator('#mine-chamber [data-subject=all]').waitFor({state:'visible'});
  assert.equal(await page.locator('#mine-chamber [data-subject=city]').count(),0);
  await page.locator('#mine-chamber [data-subject=realm]').click();
  await page.locator('#mine-chamber [data-ledger-stack=mine]').click();
  assert.equal(await page.locator('#mine-chamber [data-train=minerPower]').count(),1);
  await page.screenshot({path:`work/realm-smithy-${width}.png`});
  assert.deepEqual(errors,[]);
  await page.close();
 }
 console.log('Realm tab locks, All/Realm collections, individual copy expansion, Smithy equipment and Mine Knowledge tree pass at desktop/phone widths.');
}finally{await browser.close();}
