/** The static city layer for DEFEND: flagstone ground, the spawn lane,
 * dirt streets (`ground-art.ts`) and their stones, park grass and ponds,
 * walls, houses and structures, rubble, the shadows everything standing
 * casts (`shadow-art.ts`), and lantern brackets. Trees stand over the units,
 * so the renderer draws them later (`park-trees.ts`). The renderer paints it
 * once into an offscreen canvas and repaints it only when a building falls or
 * is rebuilt, the size changes, or art finishes loading. */
import { CELL_COUNT, CELLS_H, CELLS_W, SPAWN_ROW, SUB, TILES_H, TILES_W, cellInBounds, cellIndex, hash, hash01 } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import type { Light, Stone } from "./lighting.ts";
import type { DefendSim } from "./sim.ts";
import { drawFenceSections } from "./fences.ts";
import { ROAD, keepStage, paintKeepRubble, paintStructureArt, paintStructureRubble } from "./structure-art.ts";
import { houseRubbleSprite, roofSeed, roofSprite } from "./roof-art.ts";
import { ART, openAt, parkArt } from "./park-art.ts";
import { paintBridges } from "./bridge-art.ts";
import { damageStage, drawSprite, sprite, wallDamagePixels, wallRubblePixels } from "./damage-art.ts";
import { mooringPixels } from "./sky-palace-art.ts";
import { GRASS, grassPatch, groundArt } from "./ground-art.ts";
import { heights, paintShadows, shadowMask, type Footprint } from "./shadow-art.ts";
import { gatePixels, gateRubblePixels } from "./gate-art.ts";
import { WOOD_GATE, gateArtRect, woodGatePixels, woodGateRubblePixels } from "./wood-gate-art.ts";
import { gateRect, type Side } from "./layout.ts";
import { SPIKE_REACH, bastionPixels, bastionRubblePixels, spikePixels } from "./wall-defense-art.ts";
import { AREAS, areaArtId, type AreaId } from "./areas.ts";
import { hasForest } from "./forest.ts";
import { hasWallArt, wallCapSprite, wallFaceSprite, wallRubbleTones } from "./area-wall-art.ts";
import { drawPixel, drawRoof, pixelKey, type PixelSprite } from "./pixel-sprites.ts";

export { POND, POND_WATER, hasTree, pondDisc, pondPath, treeCanopy } from "./park-geometry.ts";

const ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const floorImages: HTMLImageElement[] = [];
const themedFloors = new Map<AreaId, HTMLImageElement[]>();
const artListeners = new Set<() => void>();
/** Mossbound Ruins' wall is cut from two hand-drawn sprites (see paintWall);
 * the other areas' walls are pixel art from `area-wall-art.ts`. */
const wallArt: { cap?: HTMLImageElement; face?: HTMLImageElement } = {};
function loadImage(name: string) {
  const img = new Image();
  img.onload = () => artListeners.forEach((f) => f());
  img.src = `${ASSET_BASE}assets/defend/${name}.png`;
  return img;
}
/** Starts loading the floor and wall art (once), calling `repaint` each time
 * an image arrives, since the layer painted without it is only a stand-in. */
export function onCityArtLoaded(repaint: () => void) {
  artListeners.add(repaint);
  if (floorImages.length || typeof Image === "undefined") return;
  for (let i = 1; i <= 4; i++) floorImages.push(loadImage(`floor-${i}`));
  wallArt.cap = loadImage("wall-cap");
  wallArt.face = loadImage("wall-face");
  for (const area of AREAS.slice(1)) themedFloors.set(area.id, [1, 2, 3, 4].map(i => loadImage(`areas/${areaArtId(area.id)}/floor-${i}`)));
}
const ready = (img?: HTMLImageElement): img is HTMLImageElement => !!img?.complete && !!img.naturalWidth;

/** The mossy flagstone floor tiles (floor-1..4.png) specifically: drawn in
 * their PNG orientation (rotating them made the baked-in lighting look
 * wrong). Each PNG's flagstones fill an 80 px square inside a transparent
 * margin that differs a pixel or so between them; only that square is drawn,
 * edge to edge over its board tile, so the tiles meet without gaps. */
const FLOOR_CROP = [
  { x: 8, y: 6 },
  { x: 8, y: 6 },
  { x: 9, y: 6 },
  { x: 9, y: 6 },
];
const FLOOR_SIZE = 80;

/** Wall sprites, in source pixels. wall-cap.png holds a vertical run of
 * mossy cap stones at x 38–54, lit from the left; each wall cell shows a
 * 16 px window of it, continuing down the run. wall-face.png holds the dark
 * brick face, hung below any wall stone with open ground to its south. */
const CAP = { x: 38, w: 16, y0: 1, span: 62 };
const FACE = { x0: 8, span: 64, y: 44, h: 14 };
/** How far a wall stone's brick face hangs over the cell below, in cells. */
export const FACE_HANG = 0.45;

const RUBBLE = "#4a443d";
const WALL = "#8e897c";

/** What the city layer is painted from. `px` is canvas pixels per cell. */
export type CityScene = {
  area?: AreaId;
  map: CityMap;
  /** The battle, if one is on: buildings it knocked down show as rubble. */
  sim: DefendSim | null;
  lights: readonly Light[];
  stones: readonly Stone[];
  /** Each structure's path by its uid, for the paths with their own look. */
  looks?: Readonly<Record<number, string>>;
};

/** Everything the painters share for one repaint. */
type Paint = {
  area: AreaId;
  c: CanvasRenderingContext2D;
  px: number;
  map: CityMap;
  sim: DefendSim | null;
  /** The cell holds a standing building or wall stone. */
  solid: (i: number) => boolean;
  looks?: Readonly<Record<number, string>>;
};

/** Paints the whole city onto `c` (sized by the caller) at `px` per cell. */
export function paintCityLayer(c: CanvasRenderingContext2D, px: number, scene: CityScene) {
  const { map, sim } = scene;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  const p: Paint = { c, px, map, sim, solid, area: scene.area ?? "moss", looks: scene.looks };
  c.imageSmoothingEnabled = false;
  paintFlagstones(p);
  paintCityGround(p);
  paintPixelArt(p, groundArt(map, hasForest(p.area)).canvas);
  paintRoadStones(p, scene.stones);
  // Ponds over the park grass, as pixel art.
  paintPixelArt(p, parkArt(map).canvas);
  paintPondPlants(p);
  paintBridges(c, px, map);
  // The spikes' beams lie under the stones, so only the stakes show past
  // the wall. Walls next: a wall's face hangs over the cell below it, and a
  // house or structure standing there is in front of the face, so it covers it.
  paintSpikes(p);
  for (const b of map.buildings) if (b.kind === "wall") paintBuilding(p, b);
  paintFences(c, px, map, sim);
  for (const b of map.buildings) if (b.kind !== "wall") paintBuilding(p, b);
  paintShadows(c, cityShadows(map, sim, scene.looks), px);
  paintLanternBrackets(p, scene.lights);
}

/** The shadows of what stands, cached for the last city and battle state. */
let shadows: { map: CityMap; sim: DefendSim | null; version: number; looks: string; mask: Uint8Array } | null = null;
function cityShadows(map: CityMap, sim: DefendSim | null, looks?: Readonly<Record<number, string>>) {
  const version = sim ? sim.mapVersion : -1, key = (looks ? Object.entries(looks).join(",") : "") + `|${pixelKey()}`;
  if (shadows?.map !== map || shadows.sim !== sim || shadows.version !== version || shadows.looks !== key) {
    const standing = (b: Building) => (!sim || sim.intact(b)) && !aloft({ looks }, b);
    const footprint = (b: Building) => spriteFootprint(map, b, b.structureUid !== undefined ? looks?.[b.structureUid] : undefined);
    shadows = { map, sim, version, looks: key, mask: shadowMask(heights(map, standing, footprint)) };
  }
  return shadows.mask;
}

/** The solid pixels of each structure's sprite as it stands undamaged, read
 * once a kind, size and look, and again as the pixel art loads, with a cell
 * of room all round for sprites that overhang their lot. */
const footprints = new Map<string, Omit<Footprint, "x0" | "y0"> | null>();
function spriteFootprint(map: CityMap, b: Building, look: string | undefined): Footprint | null {
  if (typeof document === "undefined") return null;
  const r = b.rect, key = `${b.kind}:${r.w}x${r.h}:${look ?? ""}:${pixelKey()}`;
  let f = footprints.get(key);
  if (f === undefined) {
    const w = (r.w + 2) * ART, h = (r.h + 2) * ART;
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d", { willReadFrequently: true })!;
    c.imageSmoothingEnabled = false;
    c.translate((1 - r.x) * ART, (1 - r.y) * ART);
    paintStanding(c, ART, map, b, "moss", look === undefined || b.structureUid === undefined ? undefined : { [b.structureUid]: look });
    const data = c.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) mask[k] = data[k * 4 + 3] >= 128 ? 1 : 0;
    // Nothing drawn (art still on its way): its lot stands in.
    f = mask.includes(1) ? { w, h, mask } : null;
    footprints.set(key, f);
  }
  return f && { ...f, x0: (r.x - 1) * ART, y0: (r.y - 1) * ART };
}

/** Ground: the mossy flagstones, one tile per board tile, with the spawn
 * lane darkened as hostile ground. */
function paintFlagstones({ c, px, area }: Paint) {
  const T = px * SUB;
  const { width } = c.canvas;
  paintFloor(c, px, area);
  const g = c.createLinearGradient(0, 0, 0, T * (SPAWN_ROW + 1));
  g.addColorStop(0, "rgba(40,6,6,0.55)");
  g.addColorStop(1, "rgba(20,0,0,0.25)");
  c.fillStyle = g;
  c.fillRect(0, 0, width, T * (SPAWN_ROW + 1));
}

/** The flagstone tiles alone, over the dark grout, at `px` a cell: the
 * city layer's ground, and what the ground relief's bump map is cut from. */
export function paintFloor(c: CanvasRenderingContext2D, px: number, area: AreaId = "moss") {
  const T = px * SUB;
  const { width, height } = c.canvas;
  // Very dark grey shows in the gaps around the flagstone sprites.
  c.fillStyle = "#17181b";
  c.fillRect(0, 0, width, height);
  for (let ty = 0; ty < TILES_H; ty++)
    for (let tx = 0; tx < TILES_W; tx++) {
      const k = hash(tx, ty, 3) % 4;
      const img = area === "moss" ? floorImages[k] : themedFloors.get(area)?.[k];
      // Whole pixels, each tile ending where the next begins.
      const x = Math.round(tx * T),
        y = Math.round(ty * T),
        w = Math.round((tx + 1) * T) - x,
        h = Math.round((ty + 1) * T) - y;
      // Pixel Art's mossy flagstones stand in for Mossbound Ruins' own.
      if (area === "moss" && drawPixel(c, `floor-${k + 1}` as PixelSprite, x, y, w, h)) continue;
      if (ready(img)) {
        const { x: sx, y: sy } = area === "moss" ? FLOOR_CROP[k] : { x: 0, y: 0 };
        const size = area === "moss" ? FLOOR_SIZE : img.naturalWidth;
        c.drawImage(img, sx, sy, size, size, x, y, w, h);
      } else {
        c.fillStyle = AREAS.find(a => a.id === area)!.dark;
        c.fillRect(x, y, w, h);
      }
    }
  if (area === "nadir") {
    c.fillStyle = "rgba(17,8,32,0.48)";
    c.fillRect(0, 0, width, height);
  }
}

/** How many of the floor images have loaded (the bump map waits for all). */
export const floorArtLoaded = (area: AreaId = "moss") => (area === "moss" ? floorImages : themedFloors.get(area) ?? []).filter(ready).length;

/** City ground: park grass, and gravel under the streets' dirt and for
 * cleared rubble and breached wall. */
function paintCityGround(p: Paint) {
  const { map, solid } = p;
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      const t = map.type[i];
      // A structure placed outside the city stands on the open floor, and
      // so does a wooden fence, not on a stone wall's footing (in the
      // forest, its grass grows under it: `paintFences`).
      if (t === CellType.OUT || (t === CellType.STRUCT && !map.city[i]) || map.buildings[map.owner[i]]?.fence) continue;
      if (t === CellType.PARK || t === CellType.WATER) paintGrass(p, cx, cy);
      else if (t !== CellType.WALL || !solid(i) || map.buildings[map.owner[i]]?.woodGate) paintGravel(p, cx, cy);
    }
}

/** Road (or rubble-coloured) gravel with a fine grit speckle. */
function paintGravel({ c, px, map, solid }: Paint, cx: number, cy: number) {
  const i = cellIndex(cx, cy);
  const x = cx * px,
    y = cy * px;
  c.fillStyle = map.owner[i] >= 0 && !solid(i) ? RUBBLE : ROAD;
  c.fillRect(x, y, px + 0.5, px + 0.5);
  const grit = Math.max(1, px * 0.07);
  for (let k = 0; k < 6; k++) {
    const h = hash01(cx, cy, 60 + k);
    c.fillStyle = h < 0.5 ? "rgba(0,0,0,0.12)" : "rgba(255,240,215,0.07)";
    c.fillRect(x + hash01(cx, cy, 70 + k) * (px - grit), y + hash01(cx, cy, 80 + k) * (px - grit), grit, grit);
  }
}

/** Pebbles on the streets, with a darker underside so they sit in the dirt. */
function paintRoadStones({ c, px }: Paint, stones: readonly Stone[]) {
  for (const st of stones) {
    const s = Math.max(1, st.s * px);
    const x = st.x * px - s / 2,
      y = st.y * px - s / 2;
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(x + s * 0.3, y + s * 0.35, s, s);
    c.fillStyle = st.shade < 0.33 ? "#857660" : st.shade < 0.66 ? "#74664f" : "#918268";
    c.fillRect(x, y, s, s);
  }
}

/** Park grass: two greens in soft patches, tufts and the odd flower. */
function paintGrass({ c, px }: Paint, cx: number, cy: number) {
  const x = Math.round(cx * px),
    y = Math.round(cy * px),
    s = Math.round((cx + 1) * px) - x,
    t = Math.round((cy + 1) * px) - y;
  c.fillStyle = grassPatch(cx, cy);
  c.fillRect(x, y, s, t);
  const d = Math.max(1, Math.round(px * 0.09));
  for (let k = 0; k < 5; k++) {
    const hx = x + Math.floor(hash01(cx, cy, 51, k) * (s - d)),
      hy = y + Math.floor(hash01(cx, cy, 52, k) * (t - d * 2));
    c.fillStyle = k % 2 ? GRASS.dark : GRASS.light;
    c.fillRect(hx, hy, d, d * 2);
  }
  if (hash01(cx, cy, 53) < 0.18) {
    c.fillStyle = ["#e8d57a", "#e6e1d6", "#c96a5a", "#b7a3d6"][hash(cx, cy, 54) % 4];
    c.fillRect(x + Math.floor(hash01(cx, cy, 55) * (s - d)), y + Math.floor(hash01(cx, cy, 56) * (t - d)), d, d);
  }
}

/** Pixel art baked at `ART` pixels a cell (streets, ponds), drawn
 * up to size with smoothing off. */
function paintPixelArt({ c }: Paint, art: HTMLCanvasElement | null) {
  if (!art) return;
  c.save();
  c.imageSmoothingEnabled = false;
  c.drawImage(art, 0, 0, c.canvas.width, c.canvas.height);
  c.restore();
}

function paintBuilding(p: Paint, b: Building) {
  if (b.hidden) return;
  const { c, px, sim, solid } = p;
  const r = b.rect;
  // Everything snaps to whole pixels so outlines stay crisp.
  const x = Math.round(r.x * px),
    y = Math.round(r.y * px),
    w = Math.round((r.x + r.w) * px) - x,
    h = Math.round((r.y + r.h) * px) - y;
  const box = { x, y, w, h, px };
  if (b.kind === "wall") {
    // Wooden fences are drawn together after the walls (`paintFences`).
    if (b.fence) return;
    if (solid(b.cells[0])) paintWall(p, b);
    else if (hasWallArt(p.area) || !paintPixelRubble(p, b)) paintArt(p, wallRubbleSprite(lotSeed(b), p.area), box);
    return;
  }
  if (b.kind === "gate") {
    const side = b.gate!.side, a = gateArtRect(b);
    const ax = Math.round(a.x * px), ay = Math.round(a.y * px);
    const art = { x: ax, y: ay, w: Math.round((a.x + a.w) * px) - ax, h: Math.round((a.y + a.h) * px) - ay, px };
    if (sim && !sim.intact(b)) {
      paintArt(p, b.woodGate ? woodGateRubbleSprite(side, lotSeed(b)) : gateRubbleSprite(side, lotSeed(b)), art);
      return paintRebuilding(p, b);
    }
    return paintArt(p, gateSpriteOf(b, b.woodGate && sim ? -1 : 0, stageOf(sim, b)), art);
  }
  if (b.kind === "wallBallista") {
    if (sim && !sim.intact(b)) {
      paintArt(p, sprite(`bastion:rubble:${lotSeed(b)}`, r.w * ART, r.h * ART, () => bastionRubblePixels(lotSeed(b))), box);
      return paintRebuilding(p, b);
    }
    return paintArt(p, bastionSprite(stageOf(sim, b), lotSeed(b)), box);
  }
  if (sim && !sim.intact(b)) {
    if (b.kind === "keep") return paintKeepRubble(c, box);
    if (paintPixelRubble(p, b)) return paintRebuilding(p, b);
    if (b.kind === "house") paintArt(p, houseRubbleSprite(r.w, r.h, b.variant, roofSeed(r.x, r.y, r.w, r.h)), box);
    else paintStructureRubble(c, b.kind, box, lotSeed(b));
    return paintRebuilding(p, b);
  }
  // A cloudborne palace floats over its lot (`sky-palace-art.ts`), leaving its mooring.
  if (aloft(p, b)) {
    return paintArt(p, sprite(`mooring:${r.w}x${r.h}:${lotSeed(b)}`, r.w * ART, r.h * ART, () => mooringPixels(r.w, r.h, lotSeed(b))), box);
  }
  // Pixel Art's roofs on undamaged houses; a damaged one keeps its own, showing the damage.
  if (b.kind === "house" && !stageOf(sim, b) && drawRoof(c, b.variant, box, px)) return;
  if (b.kind === "house") return paintArt(p, roofSprite(r.w, r.h, b.variant, roofSeed(r.x, r.y, r.w, r.h), stageOf(sim, b)), box);
  paintStructureArt(c, b.kind, box, stageOf(sim, b), lotSeed(b), b.structureUid !== undefined ? p.looks?.[b.structureUid] : undefined);
}

/** Paints building `b` whole and undamaged onto `c` at `px` per cell (a
 * magic boat's water drawing it down as it sinks, the shimmer reading its
 * shape), in `looks`' path look. */
export function paintStanding(c: CanvasRenderingContext2D, px: number, map: CityMap, b: Building, area: AreaId = "moss", looks?: Readonly<Record<number, string>>) {
  paintBuilding({ c, px, map, sim: null, solid: () => true, area, looks }, b);
}

/** Whether `b` is a palace on the Cloudborne path, off its lot. */
const aloft = (p: { looks?: Readonly<Record<number, string>> }, b: Building) => b.structureUid !== undefined && p.looks?.[b.structureUid] === "cloudborne";

/** The seed a building's damage and rubble are drawn from: its lot. */
export const lotSeed = (b: Building) => hash(b.rect.x, b.rect.y, b.rect.w, b.rect.h, 77);

/** How damaged a standing building looks: the keep's `keepStage`, anything
 * else's `damageStage` (0 out of battle). */
export function stageOf(sim: DefendSim | null, b: Building) {
  if (!sim) return 0;
  return b.kind === "keep" ? keepStage(sim.hp[b.id], sim.maxHp[b.id]) : damageStage(sim.hp[b.id], sim.maxHp[b.id]);
}

/** A number that changes whenever any standing building's damage stage
 * does, so the renderer knows to repaint the layer. */
export function damageKey(sim: DefendSim) {
  let k = 0;
  for (const b of sim.map.buildings) k = (Math.imul(k, 31) + (sim.intact(b) ? stageOf(sim, b) : 7)) | 0;
  return k;
}

/** Partially rebuilt: finished sections show as fresh timber framing over
 * the rubble. */
function paintRebuilding({ c, px, solid }: Paint, b: Building) {
  for (const i of b.cells) {
    if (!solid(i)) continue;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    c.fillStyle = "#9c8356";
    c.fillRect(cx * px + 1, cy * px + 1, px - 2, px - 2);
    c.strokeStyle = "#5b4a2e";
    c.lineWidth = Math.max(1, px * 0.08);
    c.strokeRect(cx * px + 1.5, cy * px + 1.5, px - 3, px - 3);
  }
}

/** A cached sprite of art pixels drawn up over `box` (canvas pixels). */
function paintArt({ c }: Paint, art: HTMLCanvasElement | null, box: { x: number; y: number; w: number; h: number }) {
  drawSprite(c, art, box.x, box.y, box.w, box.h);
}

/** A wall ballista's bastion at damage `stage`. */
export const bastionSprite = (stage: number, seed: number) => sprite(`bastion:${stage}:${seed}`, 2 * ART, 2 * ART, () => bastionPixels(stage, seed));

const SPIKE_OUT: Record<Side, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

/** The wall spikes on every standing stone they line, painted under the
 * stones, their tips reaching out past the wall's face (on the south, past
 * the brick face hanging below the stone). */
function paintSpikes({ c, px, map, solid }: Paint, outside = false) {
  for (const row of map.spikes ?? []) {
    const [dx, dy] = SPIKE_OUT[row.side];
    for (const i of row.cells) {
      if (!solid(i)) continue;
      const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
      const hung = row.side === "s" && cy + 1 < CELLS_H && !solid(i + CELLS_W);
      const reach = SPIKE_REACH / ART + (hung ? FACE_HANG : 0);
      const x = Math.round((cx + dx * reach) * px), y = Math.round((cy + dy * reach) * px);
      const w = Math.round((cx + dx * reach + 1) * px) - x, h = Math.round((cy + dy * reach + 1) * px) - y;
      if (outside) {
        // Only past the stone (and its hanging face), on the ground outside.
        const x0 = Math.round(cx * px), x1 = Math.round((cx + 1) * px), y0 = Math.round(cy * px);
        const y1 = Math.round((cy + 1) * px) + (hung ? Math.round(px * FACE_HANG) : 0);
        const r = row.side === "n" ? [x, y, w, y0 - y] : row.side === "s" ? [x, y1, w, y + h - y1] : row.side === "e" ? [x1, y, x + w - x1, h] : [x, y, x0 - x, h];
        if (r[2] <= 0 || r[3] <= 0) continue;
        c.save();
        c.beginPath();
        c.rect(r[0], r[1], r[2], r[3]);
        c.clip();
      }
      drawSprite(c, sprite(`spikes:${row.side}:${hash(cx, cy, 31) % 8}`, ART, ART, () => spikePixels(row.side, hash(cx, cy, 31) % 8)), x, y, w, h);
      if (outside) c.restore();
    }
  }
}

/** The spikes' points reaching out past the wall over the open ground,
 * painted again (at `px` a cell) over whatever covered that ground after
 * the city layer: the forest's floor. */
export function paintSpikePoints(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null) {
  if (!map.spikes?.length) return;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  paintSpikes({ c, px, map, sim, solid, area: "moss" }, true);
}

/** The standing wooden fences, all at once: in the city layer, and again
 * over the forest's floor and grass, which cover the open ground they
 * stand on. */
export function paintFences(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, shadow = false) {
  const sections = [];
  for (const b of map.buildings)
    if (b.kind === "wall" && b.fence && !b.hidden && b.cells.length && (sim ? sim.solid[b.cells[0]] === 1 : true))
      for (const f of b.rails ?? [b.fence]) sections.push({ ...f, broken: false });
  if (sections.length) drawFenceSections(c, px, sections, shadow);
}

/** A city gate's sprite with its doors at `frame`, and its rubble. */
export const gateSprite = (side: Side, frame: number, stage: number, seed: number) => {
  const r = gateRect({ tx: 0, ty: 0, side });
  return sprite(`gate:${side}:${frame}:${stage}:${seed}`, r.w * ART, r.h * ART, () => gatePixels(side, frame, stage, seed));
};
/** Gate `b`'s sprite, stone or wooden, with its doors at `frame`, drawn over
 * `gateArtRect(b)`. */
export const gateSpriteOf = (b: Building, frame: number, stage: number) =>
  b.woodGate ? woodGateSprite(b.gate!.side, frame, stage, lotSeed(b)) : gateSprite(b.gate!.side, frame, stage, lotSeed(b));
const woodGateSprite = (side: Side, frame: number, stage: number, seed: number) => {
  const across = side === "e" || side === "w", u = WOOD_GATE.long * ART, v = WOOD_GATE.deep * ART;
  return sprite(`woodGate:${side}:${frame}:${stage}:${seed}`, across ? v : u, across ? u : v, () => woodGatePixels(side, frame, stage, seed));
};
const woodGateRubbleSprite = (side: Side, seed: number) => {
  const across = side === "e" || side === "w", u = WOOD_GATE.long * ART, v = WOOD_GATE.deep * ART;
  return sprite(`woodGate:${side}:rubble:${seed}`, across ? v : u, across ? u : v, () => woodGateRubblePixels(side, seed));
};
const gateRubbleSprite = (side: Side, seed: number) => {
  const r = gateRect({ tx: 0, ty: 0, side });
  return sprite(`gate:${side}:rubble:${seed}`, r.w * ART, r.h * ART, () => gateRubblePixels(side, seed));
};
const wallRubbleSprite = (seed: number, area: AreaId) => {
  const tones = wallRubbleTones(area);
  return sprite(`wall:rubble:${tones ? area : "moss"}:${seed}`, ART, ART, () => wallRubblePixels(seed, ART, tones?.stone, tones?.accent));
};
const wallDamageSprite = (stage: number, seed: number) => sprite(`wall:${stage}:${seed}`, ART, ART, () => wallDamagePixels(stage, seed, ART));

/** One wall stone. Edges and the hanging brick face follow the *standing*
 * wall, so a breach gets proper broken edges. */
function paintWall(p: Paint, b: Building) {
  const { c, px, map, sim, solid } = p;
  const cx = b.rect.x,
    cy = b.rect.y;
  const x = Math.round(cx * px),
    y = Math.round(cy * px);
  const standing = (dx: number, dy: number) => {
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny)) return false;
    const i = cellIndex(nx, ny);
    return map.wall[i] === 1 && solid(i);
  };
  const cap = wallArt.cap;
  if (hasWallArt(p.area)) drawSprite(c, wallCapSprite(p.area, cx, cy), x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y);
  else if (drawPixel(c, "city-wall-cap", x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y)) {
    // Pixel Art's cap stone; the edges, damage, face and outline still follow the standing wall.
  } else if (ready(cap)) {
    const sy = CAP.y0 + ((cy * CAP.w + cx * 37) % CAP.span);
    c.drawImage(cap, CAP.x, sy, CAP.w, CAP.w, x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y);
  } else {
    c.fillStyle = WALL;
    c.fillRect(x, y, px + 0.5, px + 0.5);
  }
  paintWallEdges(p, { x, y }, standing);
  const stage = stageOf(sim, b);
  if (stage) paintArt(p, wallDamageSprite(stage, lotSeed(b)), { x, y, w: Math.round((cx + 1) * px) - x, h: Math.round((cy + 1) * px) - y });
  const face = !standing(0, 1) && cy + 1 < CELLS_H;
  if (face) paintWallFace(p, cx, { x, y });
  paintWallOutline(p, { x, y, w: Math.round((cx + 1) * px) - x, h: Math.round((cy + 1) * px) - y }, standing, face);
}

/** The open ground cells (outside the city) a standing wall stone's brick
 * face hangs over, in runs along each row: `y` the row, `x0` to `x1`
 * (exclusive) the cells. Whatever is drawn on that ground after the city
 * layer (the forest's floor) must leave the face showing. */
export function hangingFaces(map: CityMap, sim: DefendSim | null): { y: number; x0: number; x1: number }[] {
  const standing = (i: number) => map.wall[i] === 1 && !map.buildings[map.owner[i]]?.fence && (sim ? sim.solid[i] === 1 : map.owner[i] >= 0);
  const runs: { y: number; x0: number; x1: number }[] = [];
  for (let cy = 1; cy < CELLS_H; cy++) {
    let start = -1;
    for (let cx = 0; cx <= CELLS_W; cx++) {
      const i = cellIndex(cx, cy);
      const hung = cx < CELLS_W && map.type[i] === CellType.OUT && standing(i - CELLS_W) && !standing(i);
      if (hung && start < 0) start = cx;
      else if (!hung && start >= 0) {
        runs.push({ y: cy, x0: start, x1: cx });
        start = -1;
      }
    }
  }
  return runs;
}

/** A thin black outline, one art pixel wide like the buildings', round the
 * standing wall: on every side of the stone at `at` with no standing
 * neighbour, carried down the sides and along the foot of its hanging face. */
function paintWallOutline(
  { c, px }: Paint,
  { x, y, w, h }: { x: number; y: number; w: number; h: number },
  standing: (dx: number, dy: number) => boolean,
  face: boolean,
) {
  const o = Math.max(1, Math.round(px / ART));
  const foot = face ? y + h + Math.round(px * FACE_HANG) : y + h;
  // A neighbour's face carries this one's on to the side.
  const faced = (dx: number) => standing(dx, 0) && !standing(dx, 1);
  c.fillStyle = "#000";
  if (!standing(0, -1)) c.fillRect(x, y, w, o);
  if (!standing(-1, 0)) c.fillRect(x, y, o, h);
  if (!standing(1, 0)) c.fillRect(x + w - o, y, o, h);
  if (face) {
    if (!faced(-1)) c.fillRect(x, y + h, o, foot - y - h);
    if (!faced(1)) c.fillRect(x + w - o, y + h, o, foot - y - h);
  }
  if (!standing(0, 1)) c.fillRect(x, foot - o, w, o);
  // Where the top meets the hanging face, the same line as the edges.
  if (face) c.fillRect(x, y + h, w, o);
  // Inside corners: where both neighbours stand but the stone between them
  // diagonally doesn't, their edge lines meet only at a point; fill it so
  // the line turns the corner unbroken.
  for (const dx of [-1, 1])
    if (standing(dx, 0) && standing(0, -1) && !standing(dx, -1)) c.fillRect(dx < 0 ? x : x + w - o, y, o, o);
}

/** Shaded sides and a lit top edge wherever the stone at `at` (canvas
 * pixels) has no standing neighbour. */
function paintWallEdges({ c, px }: Paint, at: { x: number; y: number }, standing: (dx: number, dy: number) => boolean) {
  const { x, y } = at;
  const e = Math.max(1, px * 0.12);
  c.fillStyle = "rgba(0,0,0,0.35)";
  if (!standing(1, 0)) c.fillRect(x + px - e, y, e, px);
  if (!standing(-1, 0)) c.fillRect(x, y, e, px);
  c.fillStyle = "rgba(255,255,255,0.1)";
  if (!standing(0, -1)) c.fillRect(x, y, px, e);
}

/** The wall's south face, seen from above at a slant, hung below the stone
 * in column `cx` whose top-left is `at` (canvas pixels). */
function paintWallFace({ c, px, area }: Paint, cx: number, { x, y }: { x: number; y: number }) {
  const e = Math.max(1, px * 0.12);
  const h = px * FACE_HANG;
  const face = wallArt.face;
  if (hasWallArt(area)) drawSprite(c, wallFaceSprite(area, cx), x, y + px, px + 0.5, h);
  else if (drawPixel(c, "city-wall-face", x, y + px, px + 0.5, h)) {
    // Pixel Art's brick face.
  } else if (ready(face)) {
    const sx = FACE.x0 + ((cx * CAP.w) % FACE.span);
    c.drawImage(face, sx, FACE.y, CAP.w, FACE.h, x, y + px, px + 0.5, h);
  } else {
    c.fillStyle = "#3a3a33";
    c.fillRect(x, y + px, px + 0.5, h);
  }
  c.fillStyle = "rgba(0,0,0,0.3)";
  c.fillRect(x, y + px + h - e, px + 0.5, e);
}

/** Lantern brackets on house walls (lit during battles). */
function paintLanternBrackets({ c, px, map, sim }: Paint, lights: readonly Light[]) {
  for (const l of lights) {
    if (l.kind !== "lantern" && l.kind !== "door") continue;
    if (sim && !sim.intact(map.buildings[l.owner])) continue;
    const s = Math.max(2, px * 0.28);
    if (drawPixel(c, "city-lantern", l.x * px - s / 2, l.y * px - s / 2, s)) continue;
    c.fillStyle = "#2b2622";
    c.fillRect(l.x * px - s / 2, l.y * px - s / 2, s, s);
    c.fillStyle = "#8a7045";
    c.fillRect(l.x * px - s / 4, l.y * px - s / 4, s / 2, s / 2);
  }
}

/** Pixel Art's rubble over a fallen building's cells, a heap a cell; false
 * (drawing nothing) while Pixel Art isn't drawn. */
function paintPixelRubble({ c, px }: Paint, b: Building) {
  for (const i of b.cells) {
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    const x = Math.round(cx * px), y = Math.round(cy * px);
    if (!drawPixel(c, "city-rubble", x, y, Math.round((cx + 1) * px) - x, Math.round((cy + 1) * px) - y)) return false;
  }
  return true;
}

/** Pixel Art's lily pads and reeds, on about a third of the pond cells,
 * where the water is open (not under a canopy), as Tower Delve's ponds have
 * them. Nothing while Pixel Art isn't drawn. */
function paintPondPlants({ c, px, map }: Paint) {
  const art = parkArt(map);
  for (let cy = 0; cy < CELLS_H; cy++)
    for (let cx = 0; cx < CELLS_W; cx++) {
      if (map.type[cellIndex(cx, cy)] !== CellType.WATER || hash01(cx, cy, 63) >= 0.35) continue;
      const lx = cx + 0.25 + hash01(cx, cy, 64) * 0.5, ly = cy + 0.25 + hash01(cx, cy, 65) * 0.5;
      if (!openAt(art, Math.floor(lx * ART), Math.floor(ly * ART))) continue;
      const r = Math.max(1.5, px * 0.15);
      if (!drawPixel(c, hash01(cx, cy, 69) < 0.7 ? "pond-lily" : "pond-reeds", Math.round(lx * px - r), Math.round(ly * px - r), Math.round(r * 2))) return;
    }
}
