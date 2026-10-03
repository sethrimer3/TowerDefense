import { ENEMIES, type EnemyDef, type EnemyKind } from "./catalog.ts";

export const MAX_WAVE_ENEMIES = 5000;
export const STARTING_DIFFICULTY = 20;
export const DIFFICULTY_GROWTH = 1.05;

/** Bounded arithmetic keeps corrupt or extremely late wave numbers finite.
 * Multiplication, rather than Math.pow, preserves cross-engine replays. */
export function waveDifficulty(wave: number): number {
  if (!Number.isFinite(wave) || wave < 1) return 0;
  let budget = STARTING_DIFFICULTY;
  for (let n = 1; n < Math.floor(wave); n++) {
    budget *= DIFFICULTY_GROWTH;
    if (budget >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;
  }
  return Math.floor(budget);
}

/** Reserve offspring as well as their parent against the wave's hard cap.
 * Cyclic or invalid future split definitions are excluded safely. */
function slots(def: EnemyDef, seen = new Set<EnemyKind>()): number {
  if (seen.has(def.kind)) return Infinity;
  if (def.chainLength !== undefined) return Number.isSafeInteger(def.chainLength) && def.chainLength > 0 ? def.chainLength : Infinity;
  if (!def.splits) return 1;
  if (!Number.isSafeInteger(def.splits.count) || def.splits.count < 0) return Infinity;
  const child = ENEMIES[def.splits.into];
  if (!child) return Infinity;
  return 1 + def.splits.count * slots(child, new Set([...seen, def.kind]));
}

export function buildWave(wave: number, rand: () => number): EnemyKind[] {
  return buildDifficultyWave(waveDifficulty(wave), rand);
}

/** Random affordable mixes, favouring expensive units when space is tight.
 * Unspendable budget is discarded; no overspending or unbounded retry loop. */
export function buildDifficultyWave(budget: number, rand: () => number): EnemyKind[] {
  if (!Number.isFinite(budget) || budget < 1) return [];
  let remaining = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(budget));
  let room = MAX_WAVE_ENEMIES;
  const roster = Object.values(ENEMIES)
    .filter(d => !d.hatched && Number.isSafeInteger(d.cost) && d.cost > 0)
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
    return value === 0 ? needed : Infinity;
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
