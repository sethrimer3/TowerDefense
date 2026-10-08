/** The lab shares its researchers across one Knowledge project. Skills,
 * path ranks and evolution crowns pay at the start and apply on completion.
 * These clocks use ordinary wall time, independently of replay speed. */
import type { Save } from "./save.ts";
import { buySkill, skillPurchase } from "./progression.ts";
import { SKILLS, type SkillId } from "./skill-trees.ts";
import { PATHS, evolve, learnPath, pathById, pathState, type PathId } from "./knowledge-paths.ts";

export type ResearchRequest = { kind: "skill"; id: SkillId } | { kind: "path" | "evolution"; id: PathId };
export type ResearchJob = ResearchRequest & { rank: number; left: number; paid: number };
/** One researcher: five minutes for rank one, growing quadratically;
 * transforming a building takes a full day of laboratory work. */
export const researchSeconds = (ranks: number, evolution = false) => evolution ? 86400 : 300 * (Math.max(0, Math.floor(ranks)) + 1) ** 2;

export function researchOffer(save: Save, request: ResearchRequest) {
  if (request.kind === "skill") {
    const p = skillPurchase(save, request.id);
    return { rank: p.level, price: p.price, seconds: researchSeconds(p.level), available: p.canBuy };
  }
  const p = pathById(request.id), st = pathState(save, request.id), evolution = request.kind === "evolution";
  return { rank: st.rank, price: evolution ? p.evolves?.cost ?? 0 : st.next?.cost ?? 0,
    seconds: researchSeconds(st.rank, evolution), available: evolution ? st.canEvolve : st.canLearn };
}

function grant(save: Save, job: ResearchJob) {
  if (job.kind === "skill") return save.skills[job.id] === job.rank && buySkill(save, job.id, true);
  if (pathState(save, job.id).rank !== job.rank) return false;
  return job.kind === "path" ? learnPath(save, job.id, job.paid) : evolve(save, job.id, job.paid);
}

export function startResearch(save: Save, request: ResearchRequest, now: number, researchers: number): boolean {
  if (save.researchJob || !Number.isFinite(now) || now < 0) return false;
  if (!save.settings.instantResearch && researchers < 1) return false;
  const offer = researchOffer(save, request);
  if (!offer.available) return false;
  const paid = save.settings.devMode ? 0 : offer.price;
  const job: ResearchJob = { ...request, rank: offer.rank, left: offer.seconds * 1000, paid };
  save.knowledge -= paid;
  save.researchClock = now;
  if (save.settings.instantResearch) {
    if (!grant(save, job)) { save.knowledge += paid; return false; }
  } else save.researchJob = job;
  return true;
}

export const researchLeft = (save: Save, researchers: number) => !save.researchJob ? 0
  : researchers > 0 ? save.researchJob.left / Math.floor(researchers) : Infinity;

/** Pausing never banks work. Changing crew affects subsequent elapsed time.
 * Completion cannot spill time into another project or award a second rank. */
export function settleResearch(save: Save, now: number, researchers: number): boolean {
  if (!Number.isFinite(now)) return false;
  const dt = Math.max(0, now - save.researchClock);
  save.researchClock = Math.max(save.researchClock, now);
  const job = save.researchJob;
  if (!job) return false;
  job.left -= dt * Math.max(0, Math.floor(researchers));
  if (job.left > 0) return false;
  const done = grant(save, job);
  if (!done) save.knowledge += job.paid;
  save.researchJob = null;
  return done;
}

export function cancelResearch(save: Save): boolean {
  if (!save.researchJob) return false;
  save.knowledge += save.researchJob.paid;
  save.researchJob = null;
  return true;
}

/** Validate a saved project against its still-unfinished target. */
export function decodeResearchJob(raw: unknown, save: Save): ResearchJob | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as ResearchJob;
  if (!["skill", "path", "evolution"].includes(j.kind) || typeof j.id !== "string"
    || !Number.isInteger(j.rank) || j.rank < 0 || !Number.isFinite(j.left) || j.left <= 0
    || !Number.isSafeInteger(j.paid) || j.paid < 0) return null;
  if (j.kind === "skill") {
    if (!(j.id in SKILLS) || save.skills[j.id] !== j.rank || j.rank >= SKILLS[j.id].max) return null;
  } else {
    const p = PATHS.find(p => p.id === j.id);
    if (!p) return null;
    const st = pathState(save, p.id);
    if (st.sealed || st.rank !== j.rank || (j.kind === "path" ? st.maxed : !p.evolves || !st.maxed || st.crowned)) return null;
  }
  return { kind: j.kind, id: j.id, rank: j.rank, left: j.left, paid: j.paid } as ResearchJob;
}
