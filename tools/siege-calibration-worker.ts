import { parentPort } from "node:worker_threads";
import { calibrateRaid } from "./siege-calibration.ts";
parentPort!.on("message", (job) => {
  try {
    parentPort!.postMessage({ row: calibrateRaid(job.mmr, job.seed, job.options) });
  } catch (e) {
    parentPort!.postMessage({ error: e instanceof Error ? e.stack : String(e) });
  }
});
