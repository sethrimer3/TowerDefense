/** The one save, kept in localStorage under its own key (another game served
 * from the same site never shares it). Loading is defensive: `defaults()`
 * defines every field, and `decode()` keeps only what is well formed. */
import { decodeDefendSave, defaultDefendSave, type DefendSave } from "./defend/progress.ts";
import { TRAINING, TRAINING_IDS, type TrainingId } from "./progression.ts";
import { SKILLS, SKILL_IDS, type SkillId } from "./skill-trees.ts";
import type { TrainingJob } from "./training-jobs.ts";
import { decodeSettings, defaultSettings, type Settings } from "./settings.ts";

export const SAVE_KEY = "towerdefense.v1";
export const SAVE_VERSION = 1;

export type Save = {
  version: number;
  /** Earned in battle, spent in the Armory. Keeps its fractions (bonuses). */
  gold: number;
  ironBar: number;
  steelBar: number;
  /** Lifetime experience from kills: the Commander's level. */
  xp: number;
  /** Earned by holding past the best wave, spent on the skill trees. */
  valor: number;
  skills: Record<SkillId, number>;
  /** Training ranks completed per row. */
  training: Record<TrainingId, number>;
  trainingJobs: TrainingJob[];
  /** Training points that ranks bought free (Dev) didn't spend. */
  freeTraining: number;
  defend: DefendSave;
  settings: Settings;
};

export function defaults(): Save {
  return {
    version: SAVE_VERSION,
    gold: 0,
    ironBar: 0,
    steelBar: 0,
    xp: 0,
    valor: 0,
    skills: Object.fromEntries(SKILL_IDS.map((id) => [id, 0])) as Record<SkillId, number>,
    training: Object.fromEntries(TRAINING_IDS.map((id) => [id, 0])) as Record<TrainingId, number>,
    trainingJobs: [],
    freeTraining: 0,
    defend: defaultDefendSave(),
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
  d.ironBar = int(s.ironBar, 0);
  d.steelBar = int(s.steelBar, 0);
  d.xp = int(s.xp, 0, 0, 1e12);
  d.valor = int(s.valor, 0);
  for (const id of SKILL_IDS) d.skills[id] = int(s.skills?.[id], 0, 0, SKILLS[id].max);
  for (const t of TRAINING) d.training[t.id] = int(s.training?.[t.id], 0, 0, t.max);
  d.trainingJobs = decodeJobs(s.trainingJobs, d.training);
  d.freeTraining = int(s.freeTraining, 0);
  d.defend = decodeDefendSave(s.defend);
  d.settings = decodeSettings(s.settings);
  return d;
}

/** Jobs on known rows, one per row, short of the row's most ranks. */
function decodeJobs(list: unknown, training: Record<TrainingId, number>): TrainingJob[] {
  if (!Array.isArray(list)) return [];
  const out: TrainingJob[] = [];
  for (const j of list) {
    const row = TRAINING.find((t) => t.id === j?.id);
    if (!row || out.some((o) => o.id === row.id) || training[row.id] >= row.max) continue;
    if (!Number.isFinite(j.startedAt) || !Number.isFinite(j.completesAt)) continue;
    out.push({ id: row.id, startedAt: j.startedAt, completesAt: j.completesAt });
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
