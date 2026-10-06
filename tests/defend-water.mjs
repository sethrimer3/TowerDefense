// Save-free visual and behavioral water fixture, at desktop and mobile scales.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 780 } });
  const errors = []; page.on('pageerror', e => errors.push(e.stack));
  await page.goto((process.env.TEST_URL || 'http://127.0.0.1:5173/') + 'tests/defend-areas.html');
  await page.waitForFunction(() => window.areaFixture);
  const report = await page.evaluate(async () => {
    const { FloodArt } = await import('/src/defend/flood-art.ts');
    const { drawBoat } = await import('/src/defend/boat-art.ts');
    const { meltIce, ageWater } = await import('/src/defend/boats.ts');
    const { PondWater } = await import('/src/defend/pond-water.ts');
    const { CellType } = await import('/src/defend/citygen.ts');
    const { map, sim, renderers } = window.areaFixture;
    const layer = renderers[0].layer, sourcePx = renderers[0].px * renderers[0].layerScale;
    const house = map.buildings.find(b => b.kind === 'house');
    const x = house.rect.x + house.rect.w / 2, y = house.rect.y + house.rect.h + 3;
    sim.floods = [{ x, y, r: 4.2, t: .7, life: 8, boat: 1 }, { x: x + 2, y: y + 2, r: 3, t: .3, life: 8, boat: 1 }];
    sim.sinkings = []; sim.enemies = []; sim.soldiers = []; sim.civilians = []; sim.time = 2;
    const boat = sim.newEnemy('boatCutter', x, y); sim.enemies.push(boat);
    const unit = sim.newEnemy('ogre', x + 1, y + 1); sim.enemies.push(unit);
    const art = new FloodArt();
    const hash = cv => { let h = 0; for (const v of cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data) h = (Math.imul(h, 31) + v) | 0; return h; };
    const gallery = document.createElement('div'); gallery.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;background:#1d2529;padding:12px;color:#e0eaf0;font:16px monospace';
    document.body.replaceChildren(gallery);
    function draw(label, { rain = false, reflections = true, reduceMotion = false, px = 24 } = {}) {
      const section = document.createElement('div'), title = document.createElement('p'), cv = document.createElement('canvas');
      title.textContent = label; cv.width = 340; cv.height = 300;
      section.append(title, cv); gallery.append(section);
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      c.translate(170 - x * px, 155 - y * px);
      c.drawImage(layer, 0, 0, layer.width / sourcePx * px, layer.height / sourcePx * px);
      art.draw({ c, px, sim, rain, reduceMotion, reflections, layer, layerScale: sourcePx / px });
      const waterHash = hash(cv);
      drawBoat({ c, px }, boat, sim.time);
      return { waterHash, cv };
    }
    const calm = draw('Reflections · calm');
    const rain = draw('Rain rings', { rain: true });
    const noReflection = draw('Reflection control', { reflections: false });
    sim.time += .3; unit.x += .2; boat.x += .25;
    const moving = draw('Footsteps & ship wake');
    const wakes = art.wakes.length;
    sim.floods.forEach(f => f.frozen = true);
    const frozen = draw('Winter ice');
    sim.time += 1; const frozenLater = draw('Ice · later');
    meltIce(sim, x, y, 1);
    const melted = draw('Thawed by heat');
    const reduced = draw('Reduce Motion', { reduceMotion: true });
    sim.time += 1; const reducedLater = draw('Reduce Motion · later', { reduceMotion: true });
    ageWater(sim, 9); const dried = draw('Meltwater dried');
    const pondMap = { ...map, type: map.type.slice() };
    for (let py = 10; py < 15; py++) for (let px = 10; px < 15; px++) pondMap.type[py * 63 + px] = CellType.WATER;
    const water = new PondWater(); water.sync(pondMap);
    const pondCanvas = document.createElement('canvas'); pondCanvas.width = layer.width; pondCanvas.height = layer.height;
    const pc = pondCanvas.getContext('2d');
    const pf = { c: pc, px: sourcePx, now: 2000, rain: false, night: 0, walkers: [], reduceMotion: true, layer, layerScale: 1 };
    water.draw(pf); const pondWarm = hash(pondCanvas);
    pc.clearRect(0, 0, pondCanvas.width, pondCanvas.height); water.draw({ ...pf, cold: true });
    const pondCold = hash(pondCanvas);
    return { calm: calm.waterHash, rain: rain.waterHash, noReflection: noReflection.waterHash, moving: moving.waterHash, wakes,
      frozen: frozen.waterHash, frozenLater: frozenLater.waterHash, melted: melted.waterHash,
      reduced: reduced.waterHash, reducedLater: reducedLater.waterHash, dried: dried.waterHash, remaining: sim.floods.length,
      pondCount: water.pondCount, pondWarm, pondCold };
  });
  assert.notEqual(report.calm, report.rain, 'rain changes water pixels');
  assert.notEqual(report.calm, report.noReflection, 'surroundings are reflected');
  assert.ok(report.wakes >= 2, 'both walking and sailing emit ripples');
  assert.equal(report.frozen, report.frozenLater, 'ice stays still');
  assert.notEqual(report.frozen, report.melted, 'thaw visibly changes ice into water');
  assert.equal(report.reduced, report.reducedLater, 'Reduce Motion freezes water animation');
  assert.equal(report.remaining, 0, 'meltwater disappears');
  assert.ok(report.pondCount); assert.notEqual(report.pondWarm, report.pondCold, 'ponds freeze visibly');
  assert.deepEqual(errors, []);
  mkdirSync('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/defend-water.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/defend-water-mobile.png', fullPage: true });
  writeFileSync('test-results/defend-water.json', JSON.stringify(report, null, 2));
  console.log('Water reflections, rain, footsteps, ship wakes, ice, thaw and reduced motion verified.', report);
} finally { await browser.close(); }
