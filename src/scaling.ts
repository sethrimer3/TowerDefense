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

/** Ten-room Tower zones. The roster repeats every 100 rooms. Base stats are
 * deliberately hand-tuned whole numbers, increasing by roughly 50% between
 * adjacent zones instead of looking like raw formula output. HP and ATK were
 * doubled from the first tuning so that careless play can die even on the
 * first ten floors; later zones keep their rise over that baseline. */
export const TOWER_ZONE_ENEMIES: readonly (readonly TowerEnemyDefinition[])[] = [
  [
    { name: "Goblin", profile: "attackHeavy", hp: 36, attack: 18, defense: 1 },
    { name: "Thief", profile: "balanced", hp: 40, attack: 12, defense: 2, drop: "thievesTools" },
    { name: "Armored Knight", profile: "defenseHeavy", hp: 52, attack: 10, defense: 4, drop: "knightsCrest" },
  ],
  [
    { name: "Bat", profile: "attackHeavy", hp: 54, attack: 28, defense: 2 },
    { name: "Slime", profile: "balanced", hp: 60, attack: 18, defense: 3, drop: "slimeGel" },
    { name: "Stone Warden", profile: "defenseHeavy", hp: 78, attack: 14, defense: 6, drop: "wardenHeartstone" },
  ],
  [
    { name: "Assassin", profile: "attackHeavy", hp: 80, attack: 42, defense: 3 },
    { name: "Skeleton", profile: "balanced", hp: 90, attack: 28, defense: 5, drop: "skeletonBone" },
    { name: "Golem", profile: "defenseHeavy", hp: 120, attack: 22, defense: 10, drop: "golemCore" },
  ],
  [
    { name: "Mage", profile: "attackHeavy", hp: 126, attack: 64, defense: 4 },
    { name: "Orc", profile: "balanced", hp: 140, attack: 42, defense: 8, drop: "orcTusk" },
    { name: "Gargoyle", profile: "defenseHeavy", hp: 180, attack: 34, defense: 16, drop: "frozenGargoyleShard" },
  ],
  [
    { name: "Berserker", profile: "attackHeavy", hp: 190, attack: 96, defense: 6 },
    { name: "Ogre", profile: "balanced", hp: 210, attack: 64, defense: 12, drop: "ogreHide" },
    { name: "Demon", profile: "defenseHeavy", hp: 280, attack: 50, defense: 24, drop: "demonEmberheart" },
  ],
  [
    { name: "Cultist", profile: "attackHeavy", hp: 290, attack: 144, defense: 9 },
    { name: "Crystal Savant", profile: "balanced", hp: 320, attack: 96, defense: 18, drop: "crystalDust" },
    { name: "Amethyst Golem", profile: "defenseHeavy", hp: 420, attack: 76, defense: 36, drop: "amethystCore" },
  ],
  [
    { name: "Drowned Marauder", profile: "attackHeavy", hp: 430, attack: 220, defense: 14 },
    { name: "Temple Wraith", profile: "balanced", hp: 480, attack: 144, defense: 27, drop: "wraithEctoplasm" },
    { name: "Coral Knight", profile: "defenseHeavy", hp: 620, attack: 116, defense: 54, drop: "coralCrest" },
  ],
  [
    { name: "Sporeling", profile: "attackHeavy", hp: 650, attack: 330, defense: 20 },
    { name: "Troll", profile: "balanced", hp: 720, attack: 220, defense: 40, drop: "trollWart" },
    { name: "Spore Colossus", profile: "defenseHeavy", hp: 940, attack: 176, defense: 80, drop: "sporeheart" },
  ],
  [
    { name: "Shadow Stalker", profile: "attackHeavy", hp: 970, attack: 500, defense: 30 },
    { name: "Obsidian Revenant", profile: "balanced", hp: 1080, attack: 330, defense: 60, drop: "revenantShard" },
    { name: "Blackstone Colossus", profile: "defenseHeavy", hp: 1400, attack: 260, defense: 120, drop: "blackstoneHeart" },
  ],
  [
    { name: "Starfire Adept", profile: "attackHeavy", hp: 1460, attack: 750, defense: 45 },
    { name: "Dragon Whelp", profile: "balanced", hp: 1620, attack: 500, defense: 90, drop: "whelpScale" },
    { name: "Celestial Guardian", profile: "defenseHeavy", hp: 2100, attack: 400, defense: 180, drop: "celestialAegis" },
  ],
] as const;

/** One rotation is approximately ten 50% increases. A clean 60x multiplier
 * keeps room 101 about 50% stronger than room 100. */
export const TOWER_CYCLE_MULTIPLIER = 60;

export function towerZoneIndex(room: number) {
  return Math.floor(Math.max(0, room) / 10) % TOWER_ZONE_ENEMIES.length;
}

function towerCycle(room: number) {
  return Math.floor(Math.max(0, room) / 100);
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
    hp: definition.hp * multiplier,
    attack: definition.attack * multiplier,
    defense: definition.defense * multiplier,
    tier: 1,
  };
}

/** How hard a Tower floor's generator asks an enemy to be. */
export type TowerEnemyStrength = EnemyStrength;

/** How far each strength exceeds the floor's own zone: the roster it comes
 * from (zones ahead), a multiplier on every stat, and its tier (which sets
 * the XP a kill pays). Weak and normal differ only in which profiles the
 * generator picks; strong is a hardened local, elite a visitor from the
 * next zone up. */
export const TOWER_ENEMY_STRENGTH: Record<TowerEnemyStrength, { zonesAhead: number; multiplier: number; tier: number }> = {
  weak: { zonesAhead: 0, multiplier: 1, tier: 1 },
  normal: { zonesAhead: 0, multiplier: 1, tier: 1 },
  strong: { zonesAhead: 0, multiplier: 1.25, tier: 2 },
  elite: { zonesAhead: 1, multiplier: 1, tier: 3 },
};

/** The XP tier a kill of each strength pays, in both modes. */
export const enemyTier = (strength: EnemyStrength) => TOWER_ENEMY_STRENGTH[strength].tier;

/** The Delve's enemy kinds, one per population an area can hold. Each has
 * its own procedural body (tile-painters.ts), since none has sprite art. */
export const DELVE_ENEMY_NAMES = ["Cinder slime", "Bone sentinel", "Dusk wing", "Ash warden"];

/** A Tower enemy of the given strength and profile for floor `room`. */
export function getTowerGateEnemy(room: number, strength: TowerEnemyStrength, profile: TowerEnemyProfile) {
  const { zonesAhead, multiplier, tier } = TOWER_ENEMY_STRENGTH[strength];
  const base = getTowerEnemy(room + zonesAhead * 10, () => 0, profile);
  return {
    name: base.name,
    hp: Math.round(base.hp * multiplier),
    attack: Math.round(base.attack * multiplier),
    defense: Math.round(base.defense * multiplier),
    tier,
    strength,
  };
}
