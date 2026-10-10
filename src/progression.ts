/** Everything the player keeps between defenses beyond the city itself:
 * the Smithy's upgrades (timed ranks bought with the Smithy points the
 * mine's smithy makes, and worked by its smiths; `training` in the save), the
 * skill trees (bought with Knowledge), upgrade points (one for each new best
 * wave), and what a defense pays out. All of it folds into one `Bonuses` the
 * battle reads. Pure functions over the save, so tests drive them without a
 * page. */
import { NO_BONUSES, type Bonuses } from "./defend/catalog.ts";
import { SKILLS, SKILL_IDS, TREES, skillAvailable, skillCost, type SkillId, type TreeId } from "./skill-trees.ts";
import { placedBattlePaths } from "./specializations.ts";
import { spellPath } from "./knowledge-paths.ts";
import { trainingJob, trainingSeconds, type TrainingJob } from "./training-jobs.ts";
import type { Metal, Metals } from "./mine/sim.ts";
import type { Save } from "./save.ts";
import type { SettingKey } from "./settings.ts";
import { ECONOMY, quadraticCost } from "./economy.ts";

/** What the Smithy and the skill trees can raise: the battle's `Bonuses`,
 * and how fast the Smithy's upgrades are worked. */
export type BonusTarget = Exclude<keyof Bonuses, "paths" | "banner" | "structurePaths" | "spikePaths" | "necromancy" | "meteor"> | "smithing";
/** Bonuses that shorten a time: their percent divides instead of multiplies. */
const TIMES = new Set<BonusTarget>(["drill", "towerReload", "rebuild", "smithing"]);

/** The mine's metal a new game starts with, for its first Forge buys. */
export const STARTING_METAL: Metals = { copper: 10, silver: 0, gold: 0 };

// ── The Smithy's upgrades (Training) ───────────────────────────────────
export type TrainingId = "troopHp" | "troopDamage" | "drill" | "towerDamage" | "towerReload" | "wallHp" | "keepHp" | "rebuild" | "bombDamage" | "undeadHp" | "undeadDamage" | "meteorDamage" | "meteorRadius";
export type TrainingRow = { id: TrainingId; group: keyof typeof TRAINING_GROUPS; name: string; per: number; max: number };
export const TRAINING_GROUPS = { army: "Army", towers: "Towers", city: "City", spells: "Spells" } as const;
/** Each rank adds `per` percent to its target, with quadratic metal cost
 * (`rankCost`) in its tier (`rankPrice`). */
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
  { id: "undeadHp", group: "spells", name: "Risen HP", per: 5, max: 40 },
  { id: "undeadDamage", group: "spells", name: "Risen damage", per: 5, max: 40 },
  { id: "meteorDamage", group: "spells", name: "Meteor damage", per: 5, max: 40 },
  { id: "meteorRadius", group: "spells", name: "Meteor blast radius", per: 3, max: 30 },
];
export const TRAINING_IDS = TRAINING.map((t) => t.id);

// ── Dev research ───────────────────────────────────────────────────────
/** The dev setting that counts every rank of the Smithy's rows (or of one skill tree) as bought. */
export const DEV_RESEARCH = {
  training: "devSmithy", command: "devCommand", stewardship: "devStewardship", mine: "devMine", library: "devLibrary",
} as const satisfies Record<TreeId | "training", SettingKey>;
const TREE_OF = Object.fromEntries(TREES.flatMap((t) => t.nodes.map((n) => [n.id, t.id]))) as Record<SkillId, TreeId>;
/** A Smithy row's ranks: the ones bought, or every one under dev research. */
export const trainingRank = (save: Save, id: TrainingId) =>
  save.settings.devSmithy ? TRAINING.find((t) => t.id === id)!.max : save.training[id];
/** A skill's ranks: the ones bought, or every one under dev research. */
export const skillRank = (save: Save, id: SkillId) => (save.settings[DEV_RESEARCH[TREE_OF[id]]] ? SKILLS[id].max : save.skills[id]);
/** Every skill's ranks as `skillRank` counts them. */
const skillRanks = (save: Save) => Object.fromEntries(SKILL_IDS.map((id) => [id, skillRank(save, id)])) as Record<SkillId, number>;

/** The metal tier a row's next rank costs, with `ranks` owned: copper for
 * the first ten, silver to twenty-five, gold after. */
export const rankPrice = (ranks: number): Metal => (ranks < 10 ? "copper" : ranks < 25 ? "silver" : "gold");
/** The next rank's metal amount; the metal tier still changes at 10/25. */
export const rankCost = (ranks: number) => quadraticCost(1, ranks, ECONOMY.training);

/** Smiths working on an upgrade: busy at the smithy until it's done. */
export const busySmiths = (save: Save) => new Set([...save.trainingJobs.flatMap((j) => j.smiths), ...(save.forgeJob?.smiths ?? [])]);

/** Where one row stands: its percent now and after one more rank, the
 * metal bill the rank costs, and whether it is maxed or affordable. */
export function trainingStep(save: Save, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, ranks = trainingRank(save, id);
  const maxed = ranks + (trainingJob(save.trainingJobs, id) ? 1 : 0) >= row.max, metal = rankPrice(ranks);
  const amount = rankCost(ranks);
  return { now: ranks * row.per, next: (ranks + 1) * row.per, maxed, metal, amount, affordable: save.settings.devMode || save.smithy[metal] >= amount };
}

/** Starts one rank of `id`, worked by `smith` (a smith with no upgrade): its
 * metal bill is spent at once, the rank counts once its work is done
 * (`settleTraining`). Dev: instantaneous research finishes it at once, smith
 * or none, and unlimited money spends no metal. */
export function startTraining(save: Save, id: TrainingId, smith: string): boolean {
  const step = trainingStep(save, id);
  if (step.maxed || trainingJob(save.trainingJobs, id) || !step.affordable) return false;
  if (!save.settings.instantResearch && busySmiths(save).has(smith)) return false;
  if (!save.settings.devMode) save.smithy[step.metal] -= step.amount;
  if (save.settings.instantResearch) {
    save.training[id]++;
    return true;
  }
  save.trainingJobs.push({ id, left: trainingSeconds(save.training[id]) * 1000, smiths: [smith], paid: save.settings.devMode ? 0 : step.amount });
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
  save.smithy[rankPrice(save.training[id])] += job.paid ?? rankCost(save.training[id]);
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
  const level = skillRank(save, id), price = skillCost(id, level);
  const maxed = level >= SKILLS[id].max, available = skillAvailable(id, skillRanks(save));
  const affordable = save.settings.devMode || save.knowledge >= price;
  return { level, price, maxed, available, affordable, canBuy: !maxed && available && affordable };
}

export function buySkill(save: Save, id: SkillId, prepaid = false): boolean {
  if (prepaid) {
    // Temporary dev unlocks must not discard a paid project on completion.
    if (save.skills[id] >= SKILLS[id].max || !skillAvailable(id, save.skills)) return false;
    save.skills[id]++;
    return true;
  }
  const p = skillPurchase(save, id);
  if (p.maxed || !p.available || !p.canBuy) return false;
  if (!save.settings.devMode) save.knowledge -= p.price;
  save.skills[id]++;
  return true;
}

/** Everything every owned skill rank adds to `target`. */
export function skillTotal(save: Save, target: (typeof SKILLS)[SkillId]["effect"]["target"]) {
  return SKILL_IDS.reduce((n, id) => (SKILLS[id].effect.target === target ? n + SKILLS[id].effect.per * skillRank(save, id) : n), 0);
}

/** Percent added to `target` by Training and skills together. */
function percent(save: Save, target: BonusTarget) {
  const row = TRAINING.find((t) => t.id === target);
  return (row ? row.per * trainingRank(save, row.id) : 0) + skillTotal(save, target);
}

/** `target` as a multiplier: 1 plus its percent, or for a time, 1 over that. */
export function multiplier(save: Save, target: BonusTarget) {
  const m = 1 + percent(save, target) / 100;
  return TIMES.has(target) ? 1 / m : m;
}

/** What the next defense fights with. */
export function bonuses(save: Save): Bonuses {
  const out = { ...NO_BONUSES } as Bonuses;
  for (const k of Object.keys(out) as Exclude<keyof Bonuses, "paths" | "banner" | "structurePaths" | "spikePaths" | "necromancy" | "meteor">[]) out[k] = multiplier(save, k);
  if (SKILL_IDS.some(id => id.startsWith("banner") && skillRank(save, id) > 0)) out.banner = { cooldown: 10 - skillTotal(save, "bannerCooldown"), defense: skillTotal(save, "bannerDefense") / 100, reach: 5 + skillTotal(save, "bannerReach"), damage: 1 + skillTotal(save, "bannerDamage") / 100, march: 1 + skillTotal(save, "bannerMarch") / 100, life: 1 + skillTotal(save, "bannerLife") / 100, regen: skillTotal(save, "bannerRegen") / 100 };
  Object.assign(out, placedBattlePaths(save));
  const necromancy = spellPath(save, "necromancy");
  if (necromancy) out.necromancy = necromancy;
  const meteor = spellPath(save, "meteor");
  if (meteor) out.meteor = meteor;
  return out;
}

// ── Rewards ────────────────────────────────────────────────────────────
/** DEFEND pays only one upgrade point for clearing a new highest wave.
 * Record it with the payment so retries cannot award the same wave twice. */
export function payWave(save: Save, wave: number) {
  const upgrade = Number.isInteger(wave) && wave > save.defend.bestWave ? 1 : 0;
  if (upgrade) {
    save.defend.bestWave = wave;
    save.upgradePoints++;
  }
  return { upgrade };
}

/** Shown as a whole number, rounded down. */
export const whole = (n: number) => Math.floor(n + 1e-9);
