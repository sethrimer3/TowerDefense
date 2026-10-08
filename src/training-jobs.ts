import type { TrainingId } from "./progression.ts";

/** A Smithy upgrade (a Training rank in code) takes one smith time, on the
 * wall clock: the first rank of a row takes `TRAINING_FIRST_SECONDS`, and
 * work grows with the square of the next rank. Resource prices, rather
 * than exponential timers, govern long-term progress. Smiths share work. */
export const TRAINING_FIRST_SECONDS = 60;
/** One rank in work: one smith's milliseconds of work `left`, and the
 * smiths (by name) working it. */
export type TrainingJob = { id: TrainingId; left: number; smiths: string[]; paid?: number };

/** Seconds the next rank takes for a stat that already has `ranks` ranks. */
export const trainingSeconds = (ranks: number) =>
  TRAINING_FIRST_SECONDS * (Math.max(0, Math.floor(ranks)) + 1) ** 2;

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);
