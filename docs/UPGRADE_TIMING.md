# Upgrade timing estimates

Current source snapshot: 2026-10-07. Analysis only; no game balance changes.

## Interpretation and limits

The planning target is 730 days of normal progress with daily check-ins. Exact costs and Smithy work are calculated from current code. Resource waits are **scenario estimates**, not predictions from a new save. Preset infrastructure is already paid for, one upgrade is prioritized, income is held constant, every rank is restarted immediately, and there is no competing spending. Infrastructure construction, repairs, replacements and battle progression are excluded from those waits. Real acquisition from a new game is longer. Lower bounds are not added together as though each upgrade had its own Mine or staff.

Mine samples run actual 1x simulation from fresh prospects with preset infrastructure, ordinary hazards and attentive prospect moves. They have a CPU limit and report exactly how much simulated time was reached. Unobserved metal means **unknown**, never zero wait. These short samples are startup averages and must not be extrapolated unchanged for two years. Knowledge wait columns use the exact nominal shelves × professors rate, excluding enchanted bonuses and casualties; measured Library results below show how far outcomes can differ.

Smithy training uses wall-clock time, including time away, and a shared pool of at most six smiths. Fully researched Smiths' guild supplies a 1.45× speed multiplier. Assigning all six to one row means they cannot simultaneously train the other rows. Per-row resource and work lower bounds overlap via max(resource wait, training work); this does not model rank-by-rank resource availability. The manufacturing jobs currently have no simulation-side busy-smith filter, so the same named smith also continues generating metal while assigned to training.

## Exact Smithy completion times

From rank zero, ignoring resource/setup/requeue delays:

| Upgrade | Ranks | Copper / Silver / Gold | One smith, no speed research | Six smiths, max research | Final rank with six |
|---|---:|---:|---:|---:|---:|
| Troop HP | 50 | 10 / 15 / 25 | 19.46 yr | 2.24 yr | 42.0 d |
| Troop damage | 50 | 10 / 15 / 25 | 19.46 yr | 2.24 yr | 42.0 d |
| Drill speed | 30 | 10 / 15 / 5 | 266.3 d | 30.6 d | 10.2 d |
| Tower damage | 50 | 10 / 15 / 25 | 19.46 yr | 2.24 yr | 42.0 d |
| Tower reload | 30 | 10 / 15 / 5 | 266.3 d | 30.6 d | 10.2 d |
| Bomb damage | 40 | 10 / 15 / 15 | 9.46 yr | 1.09 yr | 42.0 d |
| Wall HP | 50 | 10 / 15 / 25 | 19.46 yr | 2.24 yr | 42.0 d |
| Keep HP | 50 | 10 / 15 / 25 | 19.46 yr | 2.24 yr | 42.0 d |
| Rebuild speed | 30 | 10 / 15 / 5 | 266.3 d | 30.6 d | 10.2 d |

All nine rows require **12.52 yr** of six-smith work at best. One top 50-rank row requires **2.24 yr**. This is why a two-year target must distinguish one focused row from completing the entire collection.

## Production scenarios and measurements

| Scenario | Setup | Sampled 1x hours (two seeds) | Copper/h | Silver/h | Gold/h | Nominal Knowledge/h |
|---|---|---:|---:|---:|---:|---:|
| early | Mine level 1, 5 workers (1 forge / 1 smiths); Library 6 shelves / 2 professors | 6.00 + 6.00 | 2.00 | 1.83 | 1.58 | 12 |
| developed | Mine level 3, 15 workers (6 forge / 3 smiths); Library 40 shelves / 6 professors | 6.00 + 6.00 | 6.58 | 5.67 | 7.00 | 240 |
| late | Mine level 5, 25 workers (8 forge / 6 smiths); Library 110 shelves / 10 professors | 6.00 + 6.00 | 9.58 | 7.67 | 12.00 | 1100 |

| Scenario / seed | Mine deaths / final crew | First Copper / Silver / Gold (h) | Library measured Knowledge/h | Bonus Knowledge | Library deaths / fires |
|---|---:|---|---:|---:|---:|
| early / 7 | 1 / 4 | 0.45 / 0.40 / 0.86 | 11.8 | 0 | 0 / 6 |
| early / 19 | 2 / 3 | 0.28 / 0.46 / 0.67 | 11.2 | 0 | 0 / 6 |
| developed / 7 | 3 / 12 | 0.20 / 0.19 / 0.62 | 228.6 | 0 | 0 / 4 |
| developed / 19 | 2 / 13 | 0.19 / 0.26 / 0.38 | 224.9 | 0 | 0 / 4 |
| late / 7 | 5 / 20 | 0.13 / 0.17 / 0.31 | 59400.0 | 349800 | 0 / 0 |
| late / 19 | 3 / 22 | 0.17 / 0.23 / 0.26 | 53900.0 | 316800 | 0 / 0 |

## Shared resource budgets

All Forge tracks together cost **1115 copper + 183 silver + 38 gold**, about **4.8 d** of the late-profile sample income if every metal is saved for them.

All Study skills together cost **1549 Knowledge**. Choosing the most expensive fully evolved path in each topic adds **287 Knowledge**, giving **1836 Knowledge** for every compatible Study upgrade: **1.7 h** at late nominal income. Minimal prerequisite prices in individual rows must not be charged again when summing the complete tree. These budgets exclude setup and income growth.

DEFEND upgrade points currently have no upgrade purchase route. They accumulate one per new highest cleared wave, so there is no point-priced upgrade completion time to calculate yet.

## Every finite upgrade: maximum rank

Each cost below is that upgrade's own cumulative price. Study prerequisite Knowledge is additional and included in the CSV's wait estimates. Separate paths for a topic are alternatives, not a collection that can all be held at once. Shelf/staff purchase totals do not include Mine infrastructure. Normal tiles and bombs have no finite completion point; their repeat prices are not counted as final upgrades.

### Forge

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Garrison | 4 | 20 copper + 1 silver | — | 2.1 h |
| Drill yard | 5 | 30 copper + 3 silver | — | 3.1 h |
| Arms & armour | 6 | 42 copper + 6 silver + 1 gold | — | 4.4 h |
| Patrol routes | 4 | 20 copper + 1 silver | — | 2.1 h |
| Keen eyes | 4 | 20 copper + 1 silver | — | 2.1 h |
| Hunter's instinct | 1 | 12 copper + 4 silver | — | 1.3 h |
| Bodkin points | 6 | 42 copper + 6 silver + 1 gold | — | 4.4 h |
| Longbows | 4 | 20 copper + 1 silver | — | 2.1 h |
| Quick nock | 5 | 30 copper + 3 silver | — | 3.1 h |
| Heavy shot | 5 | 30 copper + 3 silver | — | 3.1 h |
| Powder monkeys | 4 | 20 copper + 1 silver | — | 2.1 h |
| Gunnery drills | 1 | 2 copper | — | 12.5 min |
| Shaped charges | 1 | 2 copper | — | 12.5 min |
| Lookouts | 4 | 20 copper + 1 silver | — | 2.1 h |
| Flamethrower | 5 | 30 copper + 3 silver | — | 3.1 h |
| Ice wave | 5 | 30 copper + 3 silver | — | 3.1 h |
| Pyroclasm | 5 | 30 copper + 3 silver | — | 3.1 h |
| Lingering embers | 5 | 30 copper + 3 silver | — | 3.1 h |
| Folded halls | 1 | 10 copper + 3 silver | — | 1.0 h |
| Long spears | 5 | 30 copper + 3 silver | — | 3.1 h |
| Folded sanctum | 1 | 45 copper + 20 silver + 3 gold | — | 4.7 h |
| Arc span | 5 | 30 copper + 3 silver | — | 3.1 h |
| Conduit of night | 20 | 270 copper + 77 silver + 30 gold | — | 1.2 d |
| Restocking | 5 | 30 copper + 3 silver | — | 3.1 h |
| Powder kegs | 5 | 30 copper + 3 silver | — | 3.1 h |
| Iron-shod stakes | 6 | 42 copper + 6 silver + 1 gold | — | 4.4 h |
| Barbed edges | 4 | 20 copper + 1 silver | — | 2.1 h |
| Masonry | 6 | 42 copper + 6 silver + 1 gold | — | 4.4 h |
| Keep bastions | 6 | 42 copper + 6 silver + 1 gold | — | 4.4 h |
| Guild of builders | 5 | 30 copper + 3 silver | — | 3.1 h |
| Hardy folk | 5 | 30 copper + 3 silver | — | 3.1 h |
| Master masons | 5 | 30 copper + 3 silver | — | 3.1 h |
| War drums | 1 | 4 copper | — | 25.0 min |

### Smithy

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Troop HP | 50 | 10 copper + 15 silver + 25 gold | — | 2.24 yr training; resources 2.1 h |
| Troop damage | 50 | 10 copper + 15 silver + 25 gold | — | 2.24 yr training; resources 2.1 h |
| Drill speed | 30 | 10 copper + 15 silver + 5 gold | — | 30.6 d training; resources 2.0 h |
| Tower damage | 50 | 10 copper + 15 silver + 25 gold | — | 2.24 yr training; resources 2.1 h |
| Tower reload | 30 | 10 copper + 15 silver + 5 gold | — | 30.6 d training; resources 2.0 h |
| Bomb damage | 40 | 10 copper + 15 silver + 15 gold | — | 1.09 yr training; resources 2.0 h |
| Wall HP | 50 | 10 copper + 15 silver + 25 gold | — | 2.24 yr training; resources 2.1 h |
| Keep HP | 50 | 10 copper + 15 silver + 25 gold | — | 2.24 yr training; resources 2.1 h |
| Rebuild speed | 30 | 10 copper + 15 silver + 5 gold | — | 30.6 d training; resources 2.0 h |

### Study skill

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Drill sergeant | 3 | 6 knowledge | — | 0.3 min |
| Veterans | 3 | 12 knowledge | 1 | 0.7 min |
| Bladework | 3 | 12 knowledge | 1 | 0.7 min |
| Fletchers | 3 | 18 knowledge | 3 | 1.1 min |
| Ballistics | 3 | 18 knowledge | 10 | 1.5 min |
| Gunpowder | 3 | 12 knowledge | 3 | 0.8 min |
| War banner | 3 | 30 knowledge | 13 | 2.3 min |
| Rapid deployment | 3 | 18 knowledge | 18 | 2.0 min |
| Sheltering standard | 1 | 5 knowledge | 36 | 2.2 min |
| Broad standard | 1 | 5 knowledge | 41 | 2.5 min |
| Battle standard | 1 | 8 knowledge | 46 | 2.9 min |
| Forced march | 1 | 8 knowledge | 46 | 2.9 min |
| Vital standard | 1 | 8 knowledge | 46 | 2.9 min |
| Restoring standard | 1 | 12 knowledge | 54 | 3.6 min |
| Masonry | 3 | 6 knowledge | — | 0.3 min |
| Bastions | 3 | 12 knowledge | 1 | 0.7 min |
| Outlying districts | 1 | 8 knowledge | 1 | 0.5 min |
| Builders' guilds | 3 | 12 knowledge | 1 | 0.7 min |
| Smiths' guild | 3 | 12 knowledge | — | 0.7 min |
| Master smith | 1 | 6 knowledge | 2 | 0.4 min |
| Fireproof wood | 10 | 275 knowledge | — | 15.0 min |
| Coffee | 12 | 156 knowledge | — | 8.5 min |
| Waterproofing | 4 | 40 knowledge | — | 2.2 min |
| Night watch | 9 | 180 knowledge | — | 9.8 min |
| Enchanted ink | 10 | 550 knowledge | — | 30.0 min |
| Fire training | 5 | 120 knowledge | — | 6.5 min |

### Study path

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Pyromancy | 3 | 26 knowledge | — | 1.4 min |
| Rime | 3 | 26 knowledge | — | 1.4 min |
| Stormcalling | 3 | 29 knowledge | — | 1.6 min |
| Crusaders | 3 | 26 knowledge | — | 1.4 min |
| Assassins | 3 | 26 knowledge | — | 1.4 min |
| Fire arrows | 3 | 26 knowledge | — | 1.4 min |
| Sharpshooters | 3 | 26 knowledge | — | 1.4 min |
| Gun crews | 3 | 26 knowledge | — | 1.4 min |
| Siege shot | 3 | 26 knowledge | — | 1.4 min |
| Rangers | 3 | 26 knowledge | — | 1.4 min |
| Skirmishers | 3 | 26 knowledge | — | 1.4 min |
| Spotters | 3 | 26 knowledge | — | 1.4 min |
| Signal fires | 3 | 26 knowledge | — | 1.4 min |
| Pyroclasm | 3 | 26 knowledge | — | 1.4 min |
| Cinders | 3 | 26 knowledge | — | 1.4 min |
| Oil-soaked | 3 | 21 knowledge | — | 1.1 min |
| Fortified crates | 3 | 21 knowledge | — | 1.1 min |
| Blasting stakes | 3 | 26 knowledge | — | 1.4 min |
| Spring stakes | 3 | 26 knowledge | — | 1.4 min |
| Rimed stakes | 3 | 26 knowledge | — | 1.4 min |

### Evolution

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Dark wizard keep | 1 | 30 knowledge | 29 | 3.2 min |
| Valkyrie palace | 1 | 25 knowledge | 26 | 2.8 min |

### Mine building

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| shaft | 5 | 40 copper + 6 silver + 3 gold | — | 4.2 h |
| barracks | 5 | 50 copper + 6 silver + 3 gold | — | 5.2 h |
| warehouse | 5 | 60 copper + 6 silver + 3 gold | — | 6.3 h |
| forge | 5 | 50 copper + 6 silver + 3 gold | — | 5.2 h |
| smithy | 5 | 50 copper + 6 silver + 3 gold | — | 5.2 h |

### Mine staff

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Full mine crew | 25 | 324 copper + 50 silver + 10 gold | — | 1.4 d |

### Library

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Full bookshelf collection | 110 | 6105 copper + 250 silver + 50 gold | — | 26.5 d |
| Full Library staff | 16 | 152 copper + 24 silver + 4 gold | — | 15.9 h |
| Alchemy lab | 5 | 100 copper + 18 silver + 3 gold | — | 10.4 h |

## What two years would require

- **One focused 50-rank Smithy row:** keeping the 60-second start and 1.5× growth, reduce the per-rank cap from 365 days of one-smith work to approximately **320.72 days** to produce a 730-day training-only total with six smiths and max speed research. This leaves the whole collection taking much longer.
- **All Smithy rows in two years:** with the same six-smith budget, a shared cap of approximately **41.29 days** gives 730 days of aggregate training work. Rows must be scheduled, resources secured and every completion immediately requeued; add allowance for setup and daily sessions rather than treating this minimum as a promise.
- **Knowledge capstones:** at the late nominal rate of 1100 Knowledge/hour, two years generates **19,272,000 Knowledge** before spending. Holding the measured late enchanted rates constant instead would imply **944–1041 million Knowledge**. This is a sensitivity comparison, not a two-year simulation. Current skills cost only hundreds; their linear rank prices cannot create a two-year finish. Keep early ranks affordable and grow later ranks, accounting for enchanted-book income and the time spent building the Library.
- **Forge capstones:** resource costs are small relative to multi-year manufacturing capacity. To make their highest tiers arrive near two years, tune cumulative resource gates against a long-run Mine model with growth, ore access, losses and prospect resets, or tie the capstone to finite progression milestones. Do not multiply all early prices by a large constant.
- **Recommended pacing:** first-hour purchases stay accessible; specialize over days/weeks; open advanced branches over months; reserve the strongest final ranks for roughly months 18–24. Specify whether a player should finish one specialization or every compatible upgrade by that point.

## Offline and check-in effects

The Mine and Library bank at most 24 hours. A daily visit can retain most wall-clock income, but longer absences lose the excess. The 120× catch-up setting controls replay throughput, not a free 120× progression multiplier. The 10× catch-up payout consumes ten seconds of bank for one simulation second: unchanged base Knowledge pays for elapsed bank time, while digging, accidents and rune-reading advance less physical simulation per paid hour. This changes unlock delays and bonus distributions, so offline-heavy play needs its own model. Smithy jobs continue on wall-clock time; only the current rank completes, with no automatic next rank. Daily visits add waiting between completions.

## Reproduce

```powershell
node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-upgrade-production.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/estimate-upgrades.ts
```

Measurement horizon defaults to 6 simulated hours per sample, with 30 CPU seconds maximum for each Mine. Set ESTIMATE_HOURS and ESTIMATE_CPU_SECONDS to change those limits. Source costs remain exact at the current snapshot. See upgrade-production.json for the full measurements and upgrade-estimates.csv for every individual rank and profile.
