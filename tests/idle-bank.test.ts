import assert from "node:assert/strict";
import test from "node:test";
import { HOUR_MS, MAX_AWAY_MS } from "../src/away.ts";
import { AD_COOLDOWN_MS, adReady, adWatched, bankIdle, drawIdle, idleLabel, MAX_BANK_MS } from "../src/idle-bank.ts";
import { decode, defaults } from "../src/save.ts";
import { decodeSettings } from "../src/settings.ts";

test("idle time reads as a short golden figure", () => {
  assert.equal(idleLabel(24 * 60000), "+24m");
  assert.equal(idleLabel(6 * 60000 + 59000), "+6m");
  assert.equal(idleLabel(3 * HOUR_MS), "+3h");
  assert.equal(idleLabel(3 * HOUR_MS + 20 * 60000), "+3h 20m");
  assert.equal(idleLabel(-5), "+0m");
});

test("a workshop out of the realm banks idle time, kindly past a day, and draws it back under its own cap", () => {
  const bank = { mine: 0, library: 0 };
  bankIdle(bank, "mine", 30 * HOUR_MS);
  bankIdle(bank, "mine", 10 * HOUR_MS);
  assert.equal(bank.mine, 40 * HOUR_MS);
  assert.equal(bank.library, 0);
  bankIdle(bank, "library", 100 * 24 * HOUR_MS);
  assert.equal(bank.library, MAX_BANK_MS);
  // Back in the realm with 20 h already owed: only 4 h fit, the rest waits.
  assert.equal(drawIdle(bank, "mine", 20 * HOUR_MS), MAX_AWAY_MS - 20 * HOUR_MS);
  assert.equal(bank.mine, 36 * HOUR_MS);
  assert.equal(drawIdle(bank, "mine", MAX_AWAY_MS), 0);
  assert.equal(drawIdle(bank, "mine", 0), MAX_AWAY_MS);
  assert.equal(bank.mine, 12 * HOUR_MS);
});

test("the ad waits out its cooldown", () => {
  const shop = { adReadyAt: 0, owned: false };
  assert.ok(adReady(shop, 1000));
  adWatched(shop, 1000);
  assert.ok(!adReady(shop, 1000 + AD_COOLDOWN_MS - 1));
  assert.ok(adReady(shop, 1000 + AD_COOLDOWN_MS));
});

test("the idle bank, the shop and the tab settings survive a save", () => {
  const save = defaults();
  assert.deepEqual(save.idleBank, { mine: 0, library: 0 });
  assert.deepEqual(save.shop, { adReadyAt: 0, owned: false });
  assert.equal(save.settings.adNotify, true);
  assert.equal(save.settings.extraTabs, false);
  save.idleBank.mine = 5 * HOUR_MS;
  save.shop = { adReadyAt: 1234, owned: true };
  save.settings.extraTabs = true;
  save.settings.adNotify = false;
  const back = decode(JSON.stringify(save));
  assert.deepEqual(back.idleBank, { mine: 5 * HOUR_MS, library: 0 });
  assert.deepEqual(back.shop, { adReadyAt: 1234, owned: true });
  assert.equal(back.settings.extraTabs, true);
  assert.equal(back.settings.adNotify, false);
  // Old saves and nonsense decode to the defaults; a bank is capped.
  const old = decode(JSON.stringify({ version: 9, idleBank: { mine: -4, library: 1e15 }, shop: { owned: "yes" } }));
  assert.deepEqual(old.idleBank, { mine: 0, library: MAX_BANK_MS });
  assert.deepEqual(old.shop, { adReadyAt: 0, owned: false });
  assert.equal(decodeSettings({}).adNotify, true);
});
