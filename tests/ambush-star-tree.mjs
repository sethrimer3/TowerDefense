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
    await page.addInitScript(() =>
      localStorage.setItem(
        "towerdefense.v1",
        JSON.stringify({
          version: 7,
          profile: { name: "Star Warden", flag: { base: 3, layers: [] } },
          settings: { reduceMotion: true },
          campaigns: { ambush: { stars: { "moss-1": 3, "moss-2": 3, "moss-3": 3 } } },
        }),
      ),
    );
    await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
    await page.waitForFunction(() => document.querySelector('nav [data-tab="defend"]')?.dataset.mode === "defend");
    await page.locator('nav [data-tab="defend"]').click();
    await page.locator("[data-star-tree]").click();
    const tree = page.locator(".ambush-star-dialog");
    assert.ok(await tree.isVisible());
    await tree.locator('[data-node="warChest:1"]').click();
    await tree.locator("[data-star-action]").click();
    assert.equal(await tree.locator("[data-pool]").innerText(), "7 stars available");
    await tree.locator('[data-node="headStart:1"]').click();
    await tree.locator("[data-star-action]").click();
    assert.equal(await tree.locator("[data-pool]").innerText(), "4 stars available");
    assert.equal(await tree.locator(".ug-motes").count(), 1);
    assert.equal(await tree.locator(".magic-circle").count(), 1);
    await page.screenshot({ path: "test-results/ambush-star-tree-" + width + ".png" });
    await tree.locator("[data-close]").click();
    assert.equal(await tree.count(), 0);
    await page.locator('#ambush [data-level="0"]').click();
    assert.equal(await page.locator("[data-star-tree]").count(), 0);
    assert.equal(await page.locator("#ambush-gold").innerText(), "550");
    await page.locator('#ambush [data-action="start"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdefense.v1")).campaigns.ambush.attempts["moss-1"]), 1);
    await page.locator('[data-action="level-select"]').click();
    await page.locator("[data-star-tree]").click();
    await tree.locator('[data-node="warChest:1"]').click();
    await tree.locator("[data-star-action]").click();
    assert.equal(await tree.locator("[data-pool]").innerText(), "6 stars available");
    await tree.locator("[data-respec]").click();
    assert.equal(await tree.locator("[data-pool]").innerText(), "9 stars available");
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("towerdefense.v1")).campaigns.ambush.ranks), undefined);
    await tree.locator("[data-close]").click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Native living star tree, buying, free buildings, attempt save, undo and respec pass at both widths.");
} finally {
  await browser.close();
}
