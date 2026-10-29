# Artist sprites

Drop PNGs here to replace the game's drawn art. Each file is named as the
export names it (`npm run export-sprites` writes them to `art/export/`), for
example `structures/archerTower-2x2.png` or `keep/keep.png`.

- One PNG pixel is one art pixel: 8 art pixels to a board cell. Keep the
  size the export gave you; a sprite of any other size is ignored.
- Draw no outline. The game draws one half an art pixel wide round the
  sprite. Near-black pixels (every channel 48 or below) on the sprite's
  outer edge are treated as an old outline and dropped.
- Draw only the undamaged building. Damage, rubble and the outline are
  painted by the game over your art.
- Missing files fall back to the game's own art. The Pixel Art setting
  turns your sprites off.

The game picks up whatever is here when it is built or run with `npm run dev`.
