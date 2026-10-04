# Defend combat frame times — October 3, 2026

The dominant stall was the ground-relief light compositor. The mixed stress scene improved from **316.2 ms / 3.2 FPS to 39.7 ms / 25.2 FPS** average frame interval. This is a substantial improvement, **not completion of the 60 FPS goal**. The siege-heavy scene and phone emulation also remain below the target. The PR should remain a draft until the remaining budget is resolved.

## Follow-up: the light field (October 4, 2026)

Profiling current `main` (3f71ff2) with Chrome's software canvas, the frame was dominated by the night lighting: every light's two swayed bakes were drawn scaled up onto both board-sized layers, about 590 filtered draws a frame for 147 lights, plus one per hand torch (about 290). Flushing the canvas between steps put **99 ms** of a 160 ms draw in the pools alone. On a GPU these draws are cheap per call but their fill grows with the pixel ratio, which is where phones are.

The pools are now summed in `LightField` (`src/defend/light-field.ts`) on the bakes' own lattice, three samples a cell, and drawn up to the board once; torches the same way, still clipped to open ground at full resolution. Separately, `ParkTrees` shades only the trees' box instead of three board-sized passes.

| Stress scene | Draw before, ms | Draw after, ms | Lighting before → after, ms | FPS before → after |
| --- | ---: | ---: | ---: | ---: |
| Mixed, DPR 1 | 160.3 | 58.1 | 125.0 → 25.1 | 5.33 → 11.78 |
| Siege-heavy, DPR 1 | 195.3 | 78.5 | 140.8 → 27.0 | 4.43 → 9.38 |
| Mixed, DPR 2 | 585.5 | 193.2 | 510.6 → 136.3 | 1.65 → 4.69 |

Trees went from 2.7 to 1.0 ms (DPR 1) and 25.5 to 5.6 ms (DPR 2). Update and the combat pass are unchanged (about 6.5 and 21 ms mixed). These runs are `npm run test:stress` with 120 measured frames in the cloud container: headless Chromium 141, SwiftShader, no GPU (`2d_canvas: unavailable_software`), on a slow 4-core Xeon, with the CPU profiler recording, so absolute numbers are far below a desktop with a GPU; the before column is `PERF_REFERENCE=1 PERF_REF=3f71ff2`. The JavaScript summing costs about 3 ms for the pools and 2.4 ms for the torches a frame on this machine. Results are `test-results/stress-{before,after}-{mixed,heavy,dpr2}.json` (ignored).

The field is close to the old drawing, not identical. Bilinear smoothing commutes with the glow's sum, and saturated sums are handled by painting them halved and doubling after the draw up. The darkness multiplies its pools, and where two strong pools meet a building's edge, multiplying and then smoothing is darker over the one to two pixels of the edge than smoothing each pool and then multiplying. Across the stress city at night the lit frame differs by a mean of about 1 level of 255 a channel, at most 30, at 6, 9.2 and 18 pixels a cell. `test:render-cache` holds it to at most 40 and a mean under 1.2 a byte against the frozen original. Still left: the combat pass (scorches, blazes, ice clusters and units, about 21 ms here), the ground relief's moving lights, and at high pixel ratios the lighting's eight or so board-sized composite passes.

## Workload and measurement

`tests/defend-stress-scene.ts` builds the same seeded city and combat state on every run: 44 archer towers, 43 cannon towers, 38 wizard towers, four dark keeps and 88 trained friendly units (24 swordsmen, 18 archers, 24 mages, 18 valkyries, four dark wizards). It places 2,500 mixed enemies on open city cells and adds four boats outside the city. Extra HP keeps attacks, movement and water active without disabling simulation work. The mixed roster is 65% roaches, 15% orcs, 10% bats, 5% ogres, 2% dark knights, 2% shield bearers and 1% firework launchers. `PERF_MIX=heavy` instead gives rolling cannons and firework launchers roughly 22% of the roster.

The recorded mixed runs all reached the same activity peaks: 75 arrows, 31 shells, 13 flames, 13 frosts, 24 fireballs, 72 blazes, 20 lightning bolts, 104 water pools and 230 effects. The heavy runs reached 2,262 effects. Both kept 2,504 live enemies. Original rendering comes from revision `3b9f8a9`; the simulation is unchanged.

Measurements used local headless Chrome 154.0.8037.57 on Windows, NVIDIA RTX 3080 Laptop / ANGLE D3D11, GPU canvas and compositing enabled, a 1280 × 900 viewport and a 720 × 840 board, DPR 1. There were 30 warm-up frames and 120 measured frames, with a fixed 1/60-second update per frame. This deliberately compares identical simulation work, including the costly opening, rather than letting a slower renderer run a different battle. CPU profiling was enabled for both runs. Frame interval includes scheduling/compositing; update and draw are CPU-side elapsed time and do not measure asynchronous GPU completion. Inclusive pass timings overlap and must not be added together.

CPU profiles and DevTools-compatible timelines were saved before changes and after the final changes. The baseline timeline was loaded into Chrome's Performance panel: 37.74 seconds of recording contained about 37.61 seconds of scripting and repeated long animation-frame tasks. The baseline CPU profile sampled 33.79 seconds in native `drawImage` (89% of recording time), versus 0.30 seconds in GC. This agrees with the instrumented ground-light pass rather than an AI/DOM bottleneck. The final timeline includes CPU samples for flame-chart inspection.

## Before and after

| Metric | Original mixed | Final mixed | Original heavy | Final heavy |
| --- | ---: | ---: | ---: | ---: |
| Update mean, ms | 4.72 | 5.75 | 7.95 | 7.52 |
| Draw mean, ms | 308.60 | 25.55 | 628.41 | 37.46 |
| Update + draw p95, ms | 635.10 | 74.80 | 1146.50 | 96.20 |
| Frame interval mean, ms | 316.16 | 39.73 | 641.45 | 61.32 |
| Frame interval p95, ms | 630.40 | 78.70 | 1145.40 | 115.10 |
| Average FPS | 3.16 | 25.17 | 1.56 | 16.31 |
| Ground-relief mean, ms | 280.26 | 2.52 | 576.77 | 1.23 |
| Combat pass mean, ms | 19.08 | 14.03 | 36.86 | 23.64 |

Sources are `stress-mixed-before.json`, `stress-complete-final.json`, `stress-heavy-before-frozen.json` and `stress-heavy-final.json` in the local ignored `test-results/` directory. A compact copy is checked in at `docs/defend-frame-times-results.json`. Separate final mixed repeats ranged from about 21 to 27 FPS; this is not a locked frame rate. Update has not been optimized in this change; small differences are measurement variance.

Final mixed draw breakdown: entities 2.56 ms, effects/lighting 20.38 ms, terrain 2.60 ms. The terrain category includes static city drawing, parks and flood water. Effects includes projectiles, fire/ice, lighting, shadows, trees and rain. A cached combat frame has zero entity drawing work; the displayed mean includes these frames.

## What each change bought

Successive fixed-workload ablations isolate the changes without editing the checkout. The original rendering modules are copied into content-addressed directories because Vite does not invalidate modules in ignored `test-results/` when those files change.

| Rendering variant | Draw mean, ms | Frame interval mean, ms | FPS |
| --- | ---: | ---: | ---: |
| Original | 308.60 | 316.16 | 3.16 |
| Ground-light cache only | 36.48 | 59.59 | 16.78 |
| Plus scorch cache | 34.83 | 52.36 | 19.10 |
| Plus combat-frame reuse / opaque presentation | 26.07 | 47.62 | 21.00 |
| Plus software sprite baking, final | 25.55 | 39.73 | 25.17 |

- **Ground lights:** eight separate pre-tinted masks retain the original `lighter` / `source-over` ordering. Exact position, reach and colour identify a sprite; brightness remains live. Software-backed masks avoid repeatedly reading a GPU scratch surface immediately after changing it. A 256-entry / 32 MiB RGBA-pixel LRU reuses evicted canvases; oversized one-off sprites are not retained. Full-board masks and the fixed layer are additional memory. This removes about 272 ms of average draw time in the ablation and over 99% of the original relief-pass cost.
- **Blaze scorches:** one recyclable canvas per live blaze preserves the existing eight-Hz ember pattern and exact fade strength. Its screen-scale raster preserves rounded edges at fractional scales. Flame tongues remain live. The isolated draw reduction was about 1.65 ms; the earlier heavy 60-frame trial saved about 4 ms.
- **Combat reuse:** retain screen pixels between unchanged simulation ticks, with camera, scale, canvas dimensions, settings, map version and out-of-tick bomb/effect changes invalidating the cache. Wall-clock chill glints remain live; loss-time torch fading bypasses reuse. This saved about 8.76 ms in the ablation. It helps repeated ticks and pauses, but cannot skip a new simulation tick during slow real-time playback.
- **Sprite backing:** tiny ice/explosion sprites are built in software rather than flushing many new GPU surfaces. Ice drawing fell from 3.03 to 2.32 ms in comparable final runs (2.12 ms in an untraced trial); total draw improvement is smaller than machine variance, so no large standalone FPS claim is made.

An enemy-body sprite cache and forcing the whole main canvas or combat buffer into software made the benchmark slower and were removed. The opaque main canvas gave no reliably isolated large gain; every frame already fills it opaquely. Its `desynchronized` flag was removed (October 4, 2026): a low-latency canvas may be shown before a frame is finished, which made the lighting, trees and rain flicker on real devices.

## Investigation of other suspects

| Suspect | Finding |
| --- | --- |
| Canvas state / compositing | Ground relief was the overwhelming measured cost. No live `shadowBlur` or canvas `filter` calls occur in the Defend drawing path. Gradients are made in cached lighting sprites or the city bake. |
| Rebuilt paths / outlines | Ice clusters and explosions already have sprite caches; lightning already rasterizes into a pixel buffer. Mage scorch pixels were rebuilt and are now cached. |
| Allocation / GC | Baseline sampled GC was 0.30 s of 37.82 s, under 1%. It becomes more noticeable after removing the compositor stall. Caches are bounded or tied to live objects; broad simulation pooling was not justified as the first fix. |
| Targeting / chaining | Enemy-range queries and lightning chains already use the enemy grid. `enemiesNear` measured 1.08 ms per frame before and 1.20 ms after; friendly nearest-defender scans remain linear over the small friendly crew. Simulation update is several milliseconds, far below the original draw cost. |
| DOM / CSS | The full battle page separately measured about 0.18–0.20 ms of UI work. Layout reads are included in UI timing; the overlay updates at most twice a second and does not participate in layout. |
| Static terrain / buildings | Already cached. Layer refresh was 0.013 ms before and 0.022 ms after; terrain/water drawing still costs about 2.6 ms. |
| Effect resolution / LOD | Ice, explosions, lightning and water already use art-scale buffers. New combat/scorch caches retain the existing rounded screen pixels. Particle counts, colour, alpha, resolution and gameplay rules were not reduced. |

## Overlay and full-page checks

Run `defendFrameTimes(true)` in the game console to enable the overlay, `defendFrameTimes(false)` to remove it, or `defendFrameTimes()` to toggle it. It shows rolling update, entities, effects, terrain and UI means with actual frame interval and p95. Timing is presentation-only, disabled by default and unsaved. Leaving the Defend tab removes the display and resets its samples.

For a save-independent interactive scene, open `http://127.0.0.1:5173/tests/defend-stress.html`. Add `?mix=heavy` or `?enemies=5000`. It uses the real battle page and never imports the save-loading shell or writes localStorage. Reload to repeat.

`test:stress-ui` measures the full battle page with a fixed simulation clock by default, 60 warm-up frames and 120 measured frames in the recorded runs. The harness substitutes actual frame intervals in the overlay, so its FPS is not the artificial 60-Hz simulation clock. Set `PERF_REALTIME=1` for real elapsed-time simulation. An earlier real-time desktop run averaged 54.34 ms / 18.40 FPS, update 16.79 ms, draw 31.79 ms, UI 0.20 ms. Phone dimensions alone (390 × 844, DPR 2) measured 39.60 ms / 25.26 FPS at fixed work. These runs preceded the last small sprite-backing change and are supplemental, not the renderer A/B.

Phone-sized, CPU-throttled results are emulation on this desktop GPU, not physical-phone validation. See the checked-in results for the final throttled run. The 16.67 ms budget is still missed even on desktop, and smooth phone play is not yet established. Remaining work is primarily the 14 ms mixed combat pass, roughly 6 ms lighting pass and their worst-frame spikes; siege-heavy combat has still more effects. The frame overlay and preserved recordings make that remaining work measurable.

## Reproduce

Start `npm run dev` in one terminal. In PowerShell, use separate clean environments for before and after:

```powershell
$env:PERF_FRAMES = '120'
$env:PERF_LABEL = 'before'
$env:PERF_REFERENCE = '1'
$env:PERF_TRACE = '1'
npm run test:stress
Remove-Item Env:PERF_REFERENCE
$env:PERF_LABEL = 'after'
npm run test:stress
Remove-Item Env:PERF_TRACE
$env:PERF_VARIANT = 'relief' # also 'scorch' or 'combat'
$env:PERF_LABEL = 'relief'
npm run test:stress
Remove-Item Env:PERF_VARIANT
$env:PERF_MIX = 'heavy'
$env:PERF_LABEL = 'heavy'
npm run test:stress
Remove-Item Env:PERF_MIX
$env:PERF_REALTIME = '1'
$env:PERF_PHONE = '1'
$env:PERF_CPU_RATE = '4'
$env:PERF_LABEL = 'phone'
npm run test:stress-ui
npm run test:render-cache
```

The scripts use installed Chrome by default; `PLAYWRIGHT_CHANNEL` selects another installed Playwright browser channel. `PERF_ENEMIES` changes the enemy count; `PERF_DPR` changes the isolated renderer's pixel ratio. `PERF_REF` selects another baseline revision that contains the required modules. JSON, screenshots, `.cpuprofile` and optional `.trace.json` files go to ignored `test-results/`. In Chrome DevTools → Performance, load the trace for the timeline or the CPU profile for function stacks; inspect Bottom-up / Call tree and compare the ground-light `drawImage` stack. Run benchmarks sequentially, without tests or another stress battle competing for the CPU/GPU.

## Validation

All 230 Node tests and the production build passed. Replay goldens remain unchanged; no battle simulation module was modified. Browser checks compare original ground relief, original scorch pixels and original combat art at normal and zoomed cameras, plus repeated cached frames, same-tick bombs, canvas resize and health-bar changes. All 29 pixel comparisons returned zero differing bytes on the test browser. Cache eviction and map invalidation checks also passed. The test permits only tiny alpha-rounding differences for other canvas implementations.
