import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width === 390 }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("tests/campaign-native.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.nativeModes);
    const tap = async (p) => {
      if (width === 390) await page.touchscreen.tap(p.x, p.y);
      else await page.mouse.click(p.x, p.y);
    };
    const cleanPage = async (mode) => {
      assert.equal(
        await page.locator("#" + mode + " h1, #" + mode + " .campaign-intro, #" + mode + " .campaign-help, #" + mode + " .campaign-spaces").count(),
        0,
      );
      assert.ok((await page.locator("#" + mode + " .campaign-board").boundingBox()).height >= height * 0.6);
    };
    await cleanPage("ambush");
    assert.ok(await page.evaluate(() => window.nativeModes.isNative()));
    await page.evaluate(() => {
      window.nativeModes.ambush.sim.gold = 10000;
      window.nativeModes.ambush.refresh();
    });
    await page.locator('#ambush [data-kind="archerTower"]').click();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r))));
    });
    const point = await page.evaluate(() => {
      const f = window.nativeModes,
        p = f.spot("archerTower");
      const r = f.ambush.sim.grid.check("archerTower", p.qx, p.qy, []).rect;
      return f.ambush.renderer.toClient(r.x + r.w / 2, r.y + r.h / 2);
    });
    await tap(point);
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings.length), 0, "A tap on open ground never buys a building.");
    await page.evaluate(() => {
      const f = window.nativeModes,
        p = f.spot("archerTower");
      f.ambush.sim.placeAt("archerTower", p.qx, p.qy);
    });
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].kind), "archerTower");
    const before = await page.evaluate(() => JSON.stringify(window.nativeModes.ambush.sim.buildings[0]));
    const inspectPoint = await page.evaluate(() => {
      const p = window.nativeModes.ambush,
        b = p.sim.buildings[0],
        r = p.sim.map.buildings[b.id].rect;
      return p.renderer.toClient(r.x + r.w / 2, r.y + r.h / 2);
    });
    await tap(inspectPoint);
    assert.equal(
      await page.evaluate(() => JSON.stringify(window.nativeModes.ambush.sim.buildings[0])),
      before,
      "A touch tap inspects without moving the building.",
    );
    await page.locator('#ambush [data-action="sell"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings.length), 0);

    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
    // Drag with the same native ghost, raised touch point and magnifier as Defend.
    await page.evaluate(() => {
      const f = window.nativeModes;
      f.save.settings.magnifier = true;
    });
    const palette = await page.locator('#ambush [data-kind="cannonTower"]').boundingBox(),
      start = { x: palette.x + palette.width / 2, y: palette.y + palette.height / 2 };
    const target = await page.evaluate(() => {
      const f = window.nativeModes,
        p = f.spot("cannonTower"),
        r = f.ambush.sim.grid.check("cannonTower", p.qx, p.qy, []).rect;
      return f.ambush.renderer.toClient(r.x + r.w / 2, r.y + r.h / 2 + f.ambush.pointers.raise);
    });
    let touch;
    if (width === 390) {
      touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start.x + 100, y: start.y, id: 1 }] });
      await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ ...target, id: 1 }] });
    } else {
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      await page.mouse.move(target.x, target.y, { steps: 5 });
    }
    await page.waitForFunction(() => window.nativeModes.ambush.pointers.session?.overlay()?.quarters?.fits);
    assert.equal(await page.locator(".defend-drag-ghost").count(), 1);
    await page.screenshot({ path: "test-results/ambush-native-drag-" + width + ".png" });
    if (touch) await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    else await page.mouse.up();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].kind), "cannonTower");
    assert.equal(await page.locator(".defend-drag-ghost").count(), 0);
    await page.evaluate(() => {
      const f = window.nativeModes;
      f.ambush.sim.remove(f.ambush.sim.buildings[0].id);
      f.save.settings.magnifier = false;
    });
    await page.evaluate(() => {
      const f = window.nativeModes;
      for (const kind of ["archerTower", "cannonTower", "wizardTower", "meleeGuild"]) {
        const p = f.spot(kind);
        f.ambush.sim.placeAt(kind, p.qx, p.qy);
      }
      f.ambush.render();
    });
    await page.locator('#ambush [data-action="start"]').click();
    await page.evaluate(() => window.nativeModes.advance(12));
    assert.ok(
      await page.evaluate(() => {
        const s = window.nativeModes.ambush.sim;
        return s.enemiesLeft + s.kills > 0;
      }),
    );
    await page.screenshot({ path: "test-results/native-ambush-full-" + width + ".png" });
    const scale = await page.evaluate(() => {
      const r = window.nativeModes.ambush.renderer,
        c = r.canvas.getBoundingClientRect();
      r.zoomAt(c.x + c.width / 2, c.y + c.height / 2, 2);
      return r.cam.s;
    });
    assert.ok(scale > 1);
    await page.locator("#siege-mode").click();
    await cleanPage("siege");
    await page.locator('#siege [data-action="start"]').click();
    const raid = await page.evaluate(() => {
      const f = window.nativeModes,
        s = f.siege.sim;
      f.advance(20);
      return {
        units: s.engine.soldiers.length,
        foes: s.raid.defense.soldiers.length,
        walls: s.map.buildings.filter((b) => b.kind === "wall").length,
        houses: s.map.buildings.filter((b) => b.kind === "house").length,
        state: f.save.siege.raid.state,
      };
    });
    assert.ok(raid.units > 0 && raid.foes > 0 && raid.walls > 0 && raid.houses > 0);
    assert.equal(raid.state, "started");
    assert.equal(await page.locator("#siege .siege-profile-name").innerText(), "Native Warden");
    await page.screenshot({ path: "test-results/native-siege-full-" + width + ".png" });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Native free-grid placement, touch inspection, selling, combat, camera and two-sided Siege pass on desktop and phone.");
} finally {
  await browser.close();
}
