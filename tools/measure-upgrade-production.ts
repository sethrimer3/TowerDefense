/** Source-backed 1x samples for the upgrade timing report. Preset infrastructure
 * is a scenario, not free infrastructure available to players. No save access. */
import { mkdirSync, writeFileSync } from "node:fs";
import { MineSim, METALS, TICK_HZ, type Metals } from "../src/mine/sim.ts";
import { BUILDINGS } from "../src/mine/buildings.ts";
import { LibrarySim, MAX_SHELVES } from "../src/library/sim.ts";
import { daylight } from "../src/library/render.ts";

const profiles = [
  { id: "early", level: 1, crew: 5, forge: 1, smiths: 1, coffee: 0, waterproof: 0,
    shelves: 6, professors: 2, shelvers: 1, researchers: 1, lab: 1, enchant: 0, fireproof: 0, fireTraining: 0, nightWatch: 0 },
  { id: "developed", level: 3, crew: 15, forge: 6, smiths: 3, coffee: 6, waterproof: 2,
    shelves: 40, professors: 6, shelvers: 3, researchers: 1, lab: 3, enchant: 0, fireproof: 5, fireTraining: 3, nightWatch: 4 },
  { id: "late", level: 5, crew: 25, forge: 8, smiths: 6, coffee: 12, waterproof: 4,
    shelves: MAX_SHELVES, professors: 10, shelvers: 4, researchers: 2, lab: 5, enchant: 10, fireproof: 10, fireTraining: 5, nightWatch: 9 },
];
const samples: unknown[] = [];
const hours = Number(process.env.ESTIMATE_HOURS || 6);
const maxCpuMs = Number(process.env.ESTIMATE_CPU_SECONDS || 30) * 1000;
if (!Number.isFinite(hours) || hours <= 0 || !Number.isFinite(maxCpuMs) || maxCpuMs <= 0)
  throw new Error("ESTIMATE_HOURS and ESTIMATE_CPU_SECONDS must be positive finite numbers");
for (const p of profiles) for (const seed of [7, 19]) {
  const start = performance.now();
  let mine = new MineSim(seed);
  mine.extraSmiths = p.smiths > p.level ? 1 : 0;
  for (const b of BUILDINGS) mine.setLevel(b, p.level);
  while (mine.miners.length < p.crew) mine.hire();
  mine.setJobs(p.forge, p.smiths);
  mine.coffee = p.coffee; mine.waterproof = p.waterproof;
  const paid: Metals = { copper: 0, silver: 0, gold: 0 };
  const first: Partial<Metals> = {}, checkpoints: unknown[] = [];
  let ticks = 0, prospects = 1;
  const checkpointTicks = 15 * 60 * TICK_HZ;
  for (; ticks < hours * 3600 * TICK_HZ; ticks++) {
    mine.step();
    if ((ticks + 1) % TICK_HZ === 0) {
      const point = mine.collect();
      for (const k of METALS) { paid[k] += point[k]; if (point[k] && first[k] === undefined) first[k] = (ticks + 1) / TICK_HZ / 3600; }
    }
    if ((ticks + 1) % checkpointTicks === 0) checkpoints.push({ hours: (ticks + 1) / TICK_HZ / 3600, paid: { ...paid }, crew: mine.miners.length, depth: mine.depth });
    // An attentive player moves prospect as soon as permitted. Deaths remain real;
    // replacements aren't gifted by this estimator.
    if ((ticks + 1) % (60 * TICK_HZ) === 0 && mine.canMoveOn) { mine = mine.prospectNext(seed + ++prospects * 101, 0); }
    if ((ticks + 1) % 300 === 0 && performance.now() - start >= maxCpuMs) { ticks++; break; }
  }
  const simulatedHours = ticks / TICK_HZ / 3600;
  const mineResult = { simulatedHours, requestedHours: hours, cpuSeconds: (performance.now() - start) / 1000,
    complete: ticks >= hours * 3600 * TICK_HZ, paid, perHour: Object.fromEntries(METALS.map(k => [k, paid[k] / simulatedHours])),
    firstPaymentHours: first, finalCrew: mine.miners.length, deaths: mine.lostTotal, prospects, finalDepth: mine.depth, checkpoints };

  const library = new LibrarySim(seed);
  library.furnish(p.shelves);
  while (library.labLevel < p.lab) library.upgradeLab();
  for (let n = 0; n < p.professors; n++) library.hire("professor");
  for (let n = 0; n < p.shelvers; n++) library.hire("shelver");
  for (let n = 0; n < p.researchers; n++) library.hire("researcher");
  if (library.built !== p.shelves || library.count("professor") !== p.professors || library.count("researcher") !== p.researchers)
    throw new Error(`Library setup exceeds capacity: ${p.id}`);
  const nominalPerHour = library.rate;
  library.enchant = p.enchant; library.fireproof = p.fireproof;
  library.fireTraining = p.fireTraining; library.nightWatch = p.nightWatch;
  let base = 0, bonuses = 0;
  const libraryStart = performance.now();
  for (let n = 0; n < hours * 36000; n++) {
    library.night = 1 - daylight(n * 100);
    const rate = library.rate;
    library.step(0.1);
    base += rate / 36000; bonuses += library.takeBonus();
  }
  const libraryResult = { simulatedHours: hours, base, bonuses, perHour: (base + bonuses) / hours,
    nominalPerHour, deaths: library.deaths, fires: library.fires,
    runesRead: library.runesRead, finalShelves: library.built, cpuSeconds: (performance.now() - libraryStart) / 1000 };
  const result = { profile: p, seed, mine: mineResult, library: libraryResult };
  samples.push(result);
  console.log(JSON.stringify({ profile: p.id, seed, mineHours: simulatedHours, metalPerHour: mineResult.perHour,
    mineDeaths: mineResult.deaths, knowledgePerHour: libraryResult.perHour, libraryDeaths: libraryResult.deaths }));
}
mkdirSync("docs", { recursive: true });
writeFileSync("docs/upgrade-production.json", JSON.stringify({ kind: "bounded 1x source simulations", samples }, null, 2) + "\n");
