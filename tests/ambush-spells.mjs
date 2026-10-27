import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(new URL("tests/campaign-native.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.nativeModes);
    await page.evaluate(() => {
      const f = window.nativeModes,
        s = f.ambush.sim,
        p = f.spot("archerTower");
      s.engine.bonuses.meteor = { path: "starfall", rank: 0 };
      s.placeAt("archerTower", p.qx, p.qy);
      s.send();
      f.ambush.render();
    });
    const button = page.locator('#ambush .strike-bar [data-spell="meteor"]');
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "true");
    await button.click();
    assert.equal(await button.getAttribute("aria-pressed"), "false");
    await button.click();
    const board = await page.locator("#ambush canvas[aria-label]").boundingBox();
    await page.mouse.move(board.x + board.width * 0.5, board.y + board.height * 0.4);
    assert.ok(await page.evaluate(() => window.nativeModes.ambush.spellBar.overlay(window.nativeModes.ambush.sim.engine)?.spell.look === "meteor"));
    await page.screenshot({ path: "test-results/ambush-strike-aim-" + width + ".png" });
    await page.mouse.click(board.x + board.width * 0.5, board.y + board.height * 0.4);
    assert.ok(await button.isDisabled());
    await page.goto(new URL("tests/defend-stress.html?manual&enemies=30", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
    await page.waitForFunction(() => window.stressPage);
    await page.evaluate(() => {
      window.stressSim.bonuses = { ...window.stressSim.bonuses, meteor: { path: "starfall", rank: 0 } };
      window.stressPage.updateSkillCooldowns();
    });
    const native = page.locator('#defend-board .strike-bar [data-spell="meteor"]');
    await native.click();
    await page.keyboard.press("Escape");
    assert.equal(await native.getAttribute("aria-pressed"), "false");
    await native.click();
    const b = await page.locator("#defend-canvas").boundingBox();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    assert.equal(await page.evaluate(() => window.stressSim.meteors.length), 1);
    await page.evaluate(() => window.stressPage.updateSkillCooldowns());
    assert.ok(await native.isDisabled());
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Shared strike bar selects, cancels, aims and casts native spells in Ambush and Defend at both widths.");
} finally {
  await browser.close();
}
