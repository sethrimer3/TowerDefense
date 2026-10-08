/** Estimates from current catalog data. Never writes gameplay or player saves.
 * Generate production samples first with measure-upgrade-production.ts. */
import { readFileSync, writeFileSync } from "node:fs";
import { UPGRADES, upgradePrice, SPEED3_PRICE, type Price } from "../src/defend/catalog.ts";
import { TRAINING, rankPrice, rankCost } from "../src/progression.ts";
import { trainingSeconds } from "../src/training-jobs.ts";
import { researchSeconds } from "../src/research-jobs.ts";
import { forgeSeconds } from "../src/forge-jobs.ts";
import { ECONOMY } from "../src/economy.ts";
import { planProgression, sampledRates } from "./plan-upgrade-progression.ts";
import { SKILLS, TREES, skillCost, type SkillId } from "../src/skill-trees.ts";
import { PATHS } from "../src/knowledge-paths.ts";
import { BUILDINGS, MAX_LEVEL } from "../src/mine/buildings.ts";
import { METALS, hirePrice, upgradePrice as minePrice, MAX_MINERS } from "../src/mine/sim.ts";
import { shelfPrice, librarianPrice, labPrice, MAX_SHELVES, MAX_LIBRARIANS, LAB_MAX_LEVEL } from "../src/library/sim.ts";

type Cost = { copper: number; silver: number; gold: number; knowledge: number };
type Row = { family: string; id: string; name: string; rank: number; max: number; final: boolean;
  price: Cost; cumulative: Cost; prerequisites: Cost; smithSeconds: number; researchSeconds?: number; notes: string };
const zero = (): Cost => ({ copper: 0, silver: 0, gold: 0, knowledge: 0 });
const cost = (p: Price = {}, knowledge = 0): Cost => ({ ...zero(), ...p, knowledge });
const add = (a: Cost, b: Cost): Cost => Object.fromEntries(Object.keys(a).map(k => [k, a[k as keyof Cost] + b[k as keyof Cost]])) as Cost;
const sum = (prices: Cost[]) => prices.reduce(add, zero());
const rows: Row[] = [];
function ranks(family: string, id: string, name: string, max: number, price: (rank: number) => Cost,
  prerequisites = zero(), notes = "", work: (rank: number) => number = () => 0, start = 0) {
  let cumulative = zero(), smithSeconds = 0;
  for (let rank = start; rank < max; rank++) {
    const p = price(rank); cumulative = add(cumulative, p); smithSeconds += work(rank);
    rows.push({ family, id, name, rank: rank + 1, max, final: rank + 1 === max,
      price: p, cumulative: { ...cumulative }, prerequisites, smithSeconds, notes });
  }
}
for (const u of UPGRADES) ranks("Forge", u.id, u.name, u.maxLevel, rank => cost((u.price ?? upgradePrice)(rank)), zero(), "Named smiths share work with Training", forgeSeconds);
ranks("Forge", "speed3", "War drums", 1, () => cost(SPEED3_PRICE), zero(), "Named smiths share work with Training", forgeSeconds);
for (const t of TRAINING) ranks("Smithy", t.id, t.name, t.max, rank => cost({ [rankPrice(rank)]: rankCost(rank) }), zero(),
  "All smiths dedicated to this row; instantaneous requeue; production and infrastructure setup excluded", trainingSeconds);
const skillNodes = Object.fromEntries(TREES.flatMap(t => t.nodes).map(n => [n.id, n]));
function requiredRanks(id: SkillId) {
  const needed = new Map<SkillId, number>();
  function visit(id: SkillId, rank: number) {
    if ((needed.get(id) ?? 0) >= rank) return;
    needed.set(id, rank);
    for (const p of skillNodes[id].requires) visit(p, skillNodes[id].full?.includes(p) ? SKILLS[p].max : 1);
  }
  for (const p of skillNodes[id].requires) visit(p, skillNodes[id].full?.includes(p) ? SKILLS[p].max : 1);
  return needed;
}
const required = (id: SkillId) => cost({}, [...requiredRanks(id)].reduce((n, [id, rank]) => n + Array.from({ length: rank }, (_, r) => skillCost(id, r)).reduce((a, b) => a + b, 0), 0));
for (const skill of Object.values(SKILLS)) ranks("Study skill", skill.id, skill.name, skill.max,
  rank => cost({}, skillCost(skill.id, rank)), required(skill.id), "Requires a living lab researcher; minimal skill prerequisites included");
for (const p of PATHS) {
  ranks("Study path", p.id, p.name, p.ranks.length, rank => cost({}, p.ranks[rank].cost), zero(),
    `Choose one path for ${p.topic}; alternatives are mutually exclusive`);
  if (p.evolves) {
    const prerequisites = cost({}, p.ranks.reduce((n, r) => n + r.cost, 0));
    ranks("Evolution", p.id + "Crown", p.evolves.name, 1, () => cost({}, p.evolves!.cost), prerequisites,
      `Requires ${p.name}; evolves every owned copy without separate metal payment`);
  }
}
for (const b of BUILDINGS) ranks("Mine building", b, b, MAX_LEVEL, rank => cost(minePrice(b, rank)), zero(),
  "Existing level 1 is free; warehouse progression and rebuilding time excluded", () => 0, 1);
ranks("Mine staff", "miners", "Full mine crew", MAX_MINERS, n => cost(hirePrice(n)), zero(),
  "First worker is free; barracks/warehouse setup excluded; no replacement costs", () => 0, 1);
ranks("Library", "shelves", "Full bookshelf collection", MAX_SHELVES, n => cost(shelfPrice(n)), zero(),
  "Purchased shelves still need construction; price wait excludes building/repair time");
ranks("Library", "librarians", "Full Library staff", MAX_LIBRARIANS, n => cost(librarianPrice(n)), zero(),
  "Lab research capacity and role allocation excluded; no replacement costs");
ranks("Library", "lab", "Alchemy lab", LAB_MAX_LEVEL, n => cost(labPrice(n)), zero(),
  "Level 1 is free", () => 0, 1);
for (const r of rows) {
  const work = (count: number) => Array.from({ length: count }, (_, rank) => researchSeconds(rank)).reduce((a, b) => a + b, 0);
  if (r.family === "Study skill") r.researchSeconds = work(r.rank) + [...requiredRanks(r.id as SkillId)].reduce((n, [, rank]) => n + work(rank), 0);
  else if (r.family === "Study path") r.researchSeconds = work(r.rank);
  else if (r.family === "Evolution") r.researchSeconds = researchSeconds(0, true) + work(PATHS.find(p => p.id + "Crown" === r.id)!.ranks.length);
}

const samples = JSON.parse(readFileSync("docs/upgrade-production.json", "utf8")).samples;
if (!Array.isArray(samples) || !samples.length) throw new Error("No production samples; run measure-upgrade-production.ts first");
const profiles = ["early", "developed", "late"].map(id => {
  const group = samples.filter((s: any) => s.profile.id === id), p = group[0].profile;
  const hours = group.reduce((n: number, s: any) => n + s.mine.simulatedHours, 0);
  const metalRates = Object.fromEntries(METALS.map(k => [k, group.reduce((n: number, s: any) => n + s.mine.paid[k], 0) / hours]));
  return { id, rates: { ...metalRates, knowledge: group[0].library.nominalPerHour } as Cost, smiths: p.smiths,
    speed: id === "early" ? 1 : id === "developed" ? 1.15 : 1.45, researchers: p.researchers };
});
function estimate(row: Row, p: typeof profiles[number]) {
  const total = add(row.cumulative, row.prerequisites);
  const missing = (Object.keys(total) as (keyof Cost)[]).filter(k => total[k] > 0 && p.rates[k] <= 0);
  const resourceHours = missing.length ? null : Math.max(...Object.keys(total).map(k => total[k as keyof Cost] ? total[k as keyof Cost] / p.rates[k as keyof Cost] : 0));
  const trainingHours = row.smithSeconds / p.smiths / p.speed / 3600;
  const researchHours = (row.researchSeconds ?? 0) / p.researchers / 3600;
  return { resourceHours, trainingHours, researchHours, combinedFloorHours: resourceHours === null ? null : Math.max(resourceHours, trainingHours, researchHours), missing };
}
const format = (hours: number) => hours < 1 ? `${(hours * 60).toFixed(1)} min` : hours < 24 ? `${hours.toFixed(1)} h` : hours < 365 * 24 ? `${(hours / 24).toFixed(1)} d` : `${(hours / 24 / 365).toFixed(2)} yr`;
const priceText = (p: Cost) => Object.entries(p).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(" + ") || "—";
const escape = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
const columns = ["family", "id", "name", "rank", "max", "is_final", "copper_next", "silver_next", "gold_next", "knowledge_next",
  "copper_total", "silver_total", "gold_total", "knowledge_total", "knowledge_prerequisites", "smith_work_hours", "research_work_hours",
  ...profiles.flatMap(p => [`${p.id}_resource_hours`, `${p.id}_training_hours`, `${p.id}_research_hours`, `${p.id}_combined_lower_bound_hours`, `${p.id}_unobserved_metals`]), "notes"];
const csvRows = rows.map(r => [r.family, r.id, r.name, r.rank, r.max, r.final, ...Object.values(r.price), ...Object.values(r.cumulative),
  r.prerequisites.knowledge, r.smithSeconds / 3600, (r.researchSeconds ?? 0) / 3600, ...profiles.flatMap(p => { const e = estimate(r, p); return [e.resourceHours ?? "", e.trainingHours, e.researchHours, e.combinedFloorHours ?? "", e.missing.join(";")]; }), r.notes]);
writeFileSync("docs/upgrade-estimates.csv", [columns, ...csvRows].map(r => r.map(escape).join(",")).join("\n") + "\n");
const finals = rows.filter(r => r.final), smiths = finals.filter(r => r.family === "Smithy");
const late = profiles[2];
const totalWork = smiths.reduce((n, r) => n + r.smithSeconds, 0);
const forgeTotal = sum(finals.filter(r => r.family === "Forge").map(r => r.cumulative));
const skillsTotal = sum(finals.filter(r => r.family === "Study skill").map(r => r.cumulative));
const compatiblePathKnowledge = [...new Set(PATHS.map(p => p.topic))].reduce((n, topic) => n + Math.max(...PATHS.filter(p => p.topic === topic)
  .map(p => p.ranks.reduce((n, r) => n + r.cost, 0) + (p.evolves?.cost ?? 0))), 0);
const lateMeasuredKnowledge = samples.filter((s: any) => s.profile.id === "late").map((s: any) => s.library.perHour);
const baseKnowledgeBudget = late.rates.knowledge * 730 * 24;
const enchantedMultiplier = samples.filter((s: any) => s.profile.id === "late").reduce((n: number, s: any) => n + s.library.perHour / s.library.nominalPerHour, 0) / 2;
const plan = planProgression(sampledRates(samples), MAX_SHELVES, enchantedMultiplier);
const topRow = smiths.find(r => r.rank === 50)!;
const conduit = finals.find(r => r.id === "chainCount")!;
const storm = PATHS.find(p => p.id === "storm")!;
const conduitBill = add(conduit.cumulative, cost({}, storm.ranks.reduce((n, r) => n + r.cost, 0) + storm.evolves!.cost));
const forecastTop = plan.focused(topRow.cumulative, topRow.smithSeconds / 3600 / 6 / 1.45);
const forecastConduit = plan.focused(conduitBill, conduit.smithSeconds / 3600 / 6 / 1.45 + (researchSeconds(3, true) + [0, 1, 2].reduce((n, r) => n + researchSeconds(r), 0)) / 3600 / 2);
const allTraining = sum(smiths.map(r => r.cumulative));
const md: string[] = [
  "# Upgrade timing and quadratic balance", "", `Current source snapshot: ${new Date().toISOString().slice(0, 10)}. Prices and project timers below are implemented in the game.`, "",
  "## Pacing target and current forecast", "",
  "The target is about two years to a focused top specialization, with 24-hour normal progress and daily visits. Compatible branches share income, so maxing the whole collection takes longer. This interpretation is explicit rather than silently giving every branch its own income budget.", "",
  "The forecast first funds a starter Library, Mine level 3 with 15 workers, Mine level 5 with 25 workers, then full Library infrastructure and its fire precautions. Unspent metals and Knowledge carry between every phase; utility research is charged once. Measured phase rates only apply after their infrastructure is funded. This is a capital-budget model, not two years of physical simulation: it excludes replacement bills, construction downtime, battle expenses and delays between manual rank starts; it holds each phase's income until the next setup is complete. Real incremental investments can improve income sooner.", "",
  "| Focused target | Estimated time from modeled start |",
  "|---|---:|",
  `| One 50-rank row, e.g. Troop HP | ${format(forecastTop)} (${(forecastTop / 24).toFixed(0)} days) |`,
  `| Conduit of night, including Stormcalling and its evolution | ${format(forecastConduit)} (${(forecastConduit / 24).toFixed(0)} days) |`,
  `| Enchanted ink, all ten ranks | ${format(plan.enchantedHours)} (${(plan.enchantedHours / 24).toFixed(0)} days) |`, "",
  "| Production investment | Modeled completion | Copper / Silver / Gold per hour afterwards | Nominal Knowledge/h |",
  "|---|---:|---|---:|",
  ...plan.stages.map(s => `| ${s.name} | ${format(s.hours)} | ${METALS.map(k => s.rates[k].toFixed(2)).join(" / ")} | ${s.rates.knowledge} |`), "",
  "## Implemented curves", "",
  "Owned ranks are zero-based. Per-purchase prices are quadratic; their cumulative spending grows roughly cubically. Early prices remain affordable. Production increases through purchased capacity and crew, without an automatic multiplier tied to elapsed calendar time.", "",
  `- Training: **1 + ${ECONOMY.training} × owned²** units of the existing Copper/Silver/Gold tier. Work is **60 × next-rank² seconds** per smith.`,
  `- Ordinary Forge levels: **2 + ${ECONOMY.forgeCopper} × owned² Copper**; precious-metal tiers also grow quadratically. Conduit's late Gold is **${ECONOMY.conduitGold} × (owned − 6)²**, beginning at rank eight. All Forge levels and War drums require named smiths, shared with Training.`,
  `- Mine buildings: **base × (1 + ${ECONOMY.mineBuilding} × (current-level − 1)²)** Copper. Crew hires are **1 + crew²** Copper. Additional capacity therefore needs progressively larger reinvestment.`,
  "- Library shelves: **1 + owned + floor(owned² / 20)** Copper; staff **2 + hired²**; lab **10 + 200 × (current-level − 1)²**. Precious-metal portions also rise quadratically.",
  `- Study skills: **base × (1 + growth × owned²)**, with growth ${ECONOMY.utilityStudy} for production/fire utility, ${ECONOMY.combatStudy} for ordinary combat research and ${ECONOMY.enchantedStudy} for Enchanted ink. Paths use ${ECONOMY.pathStudy}; evolution crowns cost 100,000/150,000 Knowledge.`,
  "- Every Knowledge skill/path rank takes **300 × next-rank² seconds per researcher**; evolution requires **24 researcher-hours**. The lab shares all current researchers on one project. Zero researchers pauses it. Effects apply on completion; cancellation refunds the exact paid bill. Instantaneous research applies to both workshops.",
  "- Enchanted books now award **one minute of current base Knowledge, at least 1**, so bonuses follow the Library instead of overwhelming it with two-hour gifts.", "",
  "## Per-track tables: interpretation and limits", "",
  "The planning target is 730 days of normal progress with daily check-ins. Exact costs and Smithy/lab work are calculated from current code. Resource waits are **scenario estimates**, not predictions from a new save. Preset infrastructure is already paid for, one upgrade is prioritized, income is held constant, every rank is restarted immediately, and there is no competing spending. Infrastructure construction, repairs, replacements and battle progression are excluded from those waits. Real acquisition from a new game is longer. Lower bounds are not added together as though each upgrade had its own Mine or staff.", "",
  "Mine samples run actual 1x simulation from fresh prospects with preset infrastructure, ordinary hazards and attentive prospect moves. They have a CPU limit and report exactly how much simulated time was reached. Unobserved metal means **unknown**, never zero wait. These short samples are startup averages and must not be extrapolated unchanged for two years. Knowledge wait columns use the exact nominal shelves × professors rate, excluding enchanted bonuses and casualties; measured Library results below show how far outcomes can differ.", "",
  "Smithy training uses wall-clock time, including time away, and a shared pool of at most six smiths. Fully researched Smiths' guild supplies a 1.45× speed multiplier. Assigning all six to one row means they cannot simultaneously train the other rows. Per-row resource and work lower bounds overlap via max(resource wait, smith work, researcher work); this does not model rank-by-rank resource availability. The manufacturing jobs currently have no simulation-side busy-smith filter, so the same named smith also continues generating metal while assigned to training.", "",
  "## Exact Smithy completion times", "", "From rank zero, ignoring resource/setup/requeue delays:", "",
  "| Upgrade | Ranks | Copper / Silver / Gold | One smith, no speed research | Six smiths, max research | Final rank with six |",
  "|---|---:|---:|---:|---:|---:|",
  ...smiths.map(r => `| ${r.name} | ${r.rank} | ${r.cumulative.copper} / ${r.cumulative.silver} / ${r.cumulative.gold} | ${format(r.smithSeconds / 3600)} | ${format(r.smithSeconds / 3600 / 6 / 1.45)} | ${format(trainingSeconds(r.rank - 1) / 3600 / 6 / 1.45)} |`), "",
  `All nine rows require **${format(totalWork / 3600 / 6 / 1.45)}** of six-smith work at best. One top 50-rank row requires **${format(topRow.smithSeconds / 3600 / 6 / 1.45)}**. Their resource prices govern the long-term finish; these are processing times after materials have been secured.`, "",
  "## Production scenarios and measurements", "",
  "| Scenario | Setup | Sampled 1x hours (two seeds) | Copper/h | Silver/h | Gold/h | Nominal Knowledge/h |",
  "|---|---|---:|---:|---:|---:|---:|",
  ...profiles.map(p => { const g = samples.filter((s: any) => s.profile.id === p.id), setup = g[0].profile;
    return `| ${p.id} | Mine level ${setup.level}, ${setup.crew} workers (${setup.forge} forge / ${setup.smiths} smiths); Library ${setup.shelves} shelves / ${setup.professors} professors | ${g.map((s: any) => s.mine.simulatedHours.toFixed(2)).join(" + ")} | ${p.rates.copper.toFixed(2)} | ${p.rates.silver.toFixed(2)} | ${p.rates.gold.toFixed(2)} | ${p.rates.knowledge} |`; }), "",
  "| Scenario / seed | Mine deaths / final crew | First Copper / Silver / Gold (h) | Library measured Knowledge/h | Bonus Knowledge | Library deaths / fires |",
  "|---|---:|---|---:|---:|---:|",
  ...samples.map((s: any) => `| ${s.profile.id} / ${s.seed} | ${s.mine.deaths} / ${s.mine.finalCrew} | ${METALS.map(k => s.mine.firstPaymentHours[k]?.toFixed(2) ?? "unobserved").join(" / ")} | ${s.library.perHour.toFixed(1)} | ${Math.round(s.library.bonuses)} | ${s.library.deaths} / ${s.library.fires} |`), "",
  "## Shared resource budgets", "",
  `All Forge tracks together cost **${priceText(forgeTotal)}**, about **${format(Math.max(forgeTotal.copper / late.rates.copper, forgeTotal.silver / late.rates.silver, forgeTotal.gold / late.rates.gold))}** of the late-profile sample income if every metal is saved for them.`, "",
  `All Training rows together cost **${priceText(allTraining)}**. Their Gold alone needs **${format(allTraining.gold / late.rates.gold)}** at the late sampled rate. This balance targets a chosen specialization near two years; it does not promise the entire collection by then.`, "",
  `All Study skills together cost **${skillsTotal.knowledge} Knowledge**. Choosing the most expensive fully evolved path in each topic adds **${compatiblePathKnowledge} Knowledge**, giving **${skillsTotal.knowledge + compatiblePathKnowledge} Knowledge** for every compatible Study upgrade: **${format((skillsTotal.knowledge + compatiblePathKnowledge) / late.rates.knowledge)}** at late nominal income. Minimal prerequisite prices in individual rows must not be charged again when summing the complete tree. These budgets exclude setup and income growth.`, "",
  "DEFEND upgrade points currently have no upgrade purchase route. They accumulate one per new highest cleared wave, so there is no point-priced upgrade completion time to calculate yet.", "",
  "## Every finite upgrade: maximum rank", "",
  "Each cost below is that upgrade's own cumulative price. Study prerequisite Knowledge is additional and included in the CSV's wait estimates. Separate paths for a topic are alternatives, not a collection that can all be held at once. Shelf/staff purchase totals do not include Mine infrastructure. Normal tiles and bombs have no finite completion point; their repeat prices are not counted as final upgrades.", "",
  ...[...new Set(finals.map(r => r.family))].flatMap(family => [
    `### ${family}`, "", "| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |", "|---|---:|---|---:|---|",
    ...finals.filter(r => r.family === family).map(r => { const e = estimate(r, late);
      const resource = e.resourceHours === null ? `Unknown: ${e.missing.join(", ")} unobserved` : format(e.resourceHours);
      const time = r.smithSeconds ? `${format(e.trainingHours)} smith work; resources ${resource}` : r.researchSeconds ? `${format(e.researchHours)} research; resources ${resource}` : resource;
      return `| ${r.name} | ${r.rank} | ${priceText(r.cumulative)} | ${r.prerequisites.knowledge || "—"} | ${time} |`; }), "",
  ]),
  "## Sensitivity and follow-up tuning", "",
  `At the late nominal rate of ${late.rates.knowledge} Knowledge/hour, two years would generate **${Math.round(baseKnowledgeBudget).toLocaleString("en-US")} Knowledge** before spending; measured late enchanted income would imply **${lateMeasuredKnowledge.slice().sort((a: number, b: number) => a - b).map((n: number) => (n * 730 * 24 / 1e6).toFixed(1)).join("–")} million**. The capital forecast accounts for setup and applies a proportional measured enchant bonus after each paid rank. It does not grant full late income at the start.`, "",
  "Two seeds per phase are sufficient for an initial balance pass, not a long-run income guarantee. Prospect geology, hazards, crew replacements and player spending can substantially change the finish. Daily visits also leave completed projects waiting for their next manual start. More playthrough seeds and offline-heavy scenarios should refine the coefficients without changing the quadratic form.", "",
  "## Offline and check-in effects", "",
  "The Mine and Library bank at most 24 hours. A daily visit can retain most wall-clock income, but longer absences lose the excess. The 120× catch-up setting controls replay throughput, not a free 120× progression multiplier. The 10× catch-up payout consumes ten seconds of bank for one simulation second: unchanged base Knowledge pays for elapsed bank time, while digging, accidents and rune-reading advance less physical simulation per paid hour. This changes unlock delays and bonus distributions, so offline-heavy play needs its own model. Smithy and Study jobs continue on wall-clock time with their current workers; zero workers pause work. Only the current project/rank completes, with no automatic next rank. Daily visits add waiting between completions.", "",
  "## Reproduce", "", "```powershell", "node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-upgrade-production.ts",
  "node --experimental-transform-types --import ./tests/pin-random.ts tools/estimate-upgrades.ts", "```", "",
  "Measurement horizon defaults to 6 simulated hours per sample, with 30 CPU seconds maximum for each Mine. Set ESTIMATE_HOURS and ESTIMATE_CPU_SECONDS to change those limits. Source costs remain exact at the current snapshot. See upgrade-production.json for the full measurements and upgrade-estimates.csv for every individual rank and profile.", "",
];
writeFileSync("docs/UPGRADE_TIMING.md", md.join("\n"));
console.log(JSON.stringify({ rankRows: rows.length, finalUpgrades: finals.length,
  focused50Days: forecastTop / 24, conduitDays: forecastConduit / 24, enchantedDays: plan.enchantedHours / 24,
  allSmithyWorkDays: totalWork / 86400 / 6 / 1.45,
  allSkillKnowledge: finals.filter(r => r.family === "Study skill").reduce((n, r) => n + r.cumulative.knowledge, 0) }, null, 2));
