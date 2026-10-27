import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("tests/campaign-native.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.nativeModes);
    await page.evaluate(() => {
      const f = window.nativeModes;
      f.ambush.sim.gold = 10000;
      const p = f.spot("meleeGuild");
      f.ambush.sim.placeAt("meleeGuild", p.qx, p.qy);
      f.ambush.refresh();
    });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    const point = await page.evaluate(() => {
      const p = window.nativeModes.ambush,
        b = p.sim.map.buildings[p.sim.buildings[0].id];
      return p.renderer.toClient(b.rect.x + b.rect.w / 2, b.rect.y + b.rect.h / 2);
    });
    await page.mouse.click(point.x, point.y);
    assert.ok(await page.locator("#ambush-inspect").isVisible());
    await page.locator('[data-upgrade="0"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].kind), "barracks");
    await page.locator('#ambush [data-action="start"]').click();
    await page.locator('[data-upgrade="0"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].kind), "chapterHouse");
    await page.locator('[data-upgrade="0"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].wear.rank), 1);
    await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim,
        b = s.buildings[0],
        e = s.engine.spawnAuxiliary("orc", 30, 5);
      s.engine.hurtEnemy(e, 1e9, true, "melee", { x: e.x, y: e.y, building: b.id });
    });
    await page.waitForFunction(() => document.querySelector('[data-stat="kills"]').textContent === "1");
    assert.ok(Number(await page.locator('[data-stat="damage"]').innerText()) > 0);
    const invested = await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].paid);
    assert.ok((await page.locator('[data-action="sell"]').innerText()).includes(String(invested)));
    const before = await page.locator(".ambush-side-head").boundingBox();
    await page.evaluate(() => {
      document.querySelector(".ambush-side-content").scrollTop = 10000;
    });
    const after = await page.locator(".ambush-side-head").boundingBox();
    assert.equal(before.y, after.y);
    await page.screenshot({ path: "test-results/ambush-building-upgrades-" + width + ".png" });
    await page.locator('[data-action="sell"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings.length), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Native building panel, live local upgrades, tallies, sticky health and full wave-one refunds pass at both widths.");
} finally {
  await browser.close();
}
