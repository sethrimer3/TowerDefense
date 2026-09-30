import type { Enemy, Player } from "./entities.ts";

export type CombatPrediction = {
  impervious: boolean;
  hit: number;
  turns: number;
  damage: number;
  survivable: boolean;
  requiredAttack: number;
};

export function predict(player: Player, enemy: Enemy): CombatPrediction {
  const hit = player.attack - enemy.defense;
  if (hit <= 0) {
    return {
      impervious: true,
      hit: 0,
      turns: Infinity,
      damage: Infinity,
      survivable: false,
      requiredAttack: enemy.defense - player.attack + 1,
    };
  }
  const turns = Math.ceil(enemy.hp / hit);
  // The shroud takes the first of it, whichever strikes that falls on.
  const damage = Math.max(0, damageTaken(enemy.attack, player.defense, turns - 1) - (player.shroud ?? 0));
  return {
    impervious: false,
    hit,
    turns,
    damage,
    survivable: player.hp > damage,
    requiredAttack: 0,
  };
}

/** The enemy's ATK in the next round: after every round it rises by 1% of
 * its ATK (rounded down), and by at least 1, so no DEF holds it off forever
 * and no fight drags on without end. */
export function raisedAttack(attack: number) {
  return attack + Math.max(1, Math.floor(attack / 100));
}

/** What the enemy's strikes back cost the hero over `strikes` rounds, starting
 * at `attack` and rising each round. Past what any HP could survive it is
 * Infinity, so a fight with a million rounds is summed in a few thousand. */
function damageTaken(attack: number, defense: number, strikes: number) {
  let damage = 0;
  for (let i = 0; i < strikes && damage <= Number.MAX_SAFE_INTEGER; i++, attack = raisedAttack(attack)) {
    damage += Math.max(0, attack - defense);
  }
  return damage > Number.MAX_SAFE_INTEGER ? Infinity : damage;
}

/** How long each strike of a fight played out round by round takes: the first
 * round's two strikes take the longest, each later round is quicker, down to
 * the fastest pace. */
export const FIRST_STRIKE_MS = 250;
export const STRIKE_SPEEDUP = 0.9;
export const FASTEST_STRIKE_MS = 50;

/** One strike of a fight: who struck, for how much, when it swings (`start`
 * to `end`, in ms from the fight's start) and lands (`at`), and the HP the
 * struck side has left. Of an enemy's strike, the shroud takes what it can
 * (`shrouded`), and `damage` is what gets through to the hero. */
export type Strike = { by: "hero" | "enemy"; damage: number; shrouded?: number; start: number; at: number; end: number; hp: number };
export type Bout = { strikes: Strike[]; duration: number };

/** The rounds `predict` sums up, one strike at a time: the hero strikes first,
 * then the enemy (its ATK rising after each round, the shroud taking its
 * strikes until it is spent), until one of them falls. Ends with the same HP
 * as the prediction (or at 0 in a fight the hero loses). */
export function bout(player: Player, enemy: Enemy): Bout {
  const hit = player.attack - enemy.defense;
  const strikes: Strike[] = [];
  if (hit <= 0) return { strikes, duration: 0 };
  let enemyHp = enemy.hp, heroHp = player.hp, shroud = player.shroud ?? 0, attack = enemy.attack, t = 0, ms = FIRST_STRIKE_MS;
  const strike = (by: Strike["by"], damage: number, hp: number, shrouded = 0) => {
    strikes.push({ by, damage, ...(shrouded ? { shrouded } : {}), start: t, at: t + ms / 2, end: t + ms, hp });
    t += ms;
  };
  for (;;) {
    enemyHp = Math.max(0, enemyHp - hit);
    strike("hero", hit, enemyHp);
    if (!enemyHp) break;
    const struck = Math.max(0, attack - player.defense), shrouded = Math.min(shroud, struck), taken = struck - shrouded;
    shroud -= shrouded;
    heroHp = Math.max(0, heroHp - taken);
    strike("enemy", taken, heroHp, shrouded);
    if (!heroHp) break;
    attack = raisedAttack(attack);
    ms = Math.max(FASTEST_STRIKE_MS, ms * STRIKE_SPEEDUP);
  }
  return { strikes, duration: t };
}

/** The hero's HP `elapsed` ms into a fight that began at `hp`. */
export function heroHpDuring(fight: Bout, hp: number, elapsed: number) {
  for (const s of fight.strikes) if (s.by === "enemy" && s.at <= elapsed) hp = s.hp;
  return hp;
}
