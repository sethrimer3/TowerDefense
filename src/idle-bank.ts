/** Idle time as the player is paid it: the golden "+24m" that rises from
 * the Mine's and the Library's tabs, the bank that keeps idle time for
 * either one while it is not in the realm, and the shop's ad, which pays
 * idle time of its own. Pure: `main.ts` applies it to the pages. */
import { HOUR_MS, MAX_AWAY_MS } from "./away.ts";

/** The two workshops that spend idle time. */
export const IDLE_SITES = ["mine", "library"] as const;
export type IdleSite = typeof IDLE_SITES[number];
/** Idle time (ms) earned by each workshop while it was out of the realm. */
export type IdleBank = Record<IdleSite, number>;
export type ShopSave = {
  /** Wall-clock ms when the next ad may be watched (0: ready). */
  adReadyAt: number;
  /** The game was bought: the ad's idle time is claimed without the ad. */
  owned: boolean;
};

/** The most one workshop's bank holds: a week, kindly more than a day away. */
export const MAX_BANK_MS = 7 * 24 * HOUR_MS;
/** Idle time an ad pays each workshop. */
export const AD_IDLE_MS = HOUR_MS;
/** Time from one ad to the next. */
export const AD_COOLDOWN_MS = 15 * 60 * 1000;
/** How long the stand-in ad plays (`ui/shop.ts`). */
export const AD_PLAY_MS = 5000;
/** Shorter time than this gets no golden number. */
export const POP_FROM_MS = 60 * 1000;

/** Idle time as a golden number: "+24m", "+3h", "+3h 20m". */
export function idleLabel(ms: number) {
  const mins = Math.floor(Math.max(0, ms) / 60000), h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `+${m}m`;
  return m === 0 ? `+${h}h` : `+${h}h ${m}m`;
}

/** Banks `ms` for a workshop that is out of the realm, up to `MAX_BANK_MS`. */
export function bankIdle(bank: IdleBank, site: IdleSite, ms: number) {
  bank[site] = Math.min(MAX_BANK_MS, bank[site] + Math.max(0, ms));
}

/** What a workshop back in the realm draws from its bank, given the idle
 * time it already owes: as much as fits under its own `MAX_AWAY_MS`, the
 * rest kept for later. Takes it from the bank and returns it (0: none). */
export function drawIdle(bank: IdleBank, site: IdleSite, owedMs: number) {
  const take = Math.min(bank[site], Math.max(0, MAX_AWAY_MS - owedMs));
  if (take < 1000) return 0;
  bank[site] -= take;
  return take;
}

/** Whether the shop's ad can be watched (or claimed) at `now`. */
export const adReady = (shop: ShopSave, now: number) => now >= shop.adReadyAt;

/** Starts the ad's cooldown at `now`. */
export function adWatched(shop: ShopSave, now: number) {
  shop.adReadyAt = now + AD_COOLDOWN_MS;
}
