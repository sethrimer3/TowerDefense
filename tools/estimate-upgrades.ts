/** Estimates from current catalog data. Never writes gameplay or player saves.
 * Generate production samples first with measure-upgrade-production.ts. */
import { readFileSync, writeFileSync } from "node:fs";
import { UPGRADES, upgradePrice, SPEED3_PRICE, type Price } from "../src/defend/catalog.ts";
import { TRAINING, rankPrice } from "../src/progression.ts";
import { trainingSeconds, TRAINING_FIRST_SECONDS, TRAINING_GROWTH } from "../src/training-jobs.ts";
import { SKILLS, TREES, skillCost, type SkillId } from "../src/skill-trees.ts";
import { PATHS } from "../src/knowledge-paths.ts";
import { BUILDINGS, MAX_LEVEL } from "../src/mine/buildings.ts";
import { METALS, hirePrice, upgradePrice as minePrice, MAX_MINERS } from "../src/mine/sim.ts";
import { shelfPrice, librarianPrice, labPrice, MAX_SHELVES, MAX_LIBRARIANS, LAB_MAX_LEVEL } from "../src/library/sim.ts";

type Cost = { copper: number; silver: number; gold: number; knowledge: number };
type Row = { family: string; id: string; name: string; rank: number; max: number; final: boolean;
  price: Cost; cumulative: Cost; prerequisites: Cost; smithSeconds: number; notes: string };
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
for (const u of UPGRADES) ranks("Forge", u.id, u.name, u.maxLevel, rank => cost((u.price ?? upgradePrice)(rank)));
ranks("Forge", "speed3", "War drums", 1, () => cost(SPEED3_PRICE));
for (const t of TRAINING) ranks("Smithy", t.id, t.name, t.max, rank => cost({ [rankPrice(rank)]: 1 }), zero(),
  "All smiths dedicated to this row; instantaneous requeue; production and infrastructure setup excluded", trainingSeconds);
const skillNodes = Object.fromEntries(TREES.flatMap(t => t.nodes).map(n => [n.id, n]));
function required(id: SkillId) {
  const needed = new Map<SkillId, number>();
  function visit(id: SkillId, rank: number) {
    if ((needed.get(id) ?? 0) >= rank) return;
    needed.set(id, rank);
    for (const p of skillNodes[id].requires) visit(p, skillNodes[id].full?.includes(p) ? SKILLS[p].max : 1);
  }
  for (const p of skillNodes[id].requires) visit(p, skillNodes[id].full?.includes(p) ? SKILLS[p].max : 1);
  return cost({}, [...needed].reduce((n, [id, rank]) => n + Array.from({ length: rank }, (_, r) => skillCost(id, r)).reduce((a, b) => a + b, 0), 0));
}
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

const samples = JSON.parse(readFileSync("docs/upgrade-production.json", "utf8")).samples;
if (!Array.isArray(samples) || !samples.length) throw new Error("No production samples; run measure-upgrade-production.ts first");
const profiles = ["early", "developed", "late"].map(id => {
  const group = samples.filter((s: any) => s.profile.id === id), p = group[0].profile;
  const hours = group.reduce((n: number, s: any) => n + s.mine.simulatedHours, 0);
  const metalRates = Object.fromEntries(METALS.map(k => [k, group.reduce((n: number, s: any) => n + s.mine.paid[k], 0) / hours]));
  return { id, rates: { ...metalRates, knowledge: group[0].library.nominalPerHour } as Cost, smiths: p.smiths,
    speed: id === "early" ? 1 : id === "developed" ? 1.15 : 1.45 };
});
function estimate(row: Row, p: typeof profiles[number]) {
  const total = add(row.cumulative, row.prerequisites);
  const missing = (Object.keys(total) as (keyof Cost)[]).filter(k => total[k] > 0 && p.rates[k] <= 0);
  const resourceHours = missing.length ? null : Math.max(...Object.keys(total).map(k => total[k as keyof Cost] ? total[k as keyof Cost] / p.rates[k as keyof Cost] : 0));
  const trainingHours = row.smithSeconds / p.smiths / p.speed / 3600;
  return { resourceHours, trainingHours, combinedFloorHours: resourceHours === null ? null : Math.max(resourceHours, trainingHours), missing };
}
const format = (hours: number) => hours < 1 ? `${(hours * 60).toFixed(1)} min` : hours < 24 ? `${hours.toFixed(1)} h` : hours < 365 * 24 ? `${(hours / 24).toFixed(1)} d` : `${(hours / 24 / 365).toFixed(2)} yr`;
const priceText = (p: Cost) => Object.entries(p).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(" + ") || "—";
const escape = (v: unknown) => `"${String(v).replaceAll('"', '""')}"`;
const columns = ["family", "id", "name", "rank", "max", "is_final", "copper_next", "silver_next", "gold_next", "knowledge_next",
  "copper_total", "silver_total", "gold_total", "knowledge_total", "knowledge_prerequisites", "smith_work_hours",
  ...profiles.flatMap(p => [`${p.id}_resource_hours`, `${p.id}_training_hours`, `${p.id}_combined_lower_bound_hours`, `${p.id}_unobserved_metals`]), "notes"];
const csvRows = rows.map(r => [r.family, r.id, r.name, r.rank, r.max, r.final, ...Object.values(r.price), ...Object.values(r.cumulative),
  r.prerequisites.knowledge, r.smithSeconds / 3600, ...profiles.flatMap(p => { const e = estimate(r, p); return [e.resourceHours ?? "", e.trainingHours, e.combinedFloorHours ?? "", e.missing.join(";")]; }), r.notes]);
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
const targets = { days: 730, individualSeconds: 730 * 86400 * late.smiths * late.speed };
const capped = (n: number, cap: number) => Array.from({ length: n }, (_, r) => Math.min(cap, Math.round(TRAINING_FIRST_SECONDS * TRAINING_GROWTH ** r))).reduce((a, b) => a + b, 0);
function solve(objective: (cap: number) => number) {
  let lo = 0, hi = 365 * 86400;
  for (let n = 0; n < 80; n++) { const m = (lo + hi) / 2; if (objective(m) > targets.individualSeconds) hi = m; else lo = m; }
  return (lo + hi) / 2 / 86400;
}
const capOne = solve(cap => capped(50, cap)), capAll = solve(cap => TRAINING.reduce((n, t) => n + capped(t.max, cap), 0));
const md: string[] = [
  "# Upgrade timing estimates", "", `Current source snapshot: ${new Date().toISOString().slice(0, 10)}. Analysis only; no game balance changes.`, "",
  "## Interpretation and limits", "",
  "The planning target is 730 days of normal progress with daily check-ins. Exact costs and Smithy work are calculated from current code. Resource waits are **scenario estimates**, not predictions from a new save. Preset infrastructure is already paid for, one upgrade is prioritized, income is held constant, every rank is restarted immediately, and there is no competing spending. Infrastructure construction, repairs, replacements and battle progression are excluded from those waits. Real acquisition from a new game is longer. Lower bounds are not added together as though each upgrade had its own Mine or staff.", "",
  "Mine samples run actual 1x simulation from fresh prospects with preset infrastructure, ordinary hazards and attentive prospect moves. They have a CPU limit and report exactly how much simulated time was reached. Unobserved metal means **unknown**, never zero wait. These short samples are startup averages and must not be extrapolated unchanged for two years. Knowledge wait columns use the exact nominal shelves × professors rate, excluding enchanted bonuses and casualties; measured Library results below show how far outcomes can differ.", "",
  "Smithy training uses wall-clock time, including time away, and a shared pool of at most six smiths. Fully researched Smiths' guild supplies a 1.45× speed multiplier. Assigning all six to one row means they cannot simultaneously train the other rows. Per-row resource and work lower bounds overlap via max(resource wait, training work); this does not model rank-by-rank resource availability. The manufacturing jobs currently have no simulation-side busy-smith filter, so the same named smith also continues generating metal while assigned to training.", "",
  "## Exact Smithy completion times", "", "From rank zero, ignoring resource/setup/requeue delays:", "",
  "| Upgrade | Ranks | Copper / Silver / Gold | One smith, no speed research | Six smiths, max research | Final rank with six |",
  "|---|---:|---:|---:|---:|---:|",
  ...smiths.map(r => `| ${r.name} | ${r.rank} | ${r.cumulative.copper} / ${r.cumulative.silver} / ${r.cumulative.gold} | ${format(r.smithSeconds / 3600)} | ${format(r.smithSeconds / 3600 / 6 / 1.45)} | ${format(trainingSeconds(r.rank - 1) / 3600 / 6 / 1.45)} |`), "",
  `All nine rows require **${format(totalWork / 3600 / 6 / 1.45)}** of six-smith work at best. One top 50-rank row requires **${format(smiths.find(r => r.rank === 50)!.smithSeconds / 3600 / 6 / 1.45)}**. This is why a two-year target must distinguish one focused row from completing the entire collection.`, "",
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
  `All Study skills together cost **${skillsTotal.knowledge} Knowledge**. Choosing the most expensive fully evolved path in each topic adds **${compatiblePathKnowledge} Knowledge**, giving **${skillsTotal.knowledge + compatiblePathKnowledge} Knowledge** for every compatible Study upgrade: **${format((skillsTotal.knowledge + compatiblePathKnowledge) / late.rates.knowledge)}** at late nominal income. Minimal prerequisite prices in individual rows must not be charged again when summing the complete tree. These budgets exclude setup and income growth.`, "",
  "DEFEND upgrade points currently have no upgrade purchase route. They accumulate one per new highest cleared wave, so there is no point-priced upgrade completion time to calculate yet.", "",
  "## Every finite upgrade: maximum rank", "",
  "Each cost below is that upgrade's own cumulative price. Study prerequisite Knowledge is additional and included in the CSV's wait estimates. Separate paths for a topic are alternatives, not a collection that can all be held at once. Shelf/staff purchase totals do not include Mine infrastructure. Normal tiles and bombs have no finite completion point; their repeat prices are not counted as final upgrades.", "",
  ...[...new Set(finals.map(r => r.family))].flatMap(family => [
    `### ${family}`, "", "| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |", "|---|---:|---|---:|---|",
    ...finals.filter(r => r.family === family).map(r => { const e = estimate(r, late);
      const time = r.family === "Smithy" ? `${format(e.trainingHours)} training; resources ${e.resourceHours === null ? "unknown" : format(e.resourceHours)}` : e.resourceHours === null ? `Unknown: ${e.missing.join(", ")} unobserved` : format(e.resourceHours);
      return `| ${r.name} | ${r.rank} | ${priceText(r.cumulative)} | ${r.prerequisites.knowledge || "—"} | ${time} |`; }), "",
  ]),
  "## What two years would require", "",
  `- **One focused 50-rank Smithy row:** keeping the 60-second start and 1.5× growth, reduce the per-rank cap from 365 days of one-smith work to approximately **${capOne.toFixed(2)} days** to produce a 730-day training-only total with six smiths and max speed research. This leaves the whole collection taking much longer.`,
  `- **All Smithy rows in two years:** with the same six-smith budget, a shared cap of approximately **${capAll.toFixed(2)} days** gives 730 days of aggregate training work. Rows must be scheduled, resources secured and every completion immediately requeued; add allowance for setup and daily sessions rather than treating this minimum as a promise.`,
  `- **Knowledge capstones:** at the late nominal rate of ${late.rates.knowledge} Knowledge/hour, two years generates **${Math.round(baseKnowledgeBudget).toLocaleString("en-US")} Knowledge** before spending. Holding the measured late enchanted rates constant instead would imply **${lateMeasuredKnowledge.map((n: number) => (n * 730 * 24 / 1e6).toFixed(0)).sort().join("–")} million Knowledge**. This is a sensitivity comparison, not a two-year simulation. Current skills cost only hundreds; their linear rank prices cannot create a two-year finish. Keep early ranks affordable and grow later ranks, accounting for enchanted-book income and the time spent building the Library.`,
  "- **Forge capstones:** resource costs are small relative to multi-year manufacturing capacity. To make their highest tiers arrive near two years, tune cumulative resource gates against a long-run Mine model with growth, ore access, losses and prospect resets, or tie the capstone to finite progression milestones. Do not multiply all early prices by a large constant.",
  "- **Recommended pacing:** first-hour purchases stay accessible; specialize over days/weeks; open advanced branches over months; reserve the strongest final ranks for roughly months 18–24. Specify whether a player should finish one specialization or every compatible upgrade by that point.", "",
  "## Offline and check-in effects", "",
  "The Mine and Library bank at most 24 hours. A daily visit can retain most wall-clock income, but longer absences lose the excess. The 120× catch-up setting controls replay throughput, not a free 120× progression multiplier. The 10× catch-up payout consumes ten seconds of bank for one simulation second: unchanged base Knowledge pays for elapsed bank time, while digging, accidents and rune-reading advance less physical simulation per paid hour. This changes unlock delays and bonus distributions, so offline-heavy play needs its own model. Smithy jobs continue on wall-clock time; only the current rank completes, with no automatic next rank. Daily visits add waiting between completions.", "",
  "## Reproduce", "", "```powershell", "node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-upgrade-production.ts",
  "node --experimental-transform-types --import ./tests/pin-random.ts tools/estimate-upgrades.ts", "```", "",
  "Measurement horizon defaults to 6 simulated hours per sample, with 30 CPU seconds maximum for each Mine. Set ESTIMATE_HOURS and ESTIMATE_CPU_SECONDS to change those limits. Source costs remain exact at the current snapshot. See upgrade-production.json for the full measurements and upgrade-estimates.csv for every individual rank and profile.", "",
];
writeFileSync("docs/UPGRADE_TIMING.md", md.join("\n"));
console.log(JSON.stringify({ rankRows: rows.length, finalUpgrades: finals.length,
  focused50Days: smiths.find(r => r.rank === 50)!.smithSeconds / 86400 / 6 / 1.45,
  allSmithyDays: totalWork / 86400 / 6 / 1.45, capOneDays: capOne, capAllDays: capAll,
  allSkillKnowledge: finals.filter(r => r.family === "Study skill").reduce((n, r) => n + r.cumulative.knowledge, 0) }, null, 2));
