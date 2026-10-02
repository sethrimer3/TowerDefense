/** The one save, kept in localStorage under its own key (another game served
 * from the same site never shares it). Loading is defensive: `defaults()`
 * defines every field, and `decode()` keeps only what is well formed. */
import { decodeDefendSave, defaultDefendSave, type DefendSave } from "./defend/progress.ts";
import { TRAINING, TRAINING_IDS, type TrainingId } from "./progression.ts";
import { SKILLS, SKILL_IDS, type SkillId } from "./skill-trees.ts";
import type { TrainingJob } from "./training-jobs.ts";
import { decodeSettings, defaultSettings, type Settings } from "./settings.ts";
import { METALS, decodeMineSave, noMetals, type MineSave, type Metals } from "./mine/sim.ts";
import { decodeLibrarySave, type LibrarySave } from "./library/sim.ts";

export const SAVE_KEY = "towerdefense.v1";
export const SAVE_VERSION = 1;

export type Save = {
  version: number;
  /** Earned in battle, spent in the Armory (and Gold on the mine and the
   * library). Gold keeps its fractions (bonuses). Saves from before copper
   * and silver called them `ironBar` and `steelBar`. */
  gold: number;
  copper: number;
  silver: number;
  /** One for each new best wave held; banked for what is to come. Saves
   * from before them start with one for each wave of the best. */
  upgradePoints: number;
  /** Smithy points the mine's smithy has made (every hundred bars of a
   * metal), spent on the Smithy's upgrades. */
  smithy: Metals;
  /** Earned in the Library (shelves × librarians an hour, idle too) and by
   * holding past the best wave; spent on the skill trees. Keeps its fractions.
   * Saves from before it was renamed call it `valor`. */
  knowledge: number;
  skills: Record<SkillId, number>;
  /** The Smithy's upgrades: ranks completed per row, the ranks in work, and
   * when their work was last settled (ms). */
  training: Record<TrainingId, number>;
  trainingJobs: TrainingJob[];
  trainingClock: number;
  defend: DefendSave;
  /** The mine as last saved (null until it first runs). */
  mine: MineSave | null;
  /** The library's shelves, books, ladders and librarians (null until it first shows). */
  library: LibrarySave | null;
  settings: Settings;
};

export function defaults(): Save {
  return {
    version: SAVE_VERSION,
    gold: 0,
    copper: 0,
    silver: 0,
    upgradePoints: 0,
    smithy: noMetals(),
    knowledge: 0,
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>,
    training: Object.fromEntries(TRAINING_IDS.map((id) => [id, 0])) as Record<TrainingId, number>,
    trainingJobs: [],
    trainingClock: 0,
    defend: defaultDefendSave(),
    mine: null,
    library: null,
    settings: defaultSettings(),
  };
}

const num = (v: unknown, fallback: number, min = 0, max = 1e15) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const int = (v: unknown, fallback: number, min = 0, max = 1e9) =>
  Number.isInteger(v) ? Math.min(max, Math.max(min, v as number)) : fallback;

/** A save from its stored JSON: every well-formed field kept, the rest
 * defaulted. A newer or unreadable save starts afresh. */
export function decode(raw: string | null): Save {
  const d = defaults();
  let s: any;
  try {
    s = raw ? JSON.parse(raw) : null;
  } catch {
    return d;
  }
  if (!s || typeof s !== "object" || !Number.isInteger(s.version) || s.version > SAVE_VERSION) return d;
  d.gold = num(s.gold, 0);
  d.copper = int(s.copper ?? s.ironBar, 0);
  d.silver = int(s.silver ?? s.steelBar, 0);
  for (const k of METALS) d.smithy[k] = int(s.smithy?.[k], 0);
  d.knowledge = num(s.knowledge ?? s.valor, 0);
  for (const id of SKILL_IDS) d.skills[id] = int(s.skills?.[id], 0, 0, SKILLS[id].max);
  for (const t of TRAINING) d.training[t.id] = int(s.training?.[t.id], 0, 0, t.max);
  d.trainingJobs = decodeJobs(s.trainingJobs, d.training);
  d.trainingClock = num(s.trainingClock, 0);
  d.defend = decodeDefendSave(s.defend);
  d.upgradePoints = int(s.upgradePoints, d.defend.bestWave);
  d.mine = decodeMineSave(s.mine);
  d.library = decodeLibrarySave(s.library);
  d.settings = decodeSettings(s.settings);
  return d;
}

/** Ranks in work on known rows, one per row, short of the row's most ranks,
 * each smith on one only. A rank in training from before the Smithy (timed
 * by the clock, with no smiths) is counted done. */
function decodeJobs(list: unknown, training: Record<TrainingId, number>): TrainingJob[] {
  if (!Array.isArray(list)) return [];
  const out: TrainingJob[] = [];
  for (const j of list) {
    const row = TRAINING.find((t) => t.id === j?.id);
    if (!row || out.some((o) => o.id === row.id) || training[row.id] >= row.max) continue;
    if (j.left === undefined && Number.isFinite(j.completesAt)) {
      training[row.id]++;
      continue;
    }
    if (!Number.isFinite(j.left) || j.left <= 0 || !Array.isArray(j.smiths)) continue;
    const smiths = j.smiths.filter((n: unknown) => typeof n === "string" && n.length > 0 && n.length <= 32 && !out.some((o) => o.smiths.includes(n)));
    out.push({ id: row.id, left: j.left, smiths: [...new Set<string>(smiths)] });
  }
  return out;
}

export function load(): Save {
  try {
    return decode(localStorage.getItem(SAVE_KEY));
  } catch {
    return defaults();
  }
}

/** Writes the save; false when storage is unavailable. */
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
