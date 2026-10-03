# Defend performance experiment — October 2, 2026

Waves now contain exactly 500 × wave enemies (500 through 10,000 at wave 20), released over five seconds. Bosses count toward this number; hatched brood is additional. Existing enemy unlocks and HP scaling remain.

## Measurements

Local headless Microsoft Edge, 1280 × 900 viewport, 720 × 840 board canvas, device scale 1. The isolated battle uses a seeded city with maximum-level barracks, archer/cannon/wizard towers, rain, night lighting and park effects. Enemies start on open city cells to stress congested combat immediately. The keep has extra HP to keep the benchmark running. Each size is a separate scene, not a natural campaign, and the main table uses roaches to isolate population cost from kind mix.

Real elapsed frame time drives the simulation. Each scene has 30 warm-up frames and 120 measured frames. Reload and explicit garbage collection between scenes keep earlier canvases out of later samples. The benchmark includes simulation and the full battle renderer, but excludes the app shell, Mine and Library; this is desktop evidence, not a mobile guarantee. Frame intervals also include browser scheduling/compositing, which CPU update/draw measurements do not. Measurements vary with machine load; FPS is an average, not a locked rate.

At 10,000 initial enemies, original revision c9b797c measured **29.9 FPS**, 21.61 ms update and 10.24 ms draw per frame, with 55.6 ms p95 frame interval. The final full-sweep result was **78.6 FPS**, 3.45 ms update, 6.97 ms draw and 27.8 ms p95. Both use the final real-time benchmark; the baseline had 9902 average live enemies and the optimized sample 10000. Different movement and frame timing mean their combat trajectories differ.

| Wave | Initial enemies | Average live | FPS | Update ms | Draw ms | Frame p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 500 | 463 | 139.3 | 0.22 | 2.37 | 7.1 |
| 2 | 1000 | 935 | 138.3 | 0.33 | 3.29 | 7.2 |
| 3 | 1500 | 1415 | 138.3 | 0.4 | 3.58 | 7.1 |
| 4 | 2000 | 1895 | 135 | 0.51 | 4.03 | 13.9 |
| 5 | 2500 | 2410 | 127.1 | 0.65 | 4.74 | 13.9 |
| 6 | 3000 | 2888 | 125.2 | 0.86 | 4.84 | 13.9 |
| 7 | 3500 | 3365 | 95.5 | 1.01 | 5.31 | 27.5 |
| 8 | 4000 | 3810 | 124.4 | 0.88 | 4.55 | 14 |
| 9 | 4500 | 4332 | 104.7 | 1.09 | 5.22 | 20.8 |
| 10 | 5000 | 4795 | 91.4 | 1.39 | 5.43 | 27.7 |
| 11 | 5500 | 5393 | 115.2 | 1.2 | 4.92 | 20.7 |
| 12 | 6000 | 5845 | 101 | 1.28 | 5.21 | 20.9 |
| 13 | 6500 | 6192 | 102.9 | 1.51 | 5.9 | 20.8 |
| 14 | 7000 | 6913 | 76.8 | 2.87 | 8.4 | 27.9 |
| 15 | 7500 | 7332 | 78.2 | 2.91 | 8.17 | 27.9 |
| 16 | 8000 | 7883 | 70.8 | 3.68 | 8.67 | 27.9 |
| 17 | 8500 | 8410 | 92.9 | 2.36 | 6.3 | 27.7 |
| 18 | 9000 | 8991 | 91.9 | 2.39 | 6.55 | 21 |
| 19 | 9500 | 9442 | 74.8 | 3.56 | 7.87 | 27.9 |
| 20 | 10000 | 10000 | 78.6 | 3.45 | 6.97 | 27.8 |

A 600-frame mixed-enemy run (30 warm-up, 570 measured) started with 10,000 enemies: 65% roaches, 15% orcs, 10% bats, 5% mothers, 4% ogres and 1% warlords. It averaged **110.1 FPS** with **9883 live enemies**, 1.79 ms update, 5.63 ms draw and 20.8 ms p95. This longer sample includes the cheaper settled crowd attacking buildings; it is not directly comparable to the short roach sweep.

## Changes and tradeoffs

- Defender searches no longer allocate merged/filtered lists per enemy.
- Separation examines at most eight deterministic representatives per indexed cell (up to four cells nearby), preventing quadratic work at dense choke points. Sparse cells still use every neighbor. This deliberately changes dense-crowd steering; damage/targeting queries still consider all eligible enemies.
- Grass indexes walkers only for cells containing blades.
- Large-crowd shadow unions are reused between simulation ticks at unzoomed scale and invalidated by light, size or night changes. Same-pixel shadows sharing size and dominant light are coalesced. Zoomed views keep the original full-detail path.
- Replay goldens were regenerated for the intended wave-count, release-rate and dense-steering changes. Explicit mixed and repair fixtures retain the existing unit/effect coverage guard.

## Reproduce and inspect

Validation: all 138 Node tests passed, the Node 24 replay and coverage checks passed, and the production build passed. An isolated browser smoke test verified the 500-enemy opening, the 1,000-enemy second wave, periodic logging and clear/lost/abandoned summaries without browser errors.

Start the dev server with `npm run dev`, then run this in PowerShell:

```powershell
$env:PERF_SCENE = 'city'
$env:PERF_REALTIME = '1'
$env:PERF_LABEL = 'city'
npm run test:performance

# Longer mixed 10,000-enemy run:
$env:PERF_WAVE = '20'
$env:PERF_MIX = '1'
$env:PERF_FRAMES = '600'
$env:PERF_LABEL = 'mixed'
npm run test:performance
```

Unset `PERF_WAVE` to run all 20 sizes. `PERF_SCENE=spawn` tests the entry lane. Without `PERF_REALTIME=1`, the benchmark advances exactly 1/60 simulation second per rendered frame for fixed-work comparisons; do not interpret that mode as real-time gameplay pacing. `PERF_PROFILE=1` additionally writes a Chrome CPU profile. Edge is the default, with the same Playwright channel/executable overrides as pointer tests.

Raw JSON and screenshots are in ignored `test-results/`. During ordinary gameplay, the console logs `[Defend performance]` every five seconds and when a wave clears, the keep falls or the run is abandoned. `window.defendPerformance` holds the last 100 rows. FPS, peak live population, mean update/draw cost, slow-frame count and frame p95 are cumulative within each wave; p95 uses 1 ms histogram bins (the maximum if the percentile reaches the overflow bin at 500 ms). Hidden-tab gaps are excluded, visible long frames are retained, and developer fast-forward closes the current measurement. Logs are not saved and do not affect simulation decisions.
