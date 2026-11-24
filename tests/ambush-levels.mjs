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
    await page.addInitScript(() => {
      localStorage.setItem(
        "towerdefense.v1",
        JSON.stringify({
          version: 7,
          profile: { name: "Level Warden", flag: { base: 3, layers: [] } },
          settings: { reduceMotion: true },
          campaigns: { ambush: { cleared: 2, layouts: [[{ pad: 0, kind: "watchTower" }]] } },
        }),
      );
    });
    await page.goto(new URL("?game=ambush", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    const nodes = "#ambush .ambush-map-node:not([hidden])";
    await page.locator(nodes).first().waitFor();
    // Two old clears migrate to one star each on the first two levels, which opens the third.
    assert.equal(await page.locator("#ambush .ambush-map-node").count(), 30);
    assert.equal(await page.locator(nodes).count(), 3);
    assert.equal(await page.locator("#ambush .ambush-map-zone").count(), 10);
    assert.ok((await page.locator("#ambush .ambush-map-zone").first().innerText()).includes("2/9"));
    assert.equal(await page.locator('#ambush [data-level="0"] .ambush-map-stars img').count(), 3);
    assert.equal(await page.locator("#ambush .ambush-map-next:not([hidden])").count(), 1);
    assert.equal(await page.locator("#ambush .ambush-map").getAttribute("data-axis"), width > height ? "x" : "y");
    const fit = await page.evaluate(() => {
      const map = document.querySelector("#ambush .ambush-map"),
        sheet = map.querySelector(".ambush-map-sheet");
      return { map: [map.clientWidth, map.clientHeight], sheet: [sheet.offsetWidth, sheet.offsetHeight] };
    });
    // The sheet fills the map across the journey and scrolls along it.
    if (width > height) assert.ok(fit.sheet[1] <= fit.map[1] && fit.sheet[1] > fit.map[1] - 4 && fit.sheet[0] > fit.map[0] * 3, JSON.stringify(fit));
    else assert.ok(fit.sheet[0] <= fit.map[0] && fit.sheet[0] > fit.map[0] - 4 && fit.sheet[1] > fit.map[1] * 3, JSON.stringify(fit));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/ambush-levels-${width}.png` });
    await page.locator('#ambush [data-level="0"]').click();
    assert.ok(await page.locator("#ambush .campaign-board canvas[aria-label]").isVisible());
    await page.locator('#ambush [data-action="level-select"]').click();
    await page.locator(nodes).first().waitFor();
    assert.equal(await page.locator(nodes).count(), 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Ambush world map: zones, revealed levels, stars, legacy unlock migration and level navigation pass on desktop and phone.");
} finally {
  await browser.close();
}
