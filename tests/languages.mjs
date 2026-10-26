// Real saved preferences, a live battle and the native three-column dialog.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';
const locales=[['en','Settings','Start Defense'],['es','Ajustes','Iniciar defensa'],['fr','Paramètres','Lancer la défense'],['de','Einstellungen','Verteidigung starten'],['pt-BR','Configurações','Iniciar defesa'],['it','Impostazioni','Avvia difesa'],['ja','設定','防衛開始'],['ko','설정','방어 시작'],['zh-CN','设置','开始防守']];
mkdirSync('test-results',{recursive:true});
async function choose(page,code){
 await page.locator('nav [data-tab="settings"]').click();
 await page.locator('#language').click();
 await page.locator(`[data-language="${code}"]`).click();
 await page.waitForFunction(code=>document.documentElement.lang===code,code);
 await page.locator('dialog.language-dialog').waitFor({state:'hidden'});
}
async function fits(page){
 const layout=await page.evaluate(()=>{
  const buttons=[...document.querySelectorAll('.language-option')],rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom};};
  return{columns:getComputedStyle(document.querySelector('.language-grid')).gridTemplateColumns.split(' ').length,buttons:buttons.map(rect),dialog:rect(document.querySelector('dialog')),close:rect(document.querySelector('[data-language-close]')),width:innerWidth,height:innerHeight,scroll:document.documentElement.scrollWidth};
 });
 assert.equal(layout.columns,3);
 assert.equal(layout.buttons.length,9);
 assert.ok(Math.abs(layout.buttons[0].y-layout.buttons[2].y)<1);
 assert.ok(layout.buttons[3].y>layout.buttons[0].y);
 for(const r of [layout.dialog,layout.close,...layout.buttons])assert.ok(r.x>=-1&&r.right<=layout.width+1&&r.y>=-1&&r.bottom<=layout.height+1,JSON.stringify(layout));
 assert.ok(layout.scroll<=layout.width);
}
try{
 for(const [width,height] of [[1170,820],[390,740],[320,568],[844,390]]){
  const context=await browser.newContext({viewport:{width,height},isMobile:width<1000,hasTouch:width<1000}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('#defend-start');
  // Build both persistent canvas pages before changing language.
  for(const tab of ['mine','library','settings'])await page.locator(`nav [data-tab="${tab}"]`).click();
  await page.locator('#language').click();await page.waitForTimeout(450);await fits(page);
  assert.equal(await page.locator('[data-language="en"]').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:`test-results/language-picker-${width}.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.evaluate(()=>{window.localeNoReload=true;});
  for(const [code,heading,start] of locales){
   await choose(page,code);
   assert.equal(await page.locator('#settings h2').textContent(),heading);
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).settings.language),code);
   assert.ok(await page.evaluate(()=>window.localeNoReload),'no reload on selection');
   await page.locator('nav [data-tab="defend"]').click();
   assert.equal(await page.locator('#defend-start').textContent(),start);
   const nav=await page.locator('nav').boundingBox();assert.ok(nav.y+nav.height<=height+1);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.locator('nav [data-tab="mine"]').click();assert.match(await page.locator('#mine-hire').textContent(),/雇用矿工/);
  await page.locator('nav [data-tab="library"]').click();assert.match(await page.locator('#library-shelf').textContent(),/书架/);
  await page.locator('#library-study').click();assert.equal(await page.locator('#library-chamber h2').textContent(),'书房');
  await choose(page,'ja');
  await page.reload();await page.waitForSelector('#defend-start');assert.equal(await page.locator('html').getAttribute('lang'),'ja');
  assert.equal(await page.locator('#defend-start').textContent(),'防衛開始');
  await page.locator('nav [data-tab="settings"]').click();await page.locator('#language').click();await page.waitForTimeout(450);await fits(page);
  await page.locator('[data-language-close]').click();assert.equal(await page.locator('html').getAttribute('lang'),'ja');
  assert.equal(await page.locator('#language').evaluate(e=>e===document.activeElement),true);
  await page.screenshot({path:`test-results/language-settings-ja-${width}.png`});
  await choose(page,'en');assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('locale-cjk')),false);
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}×${height}: nine languages, persistent pages, saved selection and 3×3 menu fit`);
 }
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
 await page.goto(base);await page.waitForSelector('#defend-start');
 await page.evaluate(async()=>{
  const moduleUrl=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/defend/ui.ts').name;
  const {DefendPage}=await import(moduleUrl);
  const frame=DefendPage.prototype.frame;
  DefendPage.prototype.frame=function(time){window.languageBattle=this;return frame.call(this,time);};
 });
 await page.locator('#defend-start').click();await page.waitForFunction(()=>window.languageBattle?.sim);
 await page.locator('nav [data-tab="settings"]').click();
 await page.evaluate(()=>{window.previousBattle=window.languageBattle.sim;});
 await choose(page,'es');await page.locator('nav [data-tab="defend"]').click();
 assert.ok(await page.evaluate(()=>window.languageBattle.sim===window.previousBattle),'language switch retains active battle');
 assert.equal(await page.locator('#defend-abandon').textContent(),'Abandonar');
 await page.locator('nav [data-tab="settings"]').click();
 await context.addInitScript(()=>{const s=JSON.parse(localStorage.getItem('towerdefense.v1'));if(s){s.settings.language='invalid';localStorage.setItem('towerdefense.v1',JSON.stringify(s));}});
 await page.reload();await page.waitForSelector('#defend-start');assert.equal(await page.locator('html').getAttribute('lang'),'en');
 await choose(page,'ja');await page.locator('#erase').click();await page.locator('#cancel').click();assert.equal(await page.locator('html').getAttribute('lang'),'ja');
 await page.locator('#erase').click();await page.locator('#confirm').click();await page.waitForFunction(()=>document.documentElement.lang==='en');
 assert.equal(await page.locator('#defend-start').textContent(),'Start Defense');
 assert.equal(await page.locator('nav [data-tab="settings"] .tab-label').textContent(),'Settings');
 await context.close();console.log('Language switching retains a live battle; invalid saves and erased progress return to English');
}finally{await browser.close();}
