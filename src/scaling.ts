import type { MaterialId } from "./materials.ts";
import type { EnemyStrength } from "./entities.ts";
import { intPow } from "./exact.ts";

export type TowerEnemyProfile = "attackHeavy" | "balanced" | "defenseHeavy";

export type TowerEnemyDefinition = {
  name: string;
  profile: TowerEnemyProfile;
  hp: number;
  attack: number;
  defense: number;
  drop?: MaterialId;
};

/** How hard every enemy in both modes is, on top of its own stats: HP and
 * ATK are doubled so that careless play can die even on the first ten
 * floors. Tune overall difficulty here; each mode's own numbers set how its
 * enemies compare with one another and rise with depth. */
export const ENEMY_STAT_SCALE = { hp: 2, attack: 2, defense: 1 };

/** How many floors each Tower zone (one roster) spans. */
export const TOWER_ZONE_FLOORS = 10;

/** Ten-room Tower zones, before `ENEMY_STAT_SCALE`. The roster repeats every
 * `TOWER_CYCLE_FLOORS` rooms. Stats are deliberately hand-tuned whole
 * numbers, increasing by roughly 50% between adjacent zones instead of
 * looking like raw formula output. */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy", hp: 18, attack: 9, defense: 1 },
    { name: "Thief", profile: "balanced", hp: 20, attack: 6, defense: 2, drop: "thievesTools" },
    { name: "Armored Knight", profile: "defenseHeavy", hp: 26, attack: 5, defense: 4, drop: "knightsCrest" },
  ],
  [
    { name: "Bat", profile: "attackHeavy", hp: 27, attack: 14, defense: 2 },
    { name: "Slime", profile: "balanced", hp: 30, attack: 9, defense: 3, drop: "slimeGel" },
    { name: "Stone Warden", profile: "defenseHeavy", hp: 39, attack: 7, defense: 6, drop: "wardenHeartstone" },
  ],
  [
    { name: "Assassin", profile: "attackHeavy", hp: 40, attack: 21, defense: 3 },
    { name: "Skeleton", profile: "balanced", hp: 45, attack: 14, defense: 5, drop: "skeletonBone" },
    { name: "Golem", profile: "defenseHeavy", hp: 60, attack: 11, defense: 10, drop: "golemCore" },
  ],
  [
    { name: "Mage", profile: "attackHeavy", hp: 63, attack: 32, defense: 4 },
    { name: "Orc", profile: "balanced", hp: 70, attack: 21, defense: 8, drop: "orcTusk" },
    { name: "Gargoyle", profile: "defenseHeavy", hp: 90, attack: 17, defense: 16, drop: "frozenGargoyleShard" },
  ],
  [
    { name: "Berserker", profile: "attackHeavy", hp: 95, attack: 48, defense: 6 },
    { name: "Ogre", profile: "balanced", hp: 105, attack: 32, defense: 12, drop: "ogreHide" },
    { name: "Demon", profile: "defenseHeavy", hp: 140, attack: 25, defense: 24, drop: "demonEmberheart" },
  ],
  [
    { name: "Cultist", profile: "attackHeavy", hp: 145, attack: 72, defense: 9 },
    { name: "Crystal Savant", profile: "balanced", hp: 160, attack: 48, defense: 18, drop: "crystalDust" },
    { name: "Amethyst Golem", profile: "defenseHeavy", hp: 210, attack: 38, defense: 36, drop: "amethystCore" },
  ],
  [
    { name: "Drowned Marauder", profile: "attackHeavy", hp: 215, attack: 110, defense: 14 },
    { name: "Temple Wraith", profile: "balanced", hp: 240, attack: 72, defense: 27, drop: "wraithEctoplasm" },
    { name: "Coral Knight", profile: "defenseHeavy", hp: 310, attack: 58, defense: 54, drop: "coralCrest" },
  ],
  [
    { name: "Sporeling", profile: "attackHeavy", hp: 325, attack: 165, defense: 20 },
    { name: "Troll", profile: "balanced", hp: 360, attack: 110, defense: 40, drop: "trollWart" },
    { name: "Spore Colossus", profile: "defenseHeavy", hp: 470, attack: 88, defense: 80, drop: "sporeheart" },
  ],
  [
    { name: "Shadow Stalker", profile: "attackHeavy", hp: 485, attack: 250, defense: 30 },
    { name: "Obsidian Revenant", profile: "balanced", hp: 540, attack: 165, defense: 60, drop: "revenantShard" },
    { name: "Blackstone Colossus", profile: "defenseHeavy", hp: 700, attack: 130, defense: 120, drop: "blackstoneHeart" },
  ],
  [
    { name: "Starfire Adept", profile: "attackHeavy", hp: 730, attack: 375, defense: 45 },
    { name: "Dragon Whelp", profile: "balanced", hp: 810, attack: 250, defense: 90, drop: "whelpScale" },
    { name: "Celestial Guardian", profile: "defenseHeavy", hp: 1050, attack: 200, defense: 180, drop: "celestialAegis" },
  ],
] as const;

/** One rotation is approximately ten 50% increases. A clean 60x multiplier
 * keeps room 101 about 50% stronger than room 100. */
export const TOWER_CYCLE_MULTIPLIER = 60;

/** How many floors pass before the roster repeats: one of every zone. */
export const TOWER_CYCLE_FLOORS = TOWER_ZONE_FLOORS * TOWER_ZONE_ENEMIES.length;

export function towerZoneIndex(room: number) {
  return Math.floor(Math.max(0, room) / TOWER_ZONE_FLOORS) % TOWER_ZONE_ENEMIES.length;
}

function towerCycle(room: number) {
  return Math.floor(Math.max(0, room) / TOWER_CYCLE_FLOORS);
}

export function towerEnemyDrop(name: string): MaterialId | null {
  return TOWER_ZONE_ENEMIES.flat().find((enemy) => enemy.name === name)?.drop ?? null;
}

export function getTowerEnemy(room: number, rng: () => number, forceProfile?: TowerEnemyProfile) {
  const roster = TOWER_ZONE_ENEMIES[towerZoneIndex(room)];
  const definition = forceProfile
    ? roster.find((enemy) => enemy.profile === forceProfile)!
    : roster[Math.floor(rng() * roster.length)];
  const multiplier = intPow(TOWER_CYCLE_MULTIPLIER, towerCycle(room));
  return {
    name: definition.name,
    hp: definition.hp * ENEMY_STAT_SCALE.hp * multiplier,
    attack: definition.attack * ENEMY_STAT_SCALE.attack * multiplier,
    defense: definition.defense * ENEMY_STAT_SCALE.defense * multiplier,
    tier: 1,
  };
}

/** How hard a Tower floor's generator asks an enemy to be. */
export type TowerEnemyStrength = EnemyStrength;

/** How far each strength exceeds the floor's own zone: the roster it comes
 * from (zones ahead), multipliers on HP and ATK (`stats`) and on DEF, and
 * its tier (which sets the XP a kill pays). A weak enemy is a balanced one
 * with less HP and ATK, as in the Delve; strong is a hardened local, elite a
 * visitor from the next zone up, and a boss a strong enemy with more HP and
 * ATK (see `bossFactor`). */
export const TOWER_ENEMY_STRENGTH: Record<TowerEnemyStrength, { zonesAhead: number; stats: number; defense: number; tier: number }> = {
  weak: { zonesAhead: 0, stats: 0.75, defense: 1, tier: 1 },
  normal: { zonesAhead: 0, stats: 1, defense: 1, tier: 1 },
  strong: { zonesAhead: 0, stats: 1.25, defense: 1.25, tier: 2 },
  elite: { zonesAhead: 1, stats: 1, defense: 1, tier: 3 },
  boss: { zonesAhead: 0, stats: 1.25, defense: 1.25, tier: 4 },
};

/** Enemy DEF compounds on top of everything else: `rate` for every
 * `towerFloors` Tower floors climbed and every `delveDepth` Delve depth. */
export const ENEMY_DEFENSE_GROWTH = { rate: 1.01, towerFloors: 5, delveDepth: 20 };
/** What every enemy's DEF is multiplied by on Tower floor `room` (0-based). */
export const towerDefenseGrowth = (room: number) =>
  intPow(ENEMY_DEFENSE_GROWTH.rate, Math.floor(Math.max(0, room) / ENEMY_DEFENSE_GROWTH.towerFloors));
/** What every enemy's DEF is multiplied by at Delve depth `depth`. */
export const delveDefenseGrowth = (depth: number) =>
  intPow(ENEMY_DEFENSE_GROWTH.rate, Math.floor(Math.max(0, depth) / ENEMY_DEFENSE_GROWTH.delveDepth));

/** How many times a strong enemy's HP and ATK a boss has, in both modes. */
export const BOSS_OVER_STRONG = 2;
/** What an enemy of `strength` multiplies a strong enemy's rounded HP and
 * ATK by: BOSS_OVER_STRONG for a boss, 1 for every other. */
export const bossFactor = (strength: EnemyStrength) => (strength === "boss" ? BOSS_OVER_STRONG : 1);

/** The XP tier a kill of each strength pays, in both modes. */
export const enemyTier = (strength: EnemyStrength) => TOWER_ENEMY_STRENGTH[strength].tier;

/** The Delve's enemy kinds, one per population an area can hold. Each has
 * its own procedural body (tile-painters.ts), since none has sprite art. */
export const DELVE_ENEMY_NAMES = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];

/** A Tower enemy of the given strength and profile for floor `room`. Its
 * DEF grows with the floor it stands on, even for an elite from the next
 * zone's roster. */
export function getTowerGateEnemy(room: number, strength: TowerEnemyStrength, profile: TowerEnemyProfile) {
  const { zonesAhead, stats, defense, tier } = TOWER_ENEMY_STRENGTH[strength];
  const base = getTowerEnemy(room + zonesAhead * TOWER_ZONE_FLOORS, () => 0, profile);
  const boss = bossFactor(strength);
  return {
    name: base.name,
    hp: Math.round(base.hp * stats) * boss,
    attack: Math.round(base.attack * stats) * boss,
    defense: Math.round(base.defense * defense * towerDefenseGrowth(room)),
    tier,
    strength,
  };
}
