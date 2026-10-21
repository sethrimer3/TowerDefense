// Native-frame/legacy parity, missing PNG fallback, camera/DPR sampling and
// a review contact sheet. All scenes use isolated contexts, never player saves.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';

const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const base = process.env.TEST_URL || 'http://127.0.0.1:5173/';
const out = 'test-results/building-sprites';
const focus = (process.env.SPRITE_KINDS || '').split(',').filter(Boolean);
const compareDir = process.env.SPRITE_COMPARE_DIR || '';
mkdirSync(out, { recursive: true });

// Exercise the special renderer itself: grounded sprites alone cannot
// prove that a flying palace has migrated or that its fallback still works.
async function checkSky({ fallback = false } = {}) {
  const { PALACE_SKY, buildingArt, buildingFrame } = await import('/src/defend/building-sprite-manifest.ts');
  const { SkyPalaceArt, skyPalacePixels, skyShadowPixels, MARGIN } = await import('/src/defend/sky-palace-art.ts');
  const { hash } = await import('/src/defend/grid.ts');
  const px = await import('/src/defend/pixel-sprites.ts');
  const make = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const expect = (ok, message) => { if (!ok) throw new Error(message); };
  const pixels = (w, h, data) => { const cv = make(w, h), c = cv.getContext('2d'), im = c.createImageData(w, h); new Uint32Array(im.data.buffer).set(data); c.putImageData(im, 0, 0); return cv; };
  for (const sky of PALACE_SKY) {
    const [cw, ch] = sky.footprint, [w, h] = sky.size, family = buildingArt('valkyriePalace', cw, ch);
    const b = { ...window.stressPage.sim.map.buildings[0], kind: 'valkyriePalace', id: 999, structureUid: 999, rect: { x: 4, y: 5, w: cw, h: ch } };
    const map = { ...window.stressPage.sim.map, buildings: [b] }, cv = make(180, 180), c = cv.getContext('2d'), renderer = new SkyPalaceArt();
    const draw = on => { px.setPixelArt(on); c.clearRect(0, 0, 180, 180); renderer.draw(c, 8, map, null, { 999: 'cloudborne' }, { now: 0, dt: 1, night: 0, reduceMotion: true }); return cv.toDataURL(); };
    const off = draw(false), reference = make(180, 180), rc = reference.getContext('2d'), seed = hash(4, 5, 0xc10d);
    rc.imageSmoothingEnabled = false; rc.globalAlpha = 0.22;
    rc.drawImage(pixels(w, h, skyShadowPixels(cw, ch, seed)), Math.round((4 + 1.2 - MARGIN) * 8), Math.round((5 + 1.8 - MARGIN) * 8));
    rc.globalAlpha = 1; rc.drawImage(pixels(w, h, skyPalacePixels(cw, ch, seed)), 16, Math.round((5 - MARGIN - 0.6) * 8));
    expect(off === reference.toDataURL(), 'airborne off matches independent legacy composition');
    const on = draw(true);
    if (fallback) expect(on === off, 'missing sky layer keeps the entire legacy flight composition');
    else {
      expect(on !== off, 'native airborne palace differs from legacy');
      rc.clearRect(0, 0, 180, 180); rc.globalAlpha = 0.22;
      rc.drawImage(px.pixelSprite(sky.shadow), Math.round((4 + 1.2 - MARGIN) * 8), Math.round((5 + 1.8 - MARGIN) * 8));
      rc.globalAlpha = 1; rc.drawImage(px.pixelSprite(sky.clouds), 16, Math.round((5 - MARGIN - 0.6) * 8));
      const f = buildingFrame(family, 0, 'cloudborne');
      rc.drawImage(px.pixelSprite(family.sheet), f.sx, f.sy, f.sw, f.sh, 32, Math.round((5 - MARGIN - 0.6) * 8) + 16, cw * 8, ch * 8);
      expect(on === reference.toDataURL(), 'airborne PNG roof/cloud/shadow stay exactly aligned');
      expect(draw(false) === off && draw(true) === on, 'airborne repeat toggle restores exact pixels');
      // Above people, fade the complete roof/cloud image once. Separate
      // translucent draws would accumulate opacity over their overlap.
      const body = make(w, h), bc = body.getContext('2d'); bc.drawImage(px.pixelSprite(sky.clouds), 0, 0);
      bc.drawImage(px.pixelSprite(family.sheet), f.sx, f.sy, f.sw, f.sh, 16, 16, cw * 8, ch * 8);
      rc.clearRect(0, 0, 180, 180); rc.globalAlpha = 0.11;
      rc.drawImage(px.pixelSprite(sky.shadow), Math.round((4 + 1.2 - MARGIN) * 8), Math.round((5 + 1.8 - MARGIN) * 8));
      rc.globalAlpha = 0.1; rc.drawImage(body, 16, Math.round((5 - MARGIN - 0.6) * 8));
      c.clearRect(0, 0, 180, 180);
      const sim = { skyPalaces: [{ id: 0, x: 4, y: 5 }], enemies: [{ hp: 1, x: 5, y: 6 }], soldiers: [], civilians: [] };
      renderer.draw(c, 8, map, sim, undefined, { now: 0, dt: 1, night: 0, reduceMotion: true });
      expect(cv.toDataURL() === reference.toDataURL(), 'faded flight applies opacity once to overlapping roof/cloud pixels');
    }
  }
  if (!fallback) {
    const { paintCityLayer } = await import('/src/defend/city-layer.ts');
    const map = window.stressPage.sim.map, b = map.buildings.find(b => b.kind === 'valkyriePalace');
    expect(b && b.structureUid !== undefined, 'fixture has a placed compact palace');
    const cv = make(720, 840), c = cv.getContext('2d'), original = c.drawImage, images = [];
    c.drawImage = function(image, ...args) { if (image instanceof HTMLImageElement) images.push(image.src); return original.call(this, image, ...args); };
    for (const on of [true, false, true]) {
      images.length = 0; px.setPixelArt(on);
      paintCityLayer(c, 8, { map, sim: null, lights: [], stones: [], looks: { [b.structureUid]: 'cloudborne' } });
      expect(images.some(src => src.includes('/palace-mooring-compact.png')) === on, 'real city layer routes the native mooring through Pixel Art');
    }
  }
  px.setPixelArt(true);
}

try {
  for (const [width, dpr] of [[1100, 1], [390, 2], [360, 3]]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, deviceScaleFactor: dpr });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + 'tests/defend-stress.html?manual&enemies=100');
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(async () => {
      window.__pixelSprites = await import('/src/defend/pixel-sprites.ts');
      window.__pixelSprites.preloadPixelArt();
    });
    await page.waitForFunction(() => window.__pixelSprites.PIXEL_SPRITES.every(id => window.__pixelSprites.pixelSprite(id)));
    await page.evaluate(checkSky, {});

    const checks = await page.evaluate(async () => {
      const { BUILDING_ART, buildingFrame, BUILDING_ICON_SIZE, buildingLook } = await import('/src/defend/building-sprite-manifest.ts');
      const { paintStructureArt, paintStructureRubble, paintKeepFlash, paintIcon, keepPixels, keepRubblePixels, drawFlag, flagPixels, FLAG_W, FLAG_H } = await import('/src/defend/structure-art.ts');
      const { structurePixels, structureRubblePixels } = await import('/src/defend/tower-art.ts');
      const { drawOverlay } = await import('/src/defend/edit-overlay.ts');
      const px = await import('/src/defend/pixel-sprites.ts');
      const make = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
      const bytes = cv => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      const same = (a, b) => { const aa = bytes(a), bb = bytes(b); return aa.length === bb.length && aa.every((v, i) => v === bb[i]); };
      const expect = (ok, message) => { if (!ok) throw new Error(message); };
      let frames = 0;
      for (const art of Object.values(BUILDING_ART)) for (const look of art.looks) {
        const [w, h] = art.size, [cw, ch] = art.footprint;
        for (let stage = 0; stage <= art.stages; stage++) {
          const rubble = stage === art.stages, a = make(w, h), b = make(w, h), box = { x: 0, y: 0, w, h, px: 8 };
          px.setPixelArt(true);
          if (rubble) paintStructureRubble(a.getContext('2d'), art.kind, box, 17, look);
          else paintStructureArt(a.getContext('2d'), art.kind, box, stage, 17, look);
          const frame = buildingFrame(art, stage, look, rubble);
          b.getContext('2d').drawImage(px.pixelSprite(art.sheet), frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, w, h);
          expect(same(a, b), `${art.kind}/${look}/${stage}: exact PNG frame`);
          const on = a.toDataURL();
          px.setPixelArt(false);
          a.getContext('2d').clearRect(0, 0, w, h);
          if (rubble) paintStructureRubble(a.getContext('2d'), art.kind, box, 17, look);
          else paintStructureArt(a.getContext('2d'), art.kind, box, stage, 17, look);
          // Direct legacy pixels provide an independent off/fallback reference.
          const legacySize = art.kind === 'keep' ? [24, 24] : [w, h], native = make(...legacySize);
          const data = art.kind === 'keep'
            ? (rubble ? keepRubblePixels() : keepPixels(stage))
            : (rubble ? structureRubblePixels(art.kind, cw, ch, 17) : structurePixels(art.kind, cw, ch, stage, 17, look));
          const nc = native.getContext('2d'), im = nc.createImageData(...legacySize);
          new Uint32Array(im.data.buffer).set(data); nc.putImageData(im, 0, 0);
          const bc = b.getContext('2d'); bc.clearRect(0, 0, w, h); bc.imageSmoothingEnabled = false; bc.drawImage(native, 0, 0, w, h);
          expect(same(a, b), `${art.kind}/${look}/${stage}: unchanged legacy graphics`);
          expect(on !== a.toDataURL(), 'new and legacy are distinct');
          px.setPixelArt(true); a.getContext('2d').clearRect(0, 0, w, h);
          if (rubble) paintStructureRubble(a.getContext('2d'), art.kind, box, 17, look);
          else paintStructureArt(a.getContext('2d'), art.kind, box, stage, 17, look);
          expect(on === a.toDataURL(), 'toggle restores exact frame'); frames++;
        }
        const a = make(48, 48), b = make(48, 48); a.dataset.look = look; paintIcon(a, art.kind);
        const bc = b.getContext('2d'); bc.imageSmoothingEnabled = false;
        expect(px.pixelArtOn() && px.pixelSprite(art.icon), `${art.kind}/${look}: icon loaded while enabled`);
        bc.drawImage(px.pixelSprite(art.icon), buildingLook(art, look) * BUILDING_ICON_SIZE, 0, 24, 24, 0, 0, 48, 48);
        expect(same(a, b), 'palette, tree and Tiles use matching PNG icons');
        // Drag icons retain a path in pixel mode and the old base icon off.
        a.removeAttribute('data-look'); a.dataset.pixelLook = look; paintIcon(a, art.kind);
        expect(same(a, b), 'carried icon retains its PNG path emblem');
        px.setPixelArt(false); paintIcon(a, art.kind);
        b.removeAttribute('data-look'); paintIcon(b, art.kind);
        expect(same(a, b), 'off retains the original base drag icon');
        px.setPixelArt(true);
        const ghost = make(...art.size), expected = make(...art.size);
        drawOverlay(ghost.getContext('2d'), 8, { legal: new Set(), hover: null, ghost: { rect: { x: 0, y: 0, w: art.footprint[0], h: art.footprint[1] }, kind: art.kind, path: look } });
        const gc = expected.getContext('2d'), frame = buildingFrame(art, 0, look);
        gc.fillStyle = 'rgba(0,0,0,0.38)'; gc.fillRect(0, 0, expected.width, expected.height);
        gc.globalAlpha = 0.7; gc.drawImage(px.pixelSprite(art.sheet), frame.sx, frame.sy, frame.sw, frame.sh, 0, 0, ...art.size);
        expect(same(ghost, expected), 'placement ghost has the exact building footprint, path and PNG');
      }
      const mask = make(32, 32); paintKeepFlash(mask.getContext('2d'), { x: 0, y: 0, w: 32, h: 32, px: 8 }, 1);
      const keep = make(32, 32); paintStructureArt(keep.getContext('2d'), 'keep', { x: 0, y: 0, w: 32, h: 32, px: 8 });
      expect(bytes(mask).every((v, i) => i % 4 !== 3 || v === bytes(keep)[i]), 'keep flash silhouette matches new art');
      const a = make(64, 64), c = a.getContext('2d');
      const flagAt = (t, reduceMotion) => { c.clearRect(0, 0, 64, 64); drawFlag(c, 8, { x: 32, y: 32, t, reduceMotion }); return a.toDataURL(); };
      expect(flagAt(0, true) === flagAt(1, true), 'reduced-motion flag is still');
      expect(flagAt(0, false) !== flagAt(0.2, false), 'flag uses authored PNG animation frames');
      px.setPixelArt(false);
      flagAt(0.2, false);
      const flagNative = make(FLAG_W, FLAG_H), fc = flagNative.getContext('2d'), fi = fc.createImageData(FLAG_W, FLAG_H);
      new Uint32Array(fi.data.buffer).set(flagPixels(0.2, false)); fc.putImageData(fi, 0, 0);
      const legacyFlag = make(64, 64); legacyFlag.getContext('2d').drawImage(flagNative, 32 - 12, 32 - 12);
      expect(same(a, legacyFlag), 'Pixel Art off keeps the legacy flag');
      px.setPixelArt(true);
      // Verify the real compositor's downsample stage and input transforms.
      const p = window.stressPage, r = p.renderer, original = r.ctx.drawImage;
      const samples = [];
      r.ctx.drawImage = function(image, ...args) { if (image === r.layer) samples.push(this.imageSmoothingEnabled); return original.call(this, image, ...args); };
      for (const on of [true, false, true]) {
        px.setPixelArt(on); r.cam.s = 1.7;
        Object.assign(p, { night: 0, weather: null }); p.frame(1000);
        expect(samples.at(-1) === !on, 'city compositing respects crisp mode and legacy mode');
        for (const [x, y] of [[36, 76], [27.5, 80.25]]) {
          const at = r.toClient(x, y), back = r.toCell(at.x, at.y);
          expect(Math.abs(back.fx - x) < 1e-8 && Math.abs(back.fy - y) < 1e-8, 'camera/DPR hit mapping stays centered');
        }
      }
      r.ctx.drawImage = original;
      // Exercise the real fallen-building dispatch: a partially rebuilt
      // barracks uses whole-footprint rubble and one-cell native scaffolds.
      const hall = p.sim.map.buildings.find(b => b.kind === 'barracks');
      const intact = p.sim.intact, layerDraw = r.lctx.drawImage, rebuilt = [];
      p.sim.intact = function(b) { return b === hall ? false : intact.call(this, b); };
      r.lctx.drawImage = function(image, ...args) { if (image instanceof HTMLImageElement && image.src.includes('/scaffold.png')) rebuilt.push(image.src); return layerDraw.call(this, image, ...args); };
      for (const on of [true, false]) {
        px.setPixelArt(on); rebuilt.length = 0; p.frame(1000);
        expect(on ? rebuilt.some(src => src.includes('/v2/defend/scaffold.png')) : rebuilt.length === 0, 'rebuilding art follows the toggle through the real city layer');
      }
      p.sim.intact = intact; r.lctx.drawImage = layerDraw; px.setPixelArt(true);
      return { frames, expectedFrames: Object.values(BUILDING_ART).reduce((n, art) => n + art.looks.length * (art.stages + 1), 0) };
    });
    assert.equal(checks.frames, checks.expectedFrames, 'all registered native/path/damage/rubble frames exercised');
    assert.deepEqual(errors, []);
    console.log(`Building art ${width}px @ DPR ${dpr}: ${checks.frames} frames, exact legacy and icon parity, camera and motion passed`);

    if (width === 1100) {
      await page.evaluate(async ({ focus, compareDir }) => {
        const { BUILDING_ART } = await import('/src/defend/building-sprite-manifest.ts');
        const { STRUCTURES } = await import('/src/defend/catalog.ts');
        const { PATHS } = await import('/src/knowledge-paths.ts');
        const { paintStructureArt, paintStructureRubble, paintIcon, drawFlag } = await import('/src/defend/structure-art.ts');
        document.body.innerHTML = '<main id="gallery"><h1>Building sprite collection</h1><p>Native PNG artwork at 3× scale · matching UI icons at 2× scale</p></main>';
        const style = document.createElement('style'); style.textContent = 'body{margin:0;background:#28251f;color:#eae2c9}#gallery{max-width:none;margin:0;padding:24px;font:14px monospace}h1{font-size:24px}h2{font-size:17px;margin:22px 0 10px}.row{display:flex;align-items:center;gap:16px;flex-wrap:wrap}#gallery figure{margin:0;text-align:center;flex:0 0 auto}figcaption{font:12px monospace;margin-top:6px;color:#cac7b5}#gallery canvas{display:block;margin:auto;width:auto;height:auto;aspect-ratio:auto;image-rendering:pixelated}'; document.head.append(style);
        const gallery = document.querySelector('#gallery');
        for (const [key, art] of Object.entries(BUILDING_ART)) {
          if (focus.length && !focus.includes(art.kind)) continue;
          const title = document.createElement('h2'); title.textContent = key === 'barracksWide' ? 'Barracks — separately composed wide footprint' : STRUCTURES[art.kind].name + (key.endsWith('Compact') ? ' — compact footprint' : ''); gallery.append(title);
          if (compareDir) {
            const load = async id => { const image = new Image(); image.src = `/${compareDir}/${id.replace(/^v2\//, '')}.png`; await image.decode(); return image; };
            const old = await load(art.sheet), oldIcon = await load(art.icon), previous = document.createElement('div'); previous.className = 'row'; gallery.append(previous);
            for (const [stage, label] of [[0, 'Previous — intact'], [art.stages - 1, 'Previous — heavy damage'], [art.stages, 'Previous — rubble']]) {
              const fig = document.createElement('figure'), cv = document.createElement('canvas'), cap = document.createElement('figcaption');
              cv.width = art.size[0] * 3; cv.height = art.size[1] * 3; const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
              c.drawImage(old, 0, stage * art.size[1], ...art.size, 0, 0, cv.width, cv.height); cap.textContent = label; fig.append(cv, cap); previous.append(fig);
            }
            const fig = document.createElement('figure'), cv = document.createElement('canvas'), cap = document.createElement('figcaption'); cv.width = cv.height = 48;
            const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; c.drawImage(oldIcon, 0, 0, 24, 24, 0, 0, 48, 48); cap.textContent = 'Previous UI'; fig.append(cv, cap); previous.append(fig);
            const label = document.createElement('p'); label.textContent = 'Revised overhead architecture and structural collapse'; gallery.append(label);
          }
          const row = document.createElement('div'); row.className = 'row'; gallery.append(row);
          const previews = art.looks.map(look => [look, 0, PATHS.find(path => path.id === look)?.name || 'Base']);
          if (art.damageModel === 'structural') previews.push(['', 1, 'Roof damage'], ['', 2, 'Partial collapse'], ['', art.stages - 1, 'Heavy collapse']);
          else previews.push(['', art.stages - 1, 'Heavy damage']);
          previews.push(['', art.stages, 'Rubble']);
          for (const [look, stage, label] of previews) {
            const figure = document.createElement('figure'), cv = document.createElement('canvas'), caption = document.createElement('figcaption');
            cv.width = art.size[0] * 3; cv.height = art.size[1] * 3;
            const c = cv.getContext('2d'), box = { x: 0, y: 0, w: cv.width, h: cv.height, px: 24 };
            if (stage === art.stages) paintStructureRubble(c, art.kind, box); else paintStructureArt(c, art.kind, box, stage, 0, look);
            if (key === 'keep' && stage < art.stages) drawFlag(c, 24, { x: cv.width / 2, y: cv.height / 2, t: 0, reduceMotion: true });
            caption.textContent = label; figure.append(cv, caption); row.append(figure);
          }
          const figure = document.createElement('figure'), icons = document.createElement('div'); icons.className = 'row';
          for (const look of art.looks) { const cv = document.createElement('canvas'); cv.width = cv.height = 48; cv.dataset.look = look; paintIcon(cv, art.kind); icons.append(cv); }
          const label = document.createElement('figcaption'); label.textContent = 'Matching UI icons'; figure.append(icons, label); row.append(figure);
        }
        if (!focus.length || focus.includes('valkyriePalace')) {
          const { PALACE_SKY } = await import('/src/defend/building-sprite-manifest.ts');
          const { SkyPalaceArt } = await import('/src/defend/sky-palace-art.ts');
          const heading = document.createElement('h2'); heading.textContent = 'Cloudborne flight — native building, cloud bank and shadow'; gallery.append(heading);
          const row = document.createElement('div'); row.className = 'row'; gallery.append(row);
          for (const sky of PALACE_SKY) {
            const [w, h] = sky.footprint, cv = document.createElement('canvas'); cv.width = (w + 7) * 24; cv.height = (h + 8) * 24;
            const b = { id: 0, kind: 'valkyriePalace', structureUid: 0, rect: { x: 3, y: 3, w, h } };
            new SkyPalaceArt().draw(cv.getContext('2d'), 24, { buildings: [b] }, null, { 0: 'cloudborne' }, { now: 0, dt: 1, night: 0, reduceMotion: true });
            const fig = document.createElement('figure'), cap = document.createElement('figcaption'); cap.textContent = `${w}×${h} cells, unchanged flight anchor`; fig.append(cv, cap); row.append(fig);
          }
        }
      }, { focus, compareDir });
      await page.screenshot({ path: `${out}/contact-sheet.png`, fullPage: true });
    }
    await context.close();
  }

  // Network failures must render the original graphics, not invisible pieces.
  const context = await browser.newContext(), page = await context.newPage();
  await page.route('**/assets/pixel/v2/**', route => route.abort());
  await page.goto(base + 'tests/defend-stress.html?manual&enemies=100');
  await page.waitForFunction(() => window.stressPage);
  const fallback = await page.evaluate(async () => {
    const { BUILDING_ART } = await import('/src/defend/building-sprite-manifest.ts');
    const { paintStructureArt, paintStructureRubble } = await import('/src/defend/structure-art.ts');
    const { setPixelArt } = await import('/src/defend/pixel-sprites.ts');
    for (const art of Object.values(BUILDING_ART)) for (const look of art.looks) for (let stage = 0; stage <= art.stages; stage++) {
      const cv = document.createElement('canvas'); [cv.width, cv.height] = art.size;
      const c = cv.getContext('2d'), box = { x: 0, y: 0, w: cv.width, h: cv.height, px: 8 };
      const draw = () => { c.clearRect(0, 0, cv.width, cv.height); if (stage === art.stages) paintStructureRubble(c, art.kind, box, 17, look); else paintStructureArt(c, art.kind, box, stage, 17, look); return cv.toDataURL(); };
      setPixelArt(false); const legacy = draw(); setPixelArt(true); if (draw() !== legacy) return false;
    }
    return true;
  });
  assert.ok(fallback, 'missing new assets use the exact legacy fallback');
  await page.evaluate(checkSky, { fallback: true });
  await context.close();
  // A missing cloud layer with the palace roof already loaded must also
  // fall back, rather than mixing half a native composition with legacy.
  const partial = await browser.newContext(), partialPage = await partial.newPage();
  await partialPage.route('**/assets/pixel/v2/defend/palace-clouds*.png', route => route.abort());
  await partialPage.goto(base + 'tests/defend-stress.html?manual&enemies=100');
  await partialPage.waitForFunction(() => window.stressPage);
  await partialPage.evaluate(async () => { window.__pixelSprites = await import('/src/defend/pixel-sprites.ts'); window.__pixelSprites.preloadPixelArt(); });
  await partialPage.waitForFunction(() => window.__pixelSprites.PIXEL_SPRITES.filter(id => !id.includes('palace-clouds')).every(id => window.__pixelSprites.pixelSprite(id)));
  await partialPage.evaluate(checkSky, { fallback: true });
  await partial.close();
  console.log('Building sprite checks passed, including missing PNG fallback');
} finally { await browser.close(); }
