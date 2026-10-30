/** First-pass wave-20 tuning. Kept independent of the catalog so enemy
 * definitions and motion share these values without an initialization cycle. */
const diagonal = Math.sqrt(1 / 2), sixty = Math.sqrt(3) / 2;
export const BLIGHT_WORM = {
  segments: 50, spacing: 5 / 8, hp: 300,
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
