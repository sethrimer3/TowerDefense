import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium",
  headless: true,
});
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const page = await browser.newPage({
        viewport: { width, height },
        hasTouch: width === 390,
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const url = new URL("tests/siege-entry.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href;
    await page.goto(url);
    await page.waitForFunction(() => window.siegeFixture);
    const q = (action) => page.locator('#siege [data-action="' + action + '"]');
    assert.equal(await page.locator(".siege-ladder h2").innerText(), "Gold III");
    assert.equal(await page.locator(".siege-profile-name").innerText(), "Oak Warden");
    assert.equal(await page.locator(".campaign-board").count(), 0);
    await page.screenshot({
      path: "test-results/siege-entry-" + width + ".png",
    });
    await q("find").click();
    await page.waitForFunction(() => document.querySelector(".siege-castle-preview")?.dataset.ready === "true");
    assert.equal(await page.locator(".siege-reveal").count(), 1);
    assert.equal(await page.locator(".siege-match-identity .profile-flag").count(), 1);
    assert.ok(!/\bBOT\b|defense rating/i.test(await page.locator("#siege").innerText()));
    const previewState = await page.evaluate(() => ({
      mmr: window.siegeFixture.save.siege.mmr,
      games: window.siegeFixture.save.siege.games,
    }));
    await q("back").click();
    assert.deepEqual(
      await page.evaluate(() => ({
        mmr: window.siegeFixture.save.siege.mmr,
        games: window.siegeFixture.save.siege.games,
      })),
      previewState,
    );
    await q("find").click();
    await page.waitForFunction(() => document.querySelector(".siege-castle-preview")?.dataset.ready === "true");
    await page.locator(".siege-match-card").evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    await page.screenshot({
      path: "test-results/siege-match-" + width + ".png",
    });
    await q("attack").click();
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.raid.state), "started");
    assert.equal(await page.locator(".siege-name-plate").count(), 2);
    assert.equal(await page.locator(".siege-name-plate-bottom strong").innerText(), "Oak Warden");
    assert.ok((await page.locator(".siege-name-plate-bottom strong").boundingBox()).height >= 10);
    const top = await page.locator(".siege-name-plate-top").boundingBox(),
      bottom = await page.locator(".siege-name-plate-bottom").boundingBox(),
      board = await page.locator(".campaign-board").boundingBox(),
      bar = await page.locator(".strike-bar").boundingBox();
    assert.ok(top.y >= board.y && top.y + top.height < board.y + board.height / 2);
    assert.ok(bottom.y > board.y + board.height / 2 && bottom.y + bottom.height <= board.y + board.height);
    assert.ok(bottom.y + bottom.height <= bar.y || bottom.x >= bar.x + bar.width || bottom.x + bottom.width <= bar.x);
    await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2);
    assert.ok(await page.locator(".siege-name-plate-top").evaluate((el) => el.classList.contains("aim-under")));
    assert.equal(await page.locator(".siege-name-plate-top").evaluate((el) => getComputedStyle(el).pointerEvents), "none");
    await page.screenshot({
      path: "test-results/siege-plates-" + width + ".png",
    });
    await page.evaluate(() => window.siegeFixture.win());
    assert.equal(await page.locator(".siege-result h2").innerText(), "Victory");
    assert.match(await page.locator(".siege-rank-change").innerText(), /Promoted to Gold II/);
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.games), 1);
    await page.evaluate(() => window.siegeFixture.setMmr(1040));
    await q("find").click();
    await q("attack").click();
    await page.evaluate(() => window.siegeFixture.lose());
    assert.match(await page.locator(".siege-rank-change").innerText(), /Demoted to Gold III/);
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.games), 2);
    await q("find").click();
    await q("attack").click();
    await page.reload();
    await page.waitForFunction(() => window.siegeFixture);
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.games), 3);
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.raid.state), "lost");
    await page.reload();
    await page.waitForFunction(() => window.siegeFixture);
    assert.equal(await page.evaluate(() => window.siegeFixture.save.siege.games), 3);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    await page.waitForFunction(() => window.siegeFixture);
    await q("find").click();
    assert.equal(await page.locator(".siege-reveal").count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Siege entry, match reveal, native preview, Back, Attack, plates, rank changes, reload loss and Reduce Motion pass at both widths.");
} finally {
  await browser.close();
}
