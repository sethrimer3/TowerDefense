// Ambush: a selected building's next upgrades sit on its menu's top bar with
// their gold costs above them; the first tap shows the upgrade's card in the
// sidebar (sprite, cost, "Tap again to buy", description, changes) and the
// second buys it. Desktop and phone (needs dev server).
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
      const p = f.spot("archerTower");
      f.ambush.sim.placeAt("archerTower", p.qx, p.qy);
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
    const menu = page.locator(".building-menu");
    await menu.waitFor();
    await page.waitForTimeout(600); // the menu's opening pop
    assert.equal(await menu.locator('[data-bm="tree"]').count(), 0, "no tree button on top");
    const options = menu.locator(".bm-upgrade");
    assert.equal(await options.count(), 3, "the archer tower's three branches");
    const offers = await page.evaluate(() => window.nativeModes.ambush.sim.upgrades(window.nativeModes.ambush.sim.buildings[0].id).map((o) => o.cost));
    for (let i = 0; i < 3; i++) {
      assert.equal(await options.nth(i).locator(".bm-cost").innerText(), String(offers[i]));
      const cost = await options.nth(i).locator(".bm-cost").boundingBox(), button = await options.nth(i).locator("button").boundingBox();
      assert.ok(cost.y + cost.height <= button.y + 1, "cost sits above its option");
    }
    await options.nth(0).locator("button").click();
    const card = page.locator("#ambush-offer");
    assert.ok(await card.isVisible());
    assert.ok(await page.locator("#ambush-palette").isHidden());
    assert.equal(await card.locator(".ambush-offer-buy").innerText(), "Tap again to buy");
    assert.ok((await card.locator(".ambush-offer-cost").innerText()).includes(String(offers[0])));
    assert.ok(await card.locator(".ambush-offer-face canvas").count());
    assert.ok((await card.locator(".ambush-offer-about").innerText()).length > 5);
    assert.ok((await card.locator(".ambush-offer-changes li").count()) >= 1);
    assert.equal(await page.evaluate(() => window.nativeModes.ambush.sim.buildings[0].kind), "archerTower", "one tap buys nothing");
    assert.equal(await menu.locator(".bm-upgrade button").nth(0).getAttribute("aria-pressed"), "true");
    await page.waitForTimeout(500); // the sidebar widening
    await page.screenshot({ path: "test-results/ambush-top-upgrades-" + width + ".png" });
    const gold = await page.evaluate(() => window.nativeModes.ambush.sim.gold);
    await page.locator(".building-menu .bm-upgrade button").nth(0).click();
    const after = await page.evaluate(() => ({ kind: window.nativeModes.ambush.sim.buildings[0].kind, gold: window.nativeModes.ambush.sim.gold }));
    assert.notEqual(after.kind, "archerTower", "the second tap buys it");
    assert.equal(after.gold, gold - offers[0]);
    assert.ok(await page.locator("#ambush-offer").isHidden());
    assert.ok((await page.locator(".building-menu .bm-upgrade").count()) >= 1, "the next upgrades take its place");
    // Short of gold, the cost turns red and the card says so.
    await page.evaluate(() => { window.nativeModes.ambush.sim.gold = 0; });
    await page.locator(".building-menu .bm-upgrade button").nth(0).click();
    await page.waitForFunction(() => document.querySelector(".building-menu .bm-upgrade")?.classList.contains("short"));
    assert.equal(await page.locator(".ambush-offer-buy").innerText(), "Not enough gold");
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/ambush-top-upgrades-short-" + width + ".png" });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Ambush top bar upgrades: costs above the options, the sidebar card on one tap and a purchase on the second pass at both widths.");
} finally {
  await browser.close();
}
