import { intPow } from "./exact.ts";
import type { TrainingId } from "./progression.ts";

/** Training a rank takes time, on the wall clock like the Archives'
 * research: the first rank of a row takes `TRAINING_FIRST_SECONDS`, and each
 * rank after takes `TRAINING_GROWTH` times as long as the one before (50%
 * longer, compounding). */
export const TRAINING_FIRST_SECONDS = 60;
export const TRAINING_GROWTH = 1.5;
/** The most one rank can take, so a stat trained very far never overflows. */
const TRAINING_LONGEST_SECONDS = 365 * 86400;
/** How many ranks can be in training at once, to start with (the
 * Tactician skill adds one). */
export const TRAINING_SLOTS = 2;

/** One rank being trained: it counts when `completesAt` (ms) is reached. */
export type TrainingJob = { id: TrainingId; startedAt: number; completesAt: number };

/** Seconds the next rank takes for a stat that already has `ranks` ranks. */
export const trainingSeconds = (ranks: number) =>
  Math.min(TRAINING_LONGEST_SECONDS, Math.round(TRAINING_FIRST_SECONDS * intPow(TRAINING_GROWTH, ranks)));

/** The job training `id`, if any. */
export const trainingJob = (jobs: readonly TrainingJob[], id: TrainingId) => jobs.find((j) => j.id === id);
