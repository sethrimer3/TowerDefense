import test from "node:test";
import assert from "node:assert/strict";
import { newSiege, findMatch, settleRaid } from "../src/campaign/siege-progress.ts";
test("Finding and backing out of a preview leaves records unchanged; a committed target cannot reroll", () => {
  const s = newSiege(45),
    before = { mmr: s.mmr, games: s.games, wins: s.wins };
  const first = s.raid.castle.id;
  assert.ok(findMatch(s));
  assert.notEqual(s.raid.castle.id, first);
  assert.deepEqual({ mmr: s.mmr, games: s.games, wins: s.wins }, before);
  assert.equal(s.raid.state, "offered");
  assert.equal(settleRaid(s, false), false);
  const target = JSON.stringify(s.raid);
  s.raid.state = "started";
  assert.equal(findMatch(s), false);
  s.raid.state = "offered";
  assert.equal(JSON.stringify(s.raid), target);
  s.raid.state = "started";
  assert.ok(settleRaid(s, true));
  assert.equal(s.games, 1);
  assert.ok(findMatch(s));
  assert.equal(s.games, 1);
  assert.equal(s.raid.state, "offered");
});
