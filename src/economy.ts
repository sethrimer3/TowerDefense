/** Price curves use owned ranks (zero for the first purchase). Production
 * grows through staffed Mine levels and Library shelves/professors, not an
 * elapsed-time multiplier. Coefficients are calibrated in UPGRADE_TIMING.md. */
export const ECONOMY = {
  training: 5,
  forgeCopper: 20,
  conduitGold: 210,
  mineBuilding: 80,
  utilityStudy: 50,
  combatStudy: 1000,
  enchantedStudy: 5000,
  pathStudy: 1000,
} as const;

/** An affordable first purchase followed by quadratic increments. */
export const quadraticCost = (first: number, owned: number, growth = first) => {
  const rank = Math.max(0, Math.floor(owned));
  return Math.ceil(first + growth * rank * rank);
};

export const studyPathCost = (first: number, rank: number) => quadraticCost(first, rank, first * ECONOMY.pathStudy);
