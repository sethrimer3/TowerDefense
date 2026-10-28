# Siege opponents and ratings

Siege uses one visible MMR (100–3000), starting at 1000, Gold III. An offered opponent has a saved MMR and native castle blueprint; its MMR enters Elo settlement. The DPS budget estimates castle capacity, not its owner's separate rating or a measured success probability. Find Match offers a target within ±80; Back does not commit a raid. Attack commits; abandoning/reloading a started rated raid loses. Completed targets can be practiced without settling again.

## Native castle snapshots

Revision 2, `siege-v2`, saves identity/flag, seed, MMR, layout, Armory levels, Smithy training, Skills, per-building paths/ranks and optional native side trees. This is the foundation for future real-player castles, which will require server validation. Nothing is uploaded today.

A seeded personality weights towers, troops, magic, gunpowder or balanced choices. Purchases and all building paths/merges use native `nextSteps`/`upgradeBuilding`, including three real maximum partners for an ultimate. Quarter placements use native `arrange`/`fitLayout` on the fixed 5×5-tile footprint. Side trees are bought with native `buySide`. Ultimates open above Diamond (Master and Grandmaster). Bounded native damage-training ranks refine the budget; these are real saved upgrades, never fractional damage modifiers. The legal maximum witness supplies the upper end, with seeded removals where appropriate.

`siegeField` passes that blueprint to native city generation and puts every owned infantry copy in bottom muster rows. Two native Defend simulations share geometry and forward damage through native unit/building damage functions. The defense wears its saved levels and native bonus snapshot. The attacker retains the player's upgrades. There is **no flat defense damage/HP scale**. Walls, repairs, projectiles, garrisons and spells remain Defend's. Destroying the enemy keep wins; four minutes loses.

Revision-one offers regenerate at the same seed and saved opponent MMR while preserving identity. Interrupted revision-one raids settle as losses once; completed results/counters remain. Optional malformed flags or side ranks do not erase valid progress.

## DPS budget and calibration status

[Measured native protocol and limitations](SIEGE_DPS.md) documents the weighted single/crowd table, support model, native floor (10.2 DPS) and bounded-search ceiling (48,088,475,605.20467 DPS). Shadow compounding dominates the upper end under immortal crowd conditions. These are capacity estimates rather than a prediction of damage delivered through walls in a raid.

`tools/siege-division-dps.ts` writes 35 increasing division anchors from `siege-budget-config.ts`; runtime generation only interpolates those numbers. Bronze V is unreachable under the 100 minimum; Bronze IV's first reachable point is 100. Grandmaster I's floor, 2720, anchors the ceiling and the top band stays there. The initial native curve bends through low-rank budgets instead of spreading Shadow's extreme range uniformly. Phase 6 replaces the old calibration script with native scripted attacker rosters and records actual matched outcomes before calling the curve calibrated.

## Settlement

`E = 1 / (1 + 10^((opponent MMR - player MMR) / 400))`.

The rating change is `K × (outcome - E)`, rounded and bounded; K is 48 for the first ten games, then 24. Each started target settles once. Equal MMR expresses a model target of 50%, not an observed chance. No fake player history, source badge or search delay is shown.
