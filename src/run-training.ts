import { whole } from "./whole.ts";
import { RUN_TRAINING_CAP, RUN_TRAINING_PRICES, TRAINING, isStatRow, trainingOpen, type TrainingId, type TrainingRow } from "./config.ts";
import type { RunCore, Save } from "./entities.ts";
import { floorGold, percentPotionChance, potionPercent, reviveChance } from "./loadout.ts";

/** Run training: Training ranks bought with Silver inside a run, on top of
 * the hero's own, lasting only for that run (`run.training`, so undo takes
 * a purchase back with the rest of the run). */

/** Each row's prices so far, unrounded, worked out as they are asked for. */
const prices = new Map<TrainingId, number[]>();

/** What the rank after `bought` ranks bought this run costs in Silver: the
 * schedule's base, raised by each earlier rank's rate in turn,
 * `first` / √(1 + k × (first² / last² − 1) / span) for the k-th, so the
 * rate falls quickly at first and reaches `last` at rank `span`. */
export function silverPrice(id: TrainingId, bought: number) {
  const { base, first, last, span } = RUN_TRAINING_PRICES[id];
  const list = prices.get(id) ?? [base];
  prices.set(id, list);
  const slope = (first * first / (last * last) - 1) / span;
  for (let k = list.length - 1; k < bought; k++) list.push(list[k] * (1 + first / Math.sqrt(1 + k * slope)));
  return Math.round(list[bought]);
}

/** The highest level `row` reaches in a run: its own `max`, or the cap. */
export const runTrainingMax = (row: TrainingRow) => ("max" in row ? row.max : RUN_TRAINING_CAP);

/** Ranks of `id` bought with Silver in `run`. */
export const boughtInRun = (run: Pick<RunCore, "training">, id: TrainingId) => run.training?.[id] ?? 0;

/** Each row's ranks counting toward `run`: the hero's own, and those bought
 * in the run. */
export function ranksInRun(save: Pick<Save, "training">, run: Pick<RunCore, "training">) {
  const ranks = { ...save.training };
  for (const id of Object.keys(ranks) as TrainingId[]) ranks[id] += boughtInRun(run, id);
  return ranks;
}

/** What buying one more rank of `id` in `run` means: the level it stands
 * at and can reach, the Silver it costs, and whether it is open (its
 * upgrade owned) and not yet at its highest. */
export function runTrainingOffer(save: Pick<Save, "training" | "upgrades">, run: Pick<RunCore, "training">, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, bought = boughtInRun(run, id);
  const level = save.training[id] + bought, max = runTrainingMax(row);
  return { row, bought, level, max, price: silverPrice(id, bought), open: trainingOpen(row, save.upgrades), maxed: level >= max };
}

/** What row `id` stands at in `run` now, as the run's cards show it: the
 * hero's stat for a stat row, the Gold a new floor pays, or the
 * percentage for the others. */
export function runTrainingValue(save: Pick<Save, "training" | "upgrades">, run: Pick<RunCore, "training" | "player">, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!;
  if (isStatRow(row)) return { value: whole(run.player[row.stat] ?? 0), unit: "" };
  const now = { upgrades: save.upgrades, training: ranksInRun(save, run) };
  if (id === "floorGold") return { value: floorGold(now), unit: "" };
  const chance = id === "findPotion" ? percentPotionChance(now) : id === "revive" ? reviveChance(now) : potionPercent(now);
  return { value: chance / 100, unit: "%" };
}
