// Settings' Building menu size in Ambush: `frame` glides the camera so the
// picked tower's range square fits the menu's open middle and back on
// closing; `grow` shrinks the menu gently as the view zooms out; `fixed`
// keeps one size. Desktop and phone (needs dev server).
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
const near = (a, b, d = 0.5) => Math.abs(a - b) <= d;
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("tests/campaign-native.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.nativeModes);
    await page.evaluate(async () => {
      const f = window.nativeModes;
      f.save.settings.reduceMotion = false;
      document.documentElement.classList.remove("reduce-motion");
      f.ambush.sim.gold = 10000;
      const p = f.spot("archerTower");
      f.ambush.sim.placeAt("archerTower", p.qx, p.qy);
      f.ambush.refresh();
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const cam = () => page.evaluate(() => ({ ...window.nativeModes.ambush.renderer.cam }));
    const tower = () => page.evaluate(() => {
      const p = window.nativeModes.ambush, b = p.sim.map.buildings[p.sim.buildings[0].id];
      return p.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    });
    const open = async () => {
      const at = await tower();
      await page.mouse.click(at.x, at.y);
      await page.locator(".building-menu").waitFor();
      await page.waitForTimeout(700); // the glide and the menu's pop
    };
    const close = async () => {
      await page.keyboard.press("Escape");
      await page.locator(".building-menu").waitFor({ state: "detached" });
      await page.waitForTimeout(600);
    };
    const bar = () => page.evaluate(() => parseFloat(document.querySelector(".building-menu").style.getPropertyValue("--bm-bar")));

    // Frame: the camera glides in and the range square sits inside the hole.
    await page.evaluate(() => { window.nativeModes.save.settings.menuSizing = "frame"; });
    const before = await cam();
    await open();
    const framed = await cam();
    assert.ok(framed.s !== before.s || framed.x !== before.x || framed.y !== before.y, "the camera moved to frame the tower");
    const fit = await page.evaluate(() => {
      const menu = document.querySelector(".building-menu"), box = menu.getBoundingClientRect();
      return { box: { x: box.left, y: box.top, w: box.width, h: box.height }, bar: parseFloat(menu.style.getPropertyValue("--bm-bar")) };
    });
    const square = await page.evaluate(async () => {
      const { orderRange } = await import("/src/defend/building-controls.ts"), { CELLS_W, CELLS_H } = await import("/src/defend/grid.ts");
      const p = window.nativeModes.ambush, b = p.sim.map.buildings[p.sim.buildings[0].id], q = orderRange(b, p.sim.engine);
      const a = p.renderer.toClient(Math.max(0, q.x - q.r), Math.max(0, q.y - q.r)), z = p.renderer.toClient(Math.min(CELLS_W, q.x + q.r), Math.min(CELLS_H, q.y + q.r));
      return { x0: a.x, y0: a.y, x1: z.x, y1: z.y };
    });
    const { box, bar: barW } = fit;
    assert.ok(square.x0 >= box.x + barW - 1 && square.x1 <= box.x + box.w - barW + 1, "range fits the hole across");
    assert.ok(square.y0 >= box.y + barW - 1 && square.y1 <= box.y + box.h - barW + 1, "range fits the hole down");
    await page.screenshot({ path: `test-results/menu-sizing-frame-${width}.png` });
    await close();
    const back = await cam();
    assert.ok(near(back.s, before.s, 1e-6) && near(back.x, before.x) && near(back.y, before.y), "the camera glides back on closing");

    // Grow: smaller zoomed out than zoomed in.
    await page.evaluate(() => { window.nativeModes.save.settings.menuSizing = "grow"; });
    await open();
    const out = await bar();
    await page.screenshot({ path: `test-results/menu-sizing-grow-out-${width}.png` });
    await page.evaluate(() => { const r = window.nativeModes.ambush.renderer, c = r.canvas.getBoundingClientRect(); r.zoomAt(c.left + c.width / 2, c.top + c.height / 2, 6); });
    await page.waitForTimeout(100);
    const zoomedIn = await bar();
    assert.ok(out < zoomedIn, `grow: ${out} zoomed out < ${zoomedIn} zoomed in`);
    const boardW = await page.evaluate(() => window.nativeModes.ambush.canvas.parentElement.getBoundingClientRect().width);
    assert.equal(zoomedIn, boardW < 560 ? 44 : 52, "grow: standard size zoomed in");
    await close();

    // Fixed: one size at every zoom.
    await page.evaluate(() => { window.nativeModes.save.settings.menuSizing = "fixed"; window.nativeModes.ambush.renderer.resetCam(); });
    const still = await cam();
    await open();
    assert.deepEqual(await cam(), still, "fixed: the camera stays put");
    const a = await bar();
    await page.evaluate(() => { const r = window.nativeModes.ambush.renderer, c = r.canvas.getBoundingClientRect(); r.zoomAt(c.left + c.width / 2, c.top + c.height / 2, 4); });
    await page.waitForTimeout(100);
    assert.equal(await bar(), a, "fixed: same bar zoomed in");
    await close();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Building menu size: framing, gentle growth and fixed sizing pass at both widths.");
} finally {
  await browser.close();
}
