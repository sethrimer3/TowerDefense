/** DEFEND's cloudborne palaces, drawn: the Valkyrie palace in its
 * Cloudborne look riding a bank of pixel cloud (outlined in black, each
 * puff lit from the upper left), with a dithered shadow on the ground
 * below, and the mooring it leaves on its lot (`mooringPixels`, painted
 * into the city layer).
 *
 * While building it hovers over its lot; in battle it floats where the
 * sim's `skyPalaces` say, and fades to a tenth of its opacity while it is
 * over the city, a structure or anyone, friend or foe, so it never hides
 * the fighting. Presentation only. */
import { ART } from "./park-art.ts";
import { cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import type { Building, CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { OUTLINE, drawSprite, pixels, sprite } from "./damage-art.ts";
import { cloudPuffs, structurePixels } from "./tower-art.ts";
import { ART_NAMES } from "./art-overrides.ts";
import { STRUCTURES } from "./catalog.ts";
import { sourcePixels, type ArtPiece } from "./sprite-source.ts";

/** Cells of cloud round the palace on each side of its sprite. */
export const MARGIN = 2;
/** How high it floats over the ground: its shadow falls this many cells
 * below and right of where it is drawn. */
const SHADOW = { x: 1.2, y: 1.8 };
/** How it fades: its opacity over something, and how fast it changes (a second). */
export const FADE = { over: 0.1, rate: 3 };

/** The puffs of a palace's cloud bank, `cw × ch` cells, in pixels of a
 * sprite with `MARGIN` cells round it. */
function bankPuffs(cw: number, ch: number, seed: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const x0 = MARGIN * ART, y0 = MARGIN * ART, x1 = (MARGIN + cw) * ART, y1 = (MARGIN + ch) * ART;
  const r = (k: number, lo: number, hi: number) => (lo + hash01(seed, k) * (hi - lo)) * ART;
  // Under the palace: a few big puffs, so the bank has no holes.
  for (let k = 0; k < 4; k++) out.push([x0 + ((k % 2) + 0.5) * (x1 - x0) / 2, y0 + (Math.floor(k / 2) + 0.5) * (y1 - y0) / 2, Math.min(cw, ch) * ART * 0.45]);
  // Billows round the edge, larger along the bottom.
  const along = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + ((i + 0.5) / n) * (b - a));
  let k = 10;
  for (const x of along(Math.max(2, Math.round(cw / 2)), x0, x1)) out.push([x, y0 - ART * 0.1, r(k++, 1.1, 1.5)]);
  for (const y of along(Math.max(2, Math.round(ch / 2)), y0, y1)) out.push([x0 - ART * 0.1, y, r(k++, 1.1, 1.5)], [x1 + ART * 0.1, y, r(k++, 1.1, 1.5)]);
  for (const [x, y] of [[x0, y0], [x1, y0]]) out.push([x, y, r(k++, 1, 1.3)]);
  // Heavier billows along the bottom, hanging lower at the corners.
  for (const x of along(Math.max(3, Math.round(cw / 1.6)), x0 - ART * 0.4, x1 + ART * 0.4)) out.push([x, y1 + ART * 0.2, r(k++, 1.3, 1.8)]);
  return out;
}

/** A cloudborne palace of `cw × ch` cells on its clouds, as RGBA pixels
 * `(cw + 2·MARGIN)·ART` wide and high. */
export function skyPalacePixels(cw: number, ch: number, seed: number): Uint32Array {
  const w = (cw + 2 * MARGIN) * ART, h = (ch + 2 * MARGIN) * ART;
  return sourcePixels(ART_NAMES.scenery("sky-palace", `${cw}x${ch}`), w, h, () => {
  const out = new Uint32Array(w * h), p = pixels(out, w, h);
  cloudPuffs(p, bankPuffs(cw, ch, seed));
  const palace = structurePixels("valkyriePalace", cw, ch, 0, seed, "cloudborne"), pw = cw * ART;
  for (let i = 0; i < palace.length; i++)
    if (palace[i] >>> 24) out[(MARGIN * ART + Math.floor(i / pw)) * w + MARGIN * ART + (i % pw)] = palace[i];
  return out;
  });
}

/** The bank's shadow: its shape in a checker of black. */
export function skyShadowPixels(cw: number, ch: number, seed: number): Uint32Array {
  const w = (cw + 2 * MARGIN) * ART, h = (ch + 2 * MARGIN) * ART;
  const out = new Uint32Array(w * h), p = pixels(out, w, h);
  cloudPuffs(p, bankPuffs(cw, ch, seed));
  for (let i = 0; i < out.length; i++) out[i] = out[i] && ((i % w) + Math.floor(i / w)) % 2 === 0 ? 0xff000000 : 0;
  return out;
}

/** The mooring a palace leaves on its lot of `cw × ch` cells: packed earth,
 * a ring of marble flags and a gold star where it comes down. */
export function mooringPixels(cw: number, ch: number, seed: number): Uint32Array {
  return sourcePixels(ART_NAMES.scenery("mooring", `${cw}x${ch}`), cw * ART, ch * ART, () => {
  const w = cw * ART, h = ch * ART, out = new Uint32Array(w * h), p = pixels(out, w, h);
  const EARTH = [0x4a3b2b, 0x5a4834, 0x66533c], MARBLE = [0x8a8c9a, 0xb9bac6, 0xdcdce4], GOLD = [0xb08a3e, 0xe9c46a, 0xfff4c8];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) p.set(x, y, EARTH[hash(x, y, seed) % 7 === 0 ? 0 : hash(x, y, seed, 1) % 5 === 0 ? 2 : 1]);
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d > R) continue;
      if (d > R - 1 || (d > R - 4 && d <= R - 3)) p.set(x, y, OUTLINE);
      else if (d > R - 3) {
        // Flagstones round the ring, alternate ones a shade apart, lit to the upper left.
        const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) * R) / 4);
        p.set(x, y, MARBLE[Math.min(2, (seg % 2) + (dx + dy < 0 ? 1 : 0))]);
      }
    }
  // A gold star at the middle: four points.
  const s = Math.max(2, Math.round(R * 0.35));
  for (let k = -s; k <= s; k++) {
    const t = s - Math.abs(k) > s / 2 ? 1 : 0;
    for (const [x, y] of [[cx + k, cy], [cx, cy + k]]) p.set(Math.floor(x), Math.floor(y), Math.abs(k) === s ? OUTLINE : GOLD[1 + t]);
  }
  p.set(Math.floor(cx), Math.floor(cy), GOLD[2]);
  return out;
  });
}

export function skyPalacePieces(): ArtPiece[] {
  const d = STRUCTURES.valkyriePalace;
  return [[d.w, d.h], ...(d.compact ? [[d.compact.w, d.compact.h]] : [])].flatMap(([cw, ch]) => [
    { name: ART_NAMES.scenery("sky-palace", `${cw}x${ch}`), w: (cw + 2 * MARGIN) * ART, h: (ch + 2 * MARGIN) * ART, about: "Cloudborne palace and cloud bank", pixels: () => skyPalacePixels(cw, ch, 0) },
    { name: ART_NAMES.scenery("mooring", `${cw}x${ch}`), w: cw * ART, h: ch * ART, about: "Cloudborne palace mooring; ground overlay", joined: true, pixels: () => mooringPixels(cw, ch, 0) },
  ]);
}

/** One palace to draw: its building, and the top left of its footprint in cells. */
type Aloft = { b: Building; x: number; y: number };

export class SkyPalaceArt {
  private alpha = new Map<number, number>();

  /** Draws every cloudborne palace: in battle where it floats, while
   * building over its lot (`looks` names those on the path). */
  draw(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, looks: Readonly<Record<number, string>> | undefined, o: { now: number; dt: number; reduceMotion: boolean; night: number }) {
    const list: Aloft[] = sim
      ? sim.skyPalaces.map((p) => ({ b: map.buildings[p.id], x: p.x, y: p.y }))
      : map.buildings.filter((b) => b.structureUid !== undefined && looks?.[b.structureUid] === "cloudborne").map((b) => ({ b, x: b.rect.x, y: b.rect.y }));
    if (!list.length) return this.alpha.clear();
    const seen = new Set<number>();
    for (const a of list) {
      seen.add(a.b.id);
      // Moored while building, it stays in plain sight to be picked out.
      const want = sim && over(map, sim, a) ? FADE.over : 1;
      const was = this.alpha.get(a.b.id) ?? want;
      const step = FADE.rate * Math.min(o.dt, 0.1);
      const alpha = o.reduceMotion ? want : was < want ? Math.min(want, was + step) : Math.max(want, was - step);
      this.alpha.set(a.b.id, alpha);
      drawOne(c, px, a, alpha, o);
    }
    for (const id of this.alpha.keys()) if (!seen.has(id)) this.alpha.delete(id);
  }
}

/** Whether the palace and its clouds are over the city, a structure or anyone. */
function over(map: CityMap, sim: DefendSim, { b, x, y }: Aloft): boolean {
  const x0 = Math.floor(x - 1), y0 = Math.floor(y - 1), x1 = Math.ceil(x + b.rect.w + 1), y1 = Math.ceil(y + b.rect.h + 1);
  for (let cy = y0; cy < y1; cy++)
    for (let cx = x0; cx < x1; cx++) {
      if (!cellInBounds(cx, cy)) continue;
      const i = cellIndex(cx, cy), owner = map.owner[i];
      if (map.city[i] || (owner >= 0 && owner !== b.id)) return true;
    }
  const inside = (u: { x: number; y: number; hp: number }) => u.hp > 0 && u.x >= x0 && u.x < x1 && u.y >= y0 && u.y < y1;
  return sim.enemies.some(inside) || sim.soldiers.some(inside) || sim.civilians.some(inside);
}

function drawOne(c: CanvasRenderingContext2D, px: number, { b, x, y }: Aloft, alpha: number, o: { now: number; reduceMotion: boolean; night: number }) {
  const { w: cw, h: ch } = b.rect, seed = hash(b.rect.x, b.rect.y, 0xc10d);
  const art = sprite(`sky:${cw}x${ch}:${seed}`, (cw + 2 * MARGIN) * ART, (ch + 2 * MARGIN) * ART, () => skyPalacePixels(cw, ch, seed));
  const shade = sprite(`sky:shadow:${cw}x${ch}:${seed}`, (cw + 2 * MARGIN) * ART, (ch + 2 * MARGIN) * ART, () => skyShadowPixels(cw, ch, seed), false);
  if (!art || !shade) return;
  // A slow bob, a whole art pixel at a time.
  const bob = o.reduceMotion ? 0 : Math.round(Math.sin(o.now / 900 + b.id) * 1.5) / ART;
  const W = (cw + 2 * MARGIN) * px, H = (ch + 2 * MARGIN) * px;
  const at = (cx: number, cy: number) => [Math.round((cx - MARGIN) * px), Math.round((cy - MARGIN) * px)];
  c.save();
  c.imageSmoothingEnabled = false;
  // Its shadow on the ground below.
  const [sx, sy] = at(x + SHADOW.x, y + SHADOW.y);
  c.globalAlpha = 0.22 * Math.max(alpha, 0.5);
  c.drawImage(shade, sx, sy, Math.round(W), Math.round(H));
  c.globalAlpha = alpha;
  if (o.night > 0) c.filter = `brightness(${1 - 0.55 * o.night})`;
  const [ax, ay] = at(x, y - 0.6 + bob);
  drawSprite(c, art, ax, ay, Math.round(W), Math.round(H));
  c.restore();
}
