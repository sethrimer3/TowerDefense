import { ENEMIES, type EnemyDef, type EnemyKind } from "./catalog.ts";
import { areaForWave } from "./areas.ts";
import { AREA_ENEMIES } from "./area-enemies.ts";

export const MAX_WAVE_ENEMIES = 5000;
export const waveCap = (wave: number) => wave === 20 ? 7000 : MAX_WAVE_ENEMIES;
export const STARTING_DIFFICULTY = 20;
export const DIFFICULTY_GROWTH = 1.05;

/** Queues pop from the end: each group releases filler before its larger body. */
const groups = (count: number, larger: EnemyKind, filler: EnemyKind, perGroup: number): EnemyKind[] =>
  Array.from({ length: count }, (): EnemyKind[] => [larger, ...Array<EnemyKind>(perGroup).fill(filler)]).flat();

/** Evenly distribute each kind through the release, without random draws.
 * Sorting fractional release positions also works when the queue is reversed. */
const mix = (roster: readonly (readonly [EnemyKind, number])[]): EnemyKind[] =>
  roster.flatMap(([kind, count], order) => Array.from({ length: count }, (_, i) => ({ kind, at: (i + .5) / count, order })))
    .sort((a, b) => a.at - b.at || a.order - b.order).map(e => e.kind);

/** Initial rosters are tuning data; split trees determine combat HP/slots. */
export const DARKLING_WAVES: Readonly<Record<number, readonly (readonly [EnemyKind, number])[]>> = {
  11: [["significantDarkling", 10], ["majorDarkling", 40]],
  12: [["significantDarkling", 20], ["majorDarkling", 40], ["darkling", 100]],
  13: [["significantDarkling", 30], ["majorDarkling", 40], ["largeDarkling", 60]],
  14: [["significantDarkling", 40], ["majorDarkling", 40], ["darkling", 200]],
  15: [["significantDarkling", 50], ["majorDarkling", 50]],
  16: [["significantDarkling", 60], ["majorDarkling", 50], ["largeDarkling", 100]],
  17: [["significantDarkling", 80], ["majorDarkling", 30], ["miniDarkling", 150]],
  18: [["significantDarkling", 90], ["majorDarkling", 20], ["darkling", 100]],
  19: [["significantDarkling", 100], ["majorDarkling", 20]],
};

/** Absolute waves only; later area cycles and Ambush keep their legacy rosters. */
const AUTHORED_WAVES: Readonly<Partial<Record<number, readonly EnemyKind[]>>> = {
  1: groups(5, "darkling", "miniDarkling", 6),
  2: groups(15, "darkling", "miniDarkling", 3),
  3: Array<EnemyKind>(50).fill("darkling"),
  4: groups(5, "largeDarkling", "darkling", 16),
  5: Array<EnemyKind>(30).fill("largeDarkling"),
  6: Array<EnemyKind>(5).fill("majorDarkling"),
  7: Array<EnemyKind>(10).fill("majorDarkling"),
  8: Array<EnemyKind>(20).fill("majorDarkling"),
  9: Array<EnemyKind>(30).fill("majorDarkling"),
  10: Array<EnemyKind>(50).fill("majorDarkling"),
  ...Object.fromEntries(Object.entries(DARKLING_WAVES).map(([wave, roster]) => [wave, mix(roster)])),
  20: ["blightWorm"],
};

/** Bounded arithmetic keeps corrupt or extremely late wave numbers finite.
 * Multiplication, rather than Math.pow, preserves cross-engine replays. */
export function waveDifficulty(wave: number): number {
  if (!Number.isFinite(wave) || wave < 1) return 0;
  const authored = AUTHORED_WAVES[wave];
  if (authored) return authored.reduce((sum, kind) => sum + ENEMIES[kind].cost, 0);
  let budget = STARTING_DIFFICULTY;
  for (let n = 1; n < Math.floor(wave); n++) {
    budget *= DIFFICULTY_GROWTH;
    if (budget >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(budget);
}

/** Reserve offspring as well as their parent against the wave's hard cap.
 * Cyclic or invalid future split definitions are excluded safely. */
export function slots(def: EnemyDef, seen = new Set<EnemyKind>()): number {
  if (seen.has(def.kind)) return Infinity;
  const length = def.chainLength ?? 1;
  if (!Number.isSafeInteger(length) || length < 1) return Infinity;
  if (def.fortress) return 1 + def.fortress.turrets + def.fortress.legs + def.fortress.armor;
  if (def.summonSlots) return def.summonSlots;
  if (!def.splits) return length;
  if (!Number.isSafeInteger(def.splits.count) || def.splits.count < 0) return Infinity;
  const child = ENEMIES[def.splits.into];
  if (!child) return Infinity;
  return length * (1 + def.splits.count * slots(child, new Set([...seen, def.kind])));
}

export function buildWave(wave: number, rand: () => number): EnemyKind[] {
  const authored = AUTHORED_WAVES[wave];
  if (authored) return [...authored];
  return buildDifficultyWave(waveDifficulty(wave), rand, AREA_ENEMIES[areaForWave(wave).id]);
}

/** Random affordable mixes, favouring expensive units when space is tight.
 * Unspendable budget is discarded; no overspending or unbounded retry loop. */
export function buildDifficultyWave(budget: number, rand: () => number, kinds?: readonly EnemyKind[]): EnemyKind[] {
  if (!Number.isFinite(budget) || budget < 1) return [];
  let remaining = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(budget));
  let room = MAX_WAVE_ENEMIES;
  const roster = (kinds ? kinds.map(k => ENEMIES[k]) : Object.values(ENEMIES))
    .filter(d => !d.hatched && !d.scriptedOnly && Number.isSafeInteger(d.cost) && d.cost > 0)
    .map(def => ({ def, slots: slots(def) }));
  const out: EnemyKind[] = [];
  const efficient = [...roster].sort((a, b) => b.def.cost / b.slots - a.def.cost / a.slots);
  const completionSlots = (value: number) => {
    let needed = 0;
    for (const d of efficient) {
      if (!Number.isFinite(d.slots)) continue;
      const count = Math.floor(value / d.def.cost);
      needed += count * d.slots;
      value -= count * d.def.cost;
    }
    // A themed roster need not contain a one-point enemy. Its final remainder
    // can be discarded; treating that remainder as an impossible completion
    // suppresses every random choice and starves less-efficient species.
    return needed;
  };
  while (room > 0 && remaining > 0) {
    const affordable = roster.filter(d => d.def.cost <= remaining && d.slots <= room);
    if (!affordable.length) break;
    const best = affordable.reduce((a, b) => b.def.cost / b.slots > a.def.cost / a.slots ? b : a);
    const viable = affordable.filter(d => completionSlots(remaining - d.def.cost) <= room - d.slots);
    const choices = viable.length ? viable : [best];
    const roll = rand();
    const index = Number.isFinite(roll) ? Math.min(choices.length - 1, Math.max(0, Math.floor(roll * choices.length))) : 0;
    const pick = choices[index];
    out.push(pick.def.kind);
    remaining -= pick.def.cost;
    room -= pick.slots;
  }
  return out;
}
