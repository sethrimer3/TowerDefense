# Window light and the Tiles stained glass

![The Tiles window and soft sunlight at phone scale](tiles-sunlight.png)

The Library and Tiles hall share `src/soft-sunlight.ts`. Each renderer caches three small light-density textures once. Their cross-section has a Gaussian feather, a smooth source fade and a gradual distance fade. Each frame shears these fields with the solar heading and composites them with `screen`. The fields overlap at low opacity; their edges dissolve instead of outlining transparent polygons. Only light is interpolated: stone, oak, lead and the rest of the scene keep their existing crisp sampling. There is no full-scene blur or per-frame texture allocation.

Tiles follows the Library's eight-minute day, with its own slower, wider sway (`hallSway`, `hallSwayMs`) and the Library's few-second pulse on each of its five shafts, drawn narrower than their spacing so each stands apart. The shafts and dust are drawn every frame onto their own layer, `.chamber-light`, which sits over the whole room, the menu included, and is composited with CSS `mix-blend-mode: screen`: the shelf and its tiles are lit where a shaft crosses them rather than hiding it. Its seventy dust motes follow stable wall-clock paths, drifting up or down and wandering, and glint only inside the light, fading at both ends; they use no gameplay/effects random stream, new timer or save state. Night clears the layer. Reduce Motion freezes the Tiles solar heading and omits its drifting dust. The keep's dim veil and shelf backing are lighter than the other rooms' so the window and light show through. The Library retains its existing effects/Reduce Motion behavior and motes.

With Pixel Art checked, the Tiles window is glazed pane by pane (`paneAt`): a border of alternating cream and blue beads, a rose in the head (cream eye, eight blue petals, clear crescents between them, an outer ring of sixteen segments each holding a cream roundel, eight in a small window), faintly blue spandrels with cream roundels, and two pointed lancets of diamond quarries either side of a mullion. `leadedPane` turns pane boundaries into one-pixel cames (lead on the pixel toward the mullion or above, so the window mirrors exactly), and shades each pane on its own, lighter along its top came. The glass is pale clear, blue and cream mixed over the city outside (about half at noon). Switching Pixel Art off rebakes the original four-lobed clear-glass window; toggling back works at the same size without reloading. This revises the existing procedural backdrop; it adds no sprite assets.

Tuning:

| Control | Location |
| --- | --- |
| Light intensity | `SUNLIGHT.density` (Library) and `hallDensity` (Tiles) in `src/soft-sunlight.ts`; callers also pass daylight/pulse strength |
| Edge softness and widening | `SUNLIGHT.feather` and `spread` |
| Fade with distance | `SUNLIGHT.distanceFade` (Library), `hallFade` (Tiles); source fade in the texture bake |
| Motion | `SUNLIGHT.sway` / `swayMs`, plus `hallSway` / `hallSwayMs` in Tiles; solar period remains `DAY_MS` |
| Dust density and speed | `SUNLIGHT.dustCount`; trajectory periods in `HallBackdrop.drawLight` |
| Pane colors and transmission | `GLASS_TINTS` and the tint mix in `HallBackdrop.draw` |
| Tracery and pane layout | `paneAt` / `leadedPane` in `src/ui/hall-art.ts` |

No runtime blur or layer-count control is needed: the cached continuous density replaces nested polygons. Five fields are drawn in each, with three reusable 96 × 192 textures per renderer.

`node tests/hall-sunlight.mjs` checks soft edge falloff, plainly visible shafts, changing sunlight/dust, night, Reduce Motion, native symmetry and repeated art toggles at 1280/390/360 pixels. It captures both the real Tiles UI and an unobstructed window under `test-results/tiles-sunlight-*` and `tiles-window-detail-*`. Run against a dev server with `TEST_URL` and `PLAYWRIGHT_EXECUTABLE` as needed. Existing `tests/library-idle.mjs` and `tests/tiles-marks.mjs` cover live Library rendering and Tiles interactions.
