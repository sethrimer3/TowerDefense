/** Everything the player keeps between defenses beyond the city itself:
 * the Commander's level (from experience), Training (timed ranks bought
 * with training points), the skill trees (bought with Valor), and what a
 * defense pays out. All of it folds into one `Bonuses` the battle reads.
 * Pure functions over the save, so tests drive them without a page. */
import { ENEMIES, NO_BONUSES, type Bonuses, type EnemyKind } from "./defend/catalog.ts";
import { SKILLS, SKILL_IDS, skillAvailable, skillCost, type SkillId } from "./skill-trees.ts";
import { TRAINING_SLOTS, trainingJob, trainingSeconds, type TrainingJob } from "./training-jobs.ts";
import type { Save } from "./save.ts";

/** What Training and the skill trees can raise: the battle's `Bonuses`, plus
 * the Gold and experience a defense pays. */
export type BonusTarget = keyof Bonuses | "gold" | "xp";
/** Bonuses that shorten a time: their percent divides instead of multiplies. */
const TIMES = new Set<BonusTarget>(["drill", "towerReload", "rebuild"]);

// ── Training ───────────────────────────────────────────────────────────
export type TrainingId = "troopHp" | "troopDamage" | "drill" | "towerDamage" | "towerReload" | "wallHp" | "keepHp" | "rebuild" | "bombDamage" | "gold";
export type TrainingRow = { id: TrainingId; group: keyof typeof TRAINING_GROUPS; name: string; per: number; cost: number; max: number };
export const TRAINING_GROUPS = { army: "Army", towers: "Towers", city: "City" } as const;
/** Each rank adds `per` percent to its target and costs `cost` training points. */
export const TRAINING: TrainingRow[] = [
  { id: "troopHp", group: "army", name: "Troop HP", per: 4, cost: 1, max: 50 },
  { id: "troopDamage", group: "army", name: "Troop damage", per: 4, cost: 1, max: 50 },
  { id: "drill", group: "army", name: "Drill speed", per: 3, cost: 1, max: 30 },
  { id: "towerDamage", group: "towers", name: "Tower damage", per: 4, cost: 1, max: 50 },
  { id: "towerReload", group: "towers", name: "Tower reload", per: 3, cost: 1, max: 30 },
  { id: "bombDamage", group: "towers", name: "Bomb damage", per: 5, cost: 1, max: 40 },
  { id: "wallHp", group: "city", name: "Wall HP", per: 5, cost: 1, max: 50 },
  { id: "keepHp", group: "city", name: "Keep HP", per: 5, cost: 1, max: 50 },
  { id: "rebuild", group: "city", name: "Rebuild speed", per: 4, cost: 1, max: 30 },
  { id: "gold", group: "city", name: "Gold found", per: 3, cost: 1, max: 50 },
];
export const TRAINING_IDS = TRAINING.map((t) => t.id);
/** Training points earned with each Commander level. */
export const TRAINING_PER_LEVEL = 1;

// ── Levels ─────────────────────────────────────────────────────────────
/** Lifetime experience needed to reach `level`. */
export const xpForLevel = (level: number) => 30 * level * level;
export function levelForXp(xp: number) {
  let level = 0;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

/** Points earned by levels, spent on ranks owned and in training (a
 * rank bought free with Dev free purchases spends none). */
export function trainingPoints(save: Save) {
  const earned = levelForXp(save.xp) * TRAINING_PER_LEVEL;
  const cost = (id: TrainingId) => TRAINING.find((t) => t.id === id)!.cost;
  const spent = TRAINING.reduce((n, t) => n + t.cost * save.training[t.id], 0) + save.trainingJobs.reduce((n, j) => n + cost(j.id), 0) - save.freeTraining;
  return { earned, spent, left: Math.max(0, earned - spent) };
}

/** How many ranks can be in training at once. */
export const trainingSlots = (save: Save) => TRAINING_SLOTS + skillTotal(save, "slots");

/** Where one Training row stands: its percent now and after one more rank. */
export function trainingStep(save: Save, id: TrainingId) {
  const row = TRAINING.find((t) => t.id === id)!, ranks = save.training[id];
  const maxed = ranks + (trainingJob(save.trainingJobs, id) ? 1 : 0) >= row.max;
  return { now: ranks * row.per, next: (ranks + 1) * row.per, maxed, affordable: save.settings.freePurchases || trainingPoints(save).left >= row.cost };
}

/** Starts training one rank of `id` at `now` (ms): its points are spent at
 * once, the rank counts once its time is up (`settleTraining`). Free
 * purchases train at once. */
export function startTraining(save: Save, id: TrainingId, now: number): boolean {
  const row = TRAINING.find((t) => t.id === id)!, step = trainingStep(save, id);
  if (step.maxed || trainingJob(save.trainingJobs, id)) return false;
  if (save.settings.freePurchases) {
    save.training[id]++;
    save.freeTraining += row.cost;
    return true;
  }
  if (!step.affordable || save.trainingJobs.length >= trainingSlots(save)) return false;
  save.trainingJobs.push({ id, startedAt: now, completesAt: now + trainingSeconds(save.training[id]) * 1000 });
  return true;
}

/** Stops the rank in training for `id`, giving its points back. */
export function cancelTraining(save: Save, id: TrainingId): boolean {
  const before = save.trainingJobs.length;
  save.trainingJobs = save.trainingJobs.filter((j) => j.id !== id);
  return save.trainingJobs.length < before;
}

/** Counts every rank whose time is up by `now`; returns how many. */
export function settleTraining(save: Save, now: number): number {
  const done = save.trainingJobs.filter((j: TrainingJob) => j.completesAt <= now);
  for (const j of done) save.training[j.id]++;
  save.trainingJobs = save.trainingJobs.filter((j) => j.completesAt > now);
  return done.length;
}

// ── Skill trees ────────────────────────────────────────────────────────
/** A skill's state for the page: its price, and whether it can be bought. */
export function skillPurchase(save: Save, id: SkillId) {
  const level = save.skills[id], price = skillCost(id, level);
  const maxed = level >= SKILLS[id].max, available = skillAvailable(id, save.skills);
  const affordable = save.settings.freePurchases || save.valor >= price;
  return { level, price, maxed, available, affordable, canBuy: !maxed && available && affordable };
}

export function buySkill(save: Save, id: SkillId): boolean {
  const p = skillPurchase(save, id);
  if (!p.canBuy) return false;
  if (!save.settings.freePurchases) save.valor -= p.price;
  save.skills[id]++;
  return true;
}

/** Everything every owned skill rank adds to `target`. */
function skillTotal(save: Save, target: BonusTarget | "slots" | "ironPerWave") {
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
export const KILL_GOLD: Record<EnemyKind, number> = { roach: 2, orc: 5, ogre: 14, bat: 4, warlord: 150 };
/** Gold for holding a wave. */
export const waveGold = (wave: number) => 10 + 5 * wave;
/** Experience a kill pays, before bonuses: what the enemy costs a wave, and
 * a warlord's own share. */
export const killXp = (kind: EnemyKind) => (kind === "warlord" ? 60 : ENEMIES[kind].cost);

/** What holding a wave pays: Gold, iron bars, a steel bar for each boss
 * wave held, and Valor for each wave past the best before it. */
export function waveReward(save: Save, wave: number, best: number) {
  return {
    gold: waveGold(wave) * multiplier(save, "gold"),
    ironBar: 1 + skillTotal(save, "ironPerWave"),
    steelBar: wave % 10 === 0 ? wave / 10 : 0,
    valor: wave > best ? (wave % 10 === 0 ? 3 : 1) : 0,
  };
}

/** Pays `slain` (kills since the last payment): Gold and experience. */
export function payKills(save: Save, slain: Partial<Record<EnemyKind, number>>) {
  let gold = 0, xp = 0;
  for (const [kind, n] of Object.entries(slain) as [EnemyKind, number][]) {
    gold += KILL_GOLD[kind] * n;
    xp += killXp(kind) * n;
  }
  const level = levelForXp(save.xp);
  save.gold += gold * multiplier(save, "gold");
  save.xp += Math.round(xp * multiplier(save, "xp"));
  return { gold, levelsGained: levelForXp(save.xp) - level };
}

export function payWave(save: Save, wave: number) {
  const r = waveReward(save, wave, save.defend.bestWave);
  save.gold += r.gold;
  save.ironBar += r.ironBar;
  save.steelBar += r.steelBar;
  save.valor += r.valor;
  return r;
}

/** Shown as a whole number, rounded down. */
export const whole = (n: number) => Math.floor(n + 1e-9);
