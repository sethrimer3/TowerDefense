import { decodeCastle, estimateCastle, generateCastle, seeded, type CastleSnapshot } from "./castles.ts";
import { INITIAL_MMR, rating, raidRating } from "./siege-rating.ts";
export type Raid = {
  castle: CastleSnapshot;
  attacker: number;
  defender: number;
  state: "offered" | "started" | "won" | "lost";
  delta?: number;
};
export type SiegeSave = {
  mmr: number;
  games: number;
  wins: number;
  sequence: number;
  raid: Raid;
};
export function newSiege(seed: number): SiegeSave {
  const castle = generateCastle(seed, INITIAL_MMR);
  return {
    mmr: INITIAL_MMR,
    games: 0,
    wins: 0,
    sequence: seed >>> 0,
    raid: {
      castle,
      attacker: INITIAL_MMR,
      defender: estimateCastle(castle).rating,
      state: "offered",
    },
  };
}
function rollOpponent(save: SiegeSave) {
  const rand = seeded(save.sequence);
  save.sequence = Math.floor(rand() * 4294967296);
  const offset = Math.round((rand() - 0.5) * 160),
    castle = generateCastle(save.sequence, save.mmr + offset);
  save.raid = {
    castle,
    attacker: save.mmr,
    defender: estimateCastle(castle).rating,
    state: "offered",
  };
  return true;
}
export function nextOpponent(save: SiegeSave) {
  return save.raid.state === "won" || save.raid.state === "lost" ? rollOpponent(save) : false;
}
/** Previewing and backing out never commits a rated raid. */
export function findMatch(save: SiegeSave) {
  return save.raid.state === "started" ? false : rollOpponent(save);
}
/** Terminal results are idempotent, including replays of a completed target. */
export function settleRaid(save: SiegeSave, won: boolean) {
  if (save.raid.state !== "started") return false;
  const result = raidRating(save.raid.attacker, save.raid.defender, save.games, won);
  save.mmr = result.after;
  save.games++;
  if (won) save.wins++;
  save.raid.state = won ? "won" : "lost";
  save.raid.delta = result.delta;
  return true;
}
export function decodeSiege(raw: unknown): SiegeSave | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const s = raw as SiegeSave,
    c = decodeCastle(s.raid?.castle);
  if (!c || !["offered", "started", "won", "lost"].includes(s.raid.state)) return undefined;
  const count = (n: number) => (Number.isSafeInteger(n) && n >= 0 ? Math.min(1e7, n) : 0);
  const games = count(s.games),
    mmr = rating(s.mmr),
    attacker = rating(s.raid.attacker);
  return {
    mmr,
    games,
    wins: Math.min(games, count(s.wins)),
    sequence: Number.isSafeInteger(s.sequence) ? s.sequence >>> 0 : c.seed,
    raid: {
      castle: c,
      attacker,
      defender: estimateCastle(c).rating,
      state: s.raid.state,
      ...(Number.isInteger(s.raid.delta) ? { delta: Math.max(-48, Math.min(48, s.raid.delta!)) } : {}),
    },
  };
}
