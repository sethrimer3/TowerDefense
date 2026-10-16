import type { TrainingId } from "./progression.ts";
import type { Metal } from "./mine/sim.ts";

/** A Smithy upgrade (a Training rank in code) takes one smith time, on the
 * wall clock: the first rank of a row takes `TRAINING_FIRST_SECONDS`, and
 * work grows with the square of the next rank and with the metal it costs
 * (`TIER_WORK`). Resource prices, rather than exponential timers, govern
 * long-term progress. Smiths share work. No Smithy upgrade is instant. */
export const TRAINING_FIRST_SECONDS = 60;
/** One rank in work: one smith's milliseconds of work `left`, and the
 * smiths (by name) working it. */
export type TrainingJob = { id: TrainingId; left: number; smiths: string[]; paid?: number };

/** How much longer an upgrade billed in a precious metal takes to work:
 * silver work twice copper's, gold four times. */
export const TIER_WORK: Record<Metal, number> = { copper: 1, silver: 2, gold: 4 };
/** The work weight of a bill: that of its most precious metal. */
export const billWork = (bill: Partial<Record<Metal, number>>) =>
  bill.gold ? TIER_WORK.gold : bill.silver ? TIER_WORK.silver : TIER_WORK.copper;

/** The metal tier a row's next rank costs, with `ranks` owned: copper for
 * the first ten, silver to twenty-five, gold after. */
export const rankPrice = (ranks: number): Metal => (ranks < 10 ? "copper" : ranks < 25 ? "silver" : "gold");

/** Seconds the next rank takes for a stat that already has `ranks` ranks. */
export const trainingSeconds = (ranks: number) =>
  TRAINING_FIRST_SECONDS * (Math.max(0, Math.floor(ranks)) + 1) ** 2 * TIER_WORK[rankPrice(ranks)];

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);
