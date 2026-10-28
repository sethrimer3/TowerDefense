import { botName } from "./bot-names.ts";
import { botFlag } from "./bot-identity.ts";
import { decodeFlag, type Flag } from "../profile/model.ts";
import { RULESET, rating } from "./siege-rating.ts";
import { generateNative } from "./castle-generator.ts";
import { dpsForMmr } from "./siege-budget.ts";
import { castleDps } from "./castle-dps.ts";
import { decodeNativeCastle } from "./castle-decode.ts";
import type { NativeCastle } from "./castle-model.ts";
import { decodeCastle as decodeLegacy, estimateCastle as estimateLegacy } from "./legacy-castles.ts";
export { seeded } from "./legacy-castles.ts";
export type CastleSnapshot = {
  id: string;
  revision: 2;
  ruleset: typeof RULESET;
  source: "bot" | "player";
  owner: { id: string; name: string; flag?: Flag };
  seed: number;
  mmr: number;
  castle: NativeCastle;
};
export const castlePower = (snapshot: CastleSnapshot) => castleDps(snapshot.castle);
/** One opponent MMR; DPS is a generation estimate, never a damage multiplier. */
export function estimateCastle(snapshot: CastleSnapshot) {
  return { power: castlePower(snapshot), rating: snapshot.mmr, confidence: "provisional" as const };
}
const cache = new Map<string, NativeCastle>();
export function generateCastle(seed: number, target: number): CastleSnapshot {
  seed >>>= 0;
  const mmr = rating(target),
    key = seed + ":" + mmr;
  let castle = cache.get(key);
  if (!castle) {
    castle = generateNative(seed, mmr, dpsForMmr(mmr));
    cache.set(key, castle);
    if (cache.size > 32) cache.delete(cache.keys().next().value!);
  }
  return {
    id: `bot-${RULESET}-${seed}`,
    revision: 2,
    ruleset: RULESET,
    source: "bot",
    owner: { id: `bot-${seed}`, name: botName(seed), flag: botFlag(seed) },
    seed,
    mmr,
    castle: structuredClone(castle),
  };
}
/** All untrusted save paths are bounded before native fitting. */
export function decodeCastle(raw: unknown, legacyMmr?: number): CastleSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as CastleSnapshot;
  if ((c.revision as number) === 1) {
    const old = decodeLegacy(raw);
    if (!old) return null;
    const upgraded = generateCastle(old.seed, legacyMmr ?? estimateLegacy(old).rating);
    return { ...upgraded, owner: old.owner };
  }
  if (
    c.revision !== 2 ||
    c.ruleset !== RULESET ||
    c.source !== "bot" ||
    !Number.isInteger(c.seed) ||
    c.seed < 0 ||
    c.seed > 4294967295 ||
    !Number.isInteger(c.mmr) ||
    rating(c.mmr) !== c.mmr
  )
    return null;
  if (!c.owner || typeof c.owner.name !== "string" || !/^[A-Za-z0-9_]{1,32}$/.test(c.owner.name) || typeof c.owner.id !== "string" || typeof c.id !== "string")
    return null;
  const castle = decodeNativeCastle(c.castle);
  if (!castle) return null;
  const flag = decodeFlag(c.owner.flag);
  return {
    id: c.id.slice(0, 100),
    revision: 2,
    ruleset: RULESET,
    source: "bot",
    owner: { id: c.owner.id.slice(0, 100), name: c.owner.name, ...(flag ? { flag } : {}) },
    seed: c.seed,
    mmr: c.mmr,
    castle,
  };
}
