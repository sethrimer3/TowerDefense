import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : { channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome' });
const base = process.env.TEST_URL ?? 'http://127.0.0.1:5173/';
mkdirSync('test-results', { recursive: true });
try {
  for (const width of [1100, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: width < 500 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/cannon-attunements.html',base).href);
    await page.waitForFunction(()=>window.cannonGallery);
    const gallery=await page.evaluate(()=>{
      const f=window.cannonGallery,pixels=()=>Array.from(f.c.getImageData(0,0,f.canvas.width,f.canvas.height).data);
      f.draw();const on=pixels();f.draw({pixel:false});const off=pixels();f.draw({reduced:true});
      return {same:on.every((v,i)=>v===off[i]),visible:pixels().some(v=>v!==0)};
    });
    assert.ok(gallery.same&&gallery.visible,'procedural cannon art works with both graphics settings and reduced motion');
    await page.evaluate(()=>window.cannonGallery.draw());
    await page.locator('canvas').screenshot({path:`test-results/cannon-gallery-${width}.png`});
    await page.goto(base); await page.waitForSelector('#defend-start');
    const save = await page.evaluate(async () => {
      const { defaults } = await import('/src/save.ts');
      const { placeCityTile, placeStructure } = await import('/src/defend/layout.ts');
      const s = defaults(); s.knowledge = 1e6; s.settings.devMode = true;
      s.settings.soundOff = s.settings.ambienceOff = true; s.defend.owned.cannonTower = 1; s.defend.owned.cityTile = 2;
      let l = s.defend.layout; l = placeCityTile(l, l.keep.tx, l.keep.ty - 1); l = placeStructure(l, 'cannonTower', l.keep.tx, l.keep.ty - 1);
      s.defend.layout = l; return s;
    });
    await context.addInitScript(save => {
      if (!sessionStorage.getItem('cannon-seeded')) {
        localStorage.setItem('towerdefense.v1', JSON.stringify(save)); sessionStorage.setItem('cannon-seeded', '1');
      }
    }, save);
    await page.reload(); await page.waitForSelector('#defend-start');
    await page.evaluate(async () => {
      const urls = new Set(['/src/defend/ui.ts']);
      for (const e of performance.getEntriesByType('resource')) if (new URL(e.name).pathname === '/src/defend/ui.ts') urls.add(e.name);
      for (const url of urls) {
        const { DefendPage } = await import(url), frame = DefendPage.prototype.frame;
        if (frame.__hooked) continue;
        DefendPage.prototype.frame = function(t) { window.__dp = this; return frame.call(this, t); };
        DefendPage.prototype.frame.__hooked = true;
      }
    });
    await page.waitForFunction(() => window.__dp);
    await page.evaluate(() => { const dp = window.__dp, b = dp.host.save().layout.structures.find(b => b.kind === 'cannonTower'); dp.openTree({ uid: b.uid }); });
    const panel = page.locator('#defend-specialty'); await panel.waitFor({ state: 'visible' }); await page.waitForTimeout(700);
    const nodes = await panel.locator('.ug-node:not(.withering)').evaluateAll(els => els.filter(e => e.classList.contains('next')).map(e => e.dataset.node));
    for (const k of ['batteryTower', 'mortarTower', 'minelayerTower']) assert.ok(nodes.includes(`k:${k}`), nodes.join(','));
    await panel.locator('[data-node="k:minelayerTower"]').click(); await page.waitForTimeout(450);
    assert.match(await panel.textContent(), /Minelayer/);
    await page.screenshot({ path: `test-results/cannon-tree-${width}.png` });
    await panel.locator('[data-ug-buy]').click();
    await page.waitForFunction(() => window.__dp.host.save().layout.structures.some(b => b.kind === 'minelayerTower'));
    await page.waitForTimeout(650);
    for (let rank = 1; rank <= 3; rank++) {
      await panel.locator(`[data-node="p:minelaying:${rank}"]`).click(); await page.waitForTimeout(350);
      await panel.locator('[data-ug-buy]').click();
      await page.waitForFunction(rank => window.__dp.host.save().layout.structures.some(b => b.kind === 'minelayerTower' && b.rank === rank), rank);
      await page.waitForTimeout(550);
    }
    assert.match(await panel.textContent(), /Smart charges|50 mines/);
    await panel.locator('[data-specialty-close]').click(); await page.locator('#defend-start').click();
    await page.waitForFunction(() => window.__dp.sim?.shells.some(s => s.mine) || window.__dp.sim?.mines.length);
    await page.evaluate(() => { window.__dp.sim.speed = 0; });
    await page.waitForTimeout(800); // The battle side-panel transition changes canvas coordinates.
    const coords = await page.evaluate(() => {
      const d = window.__dp, b = d.sim.map.buildings.find(b => b.kind === 'minelayerTower');
      window.__mineId = b.id;
      // An aim rides above the finger while dragged items do (touch screens).
      const x = b.rect.x + b.rect.w / 2, y = b.rect.y + b.rect.h / 2, raise = d.pointers.raise;
      return { tower: d.renderer.toClient(x, y), home: d.renderer.toClient(x, y + raise), target: d.renderer.toClient(x + 3.5, y + raise), other: d.renderer.toClient(x - 3, y + raise), blank: d.renderer.toClient(x + 8, y + 5) };
    });
    const cdp = width < 500 ? await context.newCDPSession(page) : null;
    async function down(p) {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      else { await page.mouse.move(p.x, p.y); await page.mouse.down(); }
    }
    async function move(p) {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
      else await page.mouse.move(p.x, p.y, { steps: 8 });
    }
    async function up() {
      if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
    }
    const aim = () => page.evaluate(() => window.__dp.sim.mineAims.get(window.__mineId) ?? null);
    const layoutBefore = await page.evaluate(() => JSON.stringify(window.__dp.host.save().layout));
    // A tap selects the tower; a second press on it, dragged, aims it.
    await page.evaluate(() => window.__dp.pick(null));
    await down(coords.tower); await up();
    assert.equal(await page.evaluate(() => window.__dp.picked?.id), await page.evaluate(() => window.__mineId), 'a tap selects it');
    await page.waitForTimeout(400);
    await down(coords.tower); await move(coords.target); await up();
    const directed = await aim(); assert.ok(directed, 'drag directs aim');
    assert.ok(Math.abs(directed.x - (await page.evaluate(() => { const b = window.__dp.sim.map.buildings[window.__mineId]; return b.rect.x + b.rect.w / 2 + 3.5; }))) < 0.6, 'the crosshair rides above the finger');
    assert.equal(await page.evaluate(() => window.__dp.picked.id), await page.evaluate(() => window.__mineId));
    await page.waitForTimeout(400); await page.screenshot({ path: `test-results/cannon-aim-${width}.png` });
    // Cancel a different preview through the same pointer state machine.
    await down(coords.tower); await move(coords.other);
    if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    else { await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }))); await page.mouse.up(); }
    assert.deepEqual(await aim(), directed, 'cancel restores committed aim');
    // Dragging the selected crosshair home switches to full-range random coverage.
    const handle = await page.evaluate(p => window.__dp.renderer.toClient(p.x, p.y), directed);
    await down(handle); await move(coords.home); await up();
    assert.equal(await aim(), null);
    await page.waitForTimeout(450); await page.screenshot({ path: `test-results/cannon-random-${width}.png` });
    assert.equal(await page.evaluate(() => JSON.stringify(window.__dp.host.save().layout)), layoutBefore, 'aim does not move the building');
    // Pinch cancels an aim rather than accidentally committing it.
    if (cdp) {
      await down(coords.tower); await move(coords.target);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...coords.target, id: 1 }, { x: coords.target.x + 40, y: coords.target.y + 40, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...coords.target, id: 1 }, { x: coords.target.x + 60, y: coords.target.y + 60, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.equal(await aim(), null, 'pinch cancels aiming');
    }
    // An overlapping war banner takes priority over aiming from the tower.
    const banner = await page.evaluate(() => {
      const dp=window.__dp,b=dp.sim.map.buildings[window.__mineId],x=b.rect.x+1,y=b.rect.y+1;
      dp.sim.plantBanner({x,y});dp.sim.bannerReadyAt=dp.sim.time;
      return { from:dp.renderer.toClient(x,y), to:dp.renderer.toClient(x+4,y+2) };
    });
    await down(banner.from);await move(banner.to);await up();
    assert.ok(await page.evaluate(()=>{const dp=window.__dp,b=dp.sim.map.buildings[window.__mineId];return Math.abs(dp.sim.warBanner.x-(b.rect.x+1))>1;}),'banner remains draggable over tower');
    assert.equal(await aim(),null,'banner drag never commits mine aim');
    // Zoom to permit camera movement, then pan from empty ground.
    const pan=await page.evaluate(()=>{const d=window.__dp,r=d.renderer,box=r.canvas.getBoundingClientRect();r.zoomAt(box.left+box.width/2,box.top+box.height/2,2);return {from:{x:box.left+box.width*.25,y:box.top+box.height*.25},before:{...r.cam}};});
    await down(pan.from);await move({x:pan.from.x+35,y:pan.from.y+25});await up();
    assert.ok(await page.evaluate(before=>{const cam=window.__dp.renderer.cam;return cam.x!==before.x||cam.y!==before.y;},pan.before),'empty-space drags still pan');
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px: three-branch tree, rank purchases, target-free laying, drag aim/reset/cancel, ${cdp ? 'touch and pinch' : 'mouse'} banner/pan controls and stable building placement passed`);
  }
} finally { await browser.close(); }
