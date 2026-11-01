# Simulation-only follow-up

The third performance pass profiles fixed simulation steps without drawing. Native mixed combat, packed Darklings and worm broods identify three costs worth reducing:

- `IceMotion.slide` called the crowd movement gate independently for X and Y, including zero-length axes. A normal passable stride could remove/reinsert the same body twice. Ground-body substeps now use one crowd call, with the same X-then-Y sweep. The original full-X terrain test remains outside the gate; full Y is tested after X has been clamped by other bodies. Cells traversed only by the intermediate X pose had an append immediately followed by removing that last entry, so combining the calls preserves final bucket order. Fully blocked axes do no crowd update. Other movement paths remain unchanged.
- Every surfaced worm contact copied and scanned all soldiers and civilians, even when almost everyone was far away. The existing defender index now optionally builds separate body-contact buckets for worm phases. These include cloaked and perched people, whose native worm-contact behavior differs from ordinary targeting. Bounds include canonical body sizes and the existing contact epsilon; results restore original soldier-then-civilian array order before damage. HP is checked live, and the existing exact contact/damage gates still apply. The index is used only while defender positions are fixed; direct calls outside the phase retain live-array behavior.
- Worm cleanup classified living runs twice even when the death-processing loop did nothing. The first classification still always runs; a second pass is needed only after an eligible death was processed. Native short-piece deaths, offspring, death-effect cascades and promotion ordering remain.

No enemy counts, collision sizes, damage, cooldowns, simulation frequency, random draws, save fields or golden fixtures change.

## Reproduce

```sh
node --experimental-transform-types --import ./tests/pin-random.ts tests/simulation-performance.ts
```

No dev server or browser is needed. The script extracts the previous simulation entry points and helpers from `801e46c` into a content-addressed ignored directory. Nine alternating warm-cache batches compare complete moving 1/30-second steps in flat native fields, plus an isolated living-worm cleanup case. It checks enemy/unit/HP/effect/statistics/trail state after each batch and the next RNG value after moving scenarios. Results go to `test-results/simulation-performance.json`. Synthetic 20k crowds bypass ordinary-wave population assumptions using the existing wave-40 cap, without changing the game.

These are simulation-only component scenarios, not whole-city combat or FPS guarantees. Friendly movement is held through the native scenario hook to isolate enemy movement and worm contact queries. Timings are reported without machine-dependent speed assertions.

## Recorded results

2026-11-01, Node 24.19.0 in the cloud workspace, after other checks completed. Median milliseconds per fixed step (cleanup is measured separately):

| Workload | Reference | Optimized |
| --- | ---: | ---: |
| 1,000 moving packed Darklings | 3.249 | 3.048 |
| 5,000 moving packed Darklings | 14.138 | 12.718 |
| 20,000 moving packed Darklings | 54.267 | 49.397 |
| 2,800 moving worm segments, 300 defenders | 60.575 | 6.209 |
| 2,800 living worm segments, cleanup only | 1.331 | 0.765 |

The worm-contact scenario is about 9.8 times faster, while the 5k moving crowd gains about 10%. Living-worm cleanup takes about 43% less time. All state comparisons and next-RNG checks matched; no replay goldens changed. A larger crowd still consumes a substantial CPU budget, and these measurements do not include rendering or active friendly AI.

## Validation

- Native replay hashes remain unchanged.
- Crowd tests check exact original swap/append bucket order over repeated mixed-size movements and boundaries, one rewrite per passable stride, and no rewrites when fully blocked.
- Defender index tests compare all contacts with full scans, preserve team order/hidden bodies/live deaths, and check epsilon contact across bucket boundaries and index teardown.
- Worm tests compare indexed and full-scan damage order, full state and RNG with nearby soldiers/civilians, cloaks, perches and same-phase deaths. Existing short-piece/cascade tests cover cleanup.
- Existing ice, archer displacement, crowd/contact and worm/brood tests plus native crowd/brood browser checks and full suite/build apply. No replay fixtures are re-recorded.

The full 146-file suite and production build passed. Final targeted checks passed for replay, ice, archer displacement, tactical enemies, crowd order, worm contacts and defender indexing. Native crowd and desktop/phone worm-brood browser checks also passed.

## Targeting and terrain follow-up

A fresh simulation-only CPU profile of 1,500 mixed enemies and 243 native troops still placed `enemiesNear` first among game-code self samples (740), with another 183 in `nearest`. A separate 5,000-Darkling profile attributed 382 self samples to `blocked`. These are sampled hotspot indicators, not exact wall-time percentages; initialization and GC are also in the profiles.

- `nearestEnemy` combines range shortlisting and nearest selection into one native grid traversal. It keeps cell/list order, live HP, armor/untargetable exclusions, inclusive range boundaries and the caller's first/last tie rule. Mages, Valkyries, ordinary ranged troops and non-volley archer towers use it. Flat-shot explicit pools, Sky Archers' global enemy ordering, specialized targeting and area/volley queries retain their native behavior.
- Patrols and citywide hunts previously sorted every eligible enemy before retaining three possible path goals. A stable bounded selection retains only those three while scanning. Equal distance/HP candidates retain input order, including at the cutoff, so path attempts and their subsequent RNG remain ordered identically.
- `blocked` formerly constructed five arrays per check (one list plus four corner pairs). Direct short-circuit corner tests retain the exact corner order, bounds checks and flooring, without those allocations.

Reproduce with:

```sh
node --experimental-transform-types --import ./tests/pin-random.ts tests/simulation-targeting-performance.ts
```

This benchmark freezes the **entire** `src/` directory at `6707b9f445a7454f4b1a70e243bd80e00b83feda` in an ignored reference directory. Both constructors run the existing native stress fixture with ordinary training, movement, towers, projectiles, effects and damage enabled. It compares exact combat/unit/projectile/effect/terrain/statistics state and tower/recruitment cooldown maps after every paired batch, plus the next simulation RNG draw. Structured clones normalize reference-class prototypes while retaining typed arrays, Maps and non-finite values. Nine alternating warm batches report median timings without speed assertions. Separate query/selection/terrain component timings must not be read as whole-battle speedups. Results go to `test-results/simulation-targeting-performance.json`.

Regression checks compare the direct query with `nearest(enemiesNear(...))` across dense and off-board fields, hidden/armor enemies, first/last ties, range edges, zero/infinite/negative radii, deaths and moved/reindexed enemies. Bounded selection is compared with native stable sorting for distance and HP priority; terrain checks match the original four corners at cell/board edges and non-finite inputs. Native replay fixtures are unchanged.

### Recorded follow-up results

2026-11-01, Node 24.19.0, after the full suite and browser checks finished so they no longer competed for CPU. Median milliseconds; component rows measure the named batch rather than a simulation step:

| Workload | Reference | Optimized |
| --- | ---: | ---: |
| Complete fixed step: 1,500 mixed enemies, 243 troops | 14.1270 | 13.2514 |
| Complete fixed step: 1,000 siege-heavy enemies, 243 troops | 11.5607 | 10.9121 |
| 243 nearest-target queries, radius 12 | 8.2788 | 4.8202 |
| Choose three from 5,000 candidates | 0.6404 | 0.0417 |
| 100,000 terrain checks | 7.5099 | 2.4493 |

Complete simulation time fell 6.2% and 5.6% in these two active battles. Isolated nearest-target work fell 42%; selecting three candidates was about 15 times faster and terrain checks about three times faster. These component gains do not translate directly into frame/FPS gains. Timings vary with workload and CPU contention; all state, cooldown and next-RNG comparisons matched in every paired run.

The full 146-file suite and production build passed. The focused replay/troop/query/boundary checks passed without golden updates. A native Chromium stress run completed 60 measured frames with 1,500 enemies, 243 troops, towers, projectiles, fire, ice and drawing active. The follow-up CPU profile still shows substantial work in crowd maintenance/movement and active blaze damage.
