/**
 * Blight Essence: what Dark One enemies leave when they die in Defend. Most
 * give 1 to 3, bigger ones more; a worm's segments share its worth (a small
 * worm about 10 in all, a medium one about 30), and the boss worm's fifty
 * segments pay a per-worm luck between 1 and 20 each, so a boss gives
 * anywhere from 50 to 1000 for those who grind it.
 *
 * Nothing here draws from the battle's random stream: each kill's roll is a
 * hash of the run's seed, the enemy's id and its kind, so replays are
 * untouched. Sums are counted in `DefendSim.essence`, outside the replayed
 * state, and the page pays them out.
 */
import { ENEMIES, type EnemyKind } from "./catalog.ts";

/** A value in [0, 1) from a few integers. */
export function hash01(...ns: number[]) {
  let h = 0x811c9dc5;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return (h >>> 0) / 4294967296;
}
const kindCode = (kind: string) => {
  let h = 7;
  for (let i = 0; i < kind.length; i++) h = Math.imul(h, 31) + kind.charCodeAt(i);
  return h;
};

/** What each segment of a worm pays: small and medium worms a fixed
 * share of about 10 and 30; the boss a per-worm luck, `BOSS_LUCK`. */
export const WORM_ESSENCE = {
  smallBlightWorm: { low: 1, high: 2 },
  mediumBlightWorm: { low: 2, high: 2 },
} as const;
/** Each boss segment pays the worm's luck, 1 to 20, skewed low (squared),
 * so a whole boss gives 50 to 1000, about 370 on average. */
export const BOSS_LUCK = { low: 1, high: 20 } as const;

/** A boss worm's luck: one per worm, read from the head's id at its first
 * segment's death and shared by its pieces (cut pieces keep the luck). */
export function bossLuck(seed: number, worm: number) {
  const r = hash01(seed, worm, 0x5eed);
  return Math.round(BOSS_LUCK.low + (BOSS_LUCK.high - BOSS_LUCK.low) * r * r);
}

/** Essence for one Dark One kill (0 for anyone else): `luck` is the boss
 * worm's, when the kill is a boss segment. */
export function essenceFor(kind: EnemyKind, id: number, seed: number, luck = 1): number {
  const def = ENEMIES[kind];
  if (def.faction !== "darkOne") return 0;
  const r = hash01(seed, id, kindCode(kind));
  if (kind === "blightWorm") return luck;
  if (kind === "smallBlightWorm" || kind === "mediumBlightWorm") {
    const w = WORM_ESSENCE[kind];
    // A third of small segments pay 2: seven segments come to about 10.
    return kind === "smallBlightWorm" ? (r < 3 / 7 ? w.high : w.low) : w.low + (r < 1 / 7 ? 1 : 0);
  }
  const hp = def.hp;
  // 1 to 3 for ordinary bodies, rising with their health.
  if (hp <= 200) {
    const base = hp <= 6 ? 1 : hp <= 60 ? 1 + (r < .5 ? 1 : 0) : 2 + (r < .5 ? 1 : 0);
    return def.fortress ? base * 3 : base;
  }
  // Bigger ones more: about 3 × √(hp / 200), a little either way.
  const big = Math.max(3, Math.round(3 * Math.sqrt(hp / 200) * (0.85 + 0.3 * r)));
  return def.fortress ? big * 2 : big;
}
