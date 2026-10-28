import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { generateCastle } from "../src/campaign/castles.ts";
import { generateCastle as legacyCastle } from "../src/campaign/legacy-castles.ts";
import { castleDps } from "../src/campaign/castle-dps.ts";
import { dpsForMmr } from "../src/campaign/siege-budget.ts";
import { fitLayout } from "../src/defend/layout.ts";
import { castleAtForge, castleGame } from "../src/campaign/castle-model.ts";
import { buildNativeCopy } from "../src/campaign/native-build.ts";
import { decodeSiege, newSiege } from "../src/campaign/siege-progress.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { bonuses } from "../src/progression.ts";
import { defaults, decode } from "../src/save.ts";
test("Every division generates native legal upgrades within five percent of its DPS budget", () => {
  const result: Record<string, string> = {},
    totals = [0, 0, 0, 0, 0, 0, 0];
  for (let tier = 1; tier < 35; tier++)
    for (const seed of [1, 45, 7907]) {
      const mmr = Math.max(100, tier * 80),
        c = generateCastle(seed, mmr),
        budget = dpsForMmr(mmr);
      assert.ok(fitLayout(c.castle.layout).ok);
      if (mmr < 2000) assert.ok(c.castle.forgeBand <= Math.floor(mmr / 600));
      assert.ok(Math.abs(castleDps(c) / budget - 1) <= 0.05, JSON.stringify({ seed, mmr, budget, dps: castleDps(c) }));
      const scratch = castleAtForge(seed, c.castle.forgeBand);
      for (const s of c.castle.layout.structures)
        assert.equal(buildNativeCopy(scratch, s.kind, s.path ? { path: s.path, rank: s.rank! } : undefined).copy, s.kind);
      result[seed + ":" + mmr] = createHash("sha256").update(JSON.stringify(c)).digest("hex");
      totals[Math.floor(tier / 5)] += c.castle.layout.structures.length;
    }
  const file = new URL("./fixtures/siege-castles.golden.json", import.meta.url);
  if (process.env.UPDATE_GOLDEN) writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
  assert.deepEqual(result, JSON.parse(readFileSync(file, "utf8")));
  assert.ok(totals[6] > totals[0] * 2);
});
test("Crowded castles and progression boundaries still fill their legal native budget", () => {
  for (const seed of [3672052678, 7954442, 1007])
    for (const mmr of [599, 1199, 1799, 1920, 1999, 2000, 2399, 2719]) {
      const castle = generateCastle(seed, mmr);
      assert.ok(fitLayout(castle.castle.layout).ok, `${seed}:${mmr}`);
      assert.ok(Math.abs(castleDps(castle) / dpsForMmr(mmr) - 1) <= 0.05, `${seed}:${mmr}`);
    }
});
test("Revision-one offers migrate at their seed/MMR, interrupted raids lose once, and completed records survive", () => {
  const old = { ...newSiege(45), raid: { castle: legacyCastle(45, 600), attacker: 600, defender: 600, state: "offered" } };
  old.mmr = 600;
  const offer = decodeSiege(old)!;
  assert.equal(offer.raid.castle.revision, 2);
  assert.equal(offer.raid.castle.seed, 45);
  assert.equal(offer.raid.castle.mmr, 600);
  assert.equal(offer.games, 0);
  assert.deepEqual(offer.raid.castle.castle, generateCastle(45, 600).castle);
  old.raid.state = "started";
  const lost = decodeSiege(old)!;
  assert.equal(lost.games, 1);
  assert.equal(lost.raid.state, "lost");
  assert.equal(lost.mmr, 576);
  assert.deepEqual(decodeSiege(lost), lost);
  old.raid.state = "won";
  old.games = 7;
  old.wins = 4;
  const won = decodeSiege(old)!;
  assert.equal(won.games, 7);
  assert.equal(won.wins, 4);
  assert.equal(won.raid.state, "won");
});
test("Native defense snapshots wear real levels and bonuses; malformed optional ranks stay isolated", () => {
  const game = defaults(),
    c = generateCastle(45, 1600),
    expected = bonuses(castleGame(c.seed, c.castle)),
    sim = new CampaignSim("siege", 0, [], game.defend.owned, game.defend.levels, c, game);
  assert.deepEqual(sim.raid.defense.levels, c.castle.levels);
  assert.deepEqual(sim.raid.defense.bonuses, expected);
  assert.equal(sim.raid.defense.bonuses.towerDamage, expected.towerDamage);
  game.siege = newSiege(45);
  (game.siege.raid.castle.castle as any).shadowRanks = { edge: 999, bleed: 1 };
  const save = decode(JSON.stringify(game));
  assert.equal(save.siege!.raid.castle.castle.shadowRanks?.edge, undefined);
  assert.equal(save.siege!.raid.castle.castle.shadowRanks?.bleed, 1);
});

test("Generated division budgets stay fresh, contiguous and bounded at the native ceiling", async () => {
  const { divisionInputHash, divisionTable } = await import("../tools/siege-division-dps.ts");
  const { DIVISION_INPUT_HASH, DIVISION_DPS } = await import("../src/campaign/siege-division-dps.ts");
  assert.equal(divisionInputHash(), DIVISION_INPUT_HASH);
  assert.deepEqual(divisionTable(), [...DIVISION_DPS]);
  for (let i = 1; i < 35; i++) assert.ok(DIVISION_DPS[i] > DIVISION_DPS[i - 1]);
  assert.equal(dpsForMmr(100), DIVISION_DPS[1]);
  assert.equal(dpsForMmr(3000), DIVISION_DPS[34]);
});
