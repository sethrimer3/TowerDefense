/** Offline progression assumptions for reproducible native raid calibration.
 * These are test armies, not an estimate of the real player population. */
import { generateNative } from "./castle-generator.ts";
import { castleGame } from "./castle-model.ts";
import { castleDps, defenderDps } from "./castle-dps.ts";
import { SIDE_GROUPS } from "./siege-dps-catalog.ts";
import { CEILING_CASTLE, DPS_MIN } from "./siege-ceiling.ts";
import { infantry } from "./plans.ts";
import { buildNativeCopy } from "./native-build.ts";
import { arrange, type PlacedKind } from "../defend/layout.ts";
import type { PathId } from "../knowledge-paths.ts";
import { rating } from "./siege-rating.ts";
import { ratioPow } from "../exact.ts";
type Choice = [PlacedKind, PathId?, number?];
export const ARMY_POLICY = {
  version: 2,
  bronzeHomes: 8,
  goldHomes: 4,
  platinumHomes: 5,
  diamondHomes: 8,
  masterHomes: 10,
  grandmasterHomes: 20,
  grandmasterPerDivision: 2,
} as const;
function progressionAnchor(value: number) {
  const mmr = rating(value),
    band = Math.min(4, Math.floor(mmr / 600)),
    rank = Math.min(3, Math.max(1, Math.floor((mmr - 400) / 400)));
  let choices: Choice[], count: number;
  if (mmr < 800) {
    choices = [["barracks"], ["archerBarracks"]];
    count = ARMY_POLICY.bronzeHomes;
  } else if (mmr < 2000) {
    choices = [
      ["chapterHouse", "crusaders", rank],
      ["berserkerLodge", "berserkers", rank],
      ["rangerLodge", "rangers", rank],
      ["infernoHall", "pyroclasm", rank],
      ["gunNest", "beltFeed", rank],
      ["phalanx", "testudo", rank],
    ];
    count = mmr < 1200 ? ARMY_POLICY.goldHomes : mmr < 1600 ? ARMY_POLICY.platinumHomes : ARMY_POLICY.diamondHomes;
  } else {
    choices =
      mmr >= 2400
        ? [["shadow"], ["heroHall", "legend", 3], ["shadow"], ["revolutionary"], ["shadow"]]
        : [["heroHall", "legend", 3], ["shadow"], ["revolutionary"], ["gatlingNest", "overdrive", 3], ["valkyriePalace", "cloudborne", 3]];
    count = mmr >= 2400 ? ARMY_POLICY.grandmasterHomes + Math.floor((mmr - 2400) / 80) * ARMY_POLICY.grandmasterPerDivision : ARMY_POLICY.masterHomes;
  }
  const fraction = Math.max(0, Math.min(1, (mmr - 2000) / 400)),
    mean =
      choices.reduce((sum, [kind, path, rank]) => {
        const group = SIDE_GROUPS.find((g) => g.kind === kind),
          side = group ? Object.fromEntries(group.paths.map((p) => [p.id, Math.round(p.ranks.length * fraction)])) : {};
        return sum + defenderDps(kind, band, path, rank, side);
      }, 0) / choices.length;
  return Math.max(DPS_MIN, mean * count);
}
/** Smooth capacity between actual catalog progression anchors, rather than
 * changing the whole assumed army on the tick a shared rank rounds upward. */
export function typicalArmyBudget(value: number) {
  const mmr = Math.min(2720, rating(value)),
    points = [100, 800, 1600, 2000, 2400, 2720];
  let previous = 0;
  const anchors = points.map((m) => {
    const dps = Math.max(progressionAnchor(m), previous * 1.1);
    previous = dps;
    return { mmr: m, dps };
  });
  let i = 0;
  while (i < anchors.length - 2 && mmr > anchors[i + 1].mmr) i++;
  const a = anchors[i],
    b = anchors[i + 1];
  return a.dps * ratioPow(b.dps / a.dps, mmr - a.mmr, b.mmr - a.mmr);
}
function armyCeiling() {
  const c = structuredClone(CEILING_CASTLE);
  c.layout.structures = c.layout.structures.filter((s) => infantry(s.kind));
  c.layout.structures[0] = { ...c.layout.structures[0], kind: "heroHall", path: "legend", rank: 3 };
  c.layout.structures[1] = { ...c.layout.structures[1], kind: "revolutionary" };
  const fitted = arrange(
    c.layout,
    c.layout.structures.slice(0, 2).map((s) => s.uid),
  );
  if (!fitted) throw Error("Native reference army ceiling cannot fit its support core");
  c.layout = fitted;
  for (const group of SIDE_GROUPS) if (!infantry(group.kind as PlacedKind)) delete c[group.key];
  return castleDps(c);
}
const maximum = armyCeiling();
/** The same seeded purchase/upgrade/placement walk as the defender, filtered
 * to infantry. Extra palette copies also use native upgrades and merges. */
export function calibrationArmy(seed: number, mmr: number, budget = typicalArmyBudget(mmr)) {
  const copies = Math.max(1, Math.min(4, Math.ceil(budget / maximum))),
    castle = generateNative(seed, rating(mmr), Math.min(maximum, Math.max(DPS_MIN, budget / copies)), { infantryOnly: true }),
    game = castleGame(seed, castle);
  for (let n = 1; n < copies; n++)
    for (const s of castle.layout.structures) buildNativeCopy(game, s.kind, s.path ? { path: s.path, rank: s.rank! } : undefined);
  return { game, budget, estimatedDps: castleDps(castle) * copies, copies };
}
