# World pixels and unit visibility contours

The canonical world lattice is **8 art pixels per board cell**, defined in `src/defend/art-scale.ts`. A city tile spans 8 cells, or 64 art pixels. One art pixel is a world-art measure, not a fixed CSS/device pixel: its screen size changes with the renderer's pixels-per-cell, camera zoom and display density. Older artists still round their strokes independently. Parks re-export the canonical constant; shared effects and Darkling bodies use it directly.

The visibility contour extends **half an art pixel outside the body**, or **1/16 of a cell**. It is bright crimson (`#ff2454`) for explicitly tagged Dark One enemies and Siege opponents, and dark blue (`#1d3f7a`) for player troops, including friendly dark wizards, summons and shades. Neutral enemies and civilians retain their existing ink. Garrison badges remain UI badges.

The contour follows the union of each group's filled body shapes. Touching and overlapping bodies have a single perimeter; no contour crosses another unit body, even across opposing groups or translucent cloaks. At small phone scales a half-art-pixel contour has partial screen-pixel coverage. Rounding it up to a full screen pixel would make it too thick, so the renderer preserves the fractional coverage.

`UnitOutline` retains the legacy painter for compatibility checks and adds a thin mode backed by `UnitContours`. Primitive fills and strokes contribute vector geometry; baked sprite bodies contribute cached paths from their opaque row runs after the old black rim is removed. Crop paths are intersected with source bounds and cached with a fixed limit. Live capes invalidate their geometry with their existing sprite copies. Axis-aligned pixel bodies use a batched union of expanded rectangles, avoiding the stroker's extra geometry for crowds. Other filled paths are stroked at twice the desired outward width; then all body interiors are removed. The remaining outside half is the visible contour. Cloaked units/shades lower the capture threshold for their bodies while ordinary sprites still exclude faint auras.

The normal renderer always enables these merged visibility contours, including when the older Merged outlines setting is off. That setting continues to control ordinary neutral/black rims. Buffers rebuild only when the existing combat cache repaints, including pan/zoom, size and settings changes. A screen-space overlay reuses the cached contours after world color drain, forest canopies and smoke; this keeps allegiance colors visible through the wash and cover. It draws before targeting/editing markers and HUD controls. Bodies retain their own palettes and normal world effects.

There is no per-frame scene readback, per-unit canvas, image filter or pairwise overlap search. Sprite paths share the existing once-per-sprite readback, and each ink uses one reusable screen-sized contour buffer. Crowd work scales with painted geometry, not the number of overlaps.

Validation:

- Native canvas pixel samples at 0.5, 1 and 2 screen-pixel outward widths; black body preservation and no overlap seams.
- Differently colored opposing units, translucent overlaps, baked-rim removal, source cropping and camera transforms.
- Production rendering under 16 desktop/phone, Simple-unit, Merged outlines and Reduce Motion combinations, including maximum grayscale drain. Phone coverage is compared with a frame without contours rather than requiring fully opaque color samples.
- Existing troop-family gallery, both sides and Simple/sprite art, on grass and at night.
- A 5,000-square crowd checks fixed canvas count and zero frame readbacks; timings are recorded in ignored test-results and remain hardware-dependent.
- Combat-cache reuse, invalidation and fresh-paint pixels; legacy painter compatibility remains independently checked. No gameplay or replay fixtures change.

Run the Vite server, then `PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/unit-contours.mjs`, `node tests/siege-outlines.mjs` and `npm run test:render-cache` (set the same browser variable as needed). Artifacts are written to `test-results/`.
