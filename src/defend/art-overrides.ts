/** Artist sprites: PNGs drawn one pixel an art pixel (8 a board cell),
 * standing in for the code's own art of the same name. They live under
 * `art/sprites/` as `<name>.png`, named as the export names them
 * (`art-export.ts`, `npm run export-sprites`): `structures/archerTower-2x2`,
 * `keep/keep-stage0`, `houses/roof-3-1x1`, `gates/gate-n-0` and so on.
 *
 * An artist's sprite replaces only the base art: damage, rubble and the
 * outline are still drawn by the game, the outline half an art pixel wide
 * round whatever the artist drew (`inked` in `damage-art.ts`), so the PNG
 * has no outline of its own. A sprite of the wrong size is ignored with a
 * warning, and none of them are used while the Pixel Art setting is off.
 * Presentation only: never in Node, never in a replay. */
import { clearSprites, rimmed } from "./damage-art.ts";
import { bumpPixelArt, onPixelArt, pixelArtOn } from "./pixel-sprites.ts";

/** The name each piece of art goes by, in `art/sprites/` and the export. */
export const ART_NAMES = {
  structure: (kind: string, cw: number, ch: number, look = "") => `structures/${kind}-${cw}x${ch}${look ? `-${look}` : ""}`,
  keep: "keep/keep",
  roof: (variant: number, cw: number, ch: number) => `houses/roof-${variant}-${cw}x${ch}`,
  gate: (side: string, frame: number) => `gates/gate-${side}-${frame}`,
  woodGate: (side: string, frame: number) => `gates/wood-gate-${side}-${frame < 0 ? "posts" : frame}`,
  bastion: "walls/bastion",
  ballista: (dir: number, loaded: boolean) => `walls/ballista-${dir}-${loaded ? "loaded" : "slack"}`,
};

type Art = { data: Uint32Array; w: number; h: number };
const art = new Map<string, Art>();
const warned = new Set<string>();

/** The artist's pixels for `name` (`w × h` art pixels), or null. */
export function artOverride(name: string, w: number, h: number): Uint32Array | null {
  const a = art.get(name);
  if (!a || !pixelArtOn()) return null;
  if (a.w !== w || a.h !== h) {
    if (!warned.has(name)) console.warn(`art/sprites/${name}.png is ${a.w}×${a.h}, the game draws it ${w}×${h}: ignored`);
    warned.add(name);
    return null;
  }
  // Drawn without an outline: given the drawn art's one-art-pixel rim.
  return rimmed(a.data, w, h);
}

/** Sets (or, with null, clears) the artist's sprite `name`. For the loader
 * and the tests. */
export function setArtOverride(name: string, a: Art | null) {
  if (a) art.set(name, a);
  else art.delete(name);
  warned.delete(name);
}

/** Names of the artist's sprites loaded. */
export const artOverrideNames = () => [...art.keys()];

/** Loads every artist sprite in `files` (path from `art/sprites/` to its
 * URL), then redraws whatever they stand in for. */
export async function loadArtOverrides(files: Record<string, string>) {
  if (typeof Image === "undefined") return;
  await Promise.all(
    Object.entries(files).map(async ([path, url]) => {
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        return console.warn(`art/sprites/${path} did not load`);
      }
      const cv = document.createElement("canvas");
      cv.width = img.naturalWidth;
      cv.height = img.naturalHeight;
      const c = cv.getContext("2d", { willReadFrequently: true })!;
      c.drawImage(img, 0, 0);
      const data = new Uint32Array(c.getImageData(0, 0, cv.width, cv.height).data.buffer.slice(0));
      // Pixel art is opaque or clear: faint edge pixels a painting tool left go.
      for (let i = 0; i < data.length; i++) if (data[i] >>> 24 < 128) data[i] = 0;
      setArtOverride(path.replace(/\.png$/, ""), { data, w: cv.width, h: cv.height });
    }),
  );
  if (art.size) bumpPixelArt();
}

// Sprites baked from the artist's art (or without it) go when the setting flips.
onPixelArt(clearSprites);
