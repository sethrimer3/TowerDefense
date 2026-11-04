// Real placement must unlock immediately, rather than only after another UI update/reload.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { dropAt } from './drag-raise.mjs';
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
try{
 for(const width of [1280,390]){
  const phone=width<500,context=await browser.newContext({viewport:{width,height:900},hasTouch:phone,isMobile:phone});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/tests/performance.html');
  const fixture=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {placeCityTile}=await import('/src/defend/layout.ts');
   const s=defaults();s.profile={name:'Placement tester',flag:{base:12,layers:[]}};s.settings.reduceMotion=true;s.settings.soundOff=true;s.settings.ambienceOff=true;
   const k=s.defend.layout.keep;
   for(const dx of [-1,0,1])s.defend.layout=placeCityTile(s.defend.layout,k.tx+dx,k.ty-1);
   return s;
  });
  await context.addInitScript(s=>{if(!sessionStorage.getItem('economy-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(s));sessionStorage.setItem('economy-seeded','1');}},fixture);
  await page.goto('http://127.0.0.1:5173/');await page.waitForSelector('#defend-start');
  await page.evaluate(async()=>{
   const urls=new Set(['/src/defend/ui.ts']);
   for(const e of performance.getEntriesByType('resource'))if(new URL(e.name).pathname==='/src/defend/ui.ts')urls.add(e.name);
   for(const url of urls){const {DefendPage}=await import(url),frame=DefendPage.prototype.frame;
    if(frame.__hooked)continue;
    DefendPage.prototype.frame=function(t){window.__dp=this;return frame.call(this,t);};
    DefendPage.prototype.frame.__hooked=true;
   }
  });
  await page.waitForFunction(()=>window.__dp);
  if(phone&&await page.locator('#defend-side-toggle[aria-pressed=false]').count())await page.locator('#defend-side-toggle').click();
  await page.waitForTimeout(500);
  const center=box=>({x:box.x+box.width/2,y:box.y+box.height/2});
  const gesture=async(a,b,preview)=>{
   if(phone){
    const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    const mid={x:b.x,y:a.y};
    for(const [from,to] of [[a,mid],[mid,b]])for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*i/8,y:from.y+(to.y-from.y)*i/8}]});
    await page.waitForTimeout(150);
    if(preview)await preview(b);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   }else{
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});
    await page.waitForTimeout(150);
    if(preview)await preview(b);await page.mouse.up();
   }
  };
  console.log('Ready',width);
  const k=fixture.defend.layout.keep;
  for(const [offset,kind] of [[-1,'mine'],[0,'library']]){
   assert.equal(await page.locator(`nav [data-tab=${kind}]`).isDisabled(),true);
   const tx=k.tx+offset,ty=k.ty-1;
   const item=page.locator(`.defend-item[data-item=${kind}]`);await item.scrollIntoViewIfNeeded();await page.waitForTimeout(250);
   await gesture(center(await item.boundingBox()),await dropAt(page,tx*8+4,ty*8+4),async(point)=>{
    const preview=await page.evaluate(()=>window.__dp.pointers.session?.overlay()?.quarters);
    assert.deepEqual(preview,{rect:{x:tx*8,y:ty*8,w:8,h:8},fits:true,clear:false});
   });
   await page.waitForFunction(kind=>!document.querySelector(`nav [data-tab=${kind}]`).disabled,kind);
   console.log('Placed',width,kind);
   const placed=await page.evaluate(kind=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.find(s=>s.kind===kind),kind);
   assert.deepEqual([placed.qx,placed.qy],[tx*4,ty*4]);
  }
  // Lift the Mine back to the collection without navigating or reloading.
  const minePoint=await page.evaluate(([x,y])=>window.__dp.renderer.toClient(x,y),[(k.tx-1)*8+4,(k.ty-1)*8+4]);
  const palette=center(await page.locator('#defend-palette').boundingBox());
  await gesture(minePoint,palette);
  await page.waitForFunction(()=>document.querySelector('nav [data-tab=mine]').disabled);
  assert.equal(await page.locator('nav [data-tab=library]').isDisabled(),false);
  await page.reload();await page.waitForSelector('#defend-start');
  assert.equal(await page.locator('nav [data-tab=mine]').isDisabled(),true);
  assert.equal(await page.locator('nav [data-tab=library]').isDisabled(),false);
  await page.locator('nav [data-tab=library]').click();await page.waitForSelector('#library-study');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Desktop/phone real drops snap, preview whole tiles, immediately unlock tabs, and lifting/reload preserve correct access.');
}finally{await browser.close();}
