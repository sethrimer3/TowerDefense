import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
try{for(const [width,height]of [[1280,800],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(new URL('tests/siege-entry.html',process.env.TEST_URL||'http://127.0.0.1:5173/').href);await page.waitForFunction(()=>window.siegeFixture);
 await page.locator('[data-action="find"]').click();await page.waitForFunction(()=>document.querySelector('.siege-castle-preview')?.dataset.ready==='true');await page.locator('[data-action="attack"]').click();
 const count=await page.evaluate(()=>{const p=window.siegeFixture.page;p.paused=true;const u=p.sim.raid.defense.soldiers.find(u=>u.kind==='flagBearer');u.x=35.5;u.y=60.5;p.sim.engine.reindexAfterDisplacement();const at=p.renderer.toClient(u.x,u.y);p.renderer.zoomAt(at.x,at.y,2.2);p.frame(performance.now());return p.sim.raid.defense.soldiers.filter(u=>u.kind==='flagBearer').length;});assert.equal(count,3);
 await page.screenshot({path:`test-results/siege-bearers-alive-${width}.png`});
 const dead=await page.evaluate(()=>{const p=window.siegeFixture.page,u=p.sim.raid.defense.soldiers.find(u=>u.kind==='flagBearer'),a=p.sim.engine,e=a.enemies.find(e=>e.id===u.id),before=p.sim.mana.value;a.explode(u.x,u.y,{r:.3,damage:2});p.frame(performance.now());const gained=p.sim.mana.value-before;a.hurtEnemy(e,10);p.frame(performance.now());return {gained,mana:p.sim.mana.value,dropped:p.flags.dropped.length,hp:u.hp};});
 assert.equal(dead.gained,2);assert.equal(dead.mana,3);assert.equal(dead.dropped,1);assert.ok(dead.hp<=0);await page.screenshot({path:`test-results/siege-bearers-dropped-${width}.png`});assert.deepEqual(errors,[]);await page.close();
}console.log('Three native flag-bearers, carried/dropped owner banners, crystal and single two-mana reward pass on desktop/phone.');}finally{await browser.close();}
