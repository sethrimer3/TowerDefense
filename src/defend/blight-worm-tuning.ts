/** Shared worm mechanics and boss tuning. Kept independent of the catalog so enemy
 * definitions and motion share these values without an initialization cycle. */
const diagonal = Math.sqrt(1 / 2), sixty = Math.sqrt(3) / 2;
export const BLIGHT_WORM = {
  segments: 50, spacing: 5 / 8, entryY: .5, hp: 300,
  surfaceSpeed: 3, burrowSpeed: 4,
  surfaceMin: 10, surfaceRange: 8, turnMin: .7, turnRange: 1.6,
  wanderTurn: .24,
  contactDamage: 4, contactCooldown: .6, burrowDamage: 5 / 4, burrowWidth: 1.6,
  headMultiplier: 4, burrowClearSeconds: 1,
  probeStep: .08, lookAhead: 1, trailLength: 50 * 5 / 8 + 2,
  trailCapacity: 4096,
  // Smallest available deviation first; left/right ties use one sim draw.
  bounces: [
    [diagonal, diagonal], [diagonal, -diagonal],
    [.5, sixty], [.5, -sixty], [0, 1], [0, -1],
    [-.5, sixty], [-.5, -sixty],
    [-diagonal, diagonal], [-diagonal, -diagonal],
  ] as readonly (readonly [number, number])[],
} as const;

/** Smaller broods share the boss's mechanics, with fourfold surface spells. */
export const SMALL_BLIGHT_WORM = {
  ...BLIGHT_WORM, segments: 7, spacing: 2 / 8, entryY: 3 / 16, hp: 60,
  contactDamage: 1, burrowDamage: 1 / 4, burrowWidth: 1.6 * 2 / 5,
  surfaceMin: BLIGHT_WORM.surfaceMin * 4, surfaceRange: BLIGHT_WORM.surfaceRange * 4,
  trailLength: 7 * 2 / 8 + 2,
} as const;
export const MEDIUM_BLIGHT_WORM = {
  ...BLIGHT_WORM, segments: 14, spacing: 3 / 8, entryY: 1 / 4, hp: 180,
  contactDamage: 2, burrowDamage: 1 / 2, burrowWidth: 1.6 * 3 / 5,
  surfaceMin: BLIGHT_WORM.surfaceMin * 4, surfaceRange: BLIGHT_WORM.surfaceRange * 4,
  trailLength: 14 * 3 / 8 + 2,
} as const;
export type BlightWormKind = "smallBlightWorm" | "mediumBlightWorm" | "blightWorm";
export const isBlightWorm = (kind: string): kind is BlightWormKind => kind === "blightWorm" || kind === "smallBlightWorm" || kind === "mediumBlightWorm";
export const wormTuning = (kind: string) => kind === "smallBlightWorm" ? SMALL_BLIGHT_WORM : kind === "mediumBlightWorm" ? MEDIUM_BLIGHT_WORM : BLIGHT_WORM;
export const MIN_WORM_SEGMENTS = 4;
