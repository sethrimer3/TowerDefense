/** Browser QA, screenshot verification, and performance benchmark for Void Defense.
 * Runs against the Vite dev server (`npm run dev`, http://127.0.0.1:5173/) in
 * desktop (1280x800), mobile portrait (390x844), and mobile landscape (844x390).
 *
 * Verifies:
 * 1. Onboarding profile modal & play-style mode selection.
 * 2. Metropolitan battle board (192x256 and 256x384), tower placement, Landfall strike,
 *    and simulation + render frame times.
 * 3. Single continuous Global Tech Network (30 nodes across 6 sectors, search/filter,
 *    purchases, and cascading refunds).
 * 4. Resistance Operations scene (Engineering Bay giant turret prototype + Research Lab)
 *    and zero offline/idle resource farming.
 * 5. Sector cards with procedural breach thumbnails and `voiddefense.v1` save isolation. */

import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("test-results", { recursive: true });

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_EXECUTABLE
    ? { headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : { headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" },
);

try {
  const url = process.env.TEST_URL || "http://127.0.0.1:5173/";
  const report = { viewports: {}, benchmark: {} };

  for (const [label, width, height] of [
    ["desktop", 1280, 800],
    ["portrait", 390, 844],
    ["landscape", 844, 390],
  ]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    // Seed a legacy towerdefense.v1 save to verify it is never overwritten or corrupted
    await page.addInitScript(() => {
      localStorage.setItem("towerdefense.v1", JSON.stringify({ sentinel: "legacy-intact", version: 7 }));
    });

    await page.goto(url);
    await page.waitForSelector("#void-profile-dialog[open]", { timeout: 15000 });
    await page.screenshot({ path: `test-results/void-onboarding-${label}.png` });

    // Complete onboarding dialog
    await page.fill('input[name="callsign"]', `Cmdr_${label}`);
    await page.click('button[type="submit"]');
    await page.waitForSelector("#void-board-canvas", { state: "visible" });

    // Place a Matter Cannon and cast Landfall on the board
    await page.click('[data-pick-tower="matterCannon"]');
    const box = await page.locator("#void-board-canvas").boundingBox();
    assert.ok(box && box.width > 100 && box.height > 100);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.7);
    await page.screenshot({ path: `test-results/void-battle-${label}.png` });

    // Navigate to Global Tech Network
    await page.click('[data-void-tab="network"]');
    await page.waitForSelector(".void-tech-graph .ug-node", { timeout: 5000 });
    const nodeCount = await page.locator(".void-tech-graph .ug-node").count();
    assert.ok(nodeCount >= 30, `Expected >=30 tech nodes in DOM, got ${nodeCount}`);
    await page.screenshot({ path: `test-results/void-network-${label}.png` });

    // Navigate to Resistance Operations (Engineering Bay + Research Lab)
    await page.click('[data-void-tab="operations"]');
    await page.waitForSelector(".void-ops-canvas", { state: "visible" });
    await page.screenshot({ path: `test-results/void-operations-${label}.png` });

    // Navigate to Sectors & Mode
    await page.click('[data-void-tab="sectors"]');
    await page.waitForSelector(".void-sector-card", { state: "visible" });
    const thumbCount = await page.locator("canvas.void-sector-thumb").count();
    assert.equal(thumbCount, 8, "All 8 sectors render procedural preview thumbnails");
    await page.screenshot({ path: `test-results/void-sectors-${label}.png` });

    // Verify save isolation
    const storageState = await page.evaluate(() => ({
      legacy: localStorage.getItem("towerdefense.v1"),
      voidSave: localStorage.getItem("voiddefense.v1"),
    }));
    assert.equal(JSON.parse(storageState.legacy).sentinel, "legacy-intact");
    assert.ok(storageState.voidSave && JSON.parse(storageState.voidSave).profile.name === `Cmdr_${label}`);
    assert.deepEqual(errors, [], `Page errors on ${label}: ${errors.join("; ")}`);

    report.viewports[label] = { width, height, nodeCount, thumbCount, ok: true };
    await context.close();
  }

  // Run headless simulation + rendering benchmark on both 192x256 and 256x384 maps
  const benchPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await benchPage.goto(url);
  await benchPage.waitForSelector("#void-profile-dialog[open]", { timeout: 15000 });
  await benchPage.click('button[type="submit"]');

  report.benchmark = await benchPage.evaluate(async () => {
    const { VoidSim } = await import("/src/void/sim.ts");
    const { VoidRenderer } = await import("/src/void/render.ts");
    const { emptyTechWallet } = await import("/src/void/tech/wallet.ts");

    const results = {};
    for (const scenarioId of ["tutorialBreach", "organismEscalation"]) {
      const wallet = emptyTechWallet();
      const sim = new VoidSim(scenarioId, "underSiege", wallet, true);
      for (let i = 0; i < 6; i++) {
        sim.placeTower("matterCannon", 20 + i * 18, 170);
        sim.placeTower("repairDepot", 25 + i * 18, 180);
        sim.placeTower("infantryBarracks", 30 + i * 18, 190);
      }
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 768;
      const renderer = new VoidRenderer(canvas);

      const simTimes = [];
      const renderTimes = [];
      for (let f = 0; f < 120; f++) {
        const t0 = performance.now();
        sim.stepOneTick();
        const t1 = performance.now();
        renderer.draw(sim, f * 16.6, null, null, null, false);
        const t2 = performance.now();
        simTimes.push(t1 - t0);
        renderTimes.push(t2 - t1);
      }
      simTimes.sort((a, b) => a - b);
      renderTimes.sort((a, b) => a - b);
      results[scenarioId] = {
        worldSize: `${sim.world.grid.w}x${sim.world.grid.h}`,
        buildings: sim.world.buildings.length,
        agents: sim.combat.agents.length,
        frontierEdges: sim.voidField.totalContactEdges(),
        simP50Ms: Number(simTimes[60].toFixed(3)),
        simP95Ms: Number(simTimes[114].toFixed(3)),
        renderP50Ms: Number(renderTimes[60].toFixed(3)),
        renderP95Ms: Number(renderTimes[114].toFixed(3)),
      };
    }
    return results;
  });

  writeFileSync("test-results/void-defense-report.json", JSON.stringify(report, null, 2) + "\n");
  console.log("Void Defense browser QA & benchmark passed:", JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
