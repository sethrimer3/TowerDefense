// Native menu integration, isolated saves; desktop and touch screenshots.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
const base=process.env.TEST_URL||'http://127.0.0.1:5173/';
try {
 for(const [width,height] of [[1280,800],[390,844]]) {
  if(process.env.MENU_AMBUSH_ONLY)break;
  const phone=width===390,context=await browser.newContext({viewport:{width,height},hasTouch:phone,isMobile:phone});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);console.log('viewport',width);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('#defend-start');
  const fixture=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {placeCityTile,placeStructure}=await import('/src/defend/layout.ts');
   const s=defaults();s.profile={name:"Menu tester",flag:{base:3,layers:[]}};s.settings.soundOff=true;s.settings.ambienceOff=true;s.settings.raiseDrag=false;s.settings.magnifier=true;s.settings.reduceMotion=true;s.settings.menuSizing="fixed";
   s.defend.owned.cityTile=10;s.defend.owned.archerTower=2;s.defend.owned.barracks=2;s.defend.owned.meleeGuild=1;s.defend.keepRanks={arrowLoops:1};
   let l=s.defend.layout;const {tx,ty}=l.keep;
   for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[-1,-1],[1,-1]])l=placeCityTile(l,tx+dx,ty+dy)||l;
   l=placeStructure(l,'archerTower',tx-1,ty)||l;l=placeStructure(l,'barracks',tx+1,ty)||l;l=placeStructure(l,'meleeGuild',tx,ty-1)||l;
   s.defend.layout=l;return s;
  });
  await context.addInitScript(s=>{if(!sessionStorage.getItem('building-menu-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(s));sessionStorage.setItem('building-menu-seeded','1');}},fixture);
  const hook=async()=>{
   await page.evaluate(async()=>{
    for(const url of new Set(['/src/defend/ui.ts',...performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/defend/ui.ts').map(e=>e.name)])){
     const {DefendPage}=await import(url),orig=DefendPage.prototype.frame;if(orig.__hooked)continue;
     DefendPage.prototype.frame=function(t){window.__dp=this;return orig.call(this,t);};DefendPage.prototype.frame.__hooked=true;
    }
   });await page.waitForFunction(()=>window.__dp);console.log('hooked');
  };
  await page.reload();await page.waitForSelector('#defend-start');await hook();
  if(await page.locator('#defend-side-toggle[aria-pressed="true"]').count())await page.locator('#defend-side-toggle').click();
  await page.waitForTimeout(350);
  const point=kind=>page.evaluate(kind=>{const d=window.__dp,b=(d.sim?.map??d.currentMap()).buildings.find(b=>b.kind===kind);return d.renderer.toClient(b.rect.x+b.rect.w/2,b.rect.y+b.rect.h/2);},kind);
  const tap=async p=>phone?await page.touchscreen.tap(p.x,p.y):await page.mouse.click(p.x,p.y);
  const cdp=phone?await context.newCDPSession(page):null;
  const drag=async(a,z,inspect=false)=>{
   if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...z,id:1}]});}
   else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(z.x,z.y,{steps:5});}
   if(inspect){await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>window.__dp.pointers.loupe.showing));}
   if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.mouse.up();
  };
  const open=async kind=>{await page.waitForTimeout(380);await tap(await point(kind));await page.waitForSelector('.building-menu');};
  // Native renderer observes palette state, flashes every visible placed piece,
  // freezes the closing trace, and draws none under Reduce Motion.
  const shimmer=await page.evaluate(async()=>{
   const d=window.__dp,r=d.renderer,draw=r.draw.bind(r),motion=d.host.reduceMotion;
   let clock=100000,lastOptions; r.draw=(map,sim,overlay,opts)=>{opts.now=clock;lastOptions=opts;return draw(map,sim,overlay,opts);};
   d.host.reduceMotion=()=>false;d.sideOpen.build=false;d.draw(false);d.draw(false);
   const closed=lastOptions.shimmer===false;
   d.sideOpen.build=true;d.draw(false);const opening=lastOptions.shimmer&&r.shimmerOpened===clock;
   clock+=200;d.draw(false);const held=r.shimmerOpened===100000;
   d.sideOpen.build=false;d.draw(false);const closing=r.shimmerClosed===clock;
   clock+=250;d.draw(false);const faded=!r.shimmerOpen;
   d.sideOpen.build=true;d.draw(false);const reopened=r.shimmerOpened===clock;
   d.host.reduceMotion=()=>true;d.draw(false);const reduced=lastOptions.reduceMotion===true;
   d.sideOpen.build=false;d.host.reduceMotion=motion;r.draw=draw;d.draw(false);
   return {closed,opening,held,closing,faded,reopened,reduced};
  });assert.ok(Object.values(shimmer).every(Boolean));
  console.log('opening tower');await open('archerTower');
  const fit=await page.locator('.building-menu').evaluate(el=>{const r=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right+1&&r.top>=b.top&&r.bottom<=b.bottom+1;});assert.ok(fit);
  await page.locator('[data-bm-mode="strongest"]').click();
  const slider=page.locator('[data-bm="range"]');await slider.fill('50');await slider.dispatchEvent('input');
  assert.equal(await page.locator('[data-bm="range-value"]').textContent(),'50%');
  // The picked mode's name pops up beside its button (whole at once under Reduce Motion), and
  // the 50% range leaves its full reach as a dotted ghost; the buttons float on 60% brick.
  assert.equal(await page.locator('.bm-mode-name').textContent(),'Strongest');
  const look=await page.locator('.building-menu').evaluate(el=>({top:getComputedStyle(el.querySelector('.bm-top')).backgroundImage,brick:getComputedStyle(el.querySelector('.bm-button'),'::before').opacity,icon:getComputedStyle(el.querySelector('.bm-icon')).opacity}));
  assert.equal(look.top,'none');assert.equal(look.brick,'0.6');assert.equal(look.icon,'1');
  await page.screenshot({path:`test-results/defend-building-menu-${width}-mode.png`});
  await page.locator('[data-bm="aim"]').click();
  assert.ok(await page.locator('.building-menu.placing').count());
  const far=await page.locator('#defend-canvas').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.right-20,y:r.top+65};});
  await tap(far);await page.waitForSelector('.building-menu:not(.placing)');
  let orders=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.find(s=>s.kind==='archerTower'));
  assert.equal(orders.targetMode,'strongest');assert.equal(orders.rangePercent,50);assert.ok(orders.crosshair);assert.ok(Math.abs(orders.crosshair.x)<=5.000001);
  await page.screenshot({path:`test-results/defend-building-menu-${width}-crosshair.png`});
  await page.keyboard.press('Escape');assert.equal(await page.locator('.building-menu').count(),0);
  await open('archerTower');await page.waitForTimeout(380);await tap(await point('archerTower'));assert.equal(await page.locator('.building-menu').count(),0);
  await open('archerTower');await tap({x:far.x-20,y:far.y});assert.equal(await page.locator('.building-menu').count(),0);
  await page.reload();await page.waitForSelector('#defend-start');await hook();
  if(await page.locator('#defend-side-toggle[aria-pressed="true"]').count())await page.locator('#defend-side-toggle').click();
  await page.waitForTimeout(350);await open('archerTower');
  assert.equal(await page.locator('[data-bm-mode="strongest"]').getAttribute('aria-checked'),'true');assert.equal(await page.locator('[data-bm="range"]').inputValue(),'50');
  assert.equal(await page.locator('[data-bm="aim"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-bm="aim"]').click();
  orders=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.find(s=>s.kind==='archerTower'));assert.ok(!orders.crosshair);
  // Tree action uses the existing upgrade tree, then a board tap brings back the menu.
  await page.locator('[data-bm="tree"]').click();await page.waitForSelector('#defend-specialty:not([hidden])');
  await page.evaluate(()=>window.__dp.closeSpecialty());
  await page.keyboard.press('Escape');await open('barracks');await page.locator('[data-bm="aim"]').click();
  const rally=await page.evaluate(()=>{const d=window.__dp,b=d.currentMap().buildings.find(b=>b.kind==='barracks');return d.renderer.toClient(b.rect.x+b.rect.w/2-5,b.rect.y+b.rect.h/2-4);});
  await tap(rally);assert.equal(await page.locator('[data-bm="aim"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-bm="aim"]').click();assert.equal(await page.locator('[data-bm="aim"]').getAttribute('aria-pressed'),'false');
  // Panning moves the camera while leaving the menu open.
  const box=await page.locator('#defend-canvas').boundingBox();
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+35,box.y+35,{steps:4});await page.mouse.up();assert.ok(await page.locator('.building-menu').count());
  await page.keyboard.press('Escape');await open('meleeGuild');
  await page.locator('[data-bm-mode="groups"]').click();await page.locator('[data-bm="remove"]').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.filter(s=>s.kind==='meleeGuild').length),0);
  await page.locator('#defend-start').click();await page.waitForTimeout(500);
  await page.evaluate(()=>{window.__dp.sim.spawnQueue=[];window.__dp.sim.breakT=1e6;});
  await open('archerTower');assert.equal(await page.locator('[data-bm="remove"]').count(),0);
  await page.locator('[data-bm-mode="weakest"]').click();
  await page.keyboard.press('Escape');
  const start=await point('archerTower'),end={x:start.x+40,y:start.y-35};
  // An unselected building pans rather than aims; once tapped, it aims.
  await page.evaluate(()=>window.__dp.sim.crosshairs.clear());
  await drag(start,end);
  assert.equal(await page.evaluate(()=>window.__dp.sim.crosshairs.size),0);
  const moved=await point('archerTower');await open('archerTower');
  await drag(moved,{x:moved.x+40,y:moved.y-35},true);
  assert.ok(await page.evaluate(()=>window.__dp.sim.crosshairs.size));
  await page.screenshot({path:`test-results/defend-building-menu-${width}-battle.png`});
  // Setting off makes a drag pan instead of setting crosshairs.
  await page.keyboard.press('Escape');await page.locator('nav [data-tab="settings"]').click();
  await page.locator('#drag-crosshair').uncheck();assert.ok(await page.locator('[data-section="controls"] #raise-drag').count());
  await page.locator('nav [data-tab="defend"]').click();await page.evaluate(()=>window.__dp.sim.crosshairs.clear());
  const off=await point('archerTower');await open('archerTower');await drag(off,{x:off.x+20,y:off.y-20});
  assert.equal(await page.evaluate(()=>window.__dp.sim.crosshairs.size),0);
  // Always highlight selectable buildings: a steady outline, sub-options shown only while on.
  await page.keyboard.press('Escape');await page.locator('nav [data-tab="settings"]').click();
  assert.ok(await page.locator('#highlight-opacity-row').isHidden());
  await page.locator('#highlight-buildings').check();
  assert.ok(await page.locator('#highlight-opacity-row').isVisible());assert.ok(await page.locator('#highlight-walls').isVisible());
  await page.locator('#highlight-opacity').fill('100');await page.locator('#highlight-opacity').dispatchEvent('input');
  await page.locator('#highlight-realm').uncheck();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).settings);
  assert.equal(saved.highlightOpacity,100);assert.equal(saved.highlightRealm,false);assert.equal(saved.highlightBuildings,true);
  await page.locator('nav [data-tab="defend"]').click();await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/defend-building-menu-${width}-highlight.png`});
  assert.deepEqual(errors,[]);await context.close();
 }
 for(const [width,height] of [[1280,800],[390,844]]) {
  const page=await browser.newPage({viewport:{width,height},hasTouch:width===390}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/campaign-native.html',base).href);await page.waitForFunction(()=>window.nativeModes);
  await page.evaluate(()=>{const f=window.nativeModes;f.ambush.sim.gold=10000;f.ambush.toggleSide(false);});await page.waitForTimeout(400);
  await page.evaluate(()=>{const p=window.nativeModes.ambush,s=p.sim,cv=p.canvas;
   for(let qy=8;qy<45;qy++)for(let qx=1;qx<35;qx++){
    const check=s.grid.check('archerTower',qx,qy,s.buildings);if(!check.fits)continue;
    const r=check.rect,at=p.renderer.toClient(r.x+r.w/2,r.y+r.h/2);
    if(document.elementFromPoint(at.x,at.y)!==cv)continue;
    s.placeAt('archerTower',qx,qy);p.refresh();return;
   }throw new Error('No visible Ambush placement');
  });
  const at=await page.evaluate(()=>{const p=window.nativeModes.ambush,b=p.sim.buildings[0],r=p.sim.map.buildings[b.id].rect;return p.renderer.toClient(r.x+r.w/2,r.y+r.h/2);});
  if(width===390)await page.touchscreen.tap(at.x,at.y);else await page.mouse.click(at.x,at.y);
  await page.waitForSelector('#ambush .building-menu');await page.locator('#ambush [data-bm-mode="weakest"]').click();
  await page.locator('#ambush [data-bm="range"]').fill('40');await page.locator('#ambush [data-bm="range"]').dispatchEvent('input');
  await page.locator('#ambush [data-bm="aim"]').click();const b=await page.locator('#ambush .campaign-board').boundingBox();
  await page.mouse.click(b.x+b.width-25,b.y+55);await page.waitForSelector('#ambush .building-menu:not(.placing)');
  assert.ok(await page.evaluate(()=>window.nativeModes.ambush.sim.engine.crosshairs.size));
  const before=await page.evaluate(()=>{const s=window.nativeModes.ambush.sim;return {gold:s.gold,refund:s.refund(s.buildings[0].id)};});
  await page.screenshot({path:`test-results/ambush-building-menu-${width}.png`});
  await page.locator('#ambush [data-bm="remove"]').click();
  assert.equal(await page.evaluate(()=>window.nativeModes.ambush.sim.gold),before.gold+before.refund);
  assert.equal(await page.evaluate(()=>window.nativeModes.ambush.sim.buildings.length),0);assert.deepEqual(errors,[]);await page.close();
 }
 console.log('native Defend and Ambush building menus ok');
}finally{await browser.close();}
