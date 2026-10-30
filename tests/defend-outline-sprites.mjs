// Isolated native stress scene, deterministic simulation and wall clocks.
// TEST_URL may point at an unchanged main checkout for `before` captures.
// PLAYWRIGHT_EXECUTABLE/CHANNEL choose a browser; no player save is read.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const stage = process.argv[2] || "after";
const out = process.env.ART_SCREENSHOT_DIR || "test-results/outline-sprites";
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }
    : { channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" }),
  headless: true,
});
mkdirSync(out, { recursive: true });
try {
  for (const phone of [false, true])
    for (const crisp of [false, true]) {
      const page = await browser.newPage({
        viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 900 },
        deviceScaleFactor: phone ? 2 : 1,
        hasTouch: phone,
      });
      const errors = [];
      page.setDefaultNavigationTimeout(120_000);
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(() => {
        globalThis.__pinnedSeeds = { defend: 3182828918, game: 3887091088 };
        let seed = 9821;
        Math.random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 4294967296;
        };
        performance.now = () => 5000;
      });
      await page.goto(
        `${process.env.TEST_URL || "http://127.0.0.1:5173/"}tests/defend-stress.html?manual&enemies=500&mix=heavy`,
      );
      await page.waitForFunction(() => window.stressPage, null, { timeout: 120_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate((crisp) => {
        const p = window.stressPage;
        p.host.crispZoom = () => crisp;
        p.host.setCrispZoom = () => {};
        p.frameTimes.enabled = false;
        for (let i = 0; i < 90; i++) window.stressSim.update(1 / 60);
        p.draw();
      }, crisp);
      if (stage !== "before")
        await page.evaluate(() => {
          const r = window.stressPage.renderer;
          if (r.crisp && Math.abs((r.px * r.cam.s) / 8 - Math.round((r.px * r.cam.s) / 8)) > 1e-9)
            throw new Error("Crisp art pixels must occupy whole device pixels");
        });
      await page.screenshot({
        path: `${out}/${stage}-${phone ? "phone" : "desktop"}-crisp-${crisp ? "on" : "off"}.png`,
        fullPage: true,
      });
      console.log(stage, phone ? "phone" : "desktop", crisp ? "crisp" : "smooth", errors);
      if (errors.length) throw new Error(errors.join("\n"));
      await page.close();
    }
  if (stage !== "before") {
    const page = await browser.newPage();
    await page.goto((process.env.TEST_URL || "http://127.0.0.1:5173/") + "tests/performance.html");
    await page.evaluate(async () => {
      const { spriteCanvas, drawSprite, withMask, maskMode, rgba } = await import("/src/defend/damage-art.ts");
      const red = rgba(0xc03030),
        ink = rgba(0x0b0907);
      const make = () => {
        const cv = document.createElement("canvas");
        cv.width = cv.height = 40;
        return cv;
      };
      const read = (cv) => new Uint32Array(cv.getContext("2d").getImageData(0, 0, 40, 40).data.buffer);
      const source = spriteCanvas(new Uint32Array([red]), 1, 1);
      for (const scale of [1, 2, 3]) {
        const full = make(),
          body = make(),
          rim = make();
        drawSprite(full.getContext("2d"), source, 12, 12, scale, scale);
        withMask("body", () => drawSprite(body.getContext("2d"), source, 12, 12, scale, scale));
        withMask("rim", () => drawSprite(rim.getContext("2d"), source, 12, 12, scale, scale));
        const a = read(full),
          b = read(body),
          r = read(rim);
        for (let y = 0; y < 40; y++)
          for (let x = 0; x < 40; x++) {
            const i = y * 40 + x,
              on = x >= 12 && x < 12 + scale && y >= 12 && y < 12 + scale;
            const box = x >= 12 - scale && x < 12 + 2 * scale && y >= 12 - scale && y < 12 + 2 * scale;
            if (a[i] !== (on ? red : box ? ink : 0) || b[i] !== (on ? red : 0) || r[i] !== (box && !on ? ink : 0))
              throw new Error(`Source placement or mask shifted at ${scale}, ${x}, ${y}`);
          }
      }
      const joined = make(),
        c = joined.getContext("2d");
      drawSprite(c, spriteCanvas(new Uint32Array([red]), 1, 1, undefined, { joins: ["e"] }), 10, 10, 2, 2);
      drawSprite(c, spriteCanvas(new Uint32Array([red]), 1, 1, undefined, { joins: ["w"] }), 12, 10, 2, 2);
      const a = read(joined);
      for (let y = 10; y < 12; y++)
        for (let x = 10; x < 14; x++) if (a[y * 40 + x] !== red) throw new Error("A joined edge acquired a black seam");
      try {
        withMask("rim", () => {
          throw new Error("probe");
        });
      } catch {}
      if (maskMode() !== null) throw new Error("Mask state leaked after an exception");
    });
    console.log("Outside rings, body/rim masks, anchors and joined edges passed at 1×, 2× and 3×.");
    await page.close();
  }
} finally {
  await browser.close();
}
