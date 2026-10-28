# Siege opponents and ratings

Siege uses one visible MMR (100–3000), starting at 1000, Gold III. An offered opponent has a saved MMR and native castle blueprint; its MMR enters Elo settlement. The DPS budget estimates castle capacity, not its owner's separate rating or a measured success probability. Find Match offers a target within ±80; Back does not commit a raid. Attack commits; abandoning/reloading a started rated raid loses. Completed targets can be practiced without settling again.

## Native castle snapshots

Revision 2, `siege-v2`, saves identity/flag, seed, MMR, layout, Armory levels, Smithy training, Skills, per-building paths/ranks and optional native side trees. This is the foundation for future real-player castles, which will require server validation. Nothing is uploaded today.

A seeded personality weights towers, troops, magic, gunpowder or balanced choices. Purchases and all building paths/merges use native `nextSteps`/`upgradeBuilding`, including three real maximum partners for an ultimate. Quarter placements use native `arrange`/`fitLayout` on the fixed 5×5-tile footprint. Side trees are bought with native `buySide`. Ultimates open above Diamond (Master and Grandmaster). Bounded native damage-training ranks refine the budget; these are real saved upgrades, never fractional damage modifiers. The legal maximum witness supplies the upper end, with seeded removals where appropriate.

`siegeField` passes that blueprint to native city generation and puts every owned infantry copy in bottom muster rows. Two native Defend simulations share geometry and forward damage through native unit/building damage functions. The defense wears its saved levels and native bonus snapshot. The attacker retains the player's upgrades. There is **no flat defense damage/HP scale**. Walls, repairs, projectiles, garrisons and spells remain Defend's. Destroying the enemy keep wins; four minutes loses.

Revision-one offers regenerate at the same seed and saved opponent MMR while preserving identity. Interrupted revision-one raids settle as losses once; completed results/counters remain. Optional malformed flags or side ranks do not erase valid progress.

## DPS budget and calibration status

[Measured native protocol and limitations](SIEGE_DPS.md) documents the weighted single/crowd table, support model, native floor (10.2 DPS) and bounded-search ceiling (48,088,452,803.799706 DPS). Shadow compounding dominates the upper end under immortal crowd conditions. These are capacity estimates rather than a prediction of damage delivered through walls in a raid.

`tools/siege-division-dps.ts` writes 35 increasing division anchors from `siege-budget-config.ts`; runtime generation only interpolates those numbers. Bronze V is unreachable under the 100 minimum; Bronze IV's first reachable point is 100. Grandmaster I's floor, 2720, anchors the ceiling and the top band stays there. The curve is fitted from actual native raids instead of spreading Shadow's extreme dummy-target range uniformly. Diamond I holds its last pre-ultimate budget until Master: interpolating an ultimate-sized budget into that band would ask for a castle that cannot fit under its upgrade rules.

The reference policy in `src/campaign/siege-army.ts` derives smooth attacker capacity from explicit catalog progression assumptions, then uses the same seeded native generator filtered to infantry. Lower armies use melee and ranged support; Master adds a native Hero and Revolutionary. These are reproducible test rosters, not equipment observed from players. The guard side uses native Defend deployment/leashes rather than rallying every soldier onto the keep.

`tools/tune-siege.ts` searches native win/loss budget brackets at representative ranks with training seed 1. An unfillable castle is a generator/capacity failure, never a simulated loss. `tools/fit-siege-curve.ts` fits monotone logarithmic anchors, with a conservative matchup margin, the native floor and the Grandmaster ceiling fixed. `tools/siege-division-dps.ts` emits runtime anchors. `tools/calibrate-siege.ts` then runs separate held-out seeds across all 34 reachable divisions. Only completed four-minute raids enter its reported win share. A two-second `--smoke` sample checks execution and reports no win rate.

Reproduce from the repository root:

```sh
node --experimental-transform-types --import ./tests/pin-random.ts tools/tune-siege.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/fit-siege-curve.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-division-dps.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/calibrate-siege.ts --samples=2 --workers=2 --split=heldout --seed-start=1001 --out=docs/design/siege-calibration.json
node --experimental-transform-types --import ./tests/pin-random.ts tools/report-siege.ts
```

Native source hashes isolate resumable caches under ignored `work/`. Never reuse trials across changed combat or generator inputs. A roughly even overall win share is a starting check for these fixed armies; sparse per-rank outcomes, matchup effects, finite units, and the ceiling constraint remain visible in the report. Real matchmaking will need population data and server-validated player layouts.

## Settlement

`E = 1 / (1 + 10^((opponent MMR - player MMR) / 400))`.

The rating change is `K × (outcome - E)`, rounded and bounded; K is 48 for the first ten games, then 24. Each started target settles once. Equal MMR expresses a model target of 50%, not an observed chance. No fake player history, source badge or search delay is shown.


<!-- native-calibration:start -->

Generated by `tools/report-siege.ts` from the checked-in native trial results.

The native floor is **10.2 estimated DPS**; the bounded-search ceiling is **48,088,452,803.8**. The held-out test armies won **35 / 68 raids (51.5%)**, using seeds 1001–1002. These are deterministic offline test-army outcomes, with no strike spells, rather than observed player probabilities. 2 cases per reachable division provide an initial calibration of the curve; per-rank results remain uneven, samples are small, and matchups matter.

| Rank | Wins / raids | Observed share |
| --- | ---: | ---: |
| Bronze | 3 / 8 | 37.5% |
| Silver | 5 / 10 | 50.0% |
| Gold | 2 / 10 | 20.0% |
| Platinum | 6 / 10 | 60.0% |
| Diamond | 4 / 10 | 40.0% |
| Master | 9 / 10 | 90.0% |
| Grandmaster | 6 / 10 | 60.0% |

| Division | MMR band | Estimated defensive DPS |
| --- | --- | ---: |
| Bronze V | 0–79 (unreachable) | 8.16 |
| Bronze IV | 100–159 | 10.2 |
| Bronze III | 160–239 | 27.3 |
| Bronze II | 240–319 | 101.41 |
| Bronze I | 320–399 | 205.17 |
| Silver V | 400–479 | 415.1 |
| Silver IV | 480–559 | 839.83 |
| Silver III | 560–639 | 1,699.12 |
| Silver II | 640–719 | 1,699.16 |
| Silver I | 720–799 | 1,699.19 |
| Gold V | 800–879 | 1,699.23 |
| Gold IV | 880–959 | 1,699.26 |
| Gold III | 960–1039 | 1,699.29 |
| Gold II | 1040–1119 | 2,939.96 |
| Gold I | 1120–1199 | 5,086.44 |
| Platinum V | 1200–1279 | 8,800.07 |
| Platinum IV | 1280–1359 | 15,225.06 |
| Platinum III | 1360–1439 | 26,340.97 |
| Platinum II | 1440–1519 | 26,341.49 |
| Platinum I | 1520–1599 | 26,342.02 |
| Diamond V | 1600–1679 | 26,342.55 |
| Diamond IV | 1680–1759 | 26,343.07 |
| Diamond III | 1760–1839 | 26,343.6 |
| Diamond II | 1840–1919 | 26,344.92 |
| Diamond I | 1920–1999 | 26,346.24 |
| Master V | 2000–2079 | 26,348.87 |
| Master IV | 2080–2159 | 3,239,905.59 |
| Master III | 2160–2239 | 398,384,758.2 |
| Master II | 2240–2319 | 398,392,725.57 |
| Master I | 2320–2399 | 398,400,693.11 |
| Grandmaster V | 2400–2479 | 398,408,660.8 |
| Grandmaster IV | 2480–2559 | 398,416,628.66 |
| Grandmaster III | 2560–2639 | 398,424,596.67 |
| Grandmaster II | 2640–2719 | 4,377,170,594.45 |
| Grandmaster I | 2720–3000 | 48,088,452,803.8 |

<!-- native-calibration:end -->
