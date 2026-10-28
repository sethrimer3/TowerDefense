# Siege opponents and ratings

Siege uses one visible MMR (100–3000), starting at 1000, Gold III. An offered opponent has a saved MMR and native castle blueprint; its MMR enters Elo settlement. The DPS budget estimates castle capacity, not its owner's separate rating or a measured success probability. Find Match offers a target within ±80; Back does not commit a raid. Attack commits; abandoning/reloading a started rated raid loses. Completed targets can be practiced without settling again.

## Native castle snapshots

Revision 2, `siege-v2`, saves identity/flag, seed, MMR, layout, Armory levels, Smithy training, Skills, per-building paths/ranks and optional native side trees. This is the foundation for future real-player castles, which will require server validation. Nothing is uploaded today.

A seeded personality weights towers, troops, magic, gunpowder or balanced choices. Purchases and all building paths/merges use native `nextSteps`/`upgradeBuilding`, including three real maximum partners for an ultimate. Quarter placements use native `arrange`/`fitLayout` on the fixed 5×5-tile footprint. Side trees are bought with native `buySide`. Ultimates open above Diamond (Master and Grandmaster). Bounded native damage-training ranks refine the budget; these are real saved upgrades, never fractional damage modifiers. The legal maximum witness supplies the upper end, with seeded removals where appropriate.

`siegeField` passes that blueprint to native city generation and puts every owned infantry copy in bottom muster rows. Two native Defend simulations share geometry and forward damage through native unit/building damage functions. The defense wears its saved levels and native bonus snapshot. The attacker retains the player's upgrades. There is **no flat defense damage/HP scale**. Walls, repairs, projectiles, garrisons and spells remain Defend's. Destroying the enemy keep wins; four minutes loses.

Revision-one offers regenerate at the same seed and saved opponent MMR while preserving identity. Interrupted revision-one raids settle as losses once; completed results/counters remain. Optional malformed flags or side ranks do not erase valid progress.

## DPS budget and calibration status

[Measured native protocol and limitations](SIEGE_DPS.md) documents the weighted single/crowd table, support model, native floor (10.2 DPS) and bounded-search ceiling (2,660,425.87 DPS). No building is credited past the best non-compounding measured rate of its band (the overkill cap): the Shadow's compounding against the benchmark's immortal crowd once reached 10⁹ DPS per building, so one Shadow outweighed any castle, the curve jumped 15,000× within Master and every top castle was one Shadow and two Ranged Guilds. These are capacity estimates rather than a prediction of damage delivered through walls in a raid.

`tools/siege-division-dps.ts` writes 35 increasing division anchors from `siege-budget-config.ts`; runtime generation only interpolates those numbers. Bronze V is unreachable under the 100 minimum; Bronze IV's first reachable point is 100. Grandmaster I's floor, 2720, anchors the ceiling and the top band stays there. The curve is fitted from actual native raids instead of spreading Shadow's extreme dummy-target range uniformly. Diamond I holds its last pre-ultimate budget until Master: interpolating an ultimate-sized budget into that band would ask for a castle that cannot fit under its upgrade rules.

The reference policy in `src/campaign/siege-army.ts` derives smooth attacker capacity from explicit catalog progression assumptions, then uses the same seeded native generator filtered to infantry. Every player starts at 1000 MMR, so the army assumed there is modest: basic guilds below it, attuned halls without paths from Gold III, ranked paths from Diamond and ultimates (Hero, Shadow, Revolutionary) from Grandmaster. These are reproducible test rosters, not equipment observed from players. The guard side uses native Defend deployment/leashes rather than rallying every soldier onto the keep.

`tools/tune-siege.ts` searches native win/loss budget brackets at representative ranks; each budget is won or lost by the majority of training seeds 1–3, since one raid is too noisy to bracket a crossover. An unfillable castle is a generator/capacity failure, never a simulated loss. `tools/fit-siege-curve.ts` fits monotone logarithmic anchors, with a conservative matchup margin, the native floor and the Grandmaster ceiling fixed. `tools/siege-division-dps.ts` emits runtime anchors. `tools/calibrate-siege.ts` then runs separate held-out seeds across all 34 reachable divisions. Only completed four-minute raids enter its reported win share. A two-second `--smoke` sample checks execution and reports no win rate.

Reproduce from the repository root:

```sh
node --experimental-transform-types --import ./tests/pin-random.ts tools/tune-siege.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/fit-siege-curve.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-division-dps.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/calibrate-siege.ts --samples=2 --workers=2 --split=heldout --seed-start=1001 --out=docs/design/siege-calibration.json
node --experimental-transform-types --import ./tests/pin-random.ts tools/report-siege.ts
```

Native source hashes isolate resumable caches under ignored `work/`. Never reuse trials across changed combat or generator inputs: `tests/siege-calibration.test.ts` fails when either published report's hash no longer matches the generator, estimate, armies and battle sources.

In a raid the attackers see a defending house only where it blocks their march to the keep. Without this, troops razed every house in reach while the builders rebuilt them, and weak armies never reached the keep. A roughly even overall win share is a starting check for these fixed armies; sparse per-rank outcomes, matchup effects, finite units, and the ceiling constraint remain visible in the report. Real matchmaking will need population data and server-validated player layouts.

## Settlement

`E = 1 / (1 + 10^((opponent MMR - player MMR) / 400))`.

The rating change is `K × (outcome - E)`, rounded and bounded; K is 48 for the first ten games, then 24. Each started target settles once. Equal MMR expresses a model target of 50%, not an observed chance. No fake player history, source badge or search delay is shown.


<!-- native-calibration:start -->

Generated by `tools/report-siege.ts` from the checked-in native trial results.

The native floor is **10.2 estimated DPS**; the bounded-search ceiling is **2,660,425.87**. The held-out test armies won **84 / 136 raids (61.8%)**, using seeds 1001–1004. These are deterministic offline test-army outcomes, with no strike spells, rather than observed player probabilities. 4 cases per reachable division provide an initial calibration of the curve; per-rank results remain uneven, samples are small, and matchups matter.

| Rank | Wins / raids | Observed share |
| --- | ---: | ---: |
| Bronze | 5 / 16 | 31.3% |
| Silver | 14 / 20 | 70.0% |
| Gold | 12 / 20 | 60.0% |
| Platinum | 16 / 20 | 80.0% |
| Diamond | 8 / 20 | 40.0% |
| Master | 16 / 20 | 80.0% |
| Grandmaster | 13 / 20 | 65.0% |

| Division | MMR band | Estimated defensive DPS |
| --- | --- | ---: |
| Bronze V | 0–79 (unreachable) | 8.16 |
| Bronze IV | 100–159 | 10.2 |
| Bronze III | 160–239 | 10.2 |
| Bronze II | 240–319 | 10.2 |
| Bronze I | 320–399 | 19.22 |
| Silver V | 400–479 | 36.21 |
| Silver IV | 480–559 | 68.21 |
| Silver III | 560–639 | 128.5 |
| Silver II | 640–719 | 144.84 |
| Silver I | 720–799 | 163.26 |
| Gold V | 800–879 | 184.01 |
| Gold IV | 880–959 | 207.41 |
| Gold III | 960–1039 | 233.78 |
| Gold II | 1040–1119 | 324.58 |
| Gold I | 1120–1199 | 555.13 |
| Platinum V | 1200–1279 | 949.41 |
| Platinum IV | 1280–1359 | 1,623.74 |
| Platinum III | 1360–1439 | 2,777.03 |
| Platinum II | 1440–1519 | 2,777.08 |
| Platinum I | 1520–1599 | 2,777.14 |
| Diamond V | 1600–1679 | 2,777.19 |
| Diamond IV | 1680–1759 | 2,777.25 |
| Diamond III | 1760–1839 | 2,777.3 |
| Diamond II | 1840–1919 | 5,994.03 |
| Diamond I | 1920–1999 | 12,936.45 |
| Master V | 2000–2079 | 27,919.71 |
| Master IV | 2080–2159 | 31,571.06 |
| Master III | 2160–2239 | 35,699.95 |
| Master II | 2240–2319 | 53,817.66 |
| Master I | 2320–2399 | 81,130.1 |
| Grandmaster V | 2400–2479 | 122,303.59 |
| Grandmaster IV | 2480–2559 | 122,309.71 |
| Grandmaster III | 2560–2639 | 122,315.82 |
| Grandmaster II | 2640–2719 | 570,449.1 |
| Grandmaster I | 2720–3000 | 2,660,425.87 |

<!-- native-calibration:end -->

## Siege spell experiment

Siege starts each raid with 1 mana, caps it at 8, and grants 1 per defending soldier's final death, including heroes and summons. Buildings, civilians, attacker deaths and prevented Hero deaths grant none. Frost nova and Necromancy cost 1; Meteor costs 2; Reinforcements costs 3. These native spells have no cooldown in Siege. An unaffordable cast does nothing. Mana resets with each new battle and is never saved or shared with Ambush gold or Mine resources. Defend and Ambush keep their cooldowns.

The calibration above is the automatic-infantry baseline with no strike casts; mana play has not been population-calibrated. In Siege, Necromancy stays armed rather than spend mana where no grave is in reach. The optional native cast hooks were remeasured after integration and leave the no-gate damage table numerically unchanged.
