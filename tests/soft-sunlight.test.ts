import test from "node:test";
import assert from "node:assert/strict";
import { shaftAt, shaftField } from "../src/soft-sunlight.ts";

test("a shaft is brightest down its middle and dark outside its halo", () => {
  const mid = shaftAt(10, 30, 10, 0, 6, 100, 0);
  assert.ok(mid > 0.5);
  assert.ok(shaftAt(13, 30, 10, 0, 6, 100, 0) < mid);
  assert.equal(shaftAt(30, 30, 10, 0, 6, 100, 0), 0);
  assert.equal(shaftAt(10, -1, 10, 0, 6, 100, 0), 0);
  assert.equal(shaftAt(10, 101, 10, 0, 6, 100, 0), 0);
});

test("a tilted shaft is sampled along its slant, as it is drawn", () => {
  const tilt = 0.4;
  assert.equal(shaftAt(10 + tilt * 50, 50, 10, 0, 6, 100, tilt), shaftField(0.5, 0));
  assert.ok(shaftAt(10, 50, 10, 0, 6, 100, tilt) < shaftField(0.5, 0));
});

test("window rays follow the shared sun across the room through the visible day", async () => {
  const { skyAtTime, DAY_MS } = await import("../src/daylight.ts");
  const { windowSunlight } = await import("../src/soft-sunlight.ts");
  const phases = [.9, .91, .94, .97, 0, .14, .28, .42, .47];
  const samples = phases.map(p => windowSunlight(skyAtTime(p * DAY_MS))).filter(s => s.strength > 0);
  assert.ok(samples[0].tilt > .8, "morning light reaches the right side of the nave");
  assert.ok(samples.at(-1)!.tilt < -.8, "evening light reaches the left side");
  assert.ok(samples[0].tilt - samples.at(-1)!.tilt > 1.6, "a full sweep, beyond the old local wiggle");
  for (let n = 1; n < samples.length; n++) assert.ok(samples[n].tilt < samples[n - 1].tilt, "sunlight travels one way while the sun is up");
  assert.equal(windowSunlight(skyAtTime(0, "day")).tilt, 0, "noon light points down, matching the sun");
});

test("sun rays fade at the horizon and remain absent through the nighttime return", async () => {
  const { skyAtTime, DAY_MS } = await import("../src/daylight.ts");
  const { windowSunlight } = await import("../src/soft-sunlight.ts");
  assert.ok(windowSunlight(skyAtTime(0, "sunset")).strength > 0);
  for (const phase of ["dusk", "twilight", "night"] as const) assert.equal(windowSunlight(skyAtTime(0, phase)).strength, 0);
  for (const p of [.5, .57, .65, .73, .83]) assert.equal(windowSunlight(skyAtTime(p * DAY_MS)).strength, 0);
  const before = windowSunlight(skyAtTime(DAY_MS - 1)), after = windowSunlight(skyAtTime(0));
  assert.ok(Math.abs(before.tilt - after.tilt) < .001, "the five-minute wrap does not jerk the rays");
});
