import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('work', { recursive: true });
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try {
 for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(() => {
    const key='towerdefense.v1', saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved&&!saved.profile){saved.profile={name:'Test Warden',flag:{base:12,layers:[{pattern:'cross',color:3}]}};localStorage.setItem(key,JSON.stringify(saved));}
  });
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');
  if(await page.locator('#profile-editor[open]').count()) {
    await page.locator('#profile-editor input').fill('Test Warden');
    await page.locator('#profile-editor [data-action="stamp"]').click();
    await page.locator('#profile-editor button[type="submit"]').click();
  }
  const tab=page.locator('nav [data-tab="defend"]');await tab.click();
  let root=page.locator('#ambush');await root.locator('.campaign-level').waitFor();
  assert.equal(await root.locator('.campaign-level option:disabled').count(),2);
  await root.locator('[data-kind="meleeGuild"]').click();await root.locator('[data-pad="0"]').click();
  await root.locator('[data-kind="rangedGuild"]').click();await root.locator('[data-pad="1"]').click();
  await root.locator('[data-action="start"]').click();await root.locator('[data-action="start"]').click();
  assert.match(await root.locator('.campaign-status').innerText(),/Paused/);
  const paused=await root.locator('.campaign-status').innerText();
  await page.locator('nav [data-tab="tiles"]').click();await tab.click();
  assert.equal(await root.locator('.campaign-status').innerText(),paused);
  await root.locator('[data-action="retry"]').click();assert.match(await root.locator('[data-pad="0"]').innerText(),/Melee/);
  await tab.click();root=page.locator('#siege');await root.locator('.siege-opponent').waitFor();
  assert.equal(await root.locator('.campaign-level').count(),0);
  assert.equal(await root.locator('.siege-bot').innerText(),'BOT');
  assert.equal(await root.locator('[data-kind="watchTower"]').count(),0);
  await root.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
  await page.screenshot({path:`work/siege-${width}.png`,fullPage:true,animations:'disabled'});
  assert.equal(await root.locator('[data-pad]').count(),0);assert.equal(await root.locator('.siege-building').count(),2);
  assert.match(await root.locator('[data-kind="meleeGuild"]').innerText(),/1 deployed/);
  await root.locator('[data-action="start"]').click();assert.match(await root.locator('.campaign-status').innerText(),/defenses/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.reload();await tab.click();await tab.click();root=page.locator('#siege');
  assert.match(await root.locator('[data-kind="meleeGuild"]').innerText(),/1 deployed/);
  assert.match(await root.locator('[data-action="start"]').innerText(),/Start practice/);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).siege.games),1);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')));
  const offeredId=saved.siege.raid.castle.id;
  await page.reload();
  const recovered=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).siege);
  assert.equal(recovered.raid.castle.id,offeredId);assert.equal(recovered.games,1);
  assert.equal(saved.campaigns.ambush.layouts[0].length,2);assert.equal(saved.campaigns.siege.layouts[0]?.length??0,0);
  const economy=await page.evaluate(async()=>{
   const {CampaignPage}=await import('/src/campaign/ui.ts');const {defaults}=await import('/src/save.ts');
   const save=defaults(),before=JSON.stringify(save.smithy);const root=document.createElement('section');document.body.append(root);
   const page=new CampaignPage(root,'ambush',{save:()=>save,store:()=>{}});page.show();
   if(root.querySelector('#ambush-gold').textContent!=='500')throw new Error('Missing starting Ambush gold');
   root.querySelector('[data-kind="rangedGuild"]').click();for(let pad=0;pad<4;pad++)root.querySelector(`[data-pad="${pad}"]`).click();
   const beforeKill=page.sim.gold,disabled=root.querySelector('[data-kind="rangedGuild"]').disabled;
   root.querySelector('[data-action="start"]').click();
   for(let i=1;i<1000&&page.sim.phase==='battle'&&page.sim.gold<110;i++)page.frame(i*100);
   const earned=page.sim.gold-beforeKill,enabled=!root.querySelector('[data-kind="rangedGuild"]').disabled;
   const purchaseGold=page.sim.gold;root.querySelector('[data-kind="rangedGuild"]').click();root.querySelector('[data-pad="4"]').click();
   const result={beforeKill,disabled,earned,enabled,paid:purchaseGold-page.sim.gold,buildings:page.sim.layout.length,kills:page.sim.kills,wallet:root.querySelector('#ambush-gold').textContent,mineUnchanged:JSON.stringify(save.smithy)===before};root.remove();return result;
  });
  assert.equal(economy.beforeKill,60);assert.equal(economy.disabled,true);assert.ok(economy.earned>=50);assert.equal(economy.enabled,true);assert.equal(economy.paid,110);assert.equal(economy.buildings,5);assert.ok(economy.kills>=5);assert.equal(economy.mineUnchanged,true);
  const deployment=await page.evaluate(async()=>{
   const {CampaignPage}=await import('/src/campaign/ui.ts');const {defaults}=await import('/src/save.ts');
   const save=defaults();save.defend.owned.meleeGuild=7;save.defend.owned.rangedGuild=6;save.defend.owned.barracks=2;save.defend.owned.watchTower=4;
   const root=document.createElement('section');document.body.append(root);const page=new CampaignPage(root,'siege',{save:()=>save,store:()=>{}});page.show();
   const spawnY=page.sim.plan.pads.map(p=>p.y);root.querySelector('[data-action="start"]').click();
   const canvas=root.querySelector('.campaign-board canvas'),context=canvas.getContext('2d'),rotations=[];
   const rotate=context.rotate.bind(context);context.rotate=angle=>{rotations.push(angle);rotate(angle);};page.frame(100);page.frame(200);
   const result={buildings:page.sim.layout.length,homes:new Set(page.sim.allies.map(a=>a.home)).size,spawnY,castleY:page.sim.castles.map(c=>c.y),rotated:rotations.filter(a=>a===Math.PI).length,defenses:page.sim.castles.length,pads:root.querySelectorAll('[data-pad]').length};root.remove();return result;
  });
  assert.equal(deployment.buildings,15);assert.equal(deployment.homes,15);assert.ok(deployment.spawnY.every(y=>y>=18.5));assert.ok(deployment.castleY.every(y=>y<16));assert.ok(deployment.rotated>=deployment.defenses);assert.equal(deployment.pads,0);
  // Drive an isolated page controller to victory to check completion persistence and next-level UI.
  const result=await page.evaluate(async()=>{
   const {CampaignPage}=await import('/src/campaign/ui.ts');const {defaults}=await import('/src/save.ts');
   const save=defaults();save.defend.owned.meleeGuild=4;save.defend.owned.rangedGuild=4;let stores=0;const root=document.createElement('section');document.body.append(root);
   const page=new CampaignPage(root,'siege',{save:()=>save,store:()=>stores++});page.show();if(page.sim.layout.length!==8)throw new Error('Missing automatic infantry copies');save.siege.raid.state='started';page.sim.start();
   for(let i=1;i<2000&&page.sim.phase==='battle';i++)page.frame(i*100);
   const result={phase:page.sim.phase,games:save.siege.games,stores,nextHidden:root.querySelector('[data-action="next"]').hidden};
   root.querySelector('[data-action="next"]').click();result.nextState=save.siege.raid.state;result.newId=save.siege.raid.castle.id;root.remove();return result;
  });
  assert.equal(result.phase,'won');assert.equal(result.games,1);assert.ok(result.stores>0);assert.equal(result.nextHidden,false);assert.equal(result.nextState,'offered');
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Campaign browser checks pass: Ambush placement, automatic infantry-only Siege, pause/return, reload, rating settlement and next opponent on desktop/phone.');
}finally{await browser.close();}
