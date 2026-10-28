/** Find native win/loss crossover budgets at rank representatives. These are
 * training trials only; calibrate-siege runs independent validation seeds. */
import { Worker } from "node:worker_threads";
import { readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { calibrationHash, TUNING_SOURCES } from "./siege-calibration.ts";
import { DPS_MIN, DPS_MAX } from "../src/campaign/siege-ceiling.ts";
import { typicalArmyBudget } from "../src/campaign/siege-army.ts";
const inputHash = calibrationHash(TUNING_SOURCES),
  cache = "work/siege-tuning-" + inputHash.slice(0, 16) + ".jsonl",
  rows = new Map<string, any>();
const resume = process.argv.find((a) => a.startsWith("--resume="))?.slice(9),
  priorHash = process.argv.find((a) => a.startsWith("--resume-hash="))?.slice(14),
  resumeReason = process.argv.find((a) => a.startsWith("--resume-reason="))?.slice(16);
if (resume) {
  if (!priorHash || !resumeReason) throw Error("A reused experiment must retain its source hash and explain why native trial inputs are unchanged");
  for (const line of readFileSync(resume, "utf8").split("\n")) {
    try {
      const r = JSON.parse(line);
      rows.set(r.mmr + ":" + r.budget + ":" + r.seed, { ...r, observedInputHash: r.observedInputHash ?? priorHash });
    } catch {}
  }
}
if (existsSync(cache))
  for (const line of readFileSync(cache, "utf8").split("\n")) {
    try {
      const r = JSON.parse(line);
      rows.set(r.mmr + ":" + r.budget + ":" + r.seed, r);
    } catch {}
  }
/** Training seeds; each budget's outcome is their majority. */
const SEEDS = [1, 2, 3];
const mmrs = [240, 560, 1000, 1360, 1760, 2000, 2160, 2400, 2560],
  targets: any[] = [];
let next = 0;
await Promise.all(
  [0, 1, 2, 3].map(async () => {
    const worker = new Worker(new URL("./siege-calibration-worker.ts", import.meta.url), { execArgv: process.execArgv });
    async function raid(mmr: number, budget: number, seed: number) {
      const key = mmr + ":" + budget + ":" + seed;
      if (rows.has(key)) return rows.get(key);
      const result: any = await new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
        worker.postMessage({ mmr, seed, options: { budget } });
      });
      worker.removeAllListeners("error");
      const row = { ...(result.error ? { mmr, budget, seed, error: result.error } : result.row), observedInputHash: inputHash };
      if (row.error && !row.error.includes("Unfilled budget")) throw Error(row.error);
      rows.set(key, row);
      appendFileSync(cache, JSON.stringify(row) + "\n");
      console.error(mmr + " " + Math.round(budget) + " #" + seed + " " + (row.phase ?? "unfillable") + " " + (row.seconds ?? ""));
      return row;
    }
    /** One budget is won when most of its seeds win: a single raid is too
     * noisy to bracket a crossover. */
    async function trial(mmr: number, budget: number) {
      budget = Math.round(budget * 1e6) / 1e6;
      let wins = 0;
      for (let n = 0; n < SEEDS.length; n++) {
        const row = await raid(mmr, budget, SEEDS[n]);
        if (row.error) return { mmr, budget, error: row.error };
        if (row.phase === "won") wins++;
        if (wins * 2 > SEEDS.length || (n + 1 - wins) * 2 > SEEDS.length) break;
      }
      return { mmr, budget, phase: wins * 2 > SEEDS.length ? "won" : "lost" };
    }
    try {
      for (;;) {
        const i = next++;
        if (i >= mmrs.length) break;
        const mmr = mmrs[i],
          first = await trial(mmr, Math.min(DPS_MAX, typicalArmyBudget(mmr)));
        let low: number | undefined = first.phase === "won" ? first.budget : undefined,
          high: number | undefined = first.phase === "lost" ? first.budget : undefined,
          failed: number | undefined = first.error ? first.budget : undefined;
        for (let n = 0; n < 10 && (!low || !high); n++) {
          const budget = !low ? Math.max(DPS_MIN, (high ?? failed!) / 4) : Math.min(DPS_MAX, failed ? Math.sqrt(low * failed) : low * 4);
          if (budget === low || budget === high || budget === failed) break;
          const r = await trial(mmr, budget);
          if (r.phase === "won") low = r.budget;
          else if (r.phase === "lost") high = r.budget;
          else {
            failed = r.budget;
            // Once a legal winning castle and a failed capacity probe exist,
            // report that bound honestly. Repeated near-capacity generation
            // is costly and cannot supply a real losing-raid observation.
            if (low) break;
          }
          if (budget === DPS_MIN && !low) break;
        }
        if (low && high)
          for (let n = 0; n < 3; n++) {
            const budget = Math.sqrt(low * high),
              r = await trial(mmr, budget);
            if (r.phase === "won") low = r.budget;
            else if (r.phase === "lost") high = r.budget;
            else {
              failed = r.budget;
              high = Math.min(high, r.budget);
            }
          }
        const bracketed = !!(low && high);
        const target = bracketed ? Math.sqrt(low! * high!) : low ? low * 0.75 : (high ?? DPS_MIN);
        targets.push({
          mmr,
          low,
          high,
          target,
          status: bracketed ? "bracketed" : low ? "no-losing-castle-found" : "floor-limited",
          ...(failed ? { unfillable: failed } : {}),
        });
      }
    } finally {
      await worker.terminate();
    }
  }),
);
const ordered = [...rows.values()].sort((a, b) => a.mmr - b.mmr || a.budget - b.budget),
  report = {
    kind: "native-crossover-search",
    inputHash,
    ...(priorHash
      ? {
          reusedSources: [
            { inputHash: priorHash, reason: resumeReason },
          ],
        }
      : {}),
    split: "training",
    floor: DPS_MIN,
    ceiling: DPS_MAX,
    seeds: SEEDS,
    spells: "none",
    targets: targets.sort((a, b) => a.mmr - b.mmr),
    rows: ordered,
  };
writeFileSync("docs/design/siege-calibration-training.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
