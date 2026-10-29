# Siege opponents and ratings

Siege uses one visible MMR (100–3000), starting at 1000, Gold III. An offered opponent has a saved MMR and native castle blueprint; its MMR enters Elo settlement. The DPS budget estimates castle capacity, not its owner's separate rating or a measured success probability. Find Match offers a target within ±80; Back does not commit a raid. Attack commits; abandoning/reloading a started rated raid loses. Completed targets can be practiced without settling again.

## Native castle snapshots

Revision 2, `siege-v2`, saves identity/flag, seed, MMR, layout, Armory levels, Smithy training, Skills, per-building paths/ranks and optional native side trees. This is the foundation for future real-player castles, which will require server validation. Nothing is uploaded today.

A seeded personality weights towers, troops, magic, gunpowder or balanced choices. Purchases and all building paths/merges use native `nextSteps`/`upgradeBuilding`, including three real maximum partners for an ultimate. Quarter placements use native `arrange`/`fitLayout` on the fixed 5×5-tile footprint. Side trees are bought with native `buySide`. Ultimates open above Diamond (Master and Grandmaster). Bounded native damage-training ranks refine the budget; these are real saved upgrades, never fractional damage modifiers. The legal maximum witness supplies the upper end, with seeded removals where appropriate.

`siegeField` passes that blueprint to native city generation and retains every owned infantry copy as a hidden staging home just beyond the bottom edge. Two native Defend simulations share geometry and forward damage through native unit/building damage functions. The defense wears its saved levels and native bonus snapshot. The attacker retains the player's upgrades. There is **no flat defense damage/HP scale**. Walls, repairs, projectiles, garrisons and spells remain Defend's. Destroying the enemy keep wins; reaching the two-minute limit loses. Native garrisons still train and replenish from their own saved homes, and enter on the last board row. Staging homes have no city cells, drawing, inspection or enemy targets; the approach stays open.

Revision-one offers regenerate at the same seed and saved opponent MMR while preserving identity. Interrupted revision-one raids settle as losses once; completed results/counters remain. Optional malformed flags or side ranks do not erase valid progress.

## DPS budget and calibration status

[Average DPS estimates](SIEGE_DPS.md) explains the per-building formula (garrison × damage × hits ÷ reload, crits and compounding as averages), the native floor (10 DPS) and the bounded-search ceiling (2,762,799.93 DPS). The Shadow's edge is averaged over a 30-second fight, so no single building outweighs a castle. These are capacity estimates rather than a prediction of damage delivered through walls in a raid.

`tools/siege-division-dps.ts` writes 35 increasing division anchors from `siege-budget-config.ts`; runtime generation only interpolates those numbers. Bronze V is unreachable under the 100 minimum; Bronze IV's first reachable point is 100. Grandmaster I's floor, 2720, anchors the ceiling and the top band stays there. The curve is fitted from actual native raids instead of spreading Shadow's extreme dummy-target range uniformly. Diamond I holds its last pre-ultimate budget until Master: interpolating an ultimate-sized budget into that band would ask for a castle that cannot fit under its upgrade rules.

The reference policy in `src/campaign/siege-army.ts` derives smooth attacker capacity from explicit catalog progression assumptions, then uses the same seeded native generator filtered to infantry. Every player starts at 1000 MMR, so the army assumed there is modest: basic guilds below it, attuned halls without paths from Gold III, ranked paths from Diamond and ultimates (Hero, Shadow, Revolutionary) from Grandmaster. These are reproducible test rosters, not equipment observed from players. The guard side uses native Defend deployment/leashes rather than rallying every soldier onto the keep.

`tools/tune-siege.ts` searches native win/loss budget brackets at representative ranks; each budget is won or lost by the majority of training seeds 1–3, since one raid is too noisy to bracket a crossover. An unfillable castle is a generator/capacity failure, never a simulated loss. `tools/fit-siege-curve.ts` fits monotone logarithmic anchors, with a conservative matchup margin, the native floor and the Grandmaster ceiling fixed. `tools/siege-division-dps.ts` emits runtime anchors. `tools/calibrate-siege.ts` then runs separate held-out seeds across all 34 reachable divisions. Only completed two-minute raids enter its reported win share. Training and held-out validation were rerun for the shorter limit and hidden staging homes; old four-minute observations are not reused. A two-second `--smoke` sample checks execution and reports no win rate.

Reproduce from the repository root:

```sh
node --experimental-transform-types --import ./tests/pin-random.ts tools/tune-siege.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/fit-siege-curve.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-division-dps.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/calibrate-siege.ts --samples=4 --workers=4 --split=heldout --seed-start=1001 --out=docs/design/siege-calibration.json
node --experimental-transform-types --import ./tests/pin-random.ts tools/report-siege.ts
```

Native source hashes isolate resumable caches under ignored `work/`. Never reuse trials across changed combat or generator inputs: `tests/siege-calibration.test.ts` fails when either published report's hash no longer matches the generator, estimate, armies and battle sources.

In a raid the attackers see a defending house only where it blocks their march to the keep. Without this, troops razed every house in reach while the builders rebuilt them, and weak armies never reached the keep. A roughly even overall win share is a starting check for these fixed armies; sparse per-rank outcomes, matchup effects, finite units, and the ceiling constraint remain visible in the report. Real matchmaking will need population data and server-validated player layouts.

Phase 8’s two-minute staging refit produced 42/136 held-out wins (30.9%). After adding the three native flag-bearers, phase 12 reran training and validation: 40/136 wins (29.4%) with unchanged curve values, versus the earlier four-minute baseline's 56/136 (41.2%). This comparison includes the new entry geometry and the curve refit; it does not isolate the timer. Bronze's reference armies lost all 16 trials even at the minimum native castle budget. The two-minute baseline is therefore not calibrated to an even win share; minimum-castle pressure, fixed progression assumptions and uneven rank outcomes remain a balance follow-up. The report preserves those losses rather than changing native combat or calling unfinished raids losses.

## Settlement

`E = 1 / (1 + 10^((opponent MMR - player MMR) / 400))`.

The rating change is `K × (outcome - E)`, rounded and bounded; K is 48 for the first ten games, then 24. Each started target settles once. Equal MMR expresses a model target of 50%, not an observed chance. No fake player history, source badge or search delay is shown.


<!-- native-calibration:start -->

Generated by `tools/report-siege.ts` from the checked-in native trial results.

The native floor is **10 estimated DPS**; the bounded-search ceiling is **2,762,799.93**. The held-out test armies won **40 / 136 raids (29.4%)**, using seeds 1001–1004, with a 120-second limit and hidden staging homes. These are deterministic offline test-army outcomes, with no strike spells, rather than observed player probabilities. 4 cases per reachable division provide an initial calibration of the curve; per-rank results remain uneven, samples are small, and matchups matter.

| Rank | Wins / raids | Observed share |
| --- | ---: | ---: |
| Bronze | 0 / 16 | 0.0% |
| Silver | 12 / 20 | 60.0% |
| Gold | 7 / 20 | 35.0% |
| Platinum | 5 / 20 | 25.0% |
| Diamond | 5 / 20 | 25.0% |
| Master | 2 / 20 | 10.0% |
| Grandmaster | 9 / 20 | 45.0% |

| Division | MMR band | Estimated defensive DPS |
| --- | --- | ---: |
| Bronze V | 0–79 (unreachable) | 8 |
| Bronze IV | 100–159 | 10 |
| Bronze III | 160–239 | 10 |
| Bronze II | 240–319 | 10 |
| Bronze I | 320–399 | 10 |
| Silver V | 400–479 | 10 |
| Silver IV | 480–559 | 10 |
| Silver III | 560–639 | 10 |
| Silver II | 640–719 | 16.63 |
| Silver I | 720–799 | 27.66 |
| Gold V | 800–879 | 45.99 |
| Gold IV | 880–959 | 76.48 |
| Gold III | 960–1039 | 127.18 |
| Gold II | 1040–1119 | 260.12 |
| Gold I | 1120–1199 | 654.35 |
| Platinum V | 1200–1279 | 1,646.06 |
| Platinum IV | 1280–1359 | 4,140.74 |
| Platinum III | 1360–1439 | 10,416.26 |
| Platinum II | 1440–1519 | 10,416.47 |
| Platinum I | 1520–1599 | 10,416.67 |
| Diamond V | 1600–1679 | 10,416.88 |
| Diamond IV | 1680–1759 | 10,417.09 |
| Diamond III | 1760–1839 | 10,417.3 |
| Diamond II | 1840–1919 | 10,417.65 |
| Diamond I | 1920–1999 | 10,417.99 |
| Master V | 2000–2079 | 10,418.34 |
| Master IV | 2080–2159 | 10,418.86 |
| Master III | 2160–2239 | 10,419.38 |
| Master II | 2240–2319 | 14,561.19 |
| Master I | 2320–2399 | 20,349.42 |
| Grandmaster V | 2400–2479 | 28,438.52 |
| Grandmaster IV | 2480–2559 | 35,464.14 |
| Grandmaster III | 2560–2639 | 44,225.42 |
| Grandmaster II | 2640–2719 | 349,551.13 |
| Grandmaster I | 2720–3000 | 2,762,799.93 |

<!-- native-calibration:end -->

## Siege spell experiment

Siege starts each raid with 1 mana, caps it at 8, and grants 1 per defending soldier's final death, including heroes and summons. Buildings, civilians, attacker deaths and prevented Hero deaths grant none. Frost nova and Necromancy cost 1; Meteor costs 2; Reinforcements costs 3. These native spells have no cooldown in Siege. An unaffordable cast does nothing. Mana resets with each new battle and is never saved or shared with Ambush gold or Mine resources. Defend and Ambush keep their cooldowns.

The calibration above is the automatic-infantry baseline with no strike casts; mana play has not been population-calibrated. In Siege, Necromancy stays armed rather than spend mana where no grave is in reach. The optional native cast hooks leave battles without a mana gate unchanged.
