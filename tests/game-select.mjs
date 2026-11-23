// The start screen: Defend+Siege or Ambush, each its own game. Isolated contexts.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE, headless: true }
  : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome", headless: true });
const base = process.env.TEST_URL || "http://127.0.0.1:5173/";
try {
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: width === 390 }), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => localStorage.setItem("towerdefense.v1", JSON.stringify({
      version: 7, profile: { name: "Start Warden", flag: { base: 3, layers: [] } }, settings: { reduceMotion: true, soundOff: true },
    })));
    await page.goto(new URL("?game=choose", base).href);
    const screen = page.locator("#game-select");
    await screen.waitFor();
    assert.deepEqual(await screen.locator("[data-game]").allInnerTexts(), ["Defend+Siege", "Ambush"]);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: `test-results/game-select-${width}.png` });

    // Ambush alone: its tab never cycles, and the realm's tabs are gone.
    await screen.locator('[data-game="ambush"]').click();
    assert.equal(await screen.count(), 0);
    const combat = page.locator('nav [data-tab="defend"]');
    assert.equal(await page.locator("section.page.active").getAttribute("id"), "ambush");
    assert.equal(await combat.innerText(), "Ambush");
    for (const id of ["mine", "library", "tiles", "siege", "shop"]) assert.equal(await page.locator(`nav [data-tab="${id}"]`).isVisible(), false, id);
    await combat.click();
    assert.equal(await page.locator("section.page.active").getAttribute("id"), "ambush");
    await page.screenshot({ path: `test-results/game-select-ambush-${width}.png` });

    // Back through Settings to Defend+Siege.
    await page.locator('nav [data-tab="settings"]').click();
    await page.locator("#choose-game").click();
    await screen.locator('[data-game="defendSiege"]').click();
    assert.equal(await page.locator("section.page.active").getAttribute("id"), "defend");
    for (const id of ["mine", "library", "tiles"]) assert.equal(await page.locator(`nav [data-tab="${id}"]`).isVisible(), true, id);
    if (width > height) {
      // Landscape: Siege has its own tab and Defend never cycles.
      assert.equal(await combat.innerText(), "Defend");
      for (const id of ["siege", "shop"]) assert.equal(await page.locator(`nav [data-tab="${id}"]`).isVisible(), true, id);
      await page.locator('nav [data-tab="siege"]').click();
      assert.equal(await page.locator("section.page.active").getAttribute("id"), "siege");
    } else {
      assert.equal(await combat.innerText(), "Defend --> Siege");
      await combat.click();
      assert.equal(await combat.innerText(), "Siege --> Defend");
      await combat.click();
      assert.equal(await combat.innerText(), "Defend --> Siege");
    }

    // The address can skip the screen.
    await page.goto(new URL("?game=ambush", base).href);
    await combat.waitFor();
    assert.equal(await page.locator("#game-select").count(), 0);
    assert.equal(await page.locator("section.page.active").getAttribute("id"), "ambush");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Start screen, Ambush as its own game, the way back through Settings and Defend+Siege cycling pass on desktop and phone.");
} finally {
  await browser.close();
}
