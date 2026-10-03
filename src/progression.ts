/** Everything the player keeps between defenses beyond the city itself:
 * the Smithy's upgrades (timed ranks bought with the Smithy points the
 * mine's smithy makes, and worked by its smiths; `training` in the save), the
 * skill trees (bought with Knowledge), upgrade points (one for each new best
 * wave), and what a defense pays out. All of it folds into one `Bonuses` the
 * battle reads. Pure functions over the save, so tests drive them without a
 * page. */
import { NO_BONUSES, type Bonuses, type EnemyKind } from "./defend/catalog.ts";
import { SKILLS, SKILL_IDS, skillAvailable, skillCost, type SkillId } from "./skill-trees.ts";
import { trainingJob, trainingSeconds, type TrainingJob } from "./training-jobs.ts";
import type { Metal } from "./mine/sim.ts";
import type { Save } from "./save.ts";

/** What the Smithy and the skill trees can raise: the battle's `Bonuses`,
 * the Gold a defense pays, and how fast the Smithy's upgrades are worked. */
export type BonusTarget = keyof Bonuses | "gold" | "smithing";
/** Bonuses that shorten a time: their percent divides instead of multiplies. */
const TIMES = new Set<BonusTarget>(["drill", "towerReload", "rebuild", "smithing"]);

// ── The Smithy's upgrades (Training) ───────────────────────────────────
export type TrainingId = "troopHp" | "troopDamage" | "drill" | "towerDamage" | "towerReload" | "wallHp" | "keepHp" | "rebuild" | "bombDamage" | "gold";
export type TrainingRow = { id: TrainingId; group: keyof typeof TRAINING_GROUPS; name: string; per: number; max: number };
export const TRAINING_GROUPS = { army: "Army", towers: "Towers", city: "City" } as const;
/** Each rank adds `per` percent to its target, and costs a Smithy point
 * (`rankPrice`). */
export const TRAINING: TrainingRow[] = [
  { id: "troopHp", group: "army", name: "Troop HP", per: 4, max: 50 },
  { id: "troopDamage", group: "army", name: "Troop damage", per: 4, max: 50 },
  { id: "drill", group: "army", name: "Drill speed", per: 3, max: 30 },
  { id: "towerDamage", group: "towers", name: "Tower damage", per: 4, max: 50 },
  { id: "towerReload", group: "towers", name: "Tower reload", per: 3, max: 30 },
  { id: "bombDamage", group: "towers", name: "Bomb damage", per: 5, max: 40 },
  { id: "wallHp", group: "city", name: "Wall HP", per: 5, max: 50 },
  { id: "keepHp", group: "city", name: "Keep HP", per: 5, max: 50 },
  { id: "rebuild", group: "city", name: "Rebuild speed", per: 4, max: 30 },
  { id: "gold", group: "city", name: "Gold found", per: 3, max: 50 },
];
export const TRAINING_IDS = TRAINING.map((t) => t.id);

/** The Smithy point a row's next rank costs, with `ranks` owned: copper for
 * the first ten, silver to twenty-five, gold after. */
export const rankPrice = (ranks: number): Metal => (ranks < 10 ? "copper" : ranks < 25 ? "silver" : "gold");

/** Smiths working on an upgrade: busy at the smithy until it's done. */
export const busySmiths = (save: Save) => new Set(save.trainingJobs.flatMap((j) => j.smiths));

/** Where one row stands: its percent now and after one more rank, the
 * point the rank costs, and whether it is maxed or affordable. */
export function trainingStep(save: Save, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, ranks = save.training[id];
  const maxed = ranks + (trainingJob(save.trainingJobs, id) ? 1 : 0) >= row.max, metal = rankPrice(ranks);
  return { now: ranks * row.per, next: (ranks + 1) * row.per, maxed, metal, affordable: save.settings.freePurchases || save.smithy[metal] >= 1 };
}

/** Starts one rank of `id`, worked by `smith` (a smith with no upgrade): its
 * point is spent at once, the rank counts once its work is done
 * (`settleTraining`). Free purchases finish it at once. */
export function startTraining(save: Save, id: TrainingId, smith: string): boolean {
  const step = trainingStep(save, id);
  if (step.maxed || trainingJob(save.trainingJobs, id)) return false;
  if (save.settings.freePurchases) {
    save.training[id]++;
    return true;
  }
  if (!step.affordable || busySmiths(save).has(smith)) return false;
  save.smithy[step.metal]--;
  save.trainingJobs.push({ id, left: trainingSeconds(save.training[id]) * 1000, smiths: [smith] });
  return true;
}

/** Puts another smith (with no upgrade) on the rank in work for `id`: the
 * work goes that much faster. */
export function addSmith(save: Save, id: TrainingId, smith: string): boolean {
  const job = trainingJob(save.trainingJobs, id);
  if (!job || busySmiths(save).has(smith)) return false;
  job.smiths.push(smith);
  return true;
}
/** Takes one smith off the rank in work for `id`; the last one only by
 * cancelling (false: ask the player first). */
export function removeSmith(save: Save, id: TrainingId): boolean {
  const job = trainingJob(save.trainingJobs, id);
  if (!job || job.smiths.length <= 1) return false;
  job.smiths.pop();
  return true;
}

/** Stops the rank in work for `id`, giving its point back. */
export function cancelTraining(save: Save, id: TrainingId): boolean {
  const job = trainingJob(save.trainingJobs, id);
  if (!job) return false;
  save.smithy[rankPrice(save.training[id])]++;
  save.trainingJobs = save.trainingJobs.filter((j) => j !== job);
  return true;
}

/** Milliseconds the rank in work for `id` has left at its smiths' pace. */
export function trainingLeft(save: Save, id: TrainingId) {
  const job = trainingJob(save.trainingJobs, id);
  if (!job) return 0;
  return job.smiths.length ? (job.left * multiplier(save, "smithing")) / job.smiths.length : Infinity;
}

/** Works every rank on from the last settling to `now` (each smith on it
 * adding a share; `smithing` speeds them all) and counts those done; returns
 * how many. With `smiths` (the smithy's crew by name), smiths no longer
 * there leave their upgrades. */
export function settleTraining(save: Save, now: number, smiths?: ReadonlySet<string>): number {
  // A clock of 0 has never been settled (a new save).
  const dt = Math.max(0, now - (save.trainingClock || now));
  save.trainingClock = now;
  const pace = 1 / multiplier(save, "smithing");
  let done = 0;
  for (const job of save.trainingJobs) {
    if (smiths) job.smiths = job.smiths.filter((n) => smiths.has(n));
    job.left -= dt * job.smiths.length * pace;
    if (job.left <= 0) {
      save.training[job.id]++;
      done++;
    }
  }
  save.trainingJobs = save.trainingJobs.filter((j) => j.left > 0);
  return done;
}

// ── Skill trees ────────────────────────────────────────────────────────
/** A skill's state for the page: its price, and whether it can be bought. */
export function skillPurchase(save: Save, id: SkillId) {
  const level = save.skills[id], price = skillCost(id, level);
  const maxed = level >= SKILLS[id].max, available = skillAvailable(id, save.skills);
  const affordable = save.settings.freePurchases || save.knowledge >= price;
  return { level, price, maxed, available, affordable, canBuy: !maxed && available && affordable };
}

export function buySkill(save: Save, id: SkillId): boolean {
  const p = skillPurchase(save, id);
  if (!p.canBuy) return false;
  if (!save.settings.freePurchases) save.knowledge -= p.price;
  save.skills[id]++;
  return true;
}

/** Everything every owned skill rank adds to `target`. */
export function skillTotal(save: Save, target: BonusTarget | "smiths" | "copperPerWave") {
  return SKILL_IDS.reduce((n, id) => (SKILLS[id].effect.target === target ? n + SKILLS[id].effect.per * save.skills[id] : n), 0);
}

/** Percent added to `target` by Training and skills together. */
function percent(save: Save, target: BonusTarget) {
  const row = TRAINING.find((t) => t.id === target);
  return (row ? row.per * save.training[row.id] : 0) + skillTotal(save, target);
}

/** `target` as a multiplier: 1 plus its percent, or for a time, 1 over that. */
export function multiplier(save: Save, target: BonusTarget) {
  const m = 1 + percent(save, target) / 100;
  return TIMES.has(target) ? 1 / m : m;
}

/** What the next defense fights with. */
export function bonuses(save: Save): Bonuses {
  const out = { ...NO_BONUSES } as Bonuses;
  for (const k of Object.keys(out) as (keyof Bonuses)[]) out[k] = multiplier(save, k);
  return out;
}

// ── Rewards ────────────────────────────────────────────────────────────
/** Gold a kill pays, before bonuses. */
export const KILL_GOLD: Record<EnemyKind, number> = { roach: 2, orc: 5, ogre: 14, bat: 4, warlord: 150, mother: 10, broodling: 2, snake: 3, dragon: 30, shieldBearer: 500, aegis: 10000, darkKnight: 60, bombOrc: 20, bombBird: 40, voidSparrow: 50000, shieldLesser: 100, shieldGreater: 2500, poisonLesser: 100, poisonBearer: 500, poisonGreater: 2500, poisonSovereign: 10000, siegeBeetle: 50, burrowingMole: 25, necromancer: 80, skeleton: 0, bannerCaptain: 70, mirrorKnight: 60, leechSwarm: 20, ashPhoenix: 100, phoenixEgg: 0, blinkImp: 30 };
/** Gold for holding a wave. */
export const waveGold = (wave: number) => 10 + 5 * wave;
/** What holding a wave pays: Gold, copper, silver for each boss wave held,
 * and for each wave past the best before it Knowledge and an upgrade point. */
export function waveReward(save: Save, wave: number, best: number) {
  return {
    gold: waveGold(wave) * multiplier(save, "gold"),
    copper: 1 + skillTotal(save, "copperPerWave"),
    silver: wave % 10 === 0 ? wave / 10 : 0,
    knowledge: wave > best ? (wave % 10 === 0 ? 3 : 1) : 0,
    upgrade: wave > best ? 1 : 0,
  };
}

/** Pays `slain` (kills since the last payment) in Gold. */
export function payKills(save: Save, slain: Partial<Record<EnemyKind, number>>) {
  let gold = 0;
  for (const [kind, n] of Object.entries(slain) as [EnemyKind, number][]) gold += KILL_GOLD[kind] * n;
  save.gold += gold * multiplier(save, "gold");
  return { gold };
}

export function payWave(save: Save, wave: number) {
  const r = waveReward(save, wave, save.defend.bestWave);
  save.gold += r.gold;
  save.copper += r.copper;
  save.silver += r.silver;
  save.knowledge += r.knowledge;
  save.upgradePoints += r.upgrade;
  return r;
}

/** Shown as a whole number, rounded down. */
export const whole = (n: number) => Math.floor(n + 1e-9);
