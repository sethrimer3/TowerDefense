// Isolated fixture: this never reads or writes the player's save.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
  : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
try {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(new URL('tests/mine-tunnels.html', process.env.TEST_URL || 'http://127.0.0.1:5173/').href);
    await page.waitForFunction(() => window.mineTunnels);
    const pixels = await page.evaluate(() => {
      const { sim, renderer:r, draw, rows, idx } = window.mineTunnels;
      // Inspect source art at native resolution, with additive glow disabled.
      draw(1200, false);
      const px = r.offCtx.getImageData(0, 0, 768, 960).data;
      const color = (x,y) => [...px.slice((y*768+x)*4,(y*768+x)*4+3)];
      const x=166,y=rows[x]-1;
      const left=color(x*2,y*2), bottomLeft=color(x*2,y*2+1), flame=color(x*2+1,y*2), stick=color(x*2+1,y*2+1);
      // Temporarily hide only the torch's art, retaining the same light map:
      // the two left pixels must be indistinguishable from ordinary air.
      const original=sim.world.cells[idx(x,y)]; sim.world.cells[idx(x,y)]=0;
      r.paint(sim,Math.max(0,Math.floor(r.camY)),Math.min(480,Math.ceil(r.camY+r.canvas.height/r.scale)+1),1200);
      const air=r.offCtx.getImageData(x*2,y*2,1,2).data;
      sim.world.cells[idx(x,y)]=original; r.paintedVersion=-1; draw(1600,true);
      // Check ramp drawing at each half-cell: every adjacent rail pixel
      // differs vertically by at most one art pixel (including cell joins).
      const rail=[];
      for(let xx=150;xx<235;xx++) { const yy=rows[xx],dy=rows[xx+1]-yy; rail.push(yy*2+1,yy*2+1+dy); }
      draw(1600,true);
      return {left,bottomLeft,airLeft:[...air.slice(0,3)],airBottomLeft:[...air.slice(4,7)],flame,stick,maxRamp:Math.max(...rail.slice(1).map((v,i)=>Math.abs(v-rail[i]))),width:r.canvas.width,height:r.canvas.height};
    });
    assert.deepEqual(pixels.left, pixels.airLeft);
    assert.deepEqual(pixels.bottomLeft, pixels.airBottomLeft);
    assert.ok(pixels.flame[0] > 200 && pixels.flame[1] > 100, JSON.stringify(pixels));
    assert.deepEqual(pixels.stick, [120,78,38]);
    assert.equal(pixels.maxRamp, 1);
    assert.ok(pixels.width > 0 && pixels.height > 0);
    await page.screenshot({ path: `test-results/mine-tunnels-${viewport.width}.png` });
    if (viewport.width === 1280) {
      const natural = await page.evaluate(() => window.mineTunnels.natural());
      assert.ok(natural.carts >= 2 && natural.lamps > 2 && natural.left > 16 && natural.right > 16, JSON.stringify(natural));
      console.log('80 simulated minutes:', natural);
      await page.screenshot({ path: 'test-results/mine-tunnels-natural.png' });
    }
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}: narrow torches and one-pixel rail ramps verified`);
    await page.close();
  }
} finally { await browser.close(); }
