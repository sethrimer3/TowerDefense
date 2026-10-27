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
    assert.equal(await page.locator('[data-action="auto"]').isChecked(), false);
    assert.equal(await page.locator("#ambush-health-label").innerText(), "Outpost 1");
    await page.evaluate(() => {
      const f = window.nativeModes,
        p = f.spot("archerTower");
      f.ambush.sim.placeAt("archerTower", p.qx, p.qy);
    });
    await page.locator('#ambush [data-action="start"]').click();
    assert.ok((await page.locator("#ambush .campaign-status").innerText()).includes("1/20"));
    await page.locator('#ambush [data-action="auto"]').check();
    assert.ok(await page.evaluate(() => window.nativeModes.save.campaigns.ambush.autoSend));
    await page.locator('#ambush [data-action="speed"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.save.defend.battleSpeed), 2);
    await page.locator('#ambush [data-action="side"]').click();
    assert.equal(await page.locator("#ambush .side-open").count(), 0);
    await page.locator('#ambush [data-action="side"]').click();
    await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim,
        p = s.outposts.posts[0];
      s.engine.spawnAuxiliary("orc", p.rect.x + 2, p.rect.y + 2);
      for (const id of p.houses) s.engine.damageBuilding(id, s.engine.hp[id] * 2);
      s.outposts.update();
    });
    await page.waitForFunction(() => document.querySelector("#ambush-health-label").textContent === "Outpost 2");
    assert.equal(await page.locator(".star-lost").count(), 1);
    await page.screenshot({ path: "test-results/ambush-hud-" + width + ".png" });
    await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim;
      s.phase = "won";
      window.nativeModes.ambush.frame(performance.now());
    });
    assert.equal(await page.locator('.ambush-result [data-action="next"]').isVisible(), true);
    assert.equal(await page.evaluate(() => window.nativeModes.save.campaigns.ambush.stars["moss-1"]), 2);
    await page.screenshot({ path: "test-results/ambush-victory-" + width + ".png" });
    await page.locator('.ambush-result [data-action="retry"]').click();
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.phase), "build");
    await page.evaluate(() => {
      const s = window.nativeModes.ambush.sim;
      s.engine.damageBuilding(s.engine.keepId, 1e9);
      s.phase = "lost";
      window.nativeModes.ambush.frame(performance.now());
    });
    assert.equal(await page.locator(".ambush-result h2").innerText(), "Defeat");
    assert.equal(await page.locator('.ambush-result [data-action="next"]').isVisible(), false);
    assert.equal(await page.evaluate(() => window.nativeModes.save.campaigns.ambush.stars["moss-1"]), 2);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Twenty-wave HUD, health transition, saved auto/speed and victory/defeat controls pass at both widths.");
} finally {
  await browser.close();
}
