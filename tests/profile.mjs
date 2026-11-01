import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('work',{recursive:true});
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE,headless:true}:{channel:process.env.PLAYWRIGHT_CHANNEL||'chrome',headless:true});
try {
 for(const width of [1280,360]){
  const page=await browser.newPage({viewport:{width,height:900},hasTouch:width===360});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TEST_URL||'http://127.0.0.1:5173/');
  const dialog=page.locator('#profile-editor'),input=dialog.locator('input');await dialog.waitFor({state:'visible'});
  await page.keyboard.press('Escape');assert.ok(await dialog.isVisible());
  await input.fill('<script>bad</script>');await dialog.locator('[type="submit"]').click();assert.match(await dialog.locator('.profile-error').innerText(),/Enter a name/);
  await input.fill('Oak Warden');
  const action=id=>dialog.locator(`[data-action="${id}"]`);
  const color=id=>dialog.locator(`[data-color="${id}"]`);
  const pattern=id=>dialog.locator(`[data-pattern="${id}"]`);
  const pixel=(x,y)=>dialog.locator('.flag-preview canvas').evaluate((c,[x,y])=>[...c.getContext('2d').getImageData(x,y,1,1).data].slice(0,3),[x,y]);
  await color(3).click();await pattern('cross').click();await action('stamp').click();
  await color(2).click();await pattern('roundel').click();await action('stamp').click();assert.deepEqual(await pixel(7,11),[168,50,64]);
  await action('down').click();assert.deepEqual(await pixel(7,11),[231,181,74]);
  await action('undo').click();assert.deepEqual(await pixel(7,11),[168,50,64]);
  await dialog.locator('[data-layer="1"]').click();await color(7).click();await action('recolor').click();assert.deepEqual(await pixel(7,11),[244,241,229]);
  await action('undo').click();await action('remove').click();assert.deepEqual(await pixel(7,11),[231,181,74]);
  await action('undo').click();await color(1).click();await action('base').click();assert.deepEqual(await pixel(0,0),[37,38,49]);
  // Opacity applies to a new stamp, and can be changed independently on an existing layer.
  await action('stamp').click();
  await dialog.locator('[data-opacity="50"]').click();await action('opacity').click();
  assert.match(await dialog.locator('[data-layer="2"]').innerText(),/50%/);
  await action('undo').click();assert.match(await dialog.locator('[data-layer="2"]').innerText(),/100%/);
  await action('remove').click();
  await dialog.locator('[data-opacity="25"]').click();await color(7).click();await pattern('border').click();await action('stamp').click();
  assert.deepEqual(await pixel(0,0),[89,89,94]);
  await dialog.locator('[data-opacity="50"]').click();await action('opacity').click();assert.deepEqual(await pixel(0,0),[141,140,139]);
  assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
  await page.screenshot({path:`work/profile-editor-${width}.png`});
  await dialog.locator('[type="submit"]').click();await dialog.waitFor({state:'hidden'});
  let save=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')));assert.equal(save.profile.name,'Oak Warden');assert.equal(save.profile.flag.layers.length,3);assert.equal(save.profile.flag.base,1);assert.equal(save.profile.flag.layers[2].opacity,50);
  const defendBefore=JSON.stringify(save.defend.layout),mmrBefore=save.siege.mmr;
  await page.reload();assert.equal(await page.locator('#profile-editor[open]').count(),0);
  const tab=page.locator('nav [data-tab="defend"]');await tab.click();await tab.click();
  const siege=page.locator('#siege');assert.equal(await siege.locator('.siege-profile-name').innerText(),'Oak Warden');assert.equal(await siege.locator('.profile-flag').count(),1);assert.ok(await siege.locator('.profile-flag rect[fill="#8d8c8b"]').count()>0);
  await siege.locator('[data-action="profile"]').click();await input.fill('Discard this');
  for(let n=0;n<9;n++)await action('stamp').click();assert.ok(await action('stamp').isDisabled());assert.equal(await dialog.locator('[data-layer-count]').innerText(),'12/12');
  await action('cancel').click();assert.equal(await siege.locator('.siege-profile-name').innerText(),'Oak Warden');
  await siege.locator('[data-action="profile"]').click();assert.equal(await input.inputValue(),'Oak Warden');assert.equal(await dialog.locator('[data-layer-count]').innerText(),'3/12');
  await input.fill('Iron Warden');await dialog.locator('[type="submit"]').click();assert.equal(await siege.locator('.siege-profile-name').innerText(),'Iron Warden');
  save=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')));assert.equal(JSON.stringify(save.defend.layout),defendBefore);assert.equal(save.siege.mmr,mmrBefore);
  // Existing players without a profile get setup while keeping all progress.
  await page.addInitScript(()=>{const key='towerdefense.v1',s=JSON.parse(localStorage.getItem(key));if(s&&!sessionStorage.getItem('legacy-profile-tested')){sessionStorage.setItem('legacy-profile-tested','1');delete s.profile;s.knowledge=123;localStorage.setItem(key,JSON.stringify(s));}});
  await page.reload();await dialog.waitFor({state:'visible'});await input.fill('   ');await dialog.locator('[type="submit"]').click();
  save=await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')));assert.equal(save.knowledge,123);assert.match(save.profile.name,/^player#[0-9]{4}$/);
  const generated=save.profile.name;await page.reload();assert.equal(await page.locator('#profile-editor[open]').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('towerdefense.v1')).profile.name),generated);
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Profile onboarding, stamp order, undo, recolor, layer cap, cancel, Siege display, legacy saves and reload pass at desktop/phone widths.');
}finally{await browser.close();}
