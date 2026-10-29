import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_EXECUTABLE||'/usr/bin/chromium'});
async function raid(viewport,reducedMotion='no-preference'){
 const page=await browser.newPage({viewport,reducedMotion});await page.goto(new URL('tests/siege-entry.html',process.env.TEST_URL||'http://127.0.0.1:5173/').href);await page.waitForFunction(()=>window.siegeFixture);await page.locator('[data-action="find"]').click();await page.waitForFunction(()=>document.querySelector('.siege-castle-preview')?.dataset.ready==='true');await page.locator('[data-action="attack"]').click();return page;
}
try{for(const [width,height]of [[1280,800],[390,844]]){
 const page=await raid({width,height}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const won=await page.evaluate(()=>{const f=window.siegeFixture,p=f.page;p.paused=true;const scenery=p.renderer.forest.sim;f.win();if(p.renderer.forest.sim!==scenery)throw Error('Victory reset scenery history');const snapshot=()=>JSON.stringify({a:[...p.sim.engine.hp],d:[...p.sim.raid.defense.hp],s:[...p.sim.engine.solid],units:p.sim.raid.defense.soldiers,stats:p.sim.engine.stats});window.victorySnapshot=snapshot();return {view:p.view,phase:p.sim.phase,state:f.save.siege.raid.state,games:f.save.siege.games};});
 assert.equal(won.view,'battle');assert.equal(won.phase,'won');assert.equal(won.state,'won');assert.equal(won.games,1);
 let previous=0;
 for(const seconds of [.5,1.5,3]){
  const count=await page.evaluate(seconds=>{const p=window.siegeFixture.page;p.victory.advance(seconds-p.victory.elapsed);p.frame(performance.now());return p.victory.collapsed.size;},seconds);assert.ok(count>=previous);previous=count;await page.screenshot({path:`test-results/siege-victory-${seconds}-${width}.png`});
 }
 const frozen=await page.evaluate(()=>{const p=window.siegeFixture.page,t=p.victory.elapsed;p.frame(performance.now()+500);return p.victory.elapsed===t;});assert.equal(frozen,true);
 const unchanged=await page.evaluate(()=>{const p=window.siegeFixture.page;return JSON.stringify({a:[...p.sim.engine.hp],d:[...p.sim.raid.defense.hp],s:[...p.sim.engine.solid],units:p.sim.raid.defense.soldiers,stats:p.sim.engine.stats})===window.victorySnapshot;});assert.equal(unchanged,true);
 await page.evaluate(()=>{const p=window.siegeFixture.page;p.victory.skip();p.frame(performance.now());});await page.waitForFunction(()=>document.querySelector('#siege').dataset.siegeView==='entry');await page.screenshot({path:`test-results/siege-victory-end-${width}.png`});assert.equal(await page.evaluate(()=>window.siegeFixture.save.siege.games),1);assert.deepEqual(errors,[]);await page.close();
 const skip=await raid({width,height});await skip.evaluate(()=>{window.siegeFixture.page.paused=true;window.siegeFixture.win();});await skip.locator('.campaign-board > canvas').click({position:{x:100,y:100}});await skip.waitForFunction(()=>document.querySelector('#siege').dataset.siegeView==='entry');assert.equal(await skip.evaluate(()=>window.siegeFixture.save.siege.games),1);await skip.close();
 const reduced=await raid({width,height},'reduce');await reduced.evaluate(()=>window.siegeFixture.win());await reduced.waitForFunction(()=>document.querySelector('#siege').dataset.siegeView==='entry');assert.equal(await reduced.evaluate(()=>window.siegeFixture.save.siege.games),1);await reduced.screenshot({path:`test-results/siege-victory-reduced-${width}.png`});await reduced.close();
}console.log('Distance collapse, burning/raised flags, frozen native state, pause, one settlement, tap skip and Reduce Motion pass on desktop/phone.');}finally{await browser.close();}
