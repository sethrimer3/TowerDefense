// The Ambush river drawn as the forest lakes are, its current, its fish
// darting away from a walker, and birds startled out of a tree, on desktop
// and phone; still under Reduce Motion. Needs `npm run dev`; no player saves.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
const url = (q = "") => new URL("tests/river-life.html" + q, process.env.TEST_URL || "http://127.0.0.1:5173/").href;
try {
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url());
    await page.waitForFunction(() => window.riverLife);
    await page.waitForTimeout(400);
    const canvas = page.locator("#ambush .campaign-board canvas[aria-label]");
    // The river's water and bank are painted with the lakes' palette.
    const look = await page.evaluate(() => {
      const r = window.riverLife.ambush.renderer;
      return { river: !!window.riverLife.ambush.sim.map.river, fish: r.river.shoal.length };
    });
    assert.ok(look.river && look.fish >= 2, "Old Road has a river with fish");
    const before = await page.evaluate(() => window.riverLife.ambush.renderer.river.shoal.map((f) => [f.x, f.y]));
    await page.waitForTimeout(800);
    const after = await page.evaluate(() => window.riverLife.ambush.renderer.river.shoal.map((f) => [f.x, f.y]));
    assert.ok(after.some(([x, y], k) => Math.abs(x - before[k][0]) + Math.abs(y - before[k][1]) > 0.5), "the fish swim about");
    await canvas.screenshot({ path: `test-results/river-life-${width}.png` });
    // A walker beside a fish frightens it off and down out of sight.
    const scared = await page.evaluate(async () => {
      const a = window.riverLife.ambush, s = a.sim;
      s.phase = "battle";
      const f = a.renderer.river.shoal.find((f) => !f.hidden);
      s.engine.spawnAuxiliary("orc", f.x / 8, f.y / 8 + 0.6);
      await new Promise((r) => setTimeout(r, 250));
      return { scared: a.renderer.river.shoal.some((g) => g.scared || g.hidden) };
    });
    assert.ok(scared.scared, "a fish darts away from the walker");
    // Someone under a roosting tree startles its birds.
    const birds = await page.evaluate(async () => {
      const a = window.riverLife.ambush, forest = a.renderer.forest, t = forest.roosts.find((t) => t.x > 4 && t.x < 68 && t.y > 10 && t.y < 94);
      a.sim.engine.spawnAuxiliary("orc", t.x, t.y);
      for (let k = 0; k < 30 && !forest.birds.count; k++) await new Promise((r) => setTimeout(r, 50));
      return forest.birds.count;
    });
    assert.ok(birds > 0, "birds fly out of the tree");
    await page.waitForTimeout(400);
    await canvas.screenshot({ path: `test-results/river-life-birds-${width}.png` });
    // Reduce Motion: the current and the fish hold still, and no birds fly.
    await page.goto(url("?still"));
    await page.waitForFunction(() => window.riverLife);
    await page.waitForTimeout(300);
    const still = await page.evaluate(async () => {
      const r = window.riverLife.ambush.renderer.river, a = r.shoal.map((f) => [f.x, f.y]);
      await new Promise((res) => setTimeout(res, 500));
      return JSON.stringify(a) === JSON.stringify(r.shoal.map((f) => [f.x, f.y]));
    });
    assert.ok(still, "the fish keep still under Reduce Motion");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("River lake look, current, fleeing fish, startled birds and Reduce Motion checked on desktop and phone.");
} finally {
  await browser.close();
}
