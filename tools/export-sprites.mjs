// Saves every piece of art an artist can redraw as a 1:1 PNG with no outline
// (src/defend/art-export.ts) to art/export/, with manifest.json listing each
// one's size and what it is. Needs `npm run dev` running (TEST_URL overrides
// http://127.0.0.1:5173/; PLAYWRIGHT_EXECUTABLE or PLAYWRIGHT_CHANNEL pick
// the browser). Put redrawn PNGs, same names, in art/sprites/.
import { chromium } from "playwright";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const base = process.env.TEST_URL ?? "http://127.0.0.1:5173/";
const out = process.argv[2] ?? "art/export";
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}),
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
});
try {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(120_000);
  await page.goto(new URL("tools/sprite-export.html", base).href);
  await page.waitForFunction(() => window.artExport, null, { timeout: 60_000 });
  const pieces = await page.evaluate(() => window.artExport);
  await rm(out, { recursive: true, force: true });
  for (const p of pieces) {
    const file = join(out, `${p.name}.png`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.from(p.png.split(",")[1], "base64"));
  }
  const manifest = pieces.map(({ name, w, h, about }) => ({ file: `${name}.png`, w, h, about }));
  await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Saved ${pieces.length} sprites to ${out}/`);
} finally {
  await browser.close();
}
