# DEFEND combat performance audit — 2026-10-06

Implemented three crowd optimizations plus allocation-free shield selection:

- Chain lightning queries the existing enemy cells directly, tightening its best distance before checking the struck set. It preserves cell traversal order, boundary inclusion, ties, branch backtracking and damage order, without building a nearby-enemy array for every link.
- Fortress parts resolve their core through an ID map during the enemy phase. The map is built only when fortress parts exist, includes new enemies created during that phase, checks current HP, and is cleared afterwards. External calls retain a live array lookup.
- Explosions share the enemy grid after the first blast rebuilds it during the stationary attack phase. The first rebuild remains at its original point in the tick. Enemy movement precedes this phase; builders and ice movement follow it. Direct explosions always rebuild. Future attacks that reposition or spawn enemies must invalidate this reuse.
- Ranged hits select a shield without allocating a filtered list, retaining priority for the first infinite shield, otherwise the first eligible finite shield.

## Reproduce

Run `npm run dev`, then `node tests/defend-combat-performance.mjs`. Optional `TEST_URL`, `PLAYWRIGHT_CHANNEL` (default `msedge`) and `PLAYWRIGHT_EXECUTABLE` select the server/browser. Results are written to `test-results/defend-combat-performance.json`. The fixture never opens the game or reads player saves.

These are warmed, alternating-order median CPU microbenchmarks in headless Edge on this Windows machine. Each row is one complete workload, not FPS. Before variants retain the old query/rebuild behavior within the same current simulation, so they isolate the named changes, not all changes combined.

| Enemies | Chain links | Chain before → after | 30 blasts before → after | 30 fire patches, current |
|---:|---:|---:|---:|---:|
| 500 | 500 | 1.58 → 0.78 ms | 0.36 → 0.22 ms | 0.16 ms |
| 2,000 | 1,000 | 11.50 → 4.36 ms | 1.44 → 0.84 ms | 0.54 ms |
| 10,000 | 1,000 | 24.22 → 8.44 ms | 6.22 → 2.76 ms | 1.80 ms |

Enemies occupy a dense eight-cell-wide formation. Blast/fire circles have radius three; only enemies within them take damage. No shields or water are present in these three workloads. Long chains are stress cases, not a claim about normal upgrade limits. Fire still visits each affected enemy for every overlapping patch to preserve damage and clinging-fire semantics.

| Complex enemies | Fortress parts | Part updates before → after | Boat sprites | Fortress sprites |
|---:|---:|---:|---:|---:|
| 100 | 600 | 1.02 → 0.02 ms | 0.72 ms | 0.82 ms |
| 500 | 3,000 | 5.82 → 0.14 ms | 3.52 ms | 7.64 ms |

Fortress update measurements include ID-map construction and cleanup; turret firing is disabled to isolate core lookup. Sprite timings include warmed hull/body/part sprites and their live details, at ten pixels per cell. They exclude water, lighting, shadows and GPU presentation. No artwork or animation was simplified.

## Remaining opportunities

The existing heavy full-scene benchmark (`PERF_MIX=heavy`, `PERF_FRAMES=90`, `PLAYWRIGHT_CHANNEL=msedge`, `node tests/defend-stress.mjs`) averaged 2,504 enemies on Edge 154 / Intel UHD Graphics. Current update time was 5.49 ms and draw time 31.93 ms; measured frame rate was 23.2 FPS. This is a profiled stress run, not a before/after comparison or a mobile performance claim.

Drawing dominates that scene: entities averaged 7.44 ms and effects 21.97 ms, with 2,112 transient effects at peak, 96 water pools, 72 blazes and 20 bolts. CPU samples point to Canvas draw calls, carried-light accumulation (`addTorch`), light-field summation and water painting. The next worthwhile investigation is the cost of live fortress details and overlapping effect/light drawing. Hulls and fortress bodies already use cached sprites. Exact compositing, fractional-scale pixel placement, damage/flash states and Reduce Motion need coverage before introducing further render caches or batching. Shield-heavy crowds also warrant a separate spatial-index investigation; the current shield check still scans generators per hit.

## Verification

The existing 303-test suite passed, including unchanged replay goldens. Added focused coverage compares full dense-chain branches/damage with the original query, exercises blast reuse and moved-enemy invalidation, and checks fortress lookup lifetime and shield priority. Production build and `git diff --check` passed. Rendering was measured but not changed; no physical-device validation was performed.
