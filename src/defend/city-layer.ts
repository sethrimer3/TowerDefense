import { UNIT_CONTOUR_ART_PIXELS, WALL_FACE_HANG } from "./art-scale.ts";
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
import { type FenceSection, drawFenceSections } from "./fences.ts";
import { ROAD, keepStage, paintKeepRubble, paintStructureArt, paintStructureRubble } from "./structure-art.ts";
import { houseRubbleSprite, roofSeed, roofSprite } from "./roof-art.ts";
import { ART, openAt, parkArt } from "./park-art.ts";
import { paintBridges } from "./bridge-art.ts";
import { damageStage, drawSprite, maskMode, sprite, spriteCanvas, wallDamagePixels, wallRubblePixels, withMask, type MaskMode } from "./damage-art.ts";
import { mooringPixels } from "./sky-palace-art.ts";
import { GRASS, grassPatch, groundArt } from "./ground-art.ts";
import { heights, paintShadows, shadowMask, type Footprint } from "./shadow-art.ts";
import { TOWER as GATE_TOWER, gatePixels, gateRubblePixels } from "./gate-art.ts";
import { WOOD_GATE, gateArtRect, woodGatePixels, woodGateRubblePixels } from "./wood-gate-art.ts";
import { gateRect, type Side } from "./layout.ts";
import { SPIKE_REACH, bastionPixels, bastionRubblePixels, spikePixels } from "./wall-defense-art.ts";
import { AREAS, areaArtId, type AreaId } from "./areas.ts";
import { hasForest } from "./forest.ts";
import { hasWallArt, wallCapSprite, wallFaceSprite, wallRubbleTones, wallRubbleSource } from "./area-wall-art.ts";
import { drawPixel, drawRoof, pixelKey, type PixelSprite } from "./pixel-sprites.ts";
import { HALL_FACE, angled, faceDepth, liftOf, liftPx, setAngled, woodGateRise } from "./angle-view.ts";
import { orthogonal } from "./outline-corners.ts";
import { KINDS, structureYard } from "./tower-art.ts";

export { faceDepth, liftOf } from "./angle-view.ts";

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
  for (const area of AREAS) if (areaArtId(area.id) !== "moss") themedFloors.set(area.id, [1, 2, 3, 4].map(i => loadImage(`areas/${areaArtId(area.id)}/floor-${i}`)));
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
export const FACE_HANG = WALL_FACE_HANG;

/** Legacy Walls: the stone wall's brick south face hung below the stones
 * (the old slanted look). Off, the default, walls are drawn top-down only:
 * cap stones and their outline, no face. Presentation only. */
let legacyWalls = false;
/** Whether walls hang their brick south face: Legacy Walls, or Angle view. */
export const wallFaces = () => legacyWalls || angleView;
export function setLegacyWalls(on: boolean) {
  if (on === legacyWalls) return;
  legacyWalls = on;
  artListeners.forEach((f) => f());
}

/** Angle view: the castle seen from the south at a slant, as most scenery
 * is. The walls hang their brick faces (as Legacy Walls) and every standing
 * building inside them (houses, the keep, towers, halls, Realm pieces,
 * gates and bastions) hangs its own south face below its roof
 * (`paintFace`), and they are painted from the back row forward so each
 * covers the faces behind it. Off, the default, the city is drawn straight
 * down. Presentation only: lots, contact and selection are unchanged. */
let angleView = false;
export { angled };
export function setAngleView(on: boolean) {
  if (on === angleView) return;
  angleView = on;
  setAngled(on);
  artListeners.forEach((f) => f());
}

const RUBBLE = "#4a443d";
const WALL = "#8e897c";

/** What the city layer is painted from. `px` is canvas pixels per cell. */
export type CityScene = {
  /** Moving sunlight is composited separately from the cached buildings. */
  omitSunShadows?: boolean;
  area?: AreaId;
  map: CityMap;
  /** The battle, if one is on: buildings it knocked down show as rubble. */
  sim: DefendSim | null;
  lights: readonly Light[];
  stones: readonly Stone[];
  /** Each structure's path by its uid, for the paths with their own look. */
  looks?: Readonly<Record<number, string>>;
  /** Cells (x1/y1 exclusive) the caller has clipped the canvas to: what
   * can't reach them is skipped, so a small repaint is cheap. */
  within?: Within;
  /** Buildings left out, by id: an edit's pieces still falling into place
   * (`arrival.ts`). */
  omit?: ReadonlySet<number>;
};

/** A box of cells the repaint is clipped to. */
export type Within = { x0: number; y0: number; x1: number; y1: number };
/** How far past its cells anything painted for one can reach (sprites'
 * outlines and padding, a wall's hanging face). */
const REACH = 2;
/** Whether cells `x`..`x + w`, `y`..`y + h` may paint inside `within`. */
function reaches(within: Within | undefined, x: number, y: number, w = 1, h = 1) {
  return !within || (x + w + REACH > within.x0 && x - REACH < within.x1 && y + h + REACH > within.y0 && y - REACH < within.y1);
}

/** Everything the painters share for one repaint. */
type Paint = {
  within?: Within;
  area: AreaId;
  c: CanvasRenderingContext2D;
  px: number;
  map: CityMap;
  sim: DefendSim | null;
  /** The cell holds a standing building or wall stone. */
  solid: (i: number) => boolean;
  looks?: Readonly<Record<number, string>>;
  omit?: ReadonlySet<number>;
  /** Leave Angle view's south faces off (what they are cut from). */
  flat?: true;
};

/** Paints the whole city onto `c` (sized by the caller) at `px` per cell. */
export function paintCityLayer(c: CanvasRenderingContext2D, px: number, scene: CityScene) {
  const { map, sim } = scene;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  const p: Paint = { c, px, map, sim, solid, area: scene.area ?? "moss", looks: scene.looks, within: scene.within, omit: scene.omit };
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
  const omit = scene.omit;
  const near = (b: Building) => reaches(p.within, b.rect.x, b.rect.y, b.rect.w, b.rect.h) && !omit?.has(b.id);
  if (angleView) {
    // From the back row forward: whatever stands nearer covers the faces
    // hanging from the roofs and wall stones behind it.
    paintFences(c, px, map, sim);
    for (const b of frontOrder(map)) if (near(b)) paintBuilding(p, b);
  } else {
    for (const b of map.buildings) if (b.kind === "wall" && near(b)) paintBuilding(p, b);
    paintFences(c, px, map, sim);
    for (const b of map.buildings) if (b.kind !== "wall" && near(b)) paintBuilding(p, b);
  }
  if (!scene.omitSunShadows) paintShadows(c, cityShadows(map, sim, scene.looks), px);
  paintLanternBrackets(p, scene.lights);
}

/** A mask of what stands in the city, at `px` per cell: with "body", the
 * standing buildings' and wall stones' solid art, which the torchlight
 * leaves dark (a flame lights the street, never the roofs); with "rim",
 * their outlines alone, which the torchlight catches. Drawn white, read by
 * its alpha (`lighting.ts`). */
export function paintBuildingMask(c: CanvasRenderingContext2D, px: number, scene: CityScene, mode: MaskMode) {
  const { map, sim } = scene;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  const p: Paint = { c, px, map, sim, solid, area: scene.area ?? "moss", looks: scene.looks, within: scene.within };
  c.imageSmoothingEnabled = false;
  withMask(mode, () => {
    for (const b of angleView ? frontOrder(map) : map.buildings) {
      if (!reaches(p.within, b.rect.x, b.rect.y, b.rect.w, b.rect.h)) continue;
      if (b.hidden || b.fence || (sim && !sim.intact(b)) || !b.cells.length || !solid(b.cells[0])) continue;
      paintBuilding(p, b);
    }
  });
  // Drawn art in any colour: the mask is its coverage.
  c.globalCompositeOperation = "source-in";
  c.fillStyle = "#fff";
  c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  c.globalCompositeOperation = "source-over";
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
export function spriteFootprint(map: CityMap, b: Building, look: string | undefined): Footprint | null {
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
    // Flat: the shadows fall from the lot, wherever Angle view draws the sprite.
    paintStanding(c, ART, map, b, "moss", look === undefined || b.structureUid === undefined ? undefined : { [b.structureUid]: look }, true);
    const data = c.getImageData(0, 0, w, h).data, mask = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) mask[k] = data[k * 4 + 3] >= 128 ? 1 : 0;
    // An open yard casts nothing: only its hall stands.
    const yard = b.structureUid === undefined || b.kind === "keep" ? 0 : structureYard(b.kind, r.w, r.h, look ?? "");
    if (yard) mask.fill(0, 0, (ART + yard) * w);
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
      // Whole pixels, each tile ending where the next begins.
      const x = Math.round(tx * T),
        y = Math.round(ty * T);
      paintFloorTile(c, area, tx, ty, x, y, Math.round((tx + 1) * T) - x, Math.round((ty + 1) * T) - y);
    }
  if (area === "nadir") {
    c.fillStyle = "rgba(26,2,6,0.55)";
    c.fillRect(0, 0, width, height);
  }
}

/** Board tile (tx, ty)'s flagstones in `area` (any tile, on the board or
 * off it), into the box at (x, y), `w` × `h` canvas pixels; the wilds
 * (`wilds.ts`) carry the floor on past the board with it. Nadir's tint is
 * the caller's. */
export function paintFloorTile(c: CanvasRenderingContext2D, area: AreaId, tx: number, ty: number, x: number, y: number, w: number, h: number) {
  const moss = areaArtId(area) === "moss", k = hash(tx, ty, 3) % 4;
  const img = moss ? floorImages[k] : themedFloors.get(area)?.[k];
  // Pixel Art's mossy flagstones stand in for Mossbound Ruins' own.
  if (moss && drawPixel(c, `floor-${k + 1}` as PixelSprite, x, y, w, h)) return;
  if (ready(img)) {
    const { x: sx, y: sy } = moss ? FLOOR_CROP[k] : { x: 0, y: 0 };
    const size = moss ? FLOOR_SIZE : img.naturalWidth;
    c.drawImage(img, sx, sy, size, size, x, y, w, h);
  } else {
    c.fillStyle = AREAS.find(a => a.id === area)!.dark;
    c.fillRect(x, y, w, h);
  }
}

/** How many of the floor images have loaded (the bump map waits for all). */
export const floorArtLoaded = (area: AreaId = "moss") => (areaArtId(area) === "moss" ? floorImages : themedFloors.get(area) ?? []).filter(ready).length;

/** City ground: park grass, and gravel under the streets' dirt and for
 * cleared rubble and breached wall. */
function paintCityGround(p: Paint) {
  const { map, solid, within: w } = p;
  const x0 = w ? Math.max(0, w.x0 - REACH) : 0, x1 = w ? Math.min(CELLS_W, w.x1 + REACH) : CELLS_W;
  const y0 = w ? Math.max(0, w.y0 - REACH) : 0, y1 = w ? Math.min(CELLS_H, w.y1 + REACH) : CELLS_H;
  for (let cy = y0; cy < y1; cy++)
    for (let cx = x0; cx < x1; cx++) {
      const i = cellIndex(cx, cy);
      const t = map.type[i];
      // A structure placed outside the city stands on the open floor, and
      // so does a wooden fence, not on a stone wall's footing (in the
      // forest, its grass grows under it: `paintFences`).
      if (t === CellType.OUT || (t === CellType.STRUCT && !map.city[i]) || map.buildings[map.owner[i]]?.fence) continue;
      if (t === CellType.PARK || t === CellType.WATER) paintGrass(p, cx, cy);
      // A wall stone still falling into place (`omit`) leaves its street bare.
      // In Angle view a gate's passage, drawn lifted, leaves its street showing below.
      else if (t !== CellType.WALL || !solid(i) || map.buildings[map.owner[i]]?.woodGate || p.omit?.has(map.owner[i]) || (angleView && map.buildings[map.owner[i]]?.kind === "gate")) paintGravel(p, cx, cy);
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
function paintRoadStones({ c, px, within }: Paint, stones: readonly Stone[]) {
  for (const st of stones) {
    if (!reaches(within, Math.floor(st.x), Math.floor(st.y))) continue;
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

/** Building `b` as it stands or lies, lifted in Angle view while it stands
 * (`liftOf`), unless `p.flat`. */
function paintBuilding(p: Paint, b: Building) {
  if (b.hidden) return;
  const up = p.flat || !standsLifted(p, b) ? 0 : liftPx(b, p.px);
  if (!up) return paintBuildingAt(p, b);
  const c = p.c, yard = yardOf(p, b);
  if (yard) {
    // A yarded hall: its yard lies on the ground, only the hall rises, over
    // the yard's far end (`structurePixels`' drop).
    const cut = (b.rect.y + yard / ART) * p.px, big = 1e6;
    c.save();
    c.beginPath();
    c.rect(-big, -big, 2 * big, big + cut);
    c.clip();
    paintBuildingAt(p, b);
    c.restore();
    c.save();
    c.translate(0, -up);
    c.beginPath();
    c.rect(-big, cut - p.px / ART, 2 * big, big);
    c.clip();
    paintBuildingAt(p, b);
    c.restore();
    return;
  }
  c.save();
  c.translate(0, -up);
  paintBuildingAt(p, b);
  c.restore();
}

/** The art rows of open yard atop structure `b`'s lot as Angle view draws
 * it (`structureYard`), 0 for anything else. */
function yardOf(p: Paint, b: Building) {
  if (b.structureUid === undefined || b.kind === "keep") return 0;
  return structureYard(b.kind, b.rect.w, b.rect.h, p.looks?.[b.structureUid] ?? "", HALL_FACE);
}

/** Whether `b` stands (a wall stone, or a building not fallen or aloft). */
function standsLifted(p: Paint, b: Building) {
  if (b.kind === "wall") return !b.fence && b.cells.length > 0 && p.solid(b.cells[0]);
  return (!p.sim || p.sim.intact(b)) && !aloft(p, b);
}

function paintBuildingAt(p: Paint, b: Building) {
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
  // The keep at full size has its own slanted art (`keep-angle-art.ts`).
  // So have the placed structures (`structurePixels`' depth).
  const ownAngle = (b.kind === "keep" && r.w >= 3) || (KINDS as readonly string[]).includes(b.kind);
  if (angleView && !p.flat && !ownAngle && !b.woodGate && (!sim || sim.intact(b)) && !aloft(p, b)) paintFace(p, b);
  if (b.kind === "gate") {
    const side = b.gate!.side, a = gateArtRect(b);
    const ax = Math.round(a.x * px), ay = Math.round(a.y * px);
    const art = { x: ax, y: ay, w: Math.round((a.x + a.w) * px) - ax, h: Math.round((a.y + a.h) * px) - ay, px };
    if (sim && !sim.intact(b)) {
      paintArt(p, b.woodGate ? woodGateRubbleSprite(side, lotSeed(b)) : gateRubbleSprite(side, lotSeed(b)), art);
      return paintRebuilding(p, b);
    }
    // Seen at a slant, a wooden gate's art stands taller, its faces hung
    // below its posts and leaves (`woodGatePixels`' rise).
    if (b.woodGate) art.y -= woodGateLift(b, px);
    return paintArt(p, gateSpriteOf(b, b.woodGate && sim ? -1 : 0, stageOf(sim, b)), b.woodGate ? { ...art, h: art.h + woodGateLift(b, px) } : art);
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
    return paintArt(p, sprite(`mooring:${r.w}x${r.h}:${lotSeed(b)}`, r.w * ART, r.h * ART, () => mooringPixels(r.w, r.h, lotSeed(b)), false), box);
  }
  // Pixel Art's roofs on undamaged houses; a damaged one keeps its own, showing the damage.
  if (b.kind === "house" && !stageOf(sim, b) && drawRoof(c, b.variant, box, px)) return;
  // Angle view's roofs lean toward the viewer, a gable end in the house's own wall.
  if (b.kind === "house") return paintArt(p, roofSprite(r.w, r.h, b.variant, roofSeed(r.x, r.y, r.w, r.h), stageOf(sim, b), angleView && !p.flat ? houseGable(r) : undefined), box);
  paintStructureArt(c, b.kind, box, stageOf(sim, b), lotSeed(b), b.structureUid !== undefined ? p.looks?.[b.structureUid] : undefined, angleView && !p.flat);
}

/** Paints building `b` whole and undamaged onto `c` at `px` per cell (a
 * magic boat's water drawing it down as it sinks, the shimmer reading its
 * shape), in `looks`' path look. */
export function paintStanding(c: CanvasRenderingContext2D, px: number, map: CityMap, b: Building, area: AreaId = "moss", looks?: Readonly<Record<number, string>>, flat = false) {
  paintBuilding({ c, px, map, sim: null, solid: () => true, area, looks, ...(flat ? { flat: true as const } : {}) }, b);
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

/** How building `b` shows in the city layer: its damage stage while it
 * stands, else how many of its cells are rebuilt (`-1 - built`), since
 * finished sections show as timber over the rubble. */
export function buildingState(sim: DefendSim, b: Building) {
  return sim.intact(b) ? stageOf(sim, b) : -1 - sim.built[b.id];
}

/** A number that changes whenever anything the city layer shows of the
 * battle does: a building's damage stage, its fall or a rebuilt section,
 * its kind or lot. Unlike `mapVersion` it ignores what the layer doesn't
 * draw, so the renderer repaints only for what it would see. */
export function damageKey(sim: DefendSim) {
  let k = 0;
  for (const b of sim.map.buildings) k = (Math.imul(k, 31) + buildingState(sim, b) * 7 + shapeOf(b)) | 0;
  return k;
}

/** A number for a building's kind and lot. */
export function shapeOf(b: Building) {
  let h = kindCodes.get(b.kind);
  if (h === undefined) {
    h = 0;
    for (let i = 0; i < b.kind.length; i++) h = (Math.imul(h, 31) + b.kind.charCodeAt(i)) | 0;
    kindCodes.set(b.kind, h);
  }
  const r = b.rect;
  return (Math.imul((Math.imul((Math.imul(r.x, 211) + r.y) | 0, 211) + r.w) | 0, 211) + r.h + Math.imul(h, 0x9e3779b1)) | 0;
}
const kindCodes = new Map<string, number>();

/** A number that changes whenever a building falls, rises or changes kind
 * or lot: what the sun's shadows are cast from. */
export function standingKey(sim: DefendSim) {
  let k = 0;
  for (const b of sim.map.buildings) k = (Math.imul(k, 31) + (sim.intact(b) ? 1 : 0) + shapeOf(b)) | 0;
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
function paintSpikes(p: Paint, outside = false) {
  // In Angle view the stakes rise with the stones they line.
  const up = angleView ? Math.round(p.px * FACE_HANG) : 0;
  if (!up) return paintSpikeRows(p, outside);
  p.c.save();
  p.c.translate(0, -up);
  paintSpikeRows(p, outside);
  p.c.restore();
}
function paintSpikeRows({ c, px, map, solid }: Paint, outside: boolean) {
  for (const row of map.spikes ?? []) {
    const [dx, dy] = SPIKE_OUT[row.side];
    for (const i of row.cells) {
      if (!solid(i)) continue;
      const cx = i % CELLS_W, cy = (i - cx) / CELLS_W;
      const hung = wallFaces() && row.side === "s" && cy + 1 < CELLS_H && !solid(i + CELLS_W);
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
      drawSprite(c, sprite(`spikes:${row.side}:${hash(cx, cy, 31) % 8}`, ART, ART, () => spikePixels(row.side, hash(cx, cy, 31) % 8), {joins:row.side==="n"||row.side==="s"?["w","e"]:["n","s"]}), x, y, w, h);
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
  const across = side === "e" || side === "w", u = WOOD_GATE.long * ART, v = WOOD_GATE.deep * ART, rise = woodGateRise();
  return sprite(`woodGate:${side}:${frame}:${stage}:${seed}:${rise}`, across ? v : u, (across ? u : v) + rise, () => woodGatePixels(side, frame, stage, seed, rise));
};
/** How far up a wooden gate's art is drawn in Angle view, in whole pixels
 * at `px` a cell: the rows its faces add below. */
export const woodGateLift = (b: Building, px: number) => (b.woodGate ? Math.round((woodGateRise() * px) / ART) : 0);
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
  return sprite(`wall:rubble:${tones ? area : "moss"}:${seed}`, ART, ART, () => wallRubbleSource(area, seed));
};
const wallDamageSprite = (stage: number, seed: number) => sprite(`wall:${stage}:${seed}`, ART, ART, () => wallDamagePixels(stage, seed, ART), false);

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
  const w = Math.round((cx + 1) * px) - x, h = Math.round((cy + 1) * px) - y;
  const face = wallFaces() && !standing(0, 1) && cy + 1 < CELLS_H;
  // A mask (`paintBuildingMask`): the stone and its face, or its outline alone.
  const mode = maskMode();
  if (mode) {
    c.fillStyle = "#fff";
    if (mode === "body") c.fillRect(x, y, w, face ? h + Math.round(px * FACE_HANG) : h);
    else paintWallOutline(p, { x, y, w, h }, standing, face);
    return;
  }
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
  if (face) paintWallFace(p, cx, { x, y });
  paintWallOutline(p, { x, y, w: Math.round((cx + 1) * px) - x, h: Math.round((cy + 1) * px) - y }, standing, face);
}

/** The open ground cells (outside the city) a standing wall stone's brick
 * face hangs over, in runs along each row: `y` the row, `x0` to `x1`
 * (exclusive) the cells. Whatever is drawn on that ground after the city
 * layer (the forest's floor) must leave the face showing. */
export function hangingFaces(map: CityMap, sim: DefendSim | null): { y: number; x0: number; x1: number }[] {
  if (!wallFaces()) return [];
  const standing = (i: number) => map.wall[i] === 1 && !map.buildings[map.owner[i]]?.fence && (sim ? sim.solid[i] === 1 : map.owner[i] >= 0);
  const runs: { y: number; x0: number; x1: number }[] = [];
  // Angle view lifts the stones instead: their faces end where they stand.
  if (angleView) return [];
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

/** A one-art-pixel black contour inside the painted box of the
 * standing wall: on every side of the stone at `at` with no standing
 * neighbour, carried down the sides and along the foot of its hanging face. */
function paintWallOutline(
  { c, px }: Paint,
  { x, y, w, h }: { x: number; y: number; w: number; h: number },
  standing: (dx: number, dy: number) => boolean,
  face: boolean,
) {
  const o = Math.max(1, Math.round(px / ART));
  const foot = face ? y + h + px * FACE_HANG : y + h;
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
function paintLanternBrackets({ c, px, map, sim, within }: Paint, lights: readonly Light[]) {
  for (const l of lights) {
    if (!reaches(within, Math.floor(l.x), Math.floor(l.y))) continue;
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

/** The city's buildings and wall stones from the back row forward (by
 * where each lot ends, then its top), for Angle view. */
let ordered: { map: CityMap; list: Building[] } | null = null;
function frontOrder(map: CityMap): readonly Building[] {
  if (ordered?.map !== map || ordered.list.length !== map.buildings.length) {
    const list = [...map.buildings].sort((a, b) => a.rect.y + a.rect.h - (b.rect.y + b.rect.h) || a.rect.y - b.rect.y || a.id - b.id);
    ordered = { map, list };
  }
  return ordered.list;
}

/** Cells of room round a lot that a building's art and its face are cut in. */
const FACE_PAD = 2;

/** Building `b`'s south face hung below its roof (Angle view), drawn before
 * the roof so the roof's own outline stays on top. */
function paintFace(p: Paint, b: Building) {
  const cv = faceSprite(p, b);
  if (!cv) return;
  const r = b.rect, px = p.px;
  const x0 = Math.round((r.x - FACE_PAD) * px), y0 = Math.round((r.y - FACE_PAD) * px);
  drawSprite(p.c, cv, x0, y0, Math.round((r.x + r.w + FACE_PAD) * px) - x0, Math.round((r.y + r.h + FACE_PAD) * px) - y0);
}

const faces = new Map<string, HTMLCanvasElement | null>();
/** Plaster for houses' walls, timber for their posts and beams, and the dark
 * of a door, a window or an arrow loop, as [r, g, b]. */
const PLASTER = [190, 172, 136], TIMBER = [74, 52, 34], OPENING = [30, 23, 18], DOOR = [92, 58, 32];
/** The neutral masonry every other face is mixed toward. */
const MASONRY = [128, 120, 106];

/** The face of building `b` as it stands whole, cut from its own art at
 * `ART` pixels a cell (`FACE_PAD` cells of room round the lot): each column
 * of the roof hangs a wall `faceDepth` art pixels deep from its lowest pixel,
 * in shade (the sun is to the upper left), coloured from the roof's edge
 * mixed toward masonry (houses in plaster and timber), coursed, with arrow
 * loops, windows and a door. The outline is drawn round it like any
 * sprite's, so its top edge is the roof's own lower outline. */
function faceSprite(p: Paint, b: Building): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const r = b.rect, look = b.structureUid !== undefined ? p.looks?.[b.structureUid] : undefined;
  const key = `${b.kind}:${r.x},${r.y},${r.w}x${r.h}:${b.variant}:${b.gate?.side ?? ""}:${b.woodGate ? 1 : 0}:${look ?? ""}:${p.area}:${pixelKey()}:${+orthogonal("buildings")}`;
  let cv = faces.get(key);
  if (cv !== undefined) return cv;
  const W = (r.w + 2 * FACE_PAD) * ART, H = (r.h + 2 * FACE_PAD) * ART;
  const art = document.createElement("canvas");
  art.width = W;
  art.height = H;
  const c = art.getContext("2d", { willReadFrequently: true })!;
  c.imageSmoothingEnabled = false;
  c.translate((FACE_PAD - r.x) * ART, (FACE_PAD - r.y) * ART);
  // The bodies alone, without their outlines: the face's outline is its own.
  withMask("body", () => paintBuilding({ c, px: ART, map: p.map, sim: null, solid: () => true, area: p.area, looks: p.looks, flat: true }, b));
  const src = c.getImageData(0, 0, W, H).data;
  // A gate in a wall running east-west shows its two towers' faces, the
  // passage between them open to the street.
  let columns: ((x: number) => boolean) | undefined;
  if (b.gate && (b.gate.side === "n" || b.gate.side === "s")) {
    const a = gateArtRect(b), x0 = (a.x - r.x + FACE_PAD) * ART, x1 = x0 + a.w * ART;
    columns = (x) => x < x0 + GATE_TOWER || x >= x1 - GATE_TOWER;
  }
  const out = facePixels(src, W, H, faceDepth(b), b.kind === "house" ? "house" : b.kind === "keep" ? "keep" : b.kind.endsWith("Tower") ? "tower" : b.kind === "gate" || b.kind === "wallBallista" ? "wall" : "hall", hash(r.x, r.y, 419), columns);
  cv = out ? spriteCanvas(out, W, H) : null;
  if (faces.size > 2000) faces.clear();
  faces.set(key, cv);
  return cv;
}

export type FaceStyle = "house" | "keep" | "tower" | "hall" | "wall";

/** A south face for the art `src` (RGBA bytes, `w` × `h`): `depth` art
 * pixels from the lowest pixel of each column down (only of the `columns`
 * kept, where given), the topmost of them left for the roof's outline. Null
 * when the art is empty. Pure. */
export function facePixels(src: Uint8ClampedArray, w: number, h: number, depth: number, style: FaceStyle, seed: number, columns?: (x: number) => boolean): Uint32Array | null {
  const foot = new Int32Array(w).fill(-1);
  for (let x = 0; x < w; x++) {
    if (columns && !columns(x)) continue;
    for (let y = h - 1; y >= 0; y--)
      if (src[(y * w + x) * 4 + 3] >= 128) {
        foot[x] = y;
        break;
      }
  }
  if (!foot.some((y) => y >= 0)) return null;
  const out = new Uint32Array(w * h);
  const put = (x: number, y: number, [R, G, B]: readonly number[], f: number) => {
    if (y < 0 || y >= h) return;
    const k = (n: number) => Math.max(0, Math.min(255, Math.round(n * f)));
    out[y * w + x] = (255 << 24 | k(B) << 16 | k(G) << 8 | k(R)) >>> 0;
  };
  const house = houseLook(seed);
  // Runs of neighbouring columns whose roofs end level (within a pixel):
  // each one wall, with its openings spaced along it.
  for (let x0 = 0; x0 < w; ) {
    if (foot[x0] < 0) { x0++; continue; }
    let x1 = x0 + 1;
    while (x1 < w && foot[x1] >= 0 && Math.abs(foot[x1] - foot[x1 - 1]) <= 1) x1++;
    const len = x1 - x0, mid = x0 + Math.floor(len / 2);
    for (let x = x0; x < x1; x++) {
      const at = (foot[x] * w + x) * 4, edge = [src[at], src[at + 1], src[at + 2]];
      const top = foot[x] + 2, rows = depth - 1, i = x - x0;
      const base = style === "house" ? house.wall : mix(edge, MASONRY, style === "wall" ? 0.25 : 0.45);
      for (let k = 0; k < rows; k++) {
        const y = top + k;
        // The sun grazes the face from the left, and the eaves shade its top.
        let f = (style === "house" ? 0.74 : 0.64) + (len > 2 ? 0.08 * (1 - i / (len - 1)) : 0);
        if (k === 0) f *= 0.72;
        f *= 0.96 + 0.08 * hash01(x, y, seed);
        let color: readonly number[] = base;
        if (style === "house") {
          const [c2, f2] = houseWall(house, i, k, len, rows, x, y, seed);
          color = c2;
          if (f2 !== null) f = f2;
          else if (k === 0) f *= house.framed ? 1 : 0.9;
        } else {
          const course = Math.floor((k - 1) / 3);
          if (k > 0 && (k - 1) % 3 === 2) f *= 0.84;
          else if (k > 0 && ((x + (course & 1) * 2) & 3) === 0) f *= 0.88;
          const slit = style !== "wall" && len >= 5 && k >= 1 && k <= 2 && i >= 2 && i <= len - 3 && (i - 2) % 4 === 0;
          const door = (style === "keep" || style === "hall") && len >= 9 && Math.abs(x - mid + 0.5) <= (style === "keep" ? 2 : 1) && k >= rows - (style === "keep" ? 5 : 3);
          if (door) {
            color = k === rows - (style === "keep" ? 5 : 3) ? OPENING : DOOR;
            f = 1;
          } else if (slit && Math.abs(x - mid) > 2) {
            color = OPENING;
            f = 1;
          }
        }
        put(x, y, color, color === OPENING ? 1 : f);
      }
    }
    x0 = x1;
  }
  return out;
}

const mix = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

type Rgb = readonly number[];
/** What a house's south wall is built of and how it is laid out, seeded by
 * its lot so neighbours differ: plaster in one of several washes (framed
 * in timber, some braced), rough stone, brick or boards; its door's place,
 * colour and height; its windows' spacing, height and shutters; a stone
 * plinth, flower boxes. */
type HouseLook = {
  material: "plaster" | "stone" | "brick" | "boards";
  wall: Rgb;
  framed: boolean;
  braced: boolean;
  posts: number;
  door: Rgb;
  doorAt: number;
  doorTall: number;
  windows: number;
  windowOff: number;
  windowTall: boolean;
  shutters: Rgb | null;
  plinth: boolean;
  flowers: boolean;
};
const WASHES: readonly Rgb[] = [PLASTER, [214, 204, 180], [196, 160, 112], [200, 168, 150], [176, 168, 140]];
const STONE_WALL: Rgb = [138, 130, 116], BRICK: Rgb = [148, 78, 54], BOARDS: Rgb = [118, 84, 54];
const DOORS: readonly Rgb[] = [DOOR, [60, 82, 52], [58, 70, 98], [112, 44, 36], [70, 48, 30]];
const SHUTTERS: readonly Rgb[] = [[66, 92, 60], [62, 78, 110], [128, 52, 40], [96, 70, 44]];
const FLOWERS: readonly Rgb[] = [[200, 60, 60], [230, 190, 80], [190, 110, 200]];

/** The colour of the gable end of the house on lot `r` in Angle view: its walls'. */
function houseGable(r: { x: number; y: number }) {
  const w = houseLook(hash(r.x, r.y, 419)).wall;
  return (Math.round(w[0]) << 16) | (Math.round(w[1]) << 8) | Math.round(w[2]);
}

export function houseLook(seed: number): HouseLook {
  const h = (n: number) => hash(seed, n, 421);
  const kind = h(1) % 10;
  const material = kind < 5 ? "plaster" : kind < 7 ? "stone" : kind < 9 ? "brick" : "boards";
  const plaster = material === "plaster";
  return {
    material,
    wall: plaster ? WASHES[h(2) % WASHES.length] : material === "stone" ? STONE_WALL : material === "brick" ? BRICK : BOARDS,
    framed: plaster && h(3) % 3 !== 0,
    braced: plaster && h(4) % 2 === 0,
    posts: 4 + (h(5) % 3),
    door: DOORS[h(6) % DOORS.length],
    doorAt: [0.5, 0.3, 0.7, 0.2, 0.8][h(7) % 5],
    doorTall: 2 + (h(8) % 2),
    windows: 3 + (h(9) % 3),
    windowOff: h(10) % 3,
    windowTall: h(11) % 3 === 0,
    shutters: h(12) % 3 === 0 ? SHUTTERS[h(13) % SHUTTERS.length] : null,
    plinth: material !== "stone" && h(14) % 3 === 0,
    flowers: h(15) % 4 === 0,
  };
}

/** The colour of a house's wall `i` pixels along a run `len` wide and `k`
 * rows down (of `rows`), and its shading if it overrides the face's (null
 * keeps it). Pure. */
function houseWall(l: HouseLook, i: number, k: number, len: number, rows: number, x: number, y: number, seed: number): [Rgb, number | null] {
  const doorX = Math.max(1, Math.min(len - 2, Math.round((len - 1) * l.doorAt)));
  const door = len >= 5 && i === doorX && k >= rows - l.doorTall;
  const edge = i === 0 || i === len - 1;
  const post = l.framed && (edge || (len > l.posts + 2 && i % l.posts === 0));
  // Windows between the posts, clear of the door and the corners.
  const winCol = i >= 2 && i <= len - 3 && Math.abs(i - doorX) > 1 && (i + l.windowOff) % l.windows === 0 && !post;
  const winRow = k === 1 || (l.windowTall && k === 2 && rows > 3);
  if (door) return [k === rows - l.doorTall ? mix(l.door, OPENING, 0.5) : l.door, 1];
  if (k === 0) return [l.framed || l.material === "boards" ? TIMBER : mix(l.wall, OPENING, 0.35), null];
  if (winCol && winRow) return [OPENING, 1];
  if (l.shutters && winRow && !post && (i >= 1 && i <= len - 2) && Math.abs(i - doorX) > 0) {
    const nextTo = (j: number) => j >= 2 && j <= len - 3 && Math.abs(j - doorX) > 1 && (j + l.windowOff) % l.windows === 0;
    if ((nextTo(i - 1) || nextTo(i + 1)) && !(l.framed && (i % l.posts === 0))) return [l.shutters, 0.9];
  }
  if (l.flowers && winCol && k === (l.windowTall ? 3 : 2) && k < rows) return [FLOWERS[hash(seed, i, 422) % FLOWERS.length], 1];
  if (post) return [TIMBER, null];
  if (l.plinth && k === rows - 1) return [STONE_WALL, 0.7];
  if (l.braced && l.framed) {
    // A diagonal brace in each panel, alternating its slant.
    const panel = Math.floor(i / l.posts), j = i % l.posts;
    if (j > 0 && (panel % 2 ? l.posts - j : j) === k) return [TIMBER, null];
  }
  if (l.material === "stone") {
    // Rough coursed rubble: stones of two tones, dark joints between.
    const course = Math.floor((k - 1) / 2), joint = (k - 1) % 2 === 1 && hash(x, y, seed) % 3 !== 0;
    if (joint || (x + course * 3 + (hash(course, seed) % 3)) % 4 === 0) return [mix(STONE_WALL, OPENING, 0.4), null];
    return [hash(x >> 1, y, seed) % 3 === 0 ? mix(STONE_WALL, [190, 182, 166], 0.4) : STONE_WALL, null];
  }
  if (l.material === "brick") {
    if ((x + (k & 1) * 2) % 4 === 0) return [mix(BRICK, [190, 180, 160], 0.45), null];
    return [hash(x >> 2, y, seed) % 4 === 0 ? mix(BRICK, [90, 40, 30], 0.3) : BRICK, null];
  }
  if (l.material === "boards") return [(x + (hash(x, seed) % 2)) % 3 === 0 ? mix(BOARDS, OPENING, 0.4) : BOARDS, null];
  return [l.wall, null];
}

/** Angle view: the wall stones and buildings whose lifted art (`liftOf`)
 * reaches out over the open ground or a wooden fence (or, given `rails`,
 * over any of them: the parks' fences, drawn after), painted again (at `px` a cell) over
 * whatever covered that ground after the city layer (the forest's floor and
 * grass, the dunes), back row first. */
export function paintOpenLifts(c: CanvasRenderingContext2D, px: number, map: CityMap, sim: DefendSim | null, area: AreaId, looks?: Readonly<Record<number, string>>, omit?: ReadonlySet<number>, rails?: readonly FenceSection[]) {
  if (!angleView) return;
  const solid = (i: number) => (sim ? sim.solid[i] === 1 : map.owner[i] >= 0 && map.type[i] !== CellType.ROAD);
  const p: Paint = { c, px, map, sim, solid, area, looks };
  // Wooden fences are painted over the city layer too (`paintFences`,
  // before this), so a lift reaching over a fence's cells is painted again.
  const fenced = new Set<number>();
  for (const b of map.buildings) if (b.fence && !b.hidden) for (const i of b.cells) fenced.add(i);
  const open = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (!cellInBounds(x, y)) continue;
        const i = cellIndex(x, y);
        if (map.type[i] === CellType.OUT || fenced.has(i)) return true;
      }
    return false;
  };
  c.imageSmoothingEnabled = false;
  for (const b of frontOrder(map)) {
    if (b.hidden || b.fence || b.woodGate || omit?.has(b.id) || !standsLifted(p, b)) continue;
    const r = b.rect, up = Math.ceil(liftOf(b));
    if (rails) {
      // Only the buildings whose lift rises over one of `rails` (parks' fences).
      if (rails.some((f) => Math.max(f.x1, f.x2) > r.x && Math.min(f.x1, f.x2) < r.x + r.w && Math.max(f.y1, f.y2) >= r.y - liftOf(b) && Math.min(f.y1, f.y2) <= r.y)) paintBuilding(p, b);
      continue;
    }
    if (open(r.x - 1, r.y - up, r.x + r.w, r.y - 1) || (b.kind !== "wall" && open(r.x - 1, r.y, r.x + r.w, r.y + r.h))) paintBuilding(p, b);
  }
}
