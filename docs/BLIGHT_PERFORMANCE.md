# Blight performance investigation

Blight lag had three reproducible causes:

1. Every worm segment called `enemies.find` for its leader on every fixed step. With N segments this approached N² comparisons, especially as Amber Desert broods split into thousands of bodies. Fortress parts already had an ID map, but worms neither enabled nor used it.
2. Any non-rectangle shape set the portal channel's `shaped` flag, forcing its fire to fill the entire device-pixel canvas. One dart, boat or fortress triggered the same six noise passes across the viewport as a screen full of Blight. High device pixel ratios multiply this cost.
3. Packed pixel ranks submitted thousands of overlapping rectangles to Canvas in each of four expanded contour/infill paths. Repeated intersections were unnecessary where exact row intervals could form the same union.

The fixes reuse the native enemy-phase lookup for all linked followers, including ordinary chains. Health remains live, newly spawned auxiliaries enter the active map, and direct callers outside the phase retain live array lookup. The map always clears in `finally`.

Portal bounds now include transformed sprite rectangles, vector control points, full arc/ellipse extents and conservative cap/miter expansion. Unknown external `Path2D` inputs retain the full-screen fallback. A reusable local fire canvas also limits destination-in compositing; cropping the input alone still cleared/blended the full destination. Capacity grows in 64-pixel chunks and shrinks after large size reductions. The same noise, screen anchoring, alpha masks and torchlight behavior remain. Pixel contours omit invisible axis-aligned bodies and merge sorted row intervals separately in each feather band, preserving subpixel widths and soft black joins. No gameplay tuning, release caps, random draws, saved fields or golden fixtures change.

## Reproduce

Start `npm run dev`, then run:

```sh
PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/blight-performance.mjs
```

The script writes `test-results/blight-performance.json`. Each pair uses warm caches, alternating execution order and nine samples. Worm phases use zero dt to isolate follower lookup scaling; the synthetic 20,000-body case bypasses release caps while retaining native chain state. Portal cases draw a native dart at DPR 1/2. Crowd cases include native bodies, contours, soft joins and fire, with both regular packs and unsorted mixed-size rows. These are headless Chromium CPU submission medians, not phone FPS or end-to-end frame guarantees.

The benchmark asserts that cropped fire processes less than a tenth of the reference pixel area, and that packed-row rendering matches the original geometry within one channel value. Timings are reported without machine-dependent pass/fail thresholds.

## Measured results

2026-11-01, headless system Chromium in the cloud workspace, Node 24.19.0, after the other test/build processes completed. Warm-cache medians in milliseconds:

| Workload | Reference | Optimized |
| --- | ---: | ---: |
| 1,000 worm segments, zero-dt enemy phase | 3.9 | 0.3 |
| 5,000 worm segments, zero-dt enemy phase | 20.4 | 1.2 |
| 20,000 worm segments, zero-dt enemy phase | 335.0 | 5.0 |
| One dart's portal, DPR 1 | 27.2 | 1.0 |
| One dart's portal, DPR 2 | 107.2 | 3.1 |
| 1,000 packed pixel bodies, contours/infill/fire | 9.2 | 8.4 |
| 5,000 packed pixel bodies, contours/infill/fire | 32.6 | 25.5 |
| 10,000 packed pixel bodies, contours/infill/fire | 63.4 | 50.2 |
| 1,000 unsorted mixed-size pixel bodies | 12.4 | 11.4 |

Reference strategies use linear leader queries, full-screen fire, or unmerged per-body contour paths, respectively. Crowd comparisons share the current capture code; they isolate the geometry strategy rather than comparing two complete application builds.

For the lone dart, fire fill area fell from 5,241,600 to 161,700 pixels per draw at DPR 1, and 20,966,400 to 629,888 at DPR 2 (about 97% less). Destination buffer area fell from 748,800 to 45,000 pixels and 2,995,200 to 102,400, respectively. Every regular/mixed crowd comparison had zero color-channel differences greater than one level. The 20k phase is about 67 times faster here; this is not an end-to-end game speedup.

## Validation

- `tests/defend-blight-worm.test.ts`: phase lookup without per-follower array scans; indexed/linear movement, cuts, state and RNG equivalence; live additions/deaths outside the phase.
- `tests/blight-contours.mjs`: cropped/full reference pixels for every Blight species in normal/Simple settings, regular and torch masks, rotated/reflected sprites, curves, miter joins, square caps and offscreen bodies. Alpha/geometry match exactly; native-species RGB differs by at most one level, with up to two levels of premultiplied RGB rounding at a few faint synthetic curve edges. Existing gap/rim/portrait/cache allocation checks remain.
- Existing `defend-crowd.mjs`, `darkling-aura.mjs`, `unit-contours.mjs` and `test:render-cache`: contact transfer, fractional seams, desktop/phone aura protection, contour coverage and cache invalidation.
- `npm test`: all 146 test files passed; `npm run build` passed. Replay/save/city/fence fixtures remain unchanged.

The dense 10,000-body renderer is still a stress workload. Body painting, infill masks, terrain, lighting and aura compositing retain costs outside the corrected hot paths; these measurements do not establish 60 FPS at every population/device/zoom.
