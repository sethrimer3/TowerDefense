// Characterization screenshots for the board renderer. The fixed scenes of
// tests/render-scenes.ts (Tower, dim Tower, Delve, sprites off, outside,
// reduced motion, and decor: a crate stepped on, a pool waded into, tall grass
// walked through; plus the Defend board in building mode, a rainy battle, a
// night boss wave and a stormy night zoomed in, and its palette icons) are
// drawn at fixed timestamps with seeded randomness, and each canvas's pixels are hashed
// against tests/fixtures/render.golden.json. A scene is only hashed once every
// image the app asked for has loaded and a capture asks for no more, and then
// it must draw the same twice. Canvases are kept on the CPU (Chrome would
// otherwise move them there partway through, after enough pixel reads), so
// runs agree exactly; pixels can still differ between browsers and machines,
// so regenerate it with UPDATE_GOLDEN=1 on the code *before* a refactor, then
// run without it after. Baseline PNGs go to test-results/render-golden/ and
// current ones to test-results/render/, with a pixel-difference count for any
// mismatch.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const UPDATE = process.env.UPDATE_GOLDEN === "1";
const GOLDEN = new URL("./fixtures/render.golden.json", import.meta.url);
const BASELINE_DIR = "test-results/render-golden";
const OUT_DIR = "test-results/render";

const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "msedge" });
const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
// Every image the app asks for, so a capture can wait until all of them have
// loaded (or failed) instead of guessing how long loading takes.
await page.addInitScript(() => {
  const Real = window.Image, images = (window.__images = []);
  window.Image = function Image(...args) {
    const img = new Real(...args);
    images.push(img);
    return img;
  };
  window.Image.prototype = Real.prototype;
  // Chrome moves a canvas from the GPU to the CPU after enough pixel reads,
  // and the two draw gradients and blends a little differently, so frames
  // would change partway through a run. Keep every canvas on the CPU from
  // the start: the same pixels every run, and less tied to the GPU.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return getContext.call(this, type, type === "2d" ? { ...options, willReadFrequently: true } : options);
  };
});
await page.goto(process.env.TEST_URL || "http://127.0.0.1:5173/");
await page.evaluate(() => document.fonts.ready);

const shots = await page.evaluate(async () => {
  const { JOBS } = await import("/tests/render-scenes.ts");

  const board = document.createElement("canvas");
  board.style.cssText = "position:fixed;left:0;top:0;width:408px;height:408px";
  const defendCanvas = document.createElement("canvas");
  defendCanvas.style.cssText = "position:fixed;left:0;top:0";
  document.body.append(board, defendCanvas);
  const pixelsOf = (cv) => {
    const c = cv.getContext("2d");
    return { pixels: c.getImageData(0, 0, cv.width, cv.height).data.slice(), png: cv.toDataURL("image/png") };
  };
  /** One job's frames: its pixels at each grab. */
  const capture = (job) => {
    const cv = job.canvas === "board" ? board : job.canvas === "defend" ? defendCanvas : document.createElement("canvas");
    const out = {};
    job.play(cv, (frame) => (out[frame] = pixelsOf(cv)));
    return out;
  };
  const hash = async (pixels) => {
    const digest = await crypto.subtle.digest("SHA-256", pixels);
    return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  /** Waits until every image asked for so far has loaded or failed. */
  const settle = async () => {
    for (let pending; (pending = window.__images.filter((img) => !img.complete)).length; )
      await Promise.all(pending.map((img) => img.decode().catch(() => {})));
  };
  const hashShot = async (shot) => {
    const hashes = {};
    for (const [frame, { pixels }] of Object.entries(shot)) hashes[frame] = await hash(pixels);
    return hashes;
  };

  const results = {};
  for (const job of JOBS) {
    const { name } = job, run = () => capture(job);
    // Art loads asynchronously, and a scene may only ask for some of it
    // partway through. A capture counts once every image was settled before
    // it began and it asked for no new ones: then all its art was drawn.
    let shot = null;
    for (let attempt = 0; attempt < 10 && !shot; attempt++) {
      await settle();
      const asked = window.__images.length, candidate = run();
      if (window.__images.length === asked) shot = candidate;
    }
    if (!shot) throw Error(`${name}: kept asking for new art`);
    const hashes = await hashShot(shot);
    // With its art in place a scene draws the same every time; a difference
    // here is a real nondeterminism bug, not loading.
    const again = await hashShot(run());
    const drift = Object.keys(hashes).filter((frame) => hashes[frame] !== again[frame]);
    if (drift.length) throw Error(`${name}: drew differently twice with all art loaded (${drift.join(", ")})`);
    for (const [frame, h] of Object.entries(hashes)) results[`${name}.${frame}`] = { hash: h, png: shot[frame].png };
  }
  board.remove();
  defendCanvas.remove();
  return results;
});

const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");
const hashes = Object.fromEntries(Object.entries(shots).map(([k, v]) => [k, v.hash]));
mkdirSync(OUT_DIR, { recursive: true });
for (const [k, v] of Object.entries(shots)) writeFileSync(`${OUT_DIR}/${k}.png`, png(v.png));

if (UPDATE || !existsSync(GOLDEN)) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  for (const [k, v] of Object.entries(shots)) writeFileSync(`${BASELINE_DIR}/${k}.png`, png(v.png));
  writeFileSync(GOLDEN, JSON.stringify(hashes, null, 2) + "\n");
  console.log(`Wrote ${Object.keys(hashes).length} render hashes to the golden file.`);
} else {
  const golden = JSON.parse(readFileSync(GOLDEN, "utf8"));
  const changed = Object.keys({ ...golden, ...hashes }).filter((k) => golden[k] !== hashes[k]);
  for (const k of changed) {
    const base = `${BASELINE_DIR}/${k}.png`;
    let detail = "no local baseline PNG to compare";
    if (existsSync(base) && shots[k]) {
      const diff = await page.evaluate(async ([a, b]) => {
        const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
        const [x, y] = await Promise.all([load(a), load(b)]);
        const read = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0); return ctx.getImageData(0, 0, c.width, c.height).data; };
        const p = read(x), q = read(y);
        if (p.length !== q.length) return "different sizes";
        let n = 0, max = 0;
        for (let i = 0; i < p.length; i += 4) {
          const d = Math.max(Math.abs(p[i] - q[i]), Math.abs(p[i + 1] - q[i + 1]), Math.abs(p[i + 2] - q[i + 2]), Math.abs(p[i + 3] - q[i + 3]));
          if (d) { n++; max = Math.max(max, d); }
        }
        return `${n} pixels differ (max channel delta ${max})`;
      }, [`data:image/png;base64,${readFileSync(base).toString("base64")}`, shots[k].png]);
      detail = diff;
    }
    console.error(`${k}: ${golden[k] ?? "missing"} -> ${hashes[k] ?? "missing"} (${detail})`);
  }
  if (changed.length) {
    await browser.close();
    throw Error(`${changed.length} render frames changed; see ${OUT_DIR}/ vs ${BASELINE_DIR}/`);
  }
  console.log(`All ${Object.keys(hashes).length} render frames match the golden hashes (${createHash("sha256").update(JSON.stringify(hashes)).digest("hex").slice(0, 8)}).`);
}
if (errors.length) throw Error(errors.join("\n"));
await browser.close();
