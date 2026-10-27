/** Placeholder crowd waves: 50 to 500 native enemies, their HP scaled so each level is a little harder than the last. */
import { ENEMIES, type EnemyKind } from "../defend/catalog.ts";
import { AREA_ENEMIES } from "../defend/area-enemies.ts";
import { hash } from "../defend/grid.ts";
import { intPow } from "../exact.ts";
import { seeded } from "./castles.ts";
import type { AmbushLevel } from "./levels.ts";

/** Every knob of the placeholder curve, until the waves are tuned by hand. */
export const AMBUSH_WAVES = {
  count: 20,
  /** Enemies in the first and last wave of the first and last level. */
  crowd: { first: [50, 110], last: [280, 500] },
  /** Total enemy HP in the first level's first wave. */
  hp: 300,
  /** Each level's waves hold this much more HP than the level before's. */
  levelGrowth: 1.07,
  /** Each wave holds this much more HP than the wave before. */
  waveGrowth: 1.11,
  /** A wave pays this much gold for each point of its enemies' HP, shared between its kills. */
  goldPerHp: 0.2,
  /** Crowd species: native HP at most this, so a scaled crowd keeps native damage within reason. */
  crowdHp: 400,
  /** Waves 10 and 20 add one boss of at most this native HP. */
  bossHp: 2500,
  /** No fliers before this wave, and never more than this share of a wave. */
  fliersFrom: 4,
  flierShare: 0.15,
  /** A wave is let out over `release + count * releasePer` seconds. */
  release: 12,
  releasePer: 1 / 12,
  /** Damage a second of an average crowd enemy in the first level's first wave, */
  dps: 2,
  /** growing this much a level and this much a wave. */
  dpsLevel: 1.07,
  dpsWave: 1.04,
  /** A crowd's bites add up, so the keep and the outposts' houses and fences stand this many times Defend's HP, */
  keepHp: 4,
  outpostHp: 2,
  /** and they, like the opening gold, grow this much a level: a little slower than the crowds, so each level is a
   * little harder than the last. */
  defenseGrowth: 1.05,
  breakSeconds: 3,
} as const;

export type WaveEntry = { kind: EnemyKind; lane: number };
export type AmbushWave = {
  entries: WaveEntry[];
  /** The total HP the wave's entries are scaled to. */
  hp: number;
  /** Every entry's native HP is multiplied by this, */
  scale: number;
  /** and its native damage by this, so the wave's average enemy deals `waveDps` a second. */
  bite: number;
  /** Gold each kill pays (before the bounty perk). */
  bounty: number;
  /** Seconds between releases. */
  gap: number;
  fliers: boolean;
  boss?: EnemyKind;
};

/** The level's place in the whole campaign, 0 to 29. */
const order = (level: AmbushLevel) => level.zone * 3 + level.index;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function crowdSize(level: AmbushLevel, wave: number) {
  const t = order(level) / 29,
    first = lerp(AMBUSH_WAVES.crowd.first[0], AMBUSH_WAVES.crowd.first[1], t),
    last = lerp(AMBUSH_WAVES.crowd.last[0], AMBUSH_WAVES.crowd.last[1], t);
  return Math.round(lerp(first, last, (Math.max(1, Math.min(20, wave)) - 1) / 19));
}

export const waveHp = (level: AmbushLevel, wave: number) =>
  Math.round(AMBUSH_WAVES.hp * intPow(AMBUSH_WAVES.levelGrowth, order(level)) * intPow(AMBUSH_WAVES.waveGrowth, Math.max(0, wave - 1)));

export const waveDps = (level: AmbushLevel, wave: number) =>
  AMBUSH_WAVES.dps * intPow(AMBUSH_WAVES.dpsLevel, order(level)) * intPow(AMBUSH_WAVES.dpsWave, Math.max(0, wave - 1));

/** The zone's species small enough to come in crowds, one body each (nothing that splits, summons, chains or
 * walks on legs of parts) and no boats, which sail straight at the keep whatever the lanes. */
export function crowdRoster(level: AmbushLevel) {
  const roster = AREA_ENEMIES[level.area].filter((k) => {
    const d = ENEMIES[k];
    return !d.hatched && !d.splits && !d.summonSlots && !d.chainLength && !d.fortress && !d.boat;
  });
  const small = roster.filter((k) => ENEMIES[k].hp <= AMBUSH_WAVES.crowdHp);
  return small.length >= 3 ? small : [...roster].sort((a, b) => ENEMIES[a].hp - ENEMIES[b].hp).slice(0, 3);
}

export function ambushWave(level: AmbushLevel, wave: number, lanes = 1): AmbushWave {
  const rand = seeded(hash(level.seed, wave, 0xa6b)),
    count = crowdSize(level, wave),
    roster = crowdRoster(level);
  // Each wave leans on a few of the roster's species, the swarmers more common.
  const picks = [...roster].sort((a, b) => (a < b ? -1 : 1));
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  const fliersOk = wave >= AMBUSH_WAVES.fliersFrom,
    ground = picks.filter((k) => !ENEMIES[k].flying),
    chosen = (fliersOk ? picks : ground).slice(0, 2 + (wave % 3));
  if (!chosen.some((k) => !ENEMIES[k].flying)) chosen.push(ground[0] ?? picks[0]);
  const weights = chosen.map((k) => 1 / Math.sqrt(ENEMIES[k].hp)),
    total = weights.reduce((a, b) => a + b, 0),
    walkers = chosen.filter((k) => !ENEMIES[k].flying);
  const maxFliers = Math.floor(count * AMBUSH_WAVES.flierShare),
    entries: WaveEntry[] = [];
  let fliers = 0;
  for (let i = 0; i < count; i++) {
    let r = rand() * total,
      k = 0;
    while (k < chosen.length - 1 && r >= weights[k]) r -= weights[k++];
    let kind = chosen[k];
    if (ENEMIES[kind].flying && fliers >= maxFliers) kind = walkers[i % walkers.length];
    if (ENEMIES[kind].flying) fliers++;
    entries.push({ kind, lane: i % lanes });
  }
  let boss: EnemyKind | undefined;
  if (wave === 10 || wave === 20) {
    boss = AREA_ENEMIES[level.area]
      .filter((k) => !ENEMIES[k].hatched && !ENEMIES[k].flying && !ENEMIES[k].boat && ENEMIES[k].hp <= AMBUSH_WAVES.bossHp)
      .sort((a, b) => ENEMIES[b].hp - ENEMIES[a].hp || (a < b ? -1 : 1))[0];
    if (boss) entries.splice(Math.floor(entries.length / 2), 0, { kind: boss, lane: 0 });
  }
  const hp = waveHp(level, wave),
    native = entries.reduce((n, e) => n + ENEMIES[e.kind].hp, 0),
    seconds = AMBUSH_WAVES.release + entries.length * AMBUSH_WAVES.releasePer;
  return {
    entries,
    hp,
    scale: hp / native,
    bite: (waveDps(level, wave) * entries.length) / entries.reduce((n, e) => n + ENEMIES[e.kind].damage / ENEMIES[e.kind].cooldown, 0),
    bounty: (hp * AMBUSH_WAVES.goldPerHp) / entries.length,
    gap: seconds / entries.length,
    fliers: entries.some((e) => !!ENEMIES[e.kind].flying),
    ...(boss ? { boss } : {}),
  };
}
export const waveHasFliers = (kinds: readonly EnemyKind[]) => kinds.some((k) => !!ENEMIES[k].flying);
