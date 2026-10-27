import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdirSync} from 'node:fs';
mkdirSync('test-results',{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try{for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:width===390?844:800},hasTouch:width===390}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('tests/campaign-native.html',process.env.TEST_URL||'http://127.0.0.1:5173/').href);await page.waitForFunction(()=>window.nativeModes);
 assert.ok(await page.evaluate(()=>window.nativeModes.isNative()));
 const cleanPage=async mode=>{
  assert.equal(await page.locator(`#${mode} h1, #${mode} .campaign-intro, #${mode} .campaign-help, #${mode} .campaign-spaces`).count(),0);
  const board=await page.locator(`#${mode} .campaign-board`).boundingBox();
  assert.ok(board.height>=page.viewportSize().height*.6,'The battlefield fills the space freed by the removed panels.');
 };
 const tapPad=async index=>{
  const point=await page.evaluate(index=>{const f=window.nativeModes.ambush,p=f.sim.plan.pads[index];return f.renderer.toClient(p.x,p.y);},index);
  if(width===390)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
 };
 await cleanPage('ambush');
 await page.evaluate(()=>{window.nativeModes.ambush.sim.gold=10000;window.nativeModes.ambush.refresh();});
 await page.locator('#ambush [data-kind="wispTower"]').click();
 await tapPad(0);
 assert.equal(await page.evaluate(()=>window.nativeModes.ambush.sim.layout[0].kind),'wispTower');
 await tapPad(0);
 await page.locator('#ambush [data-action="sell"]').click();
 assert.equal(await page.evaluate(()=>window.nativeModes.ambush.sim.layout.length),0);
 const data=await page.evaluate(()=>{const f=window.nativeModes,s=f.ambush.sim;s.gold=10000;s.place(0,'brazierTower');s.place(1,'wispTower');s.place(2,'meleeGuild');f.ambush.render();return {native:s.engine.constructor.name,buildings:s.map.buildings.length,arrows:s.engine.arrows.length,wisps:s.engine.wisps.length,paths:Object.keys(s.engine.bonuses.structurePaths||{}).length};});
 await page.locator('#ambush [data-action="start"]').click();
 assert.equal(await page.evaluate(()=>window.nativeModes.ambush.sim.phase),'battle');
 await page.evaluate(()=>window.nativeModes.advance(12));
 assert.equal(data.native,'DefendSim');assert.ok(data.buildings>20);assert.ok(data.paths>0);
 await page.locator('#ambush .campaign-board').screenshot({path:`test-results/native-ambush-${width}.png`});
 await page.screenshot({path:`test-results/native-ambush-full-${width}.png`});
 const camera=await page.evaluate(()=>{const r=window.nativeModes.ambush.renderer,c=r.canvas.getBoundingClientRect();r.zoomAt(c.x+c.width/2,c.y+c.height/2,2);return {scale:r.cam.s,point:r.toClient(30,30)};});assert.ok(camera.scale>1);
 await page.locator('#siege-mode').click();await page.waitForFunction(()=>document.querySelector('#siege').classList.contains('active'));
 await cleanPage('siege');
 await page.locator('#siege [data-action="start"]').click();
 assert.equal(await page.evaluate(()=>window.nativeModes.save.siege.raid.state),'started');
 const raid=await page.evaluate(()=>{const f=window.nativeModes,s=f.siege.sim;f.advance(20);return {attack:s.raid.attack.constructor.name,defense:s.raid.defense.constructor.name,units:s.engine.soldiers.length,foes:s.raid.defense.soldiers.length,walls:s.map.buildings.filter(b=>b.kind==='wall').length,houses:s.map.buildings.filter(b=>b.kind==='house').length,profile:document.querySelector('#siege .siege-profile-name')?.textContent};});
 assert.equal(raid.attack,'Side');assert.equal(raid.defense,'Side');assert.ok(raid.units>0);assert.ok(raid.foes>0);assert.ok(raid.walls>0);assert.ok(raid.houses>0);assert.equal(raid.profile,'Native Warden');
 await page.locator('#siege .campaign-board').screenshot({path:`test-results/native-siege-${width}.png`});
 await page.screenshot({path:`test-results/native-siege-full-${width}.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.close();
}console.log('Clean Ambush/Siege pages, board placement and selling, native combat, camera and desktop/mobile layouts pass.');}finally{await browser.close();}
