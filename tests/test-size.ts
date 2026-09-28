// How big the broad property checks run. CI (which sets CI) runs them in
// full; a local `npm test` runs a smaller sample and skips the slowest, so a
// focused change gets quick feedback. Set CI=1 to run the full suite locally.
export const FULL = !!process.env.CI;

/** Skips a test outside CI; pass as the options of a slow `test`. */
export const ciOnly = { skip: FULL ? false : "slow: runs in CI (set CI=1 to run it here)" };
