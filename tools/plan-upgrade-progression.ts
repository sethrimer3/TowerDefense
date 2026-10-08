/** A transparent capital-budget forecast, not a multi-year physical sim.
 * Rates are measured scenarios. Each setup is funded before its new rate
 * applies; all income is conserved across phases and competing purchases. */
import { BUILDINGS } from "../src/mine/buildings.ts";
import { hirePrice, upgradePrice, METALS } from "../src/mine/sim.ts";
import { shelfPrice, librarianPrice, labPrice } from "../src/library/sim.ts";
import { STARTING_METAL } from "../src/progression.ts";
import { skillCost, type SkillId } from "../src/skill-trees.ts";
import { researchSeconds } from "../src/research-jobs.ts";

export type Budget = { copper: number; silver: number; gold: number; knowledge: number };
const empty = (): Budget => ({ copper: 0, silver: 0, gold: 0, knowledge: 0 });
const add = (a: Budget, b: Partial<Budget>) => { for (const key of Object.keys(a) as (keyof Budget)[]) a[key] += b[key] ?? 0; };
const range = (from: number, to: number, price: (rank: number) => Partial<Budget>) => {
  const total = empty(); for (let r = from; r < to; r++) add(total, price(r)); return total;
};
const skills = (id: SkillId, from: number, to: number) => range(from, to, r => ({ knowledge: skillCost(id, r) }));

export function planProgression(rates: Budget[], finalShelves: number, enchantedMultiplier: number) {
  const wallet = { ...STARTING_METAL, knowledge: 0 };
  let hours = 0, income = { ...rates[0], knowledge: 0 };
  const stages: { name: string; hours: number; cost: Budget; rates: Budget }[] = [];
  function earn(time: number) { for (const k of Object.keys(wallet) as (keyof Budget)[]) wallet[k] += time * income[k]; hours += time; }
  function fund(name: string, bill: Budget, nextRates: Budget) {
    const wait = Math.max(0, ...Object.keys(wallet).map(k => Math.max(0, bill[k as keyof Budget] - wallet[k as keyof Budget]) / income[k as keyof Budget] || 0));
    if (!Number.isFinite(wait)) throw new Error(`Unfundable phase: ${name}`);
    earn(wait);
    for (const k of Object.keys(wallet) as (keyof Budget)[]) wallet[k] -= bill[k];
    income = { ...nextRates };
    stages.push({ name, hours, cost: bill, rates: { ...income } });
  }
  const initial = range(1, 5, hirePrice);
  add(initial, range(0, 6, shelfPrice)); add(initial, range(0, 4, librarianPrice));
  fund("5 workers; 6 shelves / 2 professors / 1 researcher", initial, { ...rates[0], knowledge: 12 });
  const middle = empty();
  for (const b of BUILDINGS) add(middle, range(1, 3, r => upgradePrice(b, r)));
  add(middle, range(5, 15, hirePrice)); add(middle, skills("coffee", 0, 6)); add(middle, skills("waterproofing", 0, 2));
  add(middle, skills("scholars", 0, 3)); add(middle, skills("tactician", 0, 1));
  fund("Mine level 3 / 15 workers; Coffee 6 / Waterproofing 2", middle, { ...rates[1], knowledge: 12 });
  const late = empty();
  for (const b of BUILDINGS) add(late, range(3, 5, r => upgradePrice(b, r)));
  add(late, range(15, 25, hirePrice)); add(late, skills("coffee", 6, 12)); add(late, skills("waterproofing", 2, 4));
  fund("Mine level 5 / 25 workers; Coffee 12 / Waterproofing 4", late, { ...rates[2], knowledge: 12 });
  const library = range(6, finalShelves, shelfPrice);
  add(library, range(4, 16, librarianPrice)); add(library, range(1, 5, labPrice));
  fund(`Library ${finalShelves} shelves / 10 professors / 4 shelvers / 2 researchers`, library, { ...rates[2], knowledge: finalShelves * 10 });
  const protectedLibrary = empty();
  for (const [id, max] of [["fireproofWood", 10], ["fireTraining", 5], ["nightWatch", 9]] as const) add(protectedLibrary, skills(id, 0, max));
  fund("Library fire precautions fully researched", protectedLibrary, income);
  // Setup bills include utility research; its laboratory work is tiny
  // beside capital waits and overlaps those waits. Target work is separate.
  const base = { hours, wallet: { ...wallet }, income: { ...income } };
  const focused = (bill: Budget, workHours: number) => {
    const wait = Math.max(0, ...Object.keys(wallet).map(k => Math.max(0, bill[k as keyof Budget] - base.wallet[k as keyof Budget]) / base.income[k as keyof Budget] || 0));
    return base.hours + wait + workHours;
  };
  // Ink's ranks actually change the following interval's income. Pay each
  // rank once and spend laboratory work before enabling its next bonus.
  for (let rank = 0; rank < 10; rank++) {
    const bill = skillCost("enchantedInk", rank);
    earn(Math.max(0, (bill - wallet.knowledge) / income.knowledge));
    wallet.knowledge -= bill;
    earn(researchSeconds(rank) / 3600 / 2);
    income.knowledge = finalShelves * 10 * (1 + (enchantedMultiplier - 1) * (rank + 1) / 10);
  }
  return { stages, infrastructureHours: base.hours, focused, enchantedHours: hours, finalKnowledgePerHour: income.knowledge };
}

export function sampledRates(samples: any[]): Budget[] {
  return ["early", "developed", "late"].map(id => {
    const rows = samples.filter(s => s.profile.id === id);
    const hours = rows.reduce((n, s) => n + s.mine.simulatedHours, 0);
    return { ...Object.fromEntries(METALS.map(k => [k, rows.reduce((n, s) => n + s.mine.paid[k], 0) / hours])), knowledge: 0 } as Budget;
  });
}
