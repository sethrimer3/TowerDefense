/** Reproduce native Siege benchmark rates; raw cache resumes interrupted runs.
 * Command: node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-siege-dps.ts
 * Optional --workers=1|2, --only=kind, --limit=N (partial runs never publish a table). */
import { Worker } from "node:worker_threads";
import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { dpsProfiles, FORGE_BANDS, SIDE_GROUPS, profileKey, type DpsProfile } from "../src/campaign/siege-dps-catalog.ts";
import { DPS_BENCH } from "./siege-dps-bench.ts";
import { siegeDpsInputs, measurementInputHash } from "./siege-dps-inputs.ts";
const arg = (name: string) => process.argv.find((a) => a.startsWith("--" + name + "="))?.split("=")[1];
const workers = Math.max(1, Math.min(2, Math.floor(Number(arg("workers")) || 2)));
const limit = Math.max(0, Math.floor(Number(arg("limit")) || 0)),
  only = arg("only");
const inputs = siegeDpsInputs(),
  profiles = dpsProfiles(),
  byKey = new Map(profiles.map((p) => [p.key, p]));
type Row = { key: string; band: number; single: number; crowd: number };
const rows = new Map<string, Row>(),
  id = (key: string, band: number) => key + "#" + band;
mkdirSync("work", { recursive: true });
const measurementHash = measurementInputHash(),
  cache = "work/siege-dps-native-" + measurementHash.slice(0, 16) + ".jsonl";
if (existsSync(cache)) {
  const lines = readFileSync(cache, "utf8").split("\n");
  if (JSON.parse(lines[0]).measurementHash !== measurementHash) throw Error("Mismatched native measurement cache");
  for (const line of lines.slice(1)) {
    try {
      const r = JSON.parse(line) as Row;
      if (
        byKey.has(r.key) &&
        Number.isInteger(r.band) &&
        r.band >= 0 &&
        r.band < FORGE_BANDS.length &&
        Number.isFinite(r.single) &&
        r.single >= 0 &&
        Number.isFinite(r.crowd) &&
        r.crowd >= 0
      )
        rows.set(id(r.key, r.band), r);
    } catch {}
  }
} else writeFileSync(cache, JSON.stringify({ inputs, measurementHash, protocol: DPS_BENCH }) + "\n");
let jobs = profiles
  .flatMap((profile) => FORGE_BANDS.map((_, band) => ({ profile, band })))
  .filter((j) => (!only || j.profile.kind === only) && !rows.has(id(j.profile.key, j.band)));
if (limit) jobs = jobs.slice(0, limit);
console.error("Native DPS: " + profiles.length + " profiles, " + rows.size + " cached, " + jobs.length + " jobs, " + workers + " workers.");
let completed = 0,
  next = 0;
const pool: Worker[] = [];
async function runWorker() {
  const worker = new Worker(new URL("./measure-siege-dps-worker.ts", import.meta.url), {
    execArgv: process.execArgv.filter((a) => !a.startsWith("--inspect")),
  });
  pool.push(worker);
  try {
    for (;;) {
      const index = next++;
      if (index >= jobs.length) break;
      const job = jobs[index];
      const result = await new Promise<Row & { error?: string }>((resolve, reject) => {
        const done = (message: Row & { error?: string }) => {
          worker.off("error", failed);
          resolve(message);
        };
        const failed = (error: Error) => {
          worker.off("message", done);
          reject(error);
        };
        worker.once("message", done);
        worker.once("error", failed);
        worker.postMessage(job);
      });
      if (result.error) throw Error(result.error);
      const r: Row = { key: result.key, band: result.band, single: result.single, crowd: result.crowd };
      if (!Number.isFinite(r.single) || !Number.isFinite(r.crowd) || r.single < 0 || r.crowd < 0)
        throw Error("Invalid native measurement: " + JSON.stringify(r));
      rows.set(id(r.key, r.band), r);
      appendFileSync(cache, JSON.stringify(r) + "\n");
      completed++;
      if (completed % 20 === 0 || completed === jobs.length) console.error("Measured " + completed + "/" + jobs.length + " · " + r.key + " · band " + r.band);
    }
  } finally {
    await worker.terminate();
  }
}
try {
  if (jobs.length) await Promise.all(Array.from({ length: Math.min(workers, jobs.length) }, runWorker));
} catch (error) {
  await Promise.all(pool.map((w) => w.terminate()));
  throw error;
}
if (only || limit) {
  console.log(JSON.stringify({ inputs: inputs.hash, cached: rows.size, cache, partial: true }));
  process.exit(0);
}
if (rows.size !== profiles.length * FORGE_BANDS.length) throw Error("Incomplete native benchmark cache.");
type Rates = { single: number[]; crowd: number[] };
const raw: Record<string, Rates> = {},
  estimated: Record<string, Rates> = {};
const round = (n: number) => Math.round(n * 1e6) / 1e6;
for (const p of profiles) {
  const rs = FORGE_BANDS.map((_, band) => rows.get(id(p.key, band))!);
  raw[p.key] = { single: rs.map((r) => round(r.single)), crowd: rs.map((r) => round(r.crowd)) };
  estimated[p.key] = { single: [...raw[p.key].single], crowd: [...raw[p.key].crowd] };
}
// Finite-window noise and native tradeoffs never make a paid rank rate lower.
let adjusted = 0;
for (const p of profiles)
  for (let band = 0; band < FORGE_BANDS.length; band++)
    for (const target of ["single", "crowd"] as const) {
      const parents: string[] = [];
      if (p.path) parents.push(profileKey(p.kind, p.rank! > 1 ? p.path : undefined, Math.max(0, p.rank! - 1)));
      if (p.side) {
        const active = Object.keys(p.side).filter((k) => p.side![k] > 0);
        if (active.length === 1) {
          const key = active[0],
            side = { ...p.side, [key]: p.side[key] - 1 };
          parents.push(profileKey(p.kind, undefined, 0, side));
        } else if (active.length > 1)
          for (const key of active)
            parents.push(profileKey(p.kind, undefined, 0, p.kind === "shadow" ? { ...p.side, [key]: p.side[key] - 1 } : { [key]: p.side[key] }));
      }
      const old = estimated[p.key][target][band],
        floor = Math.max(band ? estimated[p.key][target][band - 1] : 0, ...parents.map((k) => estimated[k]?.[target][band] ?? 0));
      estimated[p.key][target][band] = Math.max(old, floor);
      if (old < floor) adjusted++;
    }
const header =
  "// Generated by tools/measure-siege-dps.ts; do not edit.\n// node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-siege-dps.ts\n";
const output =
  header +
  "export const SIEGE_DPS_INPUT_HASH=" +
  JSON.stringify(inputs.hash) +
  ";\nexport const SIEGE_DPS_INPUT_FILES=" +
  JSON.stringify(inputs.files, null, 2) +
  " as const;\nexport const SIEGE_DPS_PROTOCOL=" +
  JSON.stringify(DPS_BENCH, null, 2) +
  " as const;\nexport type SiegeDpsRow={single:readonly number[];crowd:readonly number[]};\nexport const SIEGE_DPS_RAW:Readonly<Record<string,SiegeDpsRow>>=" +
  JSON.stringify(raw, null, 2) +
  ";\nexport const SIEGE_DPS_TABLE:Readonly<Record<string,SiegeDpsRow>>=" +
  JSON.stringify(estimated, null, 2) +
  ";\n";
writeFileSync("src/campaign/siege-dps-table.ts", output);
const weighted = (r: Rates, band: number) => r.single[band] * DPS_BENCH.weights.single + r.crowd[band] * DPS_BENCH.weights.crowd;
const kinds = [...new Set(profiles.map((p) => p.kind))],
  summary = kinds.map((kind) => {
    const candidates = profiles.filter((p) => p.kind === kind).sort((a, b) => weighted(estimated[b.key], 4) - weighted(estimated[a.key], 4)),
      best = candidates[0];
    return { kind, profile: best.key, base: round(weighted(estimated[profileKey(kind)], 0)), max: round(weighted(estimated[best.key], 4)) };
  });
mkdirSync("docs/design", { recursive: true });
writeFileSync(
  "docs/design/siege-dps-measurements.json",
  JSON.stringify({ inputs, protocol: DPS_BENCH, profiles: profiles.length, measurements: rows.size, monotoneAdjustments: adjusted, kinds: summary }, null, 2) +
    "\n",
);
console.log(
  JSON.stringify(
    { hash: inputs.hash, profiles: profiles.length, measurements: rows.size, monotoneAdjustments: adjusted, table: "src/campaign/siege-dps-table.ts", summary },
    null,
    2,
  ),
);
