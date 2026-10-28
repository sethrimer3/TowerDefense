# Siege defensive damage measurements

The rating estimator uses native Defend attacks. It never sets battle damage, HP, fire rate, or targeting. The current measured floor is **10.2 DPS** (the unupgraded keep and two Ranged Guilds). The bounded-search ceiling is **48,088,475,605.20467 DPS** (24 maximum Shadows, 22 Watch towers, the maximum keep, gate and four corner ballistas). These are capacity estimates under the protocol below, not damage a castle necessarily delivers during a raid or measured success probabilities.

## Reproduce

```
node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-siege-dps.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/siege-dps-ceiling.ts
PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/siege-dps.mjs
```

The first tool measures 272 profiles at five native upgrade bands (1,360 single/crowd pairs). Its two persistent workers write a resumable, source-hashed cache under ignored `work/`; completion order does not affect output. `--workers=1`, `--only=kind` and `--limit=N` support inspection; partial runs never publish the generated table. `siege-dps-measurements.json` lists the protocol, source manifest, per-kind maxima and adjustment count. Tests fail if combat/catalog/benchmark inputs change without regeneration.

## Protocol and limitations

Each fixture runs an actual `DefendSim` with native bonuses and per-home paths, pinned seed 20261028, a 20-second warmup and 40-second measurement at 30 Hz. One tough target and twelve densely grouped targets are measured separately, weighted 60%/40%. Targets have one billion HP, are held beside the defender and have their HP restored each frame. The tool sums actual clamped HP loss, including damage without source attribution. This measures ranged, melee, splash, chains, burns and native death effects without implementing their formulas.

Watch and Chrono fixtures include the same Archer tower and Melee Guild support in a paired baseline; only their marginal damage is recorded. Chrono has 120 seconds to collect native charge. Nano receives an infected host death every two seconds. Walls and bait collapse once, amortized over the window. These context choices are explicit assumptions, not guaranteed raid conditions.

Raw measurements are checked in. The rating table uses a nondecreasing envelope across paid path ranks and Forge bands; 89 measurements required adjustment. Ordinary profiles cover every native path/rank. Shared trees measure each branch/rank and the all-max interaction. Mixed shared ranks interpolate nonnegative branch effects against that joint anchor; they are modeled combinations, not separately measured battles.

`castleDps` sums native defenders, keep, gates, ballistas and every fitted perimeter/placed wall stone. Watch marking never stacks: coverage is sampled at four fronts around each armed footprint, weighted toward the southern approach. Chrono/Nano require nearby armed homes; the common-target-pool model counts the strongest contribution in each family. Fine native damage-training ranks apply their real catalog ratios relative to the nearest measured band. Placement and support interactions remain approximations. Additional buildings and ranks cannot reduce the estimate.

Shadow's native knife compounding reaches extremely high damage during dense, immortal-target encounters. Its all-max weighted measurement is about 1.007 billion DPS per building, making the endgame ceiling many orders above the floor. The measurements preserve this behavior and the finite-target clamp rather than inventing a cap. Ordinary raids have finite units, changing geometry, deaths and walls; phase 6 must measure actual raid outcomes and may bend the MMR curve. No rating estimate is a claim of a 50% win rate.

## Legal ceiling witness

The ceiling tool compares maximum profiles of every armed kind, then 18 mixed/support placements, for **64 candidates**. Native `arrange`/`fitLayout` enforce quarter clearance, roads, the keep and gate approach on a fixed 5×5-tile footprint. Buildings are constructed through native root purchases, `nextSteps` and `upgradeBuilding`, including real three-part merges; side trees use `buySide`. Native compact upgrades govern footprints. The emitted blueprint is a legal reproducible witness and the best layout in this bounded search, **not a proof of the mathematical global optimum**. Its role is a tunable Grandmaster generation anchor.

No player save or native random stream is consulted. Explicitly seeded scratch Defend saves avoid consuming the normal roll stream. The UI gallery renders both witnesses using Defend's city generator and renderer at desktop and phone sizes.
