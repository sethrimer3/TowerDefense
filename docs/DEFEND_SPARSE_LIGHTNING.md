# DEFEND sparse lightning rendering

The lightning buffer previously cleared and recoloured every pixel in the bounding rectangle of all bolts, including empty space between distant chains. It now tracks occupied pixels in a fixed-size Uint32Array and only clears/recolours those entries. Overlapping glow, spark and core priorities and upload bounds are preserved. The additional buffer is bounded at four bytes per art pixel; no per-frame array allocation is required.

A local headless Chrome microbenchmark of two short chains at opposite board corners, 50 warmup iterations followed by 500 measured iterations, measured 0.797 ms per raster before and 0.0294 ms after (about 96% less time). This measures lightning rasterization, not total game FPS.

The same 2,504-enemy mixed battle fixture measured 45.75 to 35.82 ms of drawing and 77.92 to 71.91 ms frame intervals in sequential 120-frame runs. Unchanged simulation and other render passes also became faster, so these whole-frame differences include machine variance and cannot be attributed entirely to this change. The workload still misses 60 FPS.

Regression checks compare all RGBA buffer values and dirty bounds against the frozen original for distant and overlapping bolts, a 250-link chain, edge clipping, hot/cool/fading/expired frames, repeated empty frames and reappearance. Existing canvas comparisons cover normal/zoomed cameras and cache invalidation. No simulation rules or golden fixtures change.

Reproduce with the dev server running: `npm run test:render-cache` for the pixel comparisons and isolated microbenchmark; `PERF_FRAMES=120` and `npm run test:stress` for the battle workload. Local complete-battle recordings are `test-results/stress-render-next-before.json` and `test-results/stress-render-next-after.json`.

Validation: all 230 Node tests passed; production build passed; all 30 rendering comparison rows matched exactly (zero differing pixel bytes), including the additional lightning sequence checks.
