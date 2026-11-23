import assert from "node:assert/strict";
import test from "node:test";
import { DRIFT_MS, GameClock, headerTime, startTime } from "../src/trusted-time.ts";
import { decode, defaults } from "../src/save.ts";

const HOUR = 60 * 60 * 1000;
/** A fake device: monotonic time and a device clock the player can set. */
function device(start = 1_000_000) {
  const d = { mono: 0, wall: start };
  return { d, src: { mono: () => d.mono, device: () => d.wall }, pass: (ms: number) => { d.mono += ms; d.wall += ms; } };
}

test("the clock holds at the last time seen until a server vouches for the time", () => {
  const { d, src, pass } = device();
  const clock = new GameClock(5000, src);
  assert.equal(clock.now(), 5000);
  pass(2000);
  assert.equal(clock.now(), 7000);
  // Setting the device clock forward a week while the game runs changes nothing.
  d.wall += 7 * 24 * HOUR;
  assert.equal(clock.now(), 7000);
  assert.ok(clock.drift() > DRIFT_MS);
  // The server says three hours passed: that much is paid, and drift settles.
  assert.equal(clock.trust(7000 + 3 * HOUR), 3 * HOUR);
  assert.ok(clock.verified);
  assert.equal(clock.now(), 7000 + 3 * HOUR);
  assert.equal(clock.drift(), 0);
});

test("a clock set forward and back again pays nothing until real time catches up", () => {
  const { src, pass } = device();
  // The save saw a time 10 h ahead of real time (an old cheat, or a wrong clock).
  const real = 100 * HOUR, clock = new GameClock(real + 10 * HOUR, src);
  assert.equal(clock.trust(real), 0);
  assert.equal(clock.now(), real + 10 * HOUR);
  pass(HOUR);
  assert.equal(clock.trust(real + HOUR), 0);
  assert.equal(clock.now(), real + 11 * HOUR);
  // Once real time passes what was seen, idle time flows again.
  assert.equal(clock.trust(real + 15 * HOUR), 4 * HOUR);
});

test("a new game's provisional start from the device clock is set back by the server once", () => {
  const { src, pass } = device();
  const clock = new GameClock(50 * HOUR, src, true);
  assert.equal(clock.trust(40 * HOUR), 0);
  assert.equal(clock.now(), 40 * HOUR);
  pass(1000);
  assert.equal(clock.trust(39 * HOUR), 0);
  assert.equal(clock.now(), 40 * HOUR + 1000);
});

test("nonsense from a server is ignored", () => {
  const { src } = device();
  const clock = new GameClock(5000, src);
  assert.equal(clock.trust(NaN), 0);
  assert.ok(!clock.verified);
  assert.equal(clock.now(), 5000);
});

test("the clock starts from the save's latest time, its last save, or (new) the device", () => {
  assert.equal(startTime(300, 200, 100), 300);
  assert.equal(startTime(0, 200, 100), 200);
  assert.equal(startTime(0, 0, 100), 100);
});

test("an HTTP Date header reads as UTC ms, whatever the time zone", () => {
  const ms = Date.UTC(2026, 10, 23, 21, 38, 16);
  assert.equal(headerTime("Mon, 23 Nov 2026 21:38:16 GMT"), ms + 500);
  assert.equal(headerTime("Mon, 23 Nov 2026 21:38:16 GMT", 400), ms + 700);
  assert.ok(Number.isNaN(headerTime(null)));
  assert.ok(Number.isNaN(headerTime("not a date")));
});

test("the latest time seen survives a save", () => {
  assert.equal(defaults().clockSeen, 0);
  const save = defaults();
  save.clockSeen = 1_234_567;
  assert.equal(decode(JSON.stringify(save)).clockSeen, 1_234_567);
  assert.equal(decode(JSON.stringify({ ...save, clockSeen: "soon" })).clockSeen, 0);
});
