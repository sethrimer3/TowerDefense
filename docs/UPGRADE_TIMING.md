# Upgrade timing and quadratic balance

Current source snapshot: 2026-10-08. Prices and project timers below are implemented in the game.

## Pacing target and current forecast

The target is about two years to a focused top specialization, with 24-hour normal progress and daily visits. Compatible branches share income, so maxing the whole collection takes longer. This interpretation is explicit rather than silently giving every branch its own income budget.

The forecast first funds a starter Library, Mine level 3 with 15 workers, Mine level 5 with 25 workers, then full Library infrastructure and its fire precautions. Unspent metals and Knowledge carry between every phase; utility research is charged once. Measured phase rates only apply after their infrastructure is funded. This is a capital-budget model, not two years of physical simulation: it excludes replacement bills, construction downtime, battle expenses and delays between manual rank starts; it holds each phase's income until the next setup is complete. Real incremental investments can improve income sooner.

| Focused target | Estimated time from modeled start |
|---|---:|
| One 50-rank row, e.g. Troop HP | 2.07 yr (757 days) |
| Conduit of night, including Stormcalling and its evolution | 2.01 yr (735 days) |
| Enchanted ink, all ten ranks | 2.00 yr (730 days) |

| Production investment | Modeled completion | Copper / Silver / Gold per hour afterwards | Nominal Knowledge/h |
|---|---:|---|---:|
| 5 workers; 6 shelves / 2 professors / 1 researcher | 1.4 d | 2.00 / 1.83 / 1.58 | 12 |
| Mine level 3 / 15 workers; Coffee 6 / Waterproofing 2 | 64.9 d | 6.58 / 5.67 / 7.00 | 12 |
| Mine level 5 / 25 workers; Coffee 12 / Waterproofing 4 | 254.4 d | 9.58 / 7.67 / 12.00 | 12 |
| Library 110 shelves / 10 professors / 4 shelvers / 2 researchers | 1.08 yr | 9.58 / 7.67 / 12.00 | 1100 |
| Library fire precautions fully researched | 1.09 yr | 9.58 / 7.67 / 12.00 | 1100 |

## Implemented curves

Owned ranks are zero-based. Per-purchase prices are quadratic; their cumulative spending grows roughly cubically. Early prices remain affordable. Production increases through purchased capacity and crew, without an automatic multiplier tied to elapsed calendar time.

- Training: **1 + 5 × owned²** units of the existing Copper/Silver/Gold tier. Work is **60 × next-rank² seconds** per smith.
- Ordinary Forge levels: **2 + 20 × owned² Copper**; precious-metal tiers also grow quadratically. Conduit's late Gold is **210 × (owned − 6)²**, beginning at rank eight. All Forge levels and War drums require named smiths, shared with Training.
- Mine buildings: **base × (1 + 80 × (current-level − 1)²)** Copper. Crew hires are **1 + crew²** Copper. Additional capacity therefore needs progressively larger reinvestment.
- Library shelves: **1 + owned + floor(owned² / 20)** Copper; staff **2 + hired²**; lab **10 + 200 × (current-level − 1)²**. Precious-metal portions also rise quadratically.
- Study skills: **base × (1 + growth × owned²)**, with growth 50 for production/fire utility, 1000 for ordinary combat research and 4000 for Enchanted ink. Paths use 1000; evolution crowns cost 100,000/150,000 Knowledge.
- Every Knowledge skill/path rank takes **300 × next-rank² seconds per researcher**; evolution requires **24 researcher-hours**. The lab shares all current researchers on one project. Zero researchers pauses it. Effects apply on completion; cancellation refunds the exact paid bill. Instantaneous research applies to both workshops.
- Enchanted books now award **one minute of current base Knowledge, at least 1**, so bonuses follow the Library instead of overwhelming it with two-hour gifts.

## Interpretation and limits

The planning target is 730 days of normal progress with daily check-ins. Exact costs and Smithy work are calculated from current code. Resource waits are **scenario estimates**, not predictions from a new save. Preset infrastructure is already paid for, one upgrade is prioritized, income is held constant, every rank is restarted immediately, and there is no competing spending. Infrastructure construction, repairs, replacements and battle progression are excluded from those waits. Real acquisition from a new game is longer. Lower bounds are not added together as though each upgrade had its own Mine or staff.

Mine samples run actual 1x simulation from fresh prospects with preset infrastructure, ordinary hazards and attentive prospect moves. They have a CPU limit and report exactly how much simulated time was reached. Unobserved metal means **unknown**, never zero wait. These short samples are startup averages and must not be extrapolated unchanged for two years. Knowledge wait columns use the exact nominal shelves × professors rate, excluding enchanted bonuses and casualties; measured Library results below show how far outcomes can differ.

Smithy training uses wall-clock time, including time away, and a shared pool of at most six smiths. Fully researched Smiths' guild supplies a 1.45× speed multiplier. Assigning all six to one row means they cannot simultaneously train the other rows. Per-row resource and work lower bounds overlap via max(resource wait, training work); this does not model rank-by-rank resource availability. The manufacturing jobs currently have no simulation-side busy-smith filter, so the same named smith also continues generating metal while assigned to training.

## Exact Smithy completion times

From rank zero, ignoring resource/setup/requeue delays:

| Upgrade | Ranks | Copper / Silver / Gold | One smith, no speed research | Six smiths, max research | Final rank with six |
|---|---:|---:|---:|---:|---:|
| Troop HP | 50 | 1435 / 23090 / 177650 | 29.8 d | 3.4 d | 4.8 h |
| Troop damage | 50 | 1435 / 23090 / 177650 | 29.8 d | 3.4 d | 4.8 h |
| Drill speed | 30 | 1435 / 23090 / 18280 | 6.6 d | 18.1 h | 1.7 h |
| Tower damage | 50 | 1435 / 23090 / 177650 | 29.8 d | 3.4 d | 4.8 h |
| Tower reload | 30 | 1435 / 23090 / 18280 | 6.6 d | 18.1 h | 1.7 h |
| Bomb damage | 40 | 1435 / 23090 / 78215 | 15.4 d | 1.8 d | 3.1 h |
| Wall HP | 50 | 1435 / 23090 / 177650 | 29.8 d | 3.4 d | 4.8 h |
| Keep HP | 50 | 1435 / 23090 / 177650 | 29.8 d | 3.4 d | 4.8 h |
| Rebuild speed | 30 | 1435 / 23090 / 18280 | 6.6 d | 18.1 h | 1.7 h |

All nine rows require **21.2 d** of six-smith work at best. One top 50-rank row requires **3.4 d**. Their resource prices govern the long-term finish; these are processing times after materials have been secured.

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
| late / 7 | 5 / 20 | 0.13 / 0.17 / 0.31 | 1585.8 | 2915 | 0 / 0 |
| late / 19 | 3 / 22 | 0.17 / 0.23 / 0.26 | 1540.0 | 2640 | 0 / 0 |

## Shared resource budgets

All Forge tracks together cost **26151 copper + 1026 silver + 173243 gold**, about **1.65 yr** of the late-profile sample income if every metal is saved for them.

All Training rows together cost **12915 copper + 207810 silver + 1021305 gold**. Their Gold alone needs **9.72 yr** at the late sampled rate. This balance targets a chosen specialization near two years; it does not promise the entire collection by then.

All Study skills together cost **11717860 Knowledge**. Choosing the most expensive fully evolved path in each topic adds **430108 Knowledge**, giving **12147968 Knowledge** for every compatible Study upgrade: **1.26 yr** at late nominal income. Minimal prerequisite prices in individual rows must not be charged again when summing the complete tree. These budgets exclude setup and income growth.

DEFEND upgrade points currently have no upgrade purchase route. They accumulate one per new highest cleared wave, so there is no point-priced upgrade completion time to calculate yet.

## Every finite upgrade: maximum rank

Each cost below is that upgrade's own cumulative price. Study prerequisite Knowledge is additional and included in the CSV's wait estimates. Separate paths for a topic are alternatives, not a collection that can all be held at once. Shelf/staff purchase totals do not include Mine infrastructure. Normal tiles and bombs have no finite completion point; their repeat prices are not counted as final upgrades.

### Forge

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Garrison | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Drill yard | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Arms & armour | 6 | 1112 copper + 14 silver + 250 gold | — | 20.9 min smith work; resources 4.8 d |
| Patrol routes | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Keen eyes | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Hunter's instinct | 1 | 12 copper + 4 silver | — | 0.2 min smith work; resources 1.3 h |
| Bodkin points | 6 | 1112 copper + 14 silver + 250 gold | — | 20.9 min smith work; resources 4.8 d |
| Longbows | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Quick nock | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Heavy shot | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Powder monkeys | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Gunnery drills | 1 | 2 copper | — | 0.2 min smith work; resources 12.5 min |
| Shaped charges | 1 | 2 copper | — | 0.2 min smith work; resources 12.5 min |
| Lookouts | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Flamethrower | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Ice wave | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Pyroclasm | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Lingering embers | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Folded halls | 1 | 10 copper + 3 silver | — | 0.2 min smith work; resources 1.0 h |
| Long spears | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Folded sanctum | 1 | 45 copper + 20 silver + 3 gold | — | 0.2 min smith work; resources 4.7 h |
| Arc span | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Conduit of night | 20 | 9960 copper + 852 silver + 171990 gold | — | 11.0 h smith work; resources 1.64 yr |
| Restocking | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Powder kegs | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Iron-shod stakes | 6 | 1112 copper + 14 silver + 250 gold | — | 20.9 min smith work; resources 4.8 d |
| Barbed edges | 4 | 288 copper + 1 silver | — | 6.9 min smith work; resources 1.3 d |
| Masonry | 6 | 1112 copper + 14 silver + 250 gold | — | 20.9 min smith work; resources 4.8 d |
| Keep bastions | 6 | 1112 copper + 14 silver + 250 gold | — | 20.9 min smith work; resources 4.8 d |
| Guild of builders | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Hardy folk | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| Master masons | 5 | 610 copper + 5 silver | — | 12.6 min smith work; resources 2.7 d |
| War drums | 1 | 4 copper | — | 0.2 min smith work; resources 25.0 min |

### Smithy

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Troop HP | 50 | 1435 copper + 23090 silver + 177650 gold | — | 3.4 d smith work; resources 1.69 yr |
| Troop damage | 50 | 1435 copper + 23090 silver + 177650 gold | — | 3.4 d smith work; resources 1.69 yr |
| Drill speed | 30 | 1435 copper + 23090 silver + 18280 gold | — | 18.1 h smith work; resources 125.5 d |
| Tower damage | 50 | 1435 copper + 23090 silver + 177650 gold | — | 3.4 d smith work; resources 1.69 yr |
| Tower reload | 30 | 1435 copper + 23090 silver + 18280 gold | — | 18.1 h smith work; resources 125.5 d |
| Bomb damage | 40 | 1435 copper + 23090 silver + 78215 gold | — | 1.8 d smith work; resources 271.6 d |
| Wall HP | 50 | 1435 copper + 23090 silver + 177650 gold | — | 3.4 d smith work; resources 1.69 yr |
| Keep HP | 50 | 1435 copper + 23090 silver + 177650 gold | — | 3.4 d smith work; resources 1.69 yr |
| Rebuild speed | 30 | 1435 copper + 23090 silver + 18280 gold | — | 18.1 h smith work; resources 125.5 d |

### Study skill

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Drill sergeant | 3 | 5003 knowledge | — | 35.0 min research; resources 4.5 h |
| Veterans | 3 | 10006 knowledge | 1 | 37.5 min research; resources 9.1 h |
| Bladework | 3 | 10006 knowledge | 1 | 37.5 min research; resources 9.1 h |
| Fletchers | 3 | 15009 knowledge | 3 | 40.0 min research; resources 13.6 h |
| Ballistics | 3 | 15009 knowledge | 10 | 47.5 min research; resources 13.7 h |
| Gunpowder | 3 | 10006 knowledge | 3 | 40.0 min research; resources 9.1 h |
| War banner | 3 | 25015 knowledge | 13 | 50.0 min research; resources 22.8 h |
| Rapid deployment | 3 | 15009 knowledge | 18 | 52.5 min research; resources 13.7 h |
| Sheltering standard | 1 | 5 knowledge | 15027 | 55.0 min research; resources 13.7 h |
| Broad standard | 1 | 5 knowledge | 15032 | 57.5 min research; resources 13.7 h |
| Battle standard | 1 | 8 knowledge | 15037 | 1.0 h research; resources 13.7 h |
| Forced march | 1 | 8 knowledge | 15037 | 1.0 h research; resources 13.7 h |
| Vital standard | 1 | 8 knowledge | 15037 | 1.0 h research; resources 13.7 h |
| Restoring standard | 1 | 12 knowledge | 15045 | 1.0 h research; resources 13.7 h |
| Masonry | 3 | 5003 knowledge | — | 35.0 min research; resources 4.5 h |
| Bastions | 3 | 10006 knowledge | 1 | 37.5 min research; resources 9.1 h |
| Outlying districts | 1 | 8 knowledge | 1 | 5.0 min research; resources 0.5 min |
| Builders' guilds | 3 | 10006 knowledge | 1 | 37.5 min research; resources 9.1 h |
| Smiths' guild | 3 | 10006 knowledge | — | 35.0 min research; resources 9.1 h |
| Master smith | 1 | 6 knowledge | 2 | 5.0 min research; resources 0.4 min |
| Fireproof wood | 10 | 71300 knowledge | — | 16.0 h research; resources 2.7 d |
| Coffee | 12 | 50624 knowledge | — | 1.1 d research; resources 1.9 d |
| Waterproofing | 4 | 2816 knowledge | — | 1.3 h research; resources 2.6 h |
| Night watch | 9 | 40836 knowledge | — | 11.9 h research; resources 1.5 d |
| Enchanted ink | 10 | 11400100 knowledge | — | 16.0 h research; resources 1.18 yr |
| Fire training | 5 | 12040 knowledge | — | 2.3 h research; resources 10.9 h |

### Study path

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Pyromancy | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Rime | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Stormcalling | 3 | 25015 knowledge | — | 35.0 min research; resources 22.7 h |
| Crusaders | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Assassins | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Fire arrows | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Sharpshooters | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Gun crews | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Siege shot | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Rangers | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Skirmishers | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Spotters | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Signal fires | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Pyroclasm | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Cinders | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Oil-soaked | 3 | 15009 knowledge | — | 35.0 min research; resources 13.6 h |
| Fortified crates | 3 | 15009 knowledge | — | 35.0 min research; resources 13.6 h |
| Blasting stakes | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Spring stakes | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |
| Rimed stakes | 3 | 20012 knowledge | — | 35.0 min research; resources 18.2 h |

### Evolution

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Dark wizard keep | 1 | 150000 knowledge | 25015 | 12.6 h research; resources 6.6 d |
| Valkyrie palace | 1 | 100000 knowledge | 20012 | 12.6 h research; resources 4.5 d |

### Mine building

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| shaft | 5 | 4496 copper + 14 silver + 5 gold | — | 19.5 d |
| barracks | 5 | 5620 copper + 14 silver + 5 gold | — | 24.4 d |
| warehouse | 5 | 6744 copper + 14 silver + 5 gold | — | 29.3 d |
| forge | 5 | 5620 copper + 14 silver + 5 gold | — | 24.4 d |
| smithy | 5 | 5620 copper + 14 silver + 5 gold | — | 24.4 d |

### Mine staff

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Full mine crew | 25 | 4924 copper + 190 silver + 30 gold | — | 21.4 d |

### Library

| Upgrade | Max | Cumulative cost | Prerequisite Knowledge | Late-profile work or resource floor |
|---|---:|---|---:|---|
| Full bookshelf collection | 110 | 27951 copper + 6232 silver + 242 gold | — | 121.5 d |
| Full Library staff | 16 | 1272 copper + 88 silver + 30 gold | — | 5.5 d |
| Alchemy lab | 5 | 2840 copper + 42 silver + 5 gold | — | 12.3 d |

## Sensitivity and follow-up tuning

At the late nominal rate of 1100 Knowledge/hour, two years would generate **19,272,000 Knowledge** before spending; measured late enchanted income would imply **27.0–27.8 million**. The capital forecast accounts for setup and applies a proportional measured enchant bonus after each paid rank. It does not grant full late income at the start.

Two seeds per phase are sufficient for an initial balance pass, not a long-run income guarantee. Prospect geology, hazards, crew replacements and player spending can substantially change the finish. Daily visits also leave completed projects waiting for their next manual start. More playthrough seeds and offline-heavy scenarios should refine the coefficients without changing the quadratic form.

## Offline and check-in effects

The Mine and Library bank at most 24 hours. A daily visit can retain most wall-clock income, but longer absences lose the excess. The 120× catch-up setting controls replay throughput, not a free 120× progression multiplier. The 10× catch-up payout consumes ten seconds of bank for one simulation second: unchanged base Knowledge pays for elapsed bank time, while digging, accidents and rune-reading advance less physical simulation per paid hour. This changes unlock delays and bonus distributions, so offline-heavy play needs its own model. Smithy and Study jobs continue on wall-clock time with their current workers; zero workers pause work. Only the current project/rank completes, with no automatic next rank. Daily visits add waiting between completions.

## Reproduce

```powershell
node --experimental-transform-types --import ./tests/pin-random.ts tools/measure-upgrade-production.ts
node --experimental-transform-types --import ./tests/pin-random.ts tools/estimate-upgrades.ts
```

Measurement horizon defaults to 6 simulated hours per sample, with 30 CPU seconds maximum for each Mine. Set ESTIMATE_HOURS and ESTIMATE_CPU_SECONDS to change those limits. Source costs remain exact at the current snapshot. See upgrade-production.json for the full measurements and upgrade-estimates.csv for every individual rank and profile.
