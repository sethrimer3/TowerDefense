// Real pages and navigation, including browser chrome/keyboard viewport reports.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL??'chrome'});
const base=process.env.TEST_URL??'http://127.0.0.1:5173/';
mkdirSync('test-results',{recursive:true});
const tabs=['defend','mine','library','tiles','settings'];
async function bounds(page,height,top=0,safe={}){
 await page.waitForFunction(({height,top})=>{
  const r=document.querySelector('.shell').getBoundingClientRect();return Math.abs(r.height-height)<1&&Math.abs(r.top-top)<1;
 },{height,top});
 const result=await page.evaluate(()=>{
  const rect=el=>{const b=el.getBoundingClientRect();return{left:b.left,right:b.right,top:b.top,bottom:b.bottom,height:b.height};};
  return {width:innerWidth,shell:rect(document.querySelector('.shell')),nav:rect(document.querySelector('nav')),buttons:[...document.querySelectorAll('nav button')].map(b=>{
   const r=rect(b),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);
   return{...r,tab:b.dataset.tab,uncovered:b===hit||b.contains(hit)};
  }),scrollWidth:document.documentElement.scrollWidth};
 });
 assert.ok(result.scrollWidth<=result.width+1,`no document-wide horizontal overflow: ${JSON.stringify(result)}`);
 assert.ok(result.nav.top>=top+(safe.top??0),`navigation stays below top inset: ${JSON.stringify(result)}`);
 for(const b of result.buttons){
  assert.ok(b.height>=35&&b.top>=top&&b.bottom<=top+height-(safe.bottom??0)+1&&b.left>=(safe.left??0)-1&&b.right<=result.width-(safe.right??0)+1,`button fits the usable viewport: ${JSON.stringify(b)}`);
  assert.ok(b.uncovered,`button remains reachable: ${b.tab}`);
 }
 return result;
}
try{
 for(const [width,height] of [[320,568],[393,740],[393,852],[412,915],[844,390],[1280,800]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForSelector('#defend-start');await page.evaluate(()=>document.fonts.ready);
  for(const tab of tabs){await page.locator(`nav [data-tab="${tab}"]`).click();await bounds(page,height);}
  await page.locator('nav [data-tab="library"]').click();await page.locator('#library-study').click();await bounds(page,height);
  await page.locator('#library-chamber [data-up]').click();
  await page.setViewportSize({width:height,height:width});await bounds(page,width);
  assert.deepEqual(errors,[]);await context.close();console.log(`${width}×${height}: all tabs, Study and orientation resize fit`);
 }
 const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.addInitScript(()=>{
  const viewport=Object.assign(new EventTarget(),{width:393,height:740,offsetTop:0,offsetLeft:0,scale:1});
  Object.defineProperty(window,'visualViewport',{value:viewport,configurable:true});
  window.changeViewport=(values,event='resize')=>{Object.assign(viewport,values);viewport.dispatchEvent(new Event(event));};
 });
 await page.goto(base);await page.waitForSelector('#defend-start');
 const safe={top:28,bottom:30,left:0,right:0};
 await page.evaluate(safe=>{for(const[side,value]of Object.entries(safe))document.documentElement.style.setProperty(`--safe-${side}`,`${value}px`);},safe);
 for(const tab of tabs){await page.locator(`nav [data-tab="${tab}"]`).click();await bounds(page,740,0,safe);}
 await page.locator('nav [data-tab="library"]').click();
 // Simulated system gesture bar covers only the space reserved for it.
 await page.evaluate(()=>{const bar=document.createElement('div');bar.id='device-gesture';bar.style.cssText='position:fixed;bottom:112px;left:0;right:0;height:30px;background:#090909;z-index:999;pointer-events:none';bar.innerHTML='<div style="height:4px;width:110px;background:white;border-radius:4px;margin:18px auto 0"></div>';document.body.append(bar);});
 await page.screenshot({path:'test-results/phone-viewport-library.png',clip:{x:0,y:0,width:393,height:740}});
 await page.locator('#device-gesture').evaluate(e=>e.remove());
 await page.evaluate(()=>window.changeViewport({height:430,offsetTop:120},'scroll'));await bounds(page,430,120,safe);
 await page.evaluate(()=>window.changeViewport({height:200,offsetTop:180,scale:2}));
 await page.waitForTimeout(60);assert.equal(Math.round((await page.locator('.shell').boundingBox()).height),430,'pinch zoom does not reflow the game');
 await page.evaluate(()=>window.changeViewport({height:0,offsetTop:0,scale:1}));
 await page.waitForTimeout(60);assert.equal(Math.round((await page.locator('.shell').boundingBox()).height),430,'transient zero height does not collapse the game');
 await page.evaluate(()=>window.changeViewport({height:852,offsetTop:0}));await bounds(page,852,0,safe);
 await page.setViewportSize({width:852,height:393});
 const landscapeSafe={top:0,bottom:24,left:44,right:44};
 await page.evaluate(safe=>{for(const[side,value]of Object.entries(safe))document.documentElement.style.setProperty(`--safe-${side}`,`${value}px`);window.changeViewport({width:852,height:350});},landscapeSafe);
 for(const tab of tabs){await page.locator(`nav [data-tab="${tab}"]`).click();await bounds(page,350,0,landscapeSafe);}
 assert.deepEqual(errors,[]);await context.close();console.log('Browser chrome, gesture/notch insets, keyboard pan, pinch zoom and restoration fit');
 const fallback=await browser.newContext({viewport:{width:390,height:650}}),legacy=await fallback.newPage();
 await fallback.addInitScript(()=>Object.defineProperty(window,'visualViewport',{value:undefined}));
 await legacy.goto(base);await legacy.waitForSelector('#defend-start');await bounds(legacy,650);
 await legacy.setViewportSize({width:844,height:390});await bounds(legacy,390);await fallback.close();
 console.log('No-VisualViewport fallback resizes correctly');
}finally{await browser.close();}
