# Further DEFEND efficiency improvements

## Implemented

- **Nearby defender queries:** a four-cell spatial index is rebuilt once per enemy phase for larger crowds (at least 32 enemies and 16 defenders). Only nearby bins are searched. Positions are fixed during that phase, HP remains live, ties use the original soldiers-then-civilians array order, and recruitment/movement happens after the index is disabled. Other calls retain the original scan.
- **Health-bar selection:** keep the best eight candidates instead of sorting the whole crowd; remove the redundant selection before drawing. Hidden bars still track wave peak strength, without selecting candidates.
- **Boat-water buffers:** paint directly into three reusable ImageData backing arrays instead of allocating three pixel arrays plus three ImageData buffers and copying every frame. Capacity is bounded by board dimensions; changing image dimensions reuses existing capacity when sufficient.

## Measurements

The paired Node microbenchmark runs seven alternating-order batches after warmup and reports medians. Defender timings include rebuilding for every batch of 2,500 queries against 88 friendly units. The health-bar case uses 2,500 eligible enemies with mixed HP and compares the original two selections per combat draw against one bounded selection.

| Work | Before | After | Reduction |
| --- | ---: | ---: | ---: |
| 2,500 nearest-defender queries, including index rebuild | 0.601 ms | 0.188 ms | 69% |
| Health-bar selection per combat draw, dense eligible crowd | 1.535 ms | 0.044 ms | 97% |

These are isolated workloads, not claims of equivalent whole-game FPS gains. Reproduce with `node --experimental-transform-types --import ./tests/pin-random.ts tests/defend-query-performance.ts`. Results: local `test-results/query-performance.json`.

Sequential local headless Chrome stress runs (2,504 enemies, 88 friendly units, fixed timestep, 120 measured frames) before/after targeting and health-bar changes measured update means of 11.47 / 8.31 ms and draw means of 52.60 / 48.51 ms. Frame intervals were 89.48 / 79.19 ms. Machine variation also affects these results; they predate the final water-buffer change. They do not establish 60 FPS or phone performance. Source recordings: `test-results/stress-targeting-before.json` and `test-results/stress-targeting-after.json`.

## Remaining measured opportunities

- Dynamic lighting still costs roughly 10.7 ms/frame in this stress run, including about 4.7 ms of ground relief. Further work should measure reducing repeated composites and culling offscreen light work without altering overlapping-light semantics.
- Combat drawing still costs roughly 26.9 ms/frame, including about 4.8 ms for ice and 2.0 ms for chilled-enemy overlays. Caching the static frost separately from its wall-clock glitter and drawing only visible effects are candidates, not implemented changes.
- Enemy-range queries account for roughly 2.2 ms/frame. Existing spatial indexing already limits the search; specialized nearest/limited-result queries could avoid allocating and sorting complete candidate lists where callers only need a few targets.

Inclusive timings overlap and must not be added. Optimizations must preserve targeting order, animation clocks, alpha compositing, and deterministic replay.

## Final validation

All 233 Node tests passed, including unchanged deterministic replay fixtures. The production build passed. All 58 rendering-comparison rows had zero differing pixel bytes; water tests include rain/reduced-motion combinations, shrinking/growing/empty/reappearing pools and buffer-capacity checks.

The final 120-frame stress run including water reuse measured 7.48 ms update, 42.38 ms draw, and 71.15 ms frame interval (14.06 FPS), versus 11.47 / 52.60 / 89.48 ms before these changes. The workload still misses 60 FPS, and the isolated paired measurements above are stronger evidence for each individual change than sequential whole-game runs. Final recording: `test-results/stress-targeting-water-final.json`.
