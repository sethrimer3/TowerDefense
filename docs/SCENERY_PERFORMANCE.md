# Scenery and lighting follow-up

The follow-up profile found three more avoidable costs after the Blight fixes in PR #222.

## Causes and changes

**Mountains regenerated during unrelated floor updates.** `paintFloor` visits every boulder for each changed floor patch. `mountain` called `mountainSource` before checking its drawing bounds, regenerating the same noise, distance transform, height field, shading and crags even for a patch nowhere near it. The immutable native plan now reuses its sources through a WeakMap. Direct/export callers remain correct when a boulder's seed or cell contents change; art revision changes invalidate cached sources, and Pixel Art callbacks release the old cache. No global strong cache retains old maps.

**Static lighting geometry rebuilt every frame.** Building outline shine expanded the same building body alpha with nine full-board shifted copies every frame, while roof darkness rebuilt the same ambient-color tint. These inputs change with building masks, board scale and ambient color, not with torch flicker. Their masks/tints now remain cached while each frame still composes the current light. Buildings and units also shared growth and rim scratch canvases despite using different board and viewport dimensions, resizing and reallocating those buffers twice per frame. They now have separate reusable buffers. Moving-unit geometry remains live, and each buffer remains bounded by its current board or viewport dimensions.

**Zoom reread unchanged native lighting masks.** City-layer refreshes included `paintMasks` and `setMasks`, even when only the camera's resolution band or board pixel scale changed. The masks always use 16 samples per cell, so those view changes do not alter them. Mask invalidation now follows map identity, map version, damage stages, area, structure looks, Pixel Art and loaded city art. The city layer still refreshes normally at its requested resolution.

## Reproduce

Start `npm run dev`, then:

```sh
PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/scenery-performance.mjs
```

The script freezes the original `forest-art.ts` and `lighting.ts` from `9515016`, resolving their imports against the unchanged supporting code. It runs warm-up followed by nine alternating before/after samples and writes `test-results/scenery-performance.json`. Timings are headless Chromium CPU submission medians, not device FPS. The lighting workload includes both building and unit outline shine. Forest workloads compare a small patch and a full floor. City refresh measurements isolate mask work by forcing an otherwise identical city-layer repaint.

Correctness and work bounds are asserted separately from timings:

- Exact pixels against the frozen reference for both forest workloads and lighting at three scales, including fractional scale, changing flicker, ambient color/opacity and in-place building-mask updates.
- No steady-state building-growth copies or scratch-canvas resizes after warming; separate building/unit buffers.
- No native mask updates on camera zoom changes; map-version, damage-stage and art changes each invalidate them.
- Node forest tests compare reused/fresh sources and partial floor pixels, mutated seed/cells, replacement art and Pixel Art toggles.

Existing renderer-cache, forest, city-night-life and Blight-trail browser checks also apply, including desktop/phone behavior. Full tests and production build must pass; combat, random streams, saves and golden fixtures stay unchanged.

## Recorded results

2026-11-01, Chromium 154.0.8037.57 and Node 24.19.0 in the cloud workspace, after other checks finished. Medians in milliseconds:

| Component workload | Reference | Optimized |
| --- | ---: | ---: |
| 32 × 32-art-pixel forest floor patch | 16.8 | 0.4 |
| Full 576 × 832-art-pixel forest floor | 30.4 | 20.0 |
| Lighting/outline shine, 6 pixels per cell | 41.2 | 31.1 |
| Lighting/outline shine, 9.23 pixels per cell | 67.0 | 45.8 |
| Lighting/outline shine, 18 pixels per cell | 171.2 | 91.0 |
| Forced city repaint, with/without mask refresh | 51.7 | 3.6 |

Lighting uses a 720 × 840 viewport, distinct from its board-sized light buffers, with the board centered under the camera transform. The reference changed scratch-canvas dimensions 24 times across three lit frames; the optimized renderer changed them zero times. Static building-mask expansion also required zero repeated copies after warming. All before/after pixel comparisons were exact, including flicker, ambient changes and in-place mask updates.

All 146 Node test files, focused forest/sunlight/city-life tests and the production build passed. Existing render-cache, city-night-life, forest and Blight-trail browser checks passed at their native desktop/phone sizes. The forest fixture now seeds a valid test profile so the required name/banner dialog does not intercept its Start button.

## Limits

These changes remove repeated work, rather than reducing visual quality or combat frequency. Dynamic light-field accumulation, unit contour compositing, water/effect layers and large crowd body painting still cost time. The mixed-battle profile identifies these remaining costs; independently run whole-scene timings while other tests/builds are active are not controlled comparisons. Use the paired component measurements for the effects of this change.
