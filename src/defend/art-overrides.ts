/** Artist sprites: PNGs drawn one pixel an art pixel (8 a board cell),
 * standing in for the code's own art of the same name. They live under
 * `art/sprites/` as `<name>.png`, named as the export names them
 * (`art-export.ts`, `npm run export-sprites`): `structures/archerTower-2x2`,
 * `keep/keep`, `houses/roof-3-1x1`, `gates/gate-n-0` and so on.
 *
 * An artist's pixels replace the corresponding outline-free source. Damage
 * and the shared outside outline are applied afterward, identically to
 * procedural sources. Units use UnitContours instead of a per-sprite ring. A sprite of the wrong size is ignored with a
 * warning, and none of them are used while the Pixel Art setting is off.
 * Presentation only: never in Node, never in a replay. */
import { clearSprites } from "./damage-art.ts";
import { bumpPixelArt, onPixelArt, pixelArtOn } from "./pixel-sprites.ts";

/** The name each piece of art goes by, in `art/sprites/` and the export. */
export const ART_NAMES = {
  spike:(side:string,seed:number)=>`walls/spikes-${side}-${seed}`,
  wall: (area:string,cx:number,cy:number,face=false)=>`walls/${area}-${face ? `face-${cx}` : `cap-${cx}-${cy}`}`,
  effect: (kind: string, pose: string | number = "") => `effects/${kind}${pose !== "" ? `-${pose}` : ""}`,
  unit: (frame: string, direction = "") => `units/${frame.replaceAll(":", "-")}${direction ? `-${direction}` : ""}`,
  // Includes 2/3/5-pixel worm and Darkling squares and blightDart/blightPrism/greaterBlightPrism-body silhouettes; no rim.
  enemy: (kind: string, pose = "") => `enemies/${kind}${pose ? `-${pose}` : ""}`,
  projectile: (kind: string, pose: string | number = "") => `projectiles/${kind}${pose !== "" ? `-${pose}` : ""}`,
  scenery: (kind: string, pose: string | number = "") => `scenery/${kind}${pose !== "" ? `-${pose}` : ""}`,
  rubble: (name: string) => `${name}-rubble`,
  banner: (blue: boolean, frame: number) => `banners/${blue ? "rally" : "war"}-${frame}`,
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

/** Cheap presence probe for batched uniform bodies. Pixel reads stay in the
 * source/cache creation path, even in crowds with thousands of Darklings. */
export const hasArtOverride = (name: string) => pixelArtOn() && art.has(name);

/** The artist's pixels for `name` (`w × h` art pixels), or null. */
export function artOverride(name: string, w: number, h: number): Uint32Array | null {
  const a = art.get(name);
  if (!a || !pixelArtOn()) return null;
  if (a.w !== w || a.h !== h) {
    if (!warned.has(name)) console.warn(`art/sprites/${name}.png is ${a.w}×${a.h}, the game draws it ${w}×${h}: ignored`);
    warned.add(name);
    return null;
  }
  return a.data.slice();
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
