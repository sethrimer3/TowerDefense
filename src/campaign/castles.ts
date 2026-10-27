import { dist,ratioPow,binaryLog } from '../exact.ts';
import { INITIAL_MMR, RULESET, rating } from './siege-rating.ts';
export type DefenseKind = 'keep' | 'tower' | 'barricade';
export type Defense = { id: number; kind: DefenseKind; x: number; y: number; hp: number; damage: number; cooldown: number; range: number };
export type Guards = { count: number; hp: number; damage: number; cooldown: number; speed: number };
/** Immutable battle input. Owner identity and defense strength have independent meanings. */
export type CastleSnapshot = {
  id: string; revision: number; ruleset: typeof RULESET; source: 'bot' | 'player';
  owner: { id: string; name: string }; seed: number;
  defenses: Defense[]; guards: Guards;
};
const FIRST = ['Ash','Moss','Iron','Ember','Silver','Night','Oak','Frost','Rune','Storm','Flint','Copper'];
const LAST = ['Fox','Rook','Warden','Badger','Drake','Fern','Knight','Owl','Wolf','Raven','Forge','Vale'];
export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296;};
}
/** Geometry counts only where it changes current combat: coverage and mutual support.
 * Decorative walls do not earn rating. Barricades contribute actual target HP.
 * These are provisional weights, not evidence of a calibrated 50% win rate. */
export function castlePower(castle: CastleSnapshot) {
  const defenses = castle.defenses;
  const structureHp = defenses.reduce((sum, d) => sum + d.hp, 0);
  const firepower = defenses.reduce((sum, d) => sum + d.damage / d.cooldown * Math.min(1.5, d.range / 5), 0);
  const overlap = defenses.filter(d => d.damage > 0).reduce((sum, d) => sum + defenses.filter(other => other.id !== d.id && other.damage > 0 && dist(d.x - other.x, d.y - other.y) <= Math.min(d.range, other.range)).length, 0);
  const guards = castle.guards;
  const endurance = structureHp + guards.count * guards.hp;
  const dps = firepower + guards.count * guards.damage / guards.cooldown * 0.6;
  return Math.sqrt(endurance * Math.max(0.1, dps)) * (1 + Math.min(0.2, overlap * 0.025));
}
export const REFERENCE_POWER = 170;
export function estimateCastle(castle: CastleSnapshot) {
  const power = castlePower(castle);
  return { power, rating: rating(INITIAL_MMR + 400 * binaryLog(Math.max(0.01, power / REFERENCE_POWER))), confidence: 'provisional' as const };
}
/** Seed and requested rating fully determine the opponent. No Defend RNG used. */
export function generateCastle(seed: number, target: number): CastleSnapshot {
  seed = seed >>> 0;
  const rand = seeded(seed);
  const name = FIRST[Math.floor(rand() * FIRST.length)] + LAST[Math.floor(rand() * LAST.length)] + (rand() < .6 ? String(10 + Math.floor(rand() * 90)) : '');
  const defenses: Defense[] = [{ id: 0, kind: 'keep', x: 8 + rand() * 4, y: 3 + rand() * 3, hp: 100, damage: 3, cooldown: 1.5, range: 6 }];
  const towers = 1 + Math.floor(rand() * 3);
  for (let i = 0; i < towers; i++) defenses.push({ id: defenses.length, kind: 'tower', x: 3 + i * (14 / Math.max(1, towers - 1)), y: 7 + rand() * 4, hp: 45 + rand() * 20, damage: 3 + rand() * 2, cooldown: 1.1 + rand() * .6, range: 5 + rand() * 2 });
  const barriers = 2 + Math.floor(rand() * 4);
  for (let i = 0; i < barriers; i++) defenses.push({ id: defenses.length, kind: 'barricade', x: 3 + i * 14 / (barriers - 1), y: 13 + rand() * 2, hp: 25 + rand() * 20, damage: 0, cooldown: 1, range: 0 });
  const castle: CastleSnapshot = { id: `bot-${RULESET}-${seed}`, revision: 1, ruleset: RULESET, source: 'bot', owner: {id: `bot-${seed}`, name}, seed, defenses, guards: { count: 3 + Math.floor(rand() * 5), hp: 15, damage: 2, cooldown: 1.2, speed: 1.3 } };
  // Solve for the requested strength instead of pretending the target MMR is
  // the castle's measured difficulty. Uniform HP/DPS scaling preserves variety.
  const desiredPower = REFERENCE_POWER * ratioPow(2,rating(target)-INITIAL_MMR,400);
  const scale = desiredPower / castlePower(castle);
  for (const d of defenses) {d.hp *= scale; d.damage *= scale;}
  castle.guards.hp *= scale; castle.guards.damage *= scale;
  return castle;
}
/** Safe local snapshot decoding; future multiplayer must validate on the server. */
export function decodeCastle(raw: unknown): CastleSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as CastleSnapshot;
  const number = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (c.ruleset !== RULESET || c.source !== 'bot' || !Number.isSafeInteger(c.seed) || c.seed < 0 || c.seed > 4294967295 || c.revision !== 1) return null;
  if (!c.owner || typeof c.owner.name !== 'string' || !/^[A-Za-z0-9_]{1,32}$/.test(c.owner.name) || typeof c.owner.id !== 'string' || typeof c.id !== 'string') return null;
  if (!Array.isArray(c.defenses) || !c.defenses.length || c.defenses.length > 32 || !c.defenses.some(d => d && d.kind === 'keep')) return null;
  const ids = new Set<number>();
  for (const d of c.defenses) {
    if (!d || !['keep','tower','barricade'].includes(d.kind) || !Number.isInteger(d.id) || ids.has(d.id) || !number(d.x,1,19) || !number(d.y,1,16) || !number(d.hp,.01,1e7) || !number(d.damage,0,1e6) || !number(d.cooldown,.1,20) || !number(d.range,0,12)) return null;
    ids.add(d.id);
  }
  const g = c.guards;
  if (!g || !Number.isInteger(g.count) || !number(g.count,0,64) || !number(g.hp,.01,1e6) || !number(g.damage,0,1e6) || !number(g.cooldown,.1,20) || !number(g.speed,.1,5)) return null;
  return { id:c.id.slice(0,100),revision:1,ruleset:RULESET,source:'bot',owner:{id:c.owner.id.slice(0,100),name:c.owner.name},seed:c.seed,defenses:c.defenses.map(d=>({...d})),guards:{...g} };
}
