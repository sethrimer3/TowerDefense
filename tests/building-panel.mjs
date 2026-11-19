// The building panel (ui/building-panel.ts) in Defend, desktop and phone:
// targeting, range, the small tree's upgrade and downgrade, kills in battle,
// and the square menu back with Settings' Building controls around the building.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome'})});
const base=process.env.TEST_URL||'http://127.0.0.1:5173/';
try {
 for(const [width,height] of [[1280,800],[390,844]]) {
  const phone=width===390,context=await browser.newContext({viewport:{width,height},hasTouch:phone,isMobile:phone});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);console.log('viewport',width);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForSelector('#defend-start');
  const fixture=await page.evaluate(async()=>{
   const {defaults}=await import('/src/save.ts');const {placeCityTile,placeStructure}=await import('/src/defend/layout.ts');
   const s=defaults();s.profile={name:"Panel tester",flag:{base:3,layers:[]}};s.settings.soundOff=true;s.settings.ambienceOff=true;s.settings.reduceMotion=true;s.knowledge=500;
   s.defend.owned.cityTile=10;s.defend.owned.archerTower=2;s.defend.owned.barracks=2;
   let l=s.defend.layout;const {tx,ty}=l.keep;
   for(const [dx,dy]of [[-1,0],[1,0],[0,-1]])l=placeCityTile(l,tx+dx,ty+dy)||l;
   l=placeStructure(l,'archerTower',tx-1,ty)||l;l=placeStructure(l,'barracks',tx+1,ty)||l;
   s.defend.layout=l;return s;
  });
  await context.addInitScript(s=>{if(!sessionStorage.getItem('building-panel-seeded')){localStorage.setItem('towerdefense.v1',JSON.stringify(s));sessionStorage.setItem('building-panel-seeded','1');}},fixture);
  await page.reload();await page.waitForSelector('#defend-start');
  await page.evaluate(async()=>{
   for(const url of new Set(['/src/defend/ui.ts',...performance.getEntriesByType('resource').filter(e=>new URL(e.name).pathname==='/src/defend/ui.ts').map(e=>e.name)])){
    const {DefendPage}=await import(url),orig=DefendPage.prototype.frame;if(orig.__hooked)continue;
    DefendPage.prototype.frame=function(t){window.__dp=this;return orig.call(this,t);};DefendPage.prototype.frame.__hooked=true;
   }
  });await page.waitForFunction(()=>window.__dp);
  if(await page.locator('#defend-side-toggle[aria-pressed="true"]').count())await page.locator('#defend-side-toggle').click();
  await page.waitForTimeout(350);
  const rect=kind=>page.evaluate(kind=>{const d=window.__dp,b=(d.sim?.map??d.currentMap()).buildings.find(b=>b.kind===kind);const a=d.renderer.toClient(b.rect.x,b.rect.y),z=d.renderer.toClient(b.rect.x+b.rect.w,b.rect.y+b.rect.h);return {x0:a.x,y0:a.y,x1:z.x,y1:z.y,x:(a.x+z.x)/2,y:(a.y+z.y)/2};},kind);
  const tap=async p=>phone?await page.touchscreen.tap(p.x,p.y):await page.mouse.click(p.x,p.y);
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')));
  const open=async kind=>{await tap(await rect(kind));await page.waitForSelector('.building-panel');};

  await open('archerTower');
  assert.equal(await page.locator('.building-menu').count(),0,'no square menu by default');
  assert.equal(await page.locator('.bp-name').textContent(),'Archer tower');
  assert.ok(await page.locator('[data-bp="kills-row"]').isHidden(),'no kills before a battle');
  // The panel stays clear of the building and inside the board.
  const clear=async kind=>{const r=await rect(kind);return page.locator('.building-panel').evaluate((el,r)=>{const p=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return (p.right<=r.x0||p.left>=r.x1)&&p.left>=b.left&&p.right<=b.right+1&&p.top>=b.top&&p.bottom<=b.bottom+1;},r);};
  assert.ok(await clear('archerTower'));
  await page.locator('[data-bp-mode="strongest"]').click();
  assert.equal(await page.locator('.bp-mode-name').textContent(),'Strongest');
  const slider=page.locator('.building-panel [data-bm="range"]');await slider.fill('50');await slider.dispatchEvent('input');
  assert.equal(await page.locator('.building-panel [data-bm="range-value"]').textContent(),'50%');
  let tower=(await stored()).defend.layout.structures.find(s=>s.kind==='archerTower');
  assert.equal(tower.targetMode,'strongest');assert.equal(tower.rangePercent,50);
  await page.screenshot({path:`test-results/building-panel-${width}.png`});

  // The small tree: buy the first next upgrade, then downgrade back.
  await page.locator('[data-bp="upgrades"]').click();await page.waitForSelector('.bp-tree');
  assert.equal(await page.locator('.bp-climbed').count(),2,'watch tower, then archer tower');
  assert.equal(await page.locator('.bp-next .bp-have').first().textContent(),'(500)','the Knowledge in hand beside the cost');
  const before=(await stored()).knowledge,cost=Number((await page.locator('.bp-next .bp-cost').first().textContent()).replace(/\D/g,''));
  await page.locator('.bp-next').first().click();
  await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.some(s=>s.kind==='archerTower'));
  await page.waitForSelector('.building-panel .bp-tree');
  const bought=(await stored()).defend.layout.structures.find(s=>s.uid===tower.uid);
  assert.notEqual(bought.kind,'archerTower');assert.equal((await stored()).knowledge,before-cost);
  assert.equal(await page.locator('.bp-climbed').count(),3);
  await page.screenshot({path:`test-results/building-panel-${width}-tree.png`});
  await page.locator('[data-bp="downgrade"]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).defend.layout.structures.some(s=>s.kind==='archerTower'));
  assert.equal((await stored()).knowledge,before);
  await page.locator('[data-bp="back"]').click();await page.waitForSelector('.building-panel [data-bp="upgrades"]');
  await page.locator('[data-bp="close"]').click();assert.equal(await page.locator('.building-panel').count(),0);

  // In battle: kills show, Remove doesn't.
  await page.locator('#defend-start').click();await page.waitForFunction(()=>window.__dp.phase==='sim');
  await page.waitForTimeout(300);await open('archerTower');
  assert.ok(await page.locator('[data-bp="kills-row"]').isVisible());
  assert.equal(await page.locator('[data-bp="remove"]').count(),0);
  const killed=await page.evaluate(()=>{const d=window.__dp,b=d.sim.map.buildings.find(b=>b.kind==='archerTower');d.sim.tally(b.id,5,true);d.draw(false);return document.querySelector('[data-bp="kills"]').textContent;});
  assert.ok(Number(killed)>=1);

  // Settings' Building controls around the building brings the square menu back.
  await page.locator('[data-bp="close"]').click();
  await page.evaluate(()=>{window.__dp.game().settings.ringMenu=true;});
  await page.waitForTimeout(400);await tap(await rect('archerTower'));
  await page.waitForSelector('.building-menu');
  assert.equal(await page.locator('.building-panel').count(),0);
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('building panel ok');
} finally {await browser.close();}
