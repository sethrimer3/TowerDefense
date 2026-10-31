import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
mkdirSync('test-results/repair-shop', { recursive: true });
try {
 for (const width of [1280, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: width === 390 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/performance.html');
  await page.evaluate(async () => {
   await import('/src/style.css'); await import('/src/theme.css');
   const { defaults } = await import('/src/save.ts');
   const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
   const { DefendPage } = await import('/src/defend/ui.ts');
   const { bonuses } = await import('/src/progression.ts');
   const game = defaults(); game.knowledge = 1e7; game.settings.soundOff = game.settings.ambienceOff = true;
   const { tx, ty } = game.defend.layout.keep;
   for (let y=-1; y<=1; y++) for (let x=-1; x<=1; x++) if(x||y) game.defend.layout = placeCityTile(game.defend.layout,tx+x,ty+y);
   game.defend.layout = placeStructure(game.defend.layout,'repairShop',tx+1,ty);
   game.defend.owned.repairShop=1; game.defend.owned.cityTile=8;
   document.body.innerHTML='<main id="repair" style="height:100vh"></main>';
   const dp = new DefendPage(document.querySelector('#repair'), {save:()=>game.defend,game:()=>game,bonuses:()=>bonuses(game),earnWave:()=>({upgrade:0}),persist:()=>{},reduceMotion:()=>true,effects:()=>true,devMode:()=>false});
   dp.show(); Object.assign(window,{repairPage:dp,repairGame:game});
   function frame(t){dp.frame(t);requestAnimationFrame(frame)}requestAnimationFrame(frame);
   dp.openTree({uid:game.defend.layout.structures.find(s=>s.kind==='repairShop').uid});
  });
  const panel = page.locator('#defend-specialty'); await panel.waitFor({state:'visible'});
  await page.locator('[data-node="repair:carpentry"]').click(); assert.match(await panel.locator('.ug-card').innerText(), /Initial skill/);
  await page.locator('[data-node="q:advancedCarpentry:1"]').click();
  await panel.locator('[data-ug-buy="q:advancedCarpentry:1"]').click();
  assert.equal(await page.evaluate(()=>window.repairGame.defend.repairRanks.advancedCarpentry),1);
  assert.ok(Number((await panel.locator('.ug-alloc b').innerText()).replace(/[^0-9]/g,''))>0);
  await page.locator('[data-node="q:crew:1"]').click(); await panel.locator('[data-ug-buy="q:crew:1"]').click();
  await page.screenshot({path:`test-results/repair-shop/tree-${width}.png`});
  await panel.locator('[data-ug-respec]').click();
  assert.equal(await page.evaluate(()=>window.repairGame.defend.repairRanks),undefined);
  assert.equal(await page.locator('[data-node="repair:carpentry"].owned').count(),1);
  await panel.locator('[data-specialty-close]').click();
  await page.screenshot({path:`test-results/repair-shop/city-${width}.png`});
  assert.deepEqual(errors,[]); console.log(`${width}: tree purchase, initial Carpentry, respec, rendering passed`);
  await page.close();
 }
} finally { await browser.close(); }
