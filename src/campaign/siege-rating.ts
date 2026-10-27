import { ratioPow } from '../exact.ts';
/** Elo policy shared by local bot raids and a future authoritative raid service. */
export const INITIAL_MMR = 1000;
export const MIN_MMR = 100;
export const MAX_MMR = 3000;
export const RULESET = 'siege-v1';
export const rating = (value: number) => Math.max(MIN_MMR, Math.min(MAX_MMR, Math.round(Number.isFinite(value) ? value : INITIAL_MMR)));
export const expectedWin = (attacker: number, defender: number) => 1 / (1 + ratioPow(10,rating(defender)-rating(attacker),400));
export function raidRating(attacker: number, defender: number, games: number, won: boolean) {
  const expected = expectedWin(attacker, defender);
  const k = games < 10 ? 48 : 24;
  const after = rating(attacker + k * ((won ? 1 : 0) - expected));
  return { before: attacker, after, delta: after - attacker, expected };
}
