# Outline-free sprite migration

Before: main `229ec210b82c507b00535e16f190a0ee65d60c88`.
After: this branch. Both use `tests/defend-stress.html?manual&enemies=500&mix=heavy`,
fixed simulation/random seeds, 90 steps of 1/60 second and a fixed presentation clock.
No player saves are read. Browser: system Chromium, headless.

| View | Before | After |
| --- | --- | --- |
| Desktop, Crisp off | [PNG](before-desktop-crisp-off.png) | [PNG](after-desktop-crisp-off.png) |
| Desktop, Crisp on | [PNG](before-desktop-crisp-on.png) | [PNG](after-desktop-crisp-on.png) |
| Phone, Crisp off | [PNG](before-phone-crisp-off.png) | [PNG](after-phone-crisp-off.png) |
| Phone, Crisp on | [PNG](before-phone-crisp-on.png) | [PNG](after-phone-crisp-on.png) |

Desktop viewport: 1280 × 900 at DPR 1. Phone: 390 × 844 at DPR 2.
Crisp on preserves whole device pixels per art pixel; off uses smooth zoom.
The screenshots retain the native stress page's framing and lighting.

To reproduce, start Vite (`npm run dev`) and run:

```sh
PLAYWRIGHT_EXECUTABLE=/usr/bin/chromium node tests/defend-outline-sprites.mjs after
```

For before, serve the main commit above from a separate checkout on port 5174,
then invoke this branch's script with `TEST_URL=http://127.0.0.1:5174/` and `before`
as its argument. `ART_SCREENSHOT_DIR` overrides the output directory.

The after script also verifies a single-pixel outline's outside padding and
unaltered origin, separate lighting body/rim masks at 1×/2×/3×, seam-free joined
edges, mask-state restoration, named Darkling replacement through the crowd
path and the Pixel Art fallback. Unit contours remain half an art pixel;
buildings and other individual world sprites use one art pixel outside their
source alpha. Dark material colors remain source art.
