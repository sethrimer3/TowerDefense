import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';mkdirSync('test-results',{recursive:true});
try{
 for(const width of [1100,390]){
  const context=await browser.newContext({viewport:{width,height:width<500?844:1000},hasTouch:width<500}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('#defend-start');
  const save=await page.evaluate(async()=>{const {defaults}=await import('/src/save.ts');const s=defaults();s.settings.soundOff=s.settings.ambienceOff=true;s.defend.bestWave=9;s.defend.furthestWave=10;s.defend.startWave=9;return s;});
  await context.addInitScript(save=>{if(!sessionStorage.getItem('waves-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(save));sessionStorage.setItem('waves-seeded','1');}},save);
  async function reload(){
   await page.reload();await page.waitForSelector('#defend-start');
   await page.evaluate(async()=>{
    const urls=new Set(['/src/defend/ui.ts']);for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
    for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;if(frame.__hooked)continue;DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};DefendPage.prototype.frame.__hooked=true;}
   });await page.waitForFunction(()=>window.__dp);
  }
  const stored=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('towerdefense.v1'));return {furthest:s.defend.furthestWave,start:s.defend.startWave,best:s.defend.bestWave,points:s.upgradePoints};});
  const selected=()=>page.locator('#defend-wave b').textContent();
  async function choose(wave){await page.locator('#defend-wave').click();await page.locator(`.defend-wave-dialog [data-wave="${wave}"]`).click();}
  async function events(list){await page.evaluate(list=>{const p=window.__dp;p.sim.events.splice(0);p.sim.wave=list.at(-1).wave;p.sim.events.push(...list);p.handleEvents();},list);}
  await reload();assert.equal(await selected(),'9');
  await page.locator('#defend-wave').click();
  assert.equal(await page.locator('.defend-wave-dialog [data-wave="9"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.defend-wave-dialog [data-wave="10"]').count(),0,'highest entered wave itself is not a starting wave');
  await page.locator('.defend-wave-dialog [data-wave="3"]').click();assert.equal(await selected(),'3');
  await reload();assert.equal(await selected(),'3','manual choice survives reload');
  await page.locator('#defend-start').click();
  await page.evaluate(()=>{const p=window.__dp;p.sim.speed=0;});
  await events([{type:'waveStart',wave:3},{type:'waveStart',wave:10}]);
  assert.deepEqual(await stored(),{furthest:10,start:3,best:9,points:0},'replay and equal record preserve manual selection');
  await events([{type:'waveStart',wave:11}]);
  assert.deepEqual(await stored(),{furthest:11,start:10,best:9,points:0},'new entered record selects previous wave without rewarding a clear');
  await page.evaluate(()=>{const p=window.__dp;p.sim.stats.begin(11,20,500);p.sim.stats.current.keep=1;});
  await events([{type:'lost',wave:11}]);
  await page.locator('.defeat-actions button').click();assert.equal(await selected(),'10','losing the new record keeps the new default');
  await page.locator('#defend-wave').click();
  assert.equal(await page.locator('.defend-wave-dialog [data-wave="10"]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.defend-wave-dialog [data-wave="11"]').count(),0);
  await page.waitForTimeout(450); // Finish the parchment unroll before checking layout.
  const fit=await page.locator('.defend-wave-dialog').evaluate(dialog=>{
   const d=dialog.getBoundingClientRect(),footer=dialog.querySelector('.dialog-actions').getBoundingClientRect(),list=dialog.querySelector('.wave-list').getBoundingClientRect(),chosen=dialog.querySelector('[data-wave="10"]').getBoundingClientRect();
   return {dialogBottom:d.bottom,footerBottom:footer.bottom,footerTop:footer.top,dialogTop:d.top,viewport:innerHeight,listTop:list.top,listBottom:list.bottom,chosenTop:chosen.top,chosenBottom:chosen.bottom};
  });
  assert.ok(fit.footerTop>=fit.dialogTop&&fit.footerBottom<=fit.dialogBottom+1&&fit.footerBottom<=fit.viewport,`picker Close stays visible: ${JSON.stringify(fit)}`);
  assert.ok(fit.chosenTop>=fit.listTop&&fit.chosenBottom<=fit.listBottom+1,`selected start is visible in the wave list: ${JSON.stringify(fit)}`);
  await page.screenshot({path:`test-results/wave-progress-${width}.png`});
  await page.locator('[data-wave-close]').click();
  await reload();assert.equal(await selected(),'10');
  await choose(4);await page.locator('#defend-start').click();await page.evaluate(()=>{window.__dp.sim.speed=0;});
  await events([{type:'waveCleared',wave:9},{type:'waveStart',wave:11}]);
  assert.deepEqual(await stored(),{furthest:11,start:4,best:9,points:0});
  await events([{type:'waveCleared',wave:11},{type:'waveStart',wave:12}]);
  assert.deepEqual(await stored(),{furthest:12,start:11,best:11,points:1},'only first clear pays, while next entered record advances the default');
  await page.evaluate(async()=>{const p=window.__dp,{DefendSim}=await import('/src/defend/sim.ts');const sim=new DefendSim(p.sim.map,p.save.levels,1,p.host.bonuses());sim.startUnitTester();p.sim=sim;});
  await events([{type:'waveStart',wave:1000}]);
  assert.deepEqual(await stored(),{furthest:12,start:11,best:11,points:1},'unit tester cannot advance real reached progress');
  assert.deepEqual(errors,[]);await context.close();
  console.log(`${width}px: previous-wave default, earlier picker choices, new-record persistence, defeat/reload, reward separation and tester exclusion passed`);
 }
}finally{await browser.close();}
