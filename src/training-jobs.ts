import { intPow } from "./exact.ts";
import type { TrainingId } from "./progression.ts";

/** A Smithy upgrade (a Training rank in code) takes one smith time, on the
 * wall clock: the first rank of a row takes `TRAINING_FIRST_SECONDS`, and
 * each rank after takes `TRAINING_GROWTH` times as long as the one before
 * (50% longer, compounding). More smiths on it share the work. */
export const TRAINING_FIRST_SECONDS = 60;
export const TRAINING_GROWTH = 1.5;
/** The most one rank can take, so a stat trained very far never overflows. */
const TRAINING_LONGEST_SECONDS = 365 * 86400;
/** One rank in work: one smith's milliseconds of work `left`, and the
 * smiths (by name) working it. */
export type TrainingJob = { id: TrainingId; left: number; smiths: string[] };

/** Seconds the next rank takes for a stat that already has `ranks` ranks. */
export const trainingSeconds = (ranks: number) =>
  Math.min(TRAINING_LONGEST_SECONDS, Math.round(TRAINING_FIRST_SECONDS * intPow(TRAINING_GROWTH, ranks)));

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);
