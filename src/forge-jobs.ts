/** Ordinary Forge levels and War drums use the same named smith pool as
 * Training. One Forge project can run alongside staffed Training rows. */
import type { Save } from "./save.ts";
import { UPGRADES, SPEED3_PRICE, upgradePrice, type Price, type UpgradeId } from "./defend/catalog.ts";
import { buySpeed3, buyUpgrade, canAfford, pay } from "./defend/progress.ts";
import { busySmiths, multiplier } from "./progression.ts";
import { billWork } from "./training-jobs.ts";
import { METALS } from "./mine/sim.ts";

export type ForgeRequest = { kind: "upgrade"; id: UpgradeId } | { kind: "speed"; id: "speed3" };
export type ForgeJob = ForgeRequest & { rank: number; left: number; smiths: string[]; paid: Price };
/** One smith's seconds of work on a Forge level with `ranks` already bought
 * and costing `bill`: twice a Smithy row's at the same rank, growing with the
 * square of the next level and with its most precious metal (`billWork`). */
export const forgeSeconds = (ranks: number, bill: Price = {}) => 120 * (Math.max(0, Math.floor(ranks)) + 1) ** 2 * billWork(bill);

export function forgeOffer(save: Save, request: ForgeRequest) {
  if (request.kind === "speed") return { rank: 0, price: SPEED3_PRICE, seconds: forgeSeconds(0, SPEED3_PRICE), maxed: save.defend.speed3 };
  const def = UPGRADES.find(u => u.id === request.id)!;
  const rank = save.defend.levels[request.id], price = (def.price ?? upgradePrice)(rank);
  return { rank, price, seconds: forgeSeconds(rank, price), maxed: rank >= def.maxLevel };
}

function grant(save: Save, job: ForgeJob) {
  const free = { ...save.smithy, free: true };
  return job.kind === "speed" ? buySpeed3(save.defend, free)
    : save.defend.levels[job.id] === job.rank && buyUpgrade(save.defend, free, job.id);
}

export function startForge(save: Save, request: ForgeRequest, smith: string, now: number): boolean {
  if (save.forgeJob || !Number.isFinite(now) || now < 0) return false;
  if (!smith || busySmiths(save).has(smith)) return false;
  const offer = forgeOffer(save, request), wallet = { ...save.smithy, free: save.settings.devMode };
  if (offer.maxed || !canAfford(wallet, offer.price)) return false;
  const paid = save.settings.devMode ? {} : { ...offer.price };
  pay(save.smithy, paid);
  save.forgeJob = { ...request, rank: offer.rank, left: offer.seconds * 1000, smiths: [smith], paid };
  save.forgeClock = now;
  return true;
}

export function addForgeSmith(save: Save, smith: string): boolean {
  if (!save.forgeJob || !smith || busySmiths(save).has(smith)) return false;
  save.forgeJob.smiths.push(smith);
  return true;
}

export function removeForgeSmith(save: Save): boolean {
  if (!save.forgeJob || save.forgeJob.smiths.length <= 1) return false;
  save.forgeJob.smiths.pop();
  return true;
}

export const forgeLeft = (save: Save) => !save.forgeJob ? 0 : save.forgeJob.smiths.length
  ? save.forgeJob.left * multiplier(save, "smithing") / save.forgeJob.smiths.length : Infinity;

export function cancelForge(save: Save): boolean {
  if (!save.forgeJob) return false;
  for (const k of METALS) save.smithy[k] += save.forgeJob.paid[k] ?? 0;
  save.forgeJob = null;
  return true;
}

export function settleForge(save: Save, now: number, smiths: ReadonlySet<string>): boolean {
  if (!Number.isFinite(now)) return false;
  const dt = Math.max(0, now - save.forgeClock);
  save.forgeClock = Math.max(now, save.forgeClock);
  const job = save.forgeJob;
  if (!job) return false;
  job.smiths = job.smiths.filter(name => smiths.has(name));
  job.left -= dt * job.smiths.length / multiplier(save, "smithing");
  if (job.left > 0) return false;
  if (!grant(save, job)) { cancelForge(save); return false; }
  save.forgeJob = null;
  return true;
}

export function decodeForgeJob(raw: unknown, save: Save): ForgeJob | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as ForgeJob;
  if (!(j.kind === "speed" && j.id === "speed3") && !(j.kind === "upgrade" && UPGRADES.some(u => u.id === j.id))) return null;
  if (!Number.isInteger(j.rank) || j.rank < 0 || !Number.isFinite(j.left) || j.left <= 0 || !Array.isArray(j.smiths)
    || !j.paid || typeof j.paid !== "object" || !METALS.every(k => j.paid[k] === undefined || Number.isSafeInteger(j.paid[k]) && j.paid[k]! >= 0)) return null;
  const offer = forgeOffer(save, j);
  if (offer.maxed || offer.rank !== j.rank) return null;
  const busy = new Set(save.trainingJobs.flatMap(j => j.smiths));
  const smiths = [...new Set(j.smiths.filter(name => typeof name === "string" && name.length > 0 && name.length <= 32 && !busy.has(name)))];
  return { ...j, smiths, paid: Object.fromEntries(METALS.filter(k => j.paid[k] !== undefined).map(k => [k, j.paid[k]])) };
}
