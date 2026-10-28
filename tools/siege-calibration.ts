/** One actual native raid; reusable by the CLI, workers and the CI smoke. */
import { calibrationArmy } from "../src/campaign/siege-army.ts";
import { generateCastle, type CastleSnapshot } from "../src/campaign/castles.ts";
import { RULESET } from "../src/campaign/siege-rating.ts";
import { botName } from "../src/campaign/bot-names.ts";
import { generateNative } from "../src/campaign/castle-generator.ts";
import { CampaignSim } from "../src/campaign/sim.ts";
import { castleDps } from "../src/campaign/castle-dps.ts";
import { dpsForMmr } from "../src/campaign/siege-budget.ts";
export function calibrateRaid(mmr: number, seed: number, options: { budget?: number; armyBudget?: number; seconds?: number } = {}) {
  const army = calibrationArmy(seed ^ 0x9e3779b9, mmr, options.armyBudget),
    castleSeed = Math.imul(seed, 7907) >>> 0,
    budget = options.budget ?? dpsForMmr(mmr);
  const castle: CastleSnapshot =
    options.budget === undefined
      ? generateCastle(castleSeed, mmr)
      : {
          id: `calibration-${castleSeed}`,
          revision: 2,
          ruleset: RULESET,
          source: "bot",
          owner: { id: `bot-${castleSeed}`, name: botName(castleSeed) },
          seed: castleSeed,
          mmr,
          castle: generateNative(castleSeed, mmr, budget),
        };
  const sim = new CampaignSim("siege", 0, [], army.game.defend.owned, army.game.defend.levels, castle, army.game);
  if (!sim.start()) throw Error("Empty calibration army");
  const max = Math.min(240, options.seconds ?? 240);
  for (let tick = 0; tick <= max * 30 && sim.phase === "battle"; tick++) sim.step(1 / 30);
  return {
    mmr,
    seed,
    budget,
    castleDps: castleDps(castle),
    armyBudget: army.budget,
    armyDps: army.estimatedDps,
    homes: sim.layout.length,
    phase: sim.phase,
    seconds: Math.round(sim.elapsed * 100) / 100,
    keepHp: sim.raid.defense.keepHp(),
    keepMax: sim.raid.defense.keepMaxHp(),
    attackUnits: sim.raid.attack.soldiers.length,
    defenseUnits: sim.raid.defense.soldiers.length,
  };
}
