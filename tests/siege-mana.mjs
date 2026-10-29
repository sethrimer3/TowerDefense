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
    for (const reducedMotion of ["no-preference", "reduce"]) {
      const page = await browser.newPage({ viewport: { width, height }, hasTouch: width === 390, reducedMotion }),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(new URL("tests/siege-entry.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
      await page.waitForFunction(() => window.siegeFixture);
      await page.locator('[data-action="find"]').click();
      await page.locator('[data-action="attack"]').click();
      await page.waitForFunction(() => window.siegeFixture.page.sim.raid.defense.soldiers.length >= 4);
      const counter = page.locator(".siege-mana"),
        button = (spell) => page.locator('[data-spell="' + spell + '"]');
      assert.equal(await counter.innerText(), "1 / 8");
      assert.equal(await button("meteor").isDisabled(), true);
      assert.equal(await button("reinforcements").isDisabled(), true);
      assert.equal(await button("frostNova").isDisabled(), false);
      assert.equal(await button("necromancy").isDisabled(), false);
      assert.equal(await button("frostNova").evaluate((el) => getComputedStyle(el).opacity), "1");
      for (const [spell, cost] of [
        ["meteor", 2],
        ["reinforcements", 3],
        ["frostNova", 1],
        ["necromancy", 1],
      ]) {
        assert.equal(await button(spell).locator(".mana-pips i").count(), cost);
        assert.match(await button(spell).getAttribute("aria-label"), new RegExp(cost + " mana"));
      }
      await page.evaluate(() => {
        const fixture = window.siegeFixture,
          mode = fixture.page.sim,
          r = mode.raid;
        // Keep the render loop, and freeze its simulation while the browser aims.
        fixture.page.paused = true;
        for (let n = 0; n < 4; n++) {
          const guard = r.defense.soldiers.find((s) => s.kind !== "flagBearer" && s.hp > 0),
            attacker = r.attack.soldiers.find((s) => s.kind === "brawler" && s.hp > 0);
          guard.x = 36.5;
          guard.y = 48.5;
          guard.hp = 1;
          attacker.x = 36.8;
          attacker.y = 48.5;
          attacker.path = [];
          attacker.cd = 0;
          attacker.guard = 10; // Isolated fixture: survive nearby native mage splash while demonstrating four kills.
          mode.step(1 / 30);
          if (guard.hp > 0) throw Error("The native melee strike did not defeat the fixture guard");
        }
        fixture.page.frame(performance.now());
      });
      await page.waitForFunction(() => document.querySelector(".siege-mana")?.textContent === "5 / 8");
      assert.equal(await button("meteor").isDisabled(), false);
      assert.equal(await button("reinforcements").isDisabled(), false);
      await page.screenshot({ path: `test-results/siege-mana-ready-${width}-${reducedMotion}.png` });
      const aim = async (spell, point) => {
        await button(spell).click();
        const at = await page.evaluate(([x, y]) => window.siegeFixture.page.renderer.toClient(x, y), point);
        await page.mouse.click(at.x, at.y);
      };
      await aim("meteor", [36, 35]);
      await page.waitForFunction(() => document.querySelector(".siege-mana")?.textContent === "3 / 8");
      assert.ok(await page.evaluate(() => window.siegeFixture.page.sim.engine.meteors.length > 0));
      await aim("reinforcements", [36, 46]);
      await page.waitForFunction(() => document.querySelector(".siege-mana")?.textContent === "0 / 8");
      assert.ok(await page.evaluate(() => window.siegeFixture.page.sim.engine.drops.length > 0));
      for (const spell of ["meteor", "reinforcements", "frostNova", "necromancy"]) assert.equal(await button(spell).isDisabled(), true);
      assert.deepEqual(
        await page.evaluate(() => {
          const s = window.siegeFixture.page.sim.engine;
          return [s.meteorReadyAt, s.frostReadyAt, s.necroReadyAt, s.reinforceReadyAt];
        }),
        [0, 0, 0, 0],
      );
      const bar = await page.locator(".strike-bar").boundingBox(),
        board = await page.locator(".campaign-board").boundingBox();
      assert.ok(bar.x >= board.x && bar.x + bar.width <= board.x + board.width + 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `test-results/siege-mana-${width}-${reducedMotion}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  console.log("Siege mana: native melee kills, cost pips, affordability, Meteor/Reinforcements spending and Reduce Motion pass on desktop and phone.");
} finally {
  await browser.close();
}
