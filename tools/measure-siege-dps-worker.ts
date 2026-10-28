import { parentPort } from "node:worker_threads";
import { measureDps } from "./siege-dps-bench.ts";
parentPort!.on("message", ({ profile, band }) => {
  try {
    parentPort!.postMessage({ key: profile.key, band, ...measureDps(profile, band) });
  } catch (error) {
    parentPort!.postMessage({ error: error instanceof Error ? error.stack : String(error) });
  }
});
