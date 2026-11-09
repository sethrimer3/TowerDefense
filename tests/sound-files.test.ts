import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { BEDS, blendLoop, ONE_SHOTS } from "../src/sound-files.ts";

const ROOT = new URL("../public/assets/sounds/", import.meta.url);

test("every listed sound has its file, and every file is listed", () => {
  const listed = new Set([...Object.values(ONE_SHOTS).flat(), ...Object.values(BEDS)].map((p) => `${p}.mp3`));
  for (const path of listed) assert.ok(existsSync(new URL(path, ROOT)), `missing ${path}`);
  const files = readdirSync(ROOT, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".mp3"))
    .map((d) => `${d.parentPath.slice(ROOT.pathname.length).replace(/^\/|\/$/g, "")}/${d.name}`.replace(/^\//, ""));
  for (const f of files) assert.ok(listed.has(f), `unused ${f}`);
});

test("a cross-faded loop runs from its end into its start without a jump", () => {
  // A wave whose pitch drifts, so its end doesn't line up with its start.
  const n = 5000, f = 400, src = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) src[i] = Math.sin((phase += 0.05 + i * 1e-6));
  const len = n - f, dst = src.slice(0, len);
  blendLoop(dst, src, len, f);
  const step = (a: number, b: number) => Math.abs(a - b);
  let worst = 0;
  for (let i = 1; i < len; i++) worst = Math.max(worst, step(dst[i], dst[i - 1]));
  // The wrap from the last sample to the first is no bigger than any other step.
  assert.ok(step(dst[0], dst[len - 1]) <= worst + 1e-3, `seam ${step(dst[0], dst[len - 1])} vs ${worst}`);
  // Past the fade, the loop is the recording untouched.
  assert.equal(dst[f + 10], src[f + 10]);
  // Without the blend the cut would jump.
  assert.ok(step(src[0], src[len - 1]) > worst * 2);
});
