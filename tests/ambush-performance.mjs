import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("test-results", { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE || "/usr/bin/chromium", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(new URL("tests/ambush-performance.html", process.env.TEST_URL || "http://127.0.0.1:5173/").href);
  await page.waitForFunction(() => window.ambushPerformance);
  const result = await page.evaluate(() => window.ambushPerformance.run());
  writeFileSync("test-results/ambush-performance.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  assert.equal(result.waves, 20);
  assert.equal(result.speed, 3);
  assert.equal(result.ambush.frames, 120);
  assert.ok(result.ambush.peak > 0);
  assert.ok(result.p95Ratio < 2.5, "Ambush page should stay near its paired native engine/renderer workload.");
  assert.deepEqual(errors, []);
  await page.screenshot({ path: "test-results/ambush-performance-390.png" });
} finally {
  await browser.close();
}
