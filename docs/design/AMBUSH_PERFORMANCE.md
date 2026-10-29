# Ambush native workload comparison

Run tests/ambush-performance.mjs with the development server running. It loads a synthetic Nadir III battle at 390 × 844 with 12 native buildings, visits all 20 seeded waves at 3× speed, and measures 120 frames per mode after warmup. Waves are fast-forwarded between sample windows; the test measures their native workloads rather than waiting for a full human-length level.

The paired baseline runs the same DefendSim and DefendRenderer on the same map, army and wave seed. Ambush adds its production page, routing lifecycle, health/gold HUD, tallies and controls. This isolates mode/UI overhead; it is not a physical-phone benchmark.

| Workload | Median frame | 95th-percentile frame | Peak enemies |
|---|---:|---:|---:|
| Native engine + renderer | 3.4 ms | 7.7 ms | 52 |
| Ambush production page | 3.5 ms | 6.5 ms | 52 |

The measured 95th-percentile ratio is 0.84. Both workloads use the same browser and fixed scene; relative cost is the useful comparison. The test allows a wider ratio for machine variation and records its raw results in test-results/ambush-performance.json. The checked-in measurement is ambush-performance.json.

Caches remain bounded: 30 lazy level previews and 64 native objective fields per battle. Building-panel statistics refresh at most four times per second. One production renderer and pointer controller persist across level navigation; the star tree disposes its graph, circle and animation loops when closed. Ordinary Defend replay goldens are unchanged.
