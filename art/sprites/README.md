# Artist sprites

Run `npm run dev`, then `npm run export-sprites` in another terminal. This
writes outline-free 1:1 PNGs and `manifest.json` (names, dimensions and descriptions)
to ignored `art/export/`. `tools/sprite-export.html` previews the same catalog.
Set `PLAYWRIGHT_EXECUTABLE` or `PLAYWRIGHT_CHANNEL` if needed.

Copy a redrawn PNG to the same relative path under `art/sprites/`, for example
`structures/archerTower-2x2.png` or `keep/keep.png`. Vite discovers these files
when run or built. Missing or wrong-sized files use procedural art; wrong sizes
also warn in the console. Pixel Art off selects procedural art.

- One PNG pixel is one art pixel: **8 pixels per board cell**. Keep exactly
  the exported canvas dimensions and transparent margins. Do not add padding.
- Draw **no exterior outline**. The shared sprite renderer adds a black ring
  **one art pixel outside** world art, expanding the drawn box without moving
  the source. Units/enemies instead receive the existing half-art-pixel faction
  contour around their combined bodies and equipment.
- Keep interior lines (roof ridges, beams, seams) and dark materials (obsidian,
  iron, cloaks, black Darklings). No near-black color stripping runs on PNGs.
- Base building images are undamaged; damage is painted after replacement.
  Rubble has its own `-rubble` files. Animation frames, directions, looks and
  equipment layers are separate named PNGs; use the manifest for exact names.
- Joined wall caps/faces, floor art, shadows and damage overlays get no separate
  ring. The assembled wall keeps its own one-art-pixel outline. Spike beams
  omit outlines on the ends that join adjacent beams. Moorings are ground art.
- Prefer opaque or clear pixels. PNG pixels below 50% opacity are cleared on
  load; dark material pixels are retained.

Existing `structures/`, `keep/`, `houses/`, gate, bastion and ballista names stay
stable. The catalog also includes `banners/`, `units/` (bodies, capes and summons),
`enemies/` (including multipart walkers and vehicles), `scenery/` (trees, rocks,
stumps, mountains, clouds, moorings and wall rubble), `projectiles/`, `effects/`
and `walls/` (joined caps/faces and spikes). Some procedural art has seeded
variation: one named replacement covers that size/look/variant, just as existing
roof replacements do. The manifest is the authoritative list of dimensions.

Source replacements and settings changes invalidate cached sprites, masks and
contours. PNGs contain presentation only and cannot affect saves or battle RNG.
