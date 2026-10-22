// Isolated render gallery; never uses player saves. Requires a Vite server.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless:true,channel:process.env.PLAYWRIGHT_CHANNEL??'chrome' });
mkdirSync('test-results',{recursive:true});
try {
 for(const width of [1000,390]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('tests/melee-capes.html',process.env.TEST_URL??'http://127.0.0.1:5173/').href);
  await page.waitForFunction(()=>window.capeFixture);
  await page.waitForTimeout(200);
  await page.evaluate(()=>window.capeFixture.draw());
  await page.locator('canvas').screenshot({path:`test-results/melee-capes-${width}.png`});
  const checks=await page.evaluate(async()=>{
   const f=window.capeFixture,{setPixelArt}=await import('/src/defend/pixel-sprites.ts');
   const {meleeCapeStyle}=await import('/src/defend/melee-cape.ts');
   const cv=document.createElement('canvas');cv.width=cv.height=160;const c=cv.getContext('2d');
   const item=f.units.find(i=>i.path==='crusaders'&&i.rank===3),u={...item.u,x:1,y:1};
   const draw=(time,reduced,pixel)=>{setPixelArt(pixel);c.clearRect(0,0,160,160);f.sim.time=time;f.drawMeleeCape(c,64,u,f.sim,reduced);return Array.from(c.getImageData(0,0,160,160).data);};
   const a=draw(0,true,true),b=draw(1,true,true),off=draw(2,true,false),back=draw(3,true,true);
   const same=(a,b)=>a.every((v,i)=>v===b[i]);
   const before=JSON.stringify(u);
   let moved=false;const still=draw(4,false,true);
   for(let n=1;n<=30;n++){const d=draw(4+n/30,false,true);moved ||= !same(still,d);}
   u.x=1000;const outside=draw(5.1,false,true);u.x=1;const returned=draw(6,false,true);
   const culled=outside.every(v=>v===0)&&returned.some(v=>v!==0);
   c.globalAlpha=.35;const veiled=draw(6.1,true,true);c.globalAlpha=1;
   let maxAlpha=0;for(let i=3;i<veiled.length;i+=4)maxAlpha=Math.max(maxAlpha,veiled[i]);
   const cloak=maxAlpha>0&&maxAlpha<=90;
   const colors=meleeCapeStyle(f.sim,u).colors;
   const trim=colors[5];let hasTrim=false;
   for(let i=0;i<a.length;i+=4)if(a[i+3]&&a[i]===trim[0]&&a[i+1]===trim[1]&&a[i+2]===trim[2])hasTrim=true;
   // New capes disappear in Simple Troops, across both Pixel Art states.
   f.draw(6,{pixel:true,simple:true});const simpleOn=f.ctx.getImageData(0,0,f.canvas.width,f.canvas.height).data.slice();
   f.draw(6,{pixel:false,simple:true});const simpleOff=f.ctx.getImageData(0,0,f.canvas.width,f.canvas.height).data;
   const simple=same(simpleOn,simpleOff);
   f.draw(6,{merged:true}); // Exercises live cape silhouettes in the merged layer.
   const unitStable=before===JSON.stringify(u);
   setPixelArt(true);
   const crowd=Array.from({length:250},(_,i)=>({...u,id:10000+i,x:.5+(i%20)*.1,y:.5+Math.floor(i/20)*.1}));
   const samples=[];
   for(let frame=0;frame<35;frame++){
    f.sim.time=7+frame/60;const start=performance.now();
    for(const troop of crowd)f.drawMeleeCape(c,32,troop,f.sim,false);
    if(frame>5)samples.push(performance.now()-start);
   }
   samples.sort((a,b)=>a-b);
   f.draw(0);
   return{frozen:same(a,b),hidden:off.every(v=>v===0),restored:same(a,back),visible:a.some(v=>v!==0),moved,hasTrim,simple,unitStable,culled,cloak,p95:samples[Math.floor(samples.length*.95)]};
  });
  for(const key of ['frozen','hidden','restored','visible','moved','hasTrim','simple','unitStable','culled','cloak'])assert.equal(checks[key],true,key);
  assert.deepEqual(errors,[]);
  console.log(`${width}px: cape gallery, trim, animation/reduced motion, toggle, Simple Troops, merged outlines and unchanged units passed; 250-cape p95 ${checks.p95.toFixed(2)}ms`);
  await context.close();
 }
}finally{await browser.close();}
