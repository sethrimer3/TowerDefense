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
    const page = await browser.newPage({ viewport: { width, height } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("tests/campaign-native.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.nativeModes);
    const state = await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim;
      s.waves[0].fliers = true;
      return { warning: s.warning, houses: s.outposts.posts.map((p) => p.initial), fences: s.map.buildings.filter((b) => b.fence).length };
    });
    assert.ok(state.warning && state.fences > 0 && state.houses.every((n) => n > 0));
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    });
    await page.screenshot({ path: "test-results/ambush-outposts-warning-" + width + ".png" });
    await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim,
        p = s.outposts.posts[0];
      s.engine.spawnAuxiliary("orc", p.rect.x + 2, p.rect.y + 2);
      for (const id of p.houses) s.engine.damageBuilding(id, s.engine.hp[id] * 2);
      s.outposts.update();
    });
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.stars), 2);
    await page.screenshot({ path: "test-results/ambush-outpost-fallen-" + width + ".png" });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Native outposts, fence art, flier warning and fallen settlement checked at both widths.");
} finally {
  await browser.close();
}
