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
