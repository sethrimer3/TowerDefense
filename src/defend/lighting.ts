/** Torchlight for DEFEND's rainy and night-time battles, built on the main
 * game's candle palette, flicker and sway (see ../lighting.ts and
 * ../torch-light.ts).
 *
 * Each light's pool is baked once into a small field: radial falloff, cut by
 * every standing wall and building between the flame and the sample (that is
 * what makes buildings cast shadows), then softened. A tower's light ignores
 * its own building but is blocked by the four corner pillars holding up its
 * roof, so it throws four long shadows out into the street. Bakes are redone
 * only for lights near cells that fell or were rebuilt.
 *
 * Unit shadows stay cheap enough for hundreds of enemies: while baking, each
 * cell records its brightest light ("dominant light"). A unit's shadow is
 * then just a few small rects stepped away from that one light — no ray
 * casting per unit per frame. */
import { ART, WALL_FACE_HANG } from "./art-scale.ts";
import { torchLevel } from "./city-torches.ts";
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "../lighting.ts";
import { glowColor, lightFalloff } from "../torch-light.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, ORTHO, boardSize, cellInBounds, cellIndex, hash, hash01, type Rect } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { isArcherTower, isCannonTower, isMageHall, isWizardTower } from "./catalog.ts";
import { FIELD_H, FIELD_W, LightField, RES, poolSamples, type PoolSamples } from "./light-field.ts";
import { cellPieces } from "./paint-box.ts";
import { FLAME, artPen, fireTongues } from "./pixel-fx.ts";
import { angled } from "./angle-view.ts";

export type LightKind = "lantern" | "archerTower" | "cannonTower" | "watchTower" | "wizardTower" | "mageGuild" | "door";
export type Light = {
  id: number;
  kind: LightKind;
  /** Flame position in cells. */
  x: number;
  y: number;
  radius: number;
  strength: number;
  /** Building the light belongs to; it goes out while that building is down. */
  owner: number;
  /** The light sits inside its owner, so the owner's cells don't block it. */
  inside: boolean;
  /** Corner pillars that block the light (cells): x, y, radius. */
  pillars: [number, number, number][];
  /** On a north face, behind its building at a slant: Angle view shows
   * its light but not its flame. */
  back?: boolean;
};

const SWAY = LIGHTING_CONFIG.glow.swayOffset;

/** A light's baked pool: its levels, `RES` samples a cell, `cols` × `rows`
 * from cell (`left`, `top`). */
type Bake = { values: Float32Array; cols: number; rows: number; left: number; top: number };
/** A light's two bakes, swayed left and right, and both as field samples. */
type Baked = { pair: [Bake, Bake]; pool: PoolSamples };

/** Where the lights of a city go. Deterministic per map. */
export function cityLights(map: CityMap): Light[] {
  const lights: Light[] = [];
  const add = (l: NewLight) => lights.push({ ...l, id: lights.length });
  for (const b of map.buildings) buildingLights(map, b).forEach(add);
  streetLanterns(map, lights.map((l) => ({ x: l.x, y: l.y }))).forEach(add);
  // Outer wall sconces face open terrain, rather than lighting only streets.
  for (const b of map.buildings) {
    if (b.kind !== "wall" || b.fence || b.hidden || (b.rect.x + b.rect.y) % 6) continue;
    for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const x = b.rect.x + dx, y = b.rect.y + dy;
      if (!cellInBounds(x,y) || map.type[cellIndex(x,y)] !== CellType.OUT) continue;
      // South-facing masonry hangs below its collision cell. Keep its
      // flame beyond that painted face too, so the wall cannot engulf it.
      const reach = .75 + (dy === 1 ? WALL_FACE_HANG : 0);
      const lx = b.rect.x + .5 + dx * reach, ly = b.rect.y + .5 + dy * reach;
      if (lights.some(l => Math.hypot(l.x-lx,l.y-ly) < 3)) continue;
      add({kind:"lantern",x:lx,y:ly,radius:5.5,strength:.9,owner:b.id,inside:false,pillars:[],...(dy === -1 ? {back:true} : {})});
      break;
    }
  }
  return lights;
}

type NewLight = Omit<Light, "id">;

/** Reach of each tower's fire, in cells. */
const TOWER_RADIUS: Partial<Record<Building["kind"], number>> = { archerTower: 7.5, brazierTower: 7.5, hawkTower: 7.5, wispTower: 7.5, cannonTower: 5.5, batteryTower: 5.5, mortarTower: 5.5, minelayerTower: 3, watchTower: 6.5, wizardTower: 5, pyreTower: 5, frostTower: 5, stormTower: 5, sigilTower: 5, mageGuild: 5.5, infernoHall: 5.5, cinderHall: 5.5, stormHall: 5.5 };

/** The troop buildings with a lamp over the door. */
const DOOR_LAMPS = new Set<Building["kind"]>(["meleeGuild", "rangedGuild", "barracks", "chapterHouse", "berserkerLodge", "halberdYard", "heroHall", "shadow", "bloodHall", "veilHouse", "poisonDen", "archerBarracks", "rangerLodge", "skirmishCamp", "skyrangerLodge", "sniperLodge", "musketHall", "gunHall", "gunNest", "gatlingNest", "rocketBattery", "revolutionary", "assassinDen", "spearHall", "phalanx", "javelinCamp", "lancerStable", "valkyriePalace", "darkKeep"]);

/** A building's own lights: a tower's fire (and the Mage Guild's fire
 * well), the keep's braziers, a barracks or palace door lamp. */
function buildingLights(map: CityMap, b: Building): NewLight[] {
  const r = b.rect;
  const radius = TOWER_RADIUS[b.kind];
  if (radius !== undefined) return [towerFire(b, radius)];
  if (b.kind === "keep") return keepBraziers(b);
  if (!DOOR_LAMPS.has(b.kind)) return [];
  const door = doorPoint(map, r);
  return door ? [{ kind: "door", x: door.x, y: door.y, radius: 4.5, strength: 0.85, owner: b.id, inside: false, pillars: [] }] : [];
}

/** A fire inside a tower. An archer tower's roof stands on four corner
 * pillars, which block it. */
function towerFire(b: Building, radius: number): NewLight {
  const r = b.rect;
  const inset = 0.22;
  return {
    kind: (isWizardTower(b.kind) ? "wizardTower" : isArcherTower(b.kind) ? "archerTower" : isCannonTower(b.kind) ? "cannonTower" : isMageHall(b.kind) ? "mageGuild" : b.kind) as LightKind,
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    radius,
    strength: 1,
    owner: b.id,
    inside: true,
    pillars:
      isArcherTower(b.kind)
        ? [
            [r.x + inset, r.y + inset, 0.2],
            [r.x + r.w - inset, r.y + inset, 0.2],
            [r.x + inset, r.y + r.h - inset, 0.2],
            [r.x + r.w - inset, r.y + r.h - inset, 0.2],
          ]
        : [],
  };
}

/** Braziers on the keep's four corners. */
function keepBraziers(b: Building): NewLight[] {
  const r = b.rect;
  return [
    [r.x - 0.3, r.y - 0.3],
    [r.x + r.w + 0.3, r.y - 0.3],
    [r.x - 0.3, r.y + r.h + 0.3],
    [r.x + r.w + 0.3, r.y + r.h + 0.3],
  ].map(([cx, cy], i) => ({ kind: "door" as const, x: cx, y: cy, radius: 4.5, strength: 0.9, owner: b.id, inside: false, pillars: [], ...(i < 2 ? { back: true } : {}) }));
}

/** Street lanterns hung on house walls, spread along the roads (in a
 * hashed order), none within 5.5 cells of another light. */
function streetLanterns(map: CityMap, taken: { x: number; y: number }[]): NewLight[] {
  const out: NewLight[] = [];
  const candidates: { i: number; h: number }[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (map.type[i] === CellType.ROAD) candidates.push({ i, h: hash(i, 77) });
  candidates.sort((a, b) => a.h - b.h);
  for (const { i } of candidates) {
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    const mount = lanternMount(map, cx, cy);
    if (!mount) continue;
    const x = cx + 0.5 + mount[0] * 0.36,
      y = cy + 0.5 + mount[1] * 0.36;
    if (taken.some((t) => (t.x - x) ** 2 + (t.y - y) ** 2 < 5.5 * 5.5)) continue;
    taken.push({ x, y });
    out.push({ kind: "lantern", x, y, radius: 5.6, strength: 0.95, owner: mount[2], inside: false, pillars: [] });
  }
  return out;
}

/** The first house beside road cell (cx, cy) with a wall facing it, east,
 * west or south (a north wall is the roof's edge from above and behind
 * the house at a slant): its direction and id. */
function lanternMount(map: CityMap, cx: number, cy: number): [number, number, number] | null {
  for (const [dx, dy] of ORTHO) {
    if (dy === 1) continue;
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny)) continue;
    const n = cellIndex(nx, ny);
    if (map.type[n] === CellType.HOUSE) return [dx, dy, map.owner[n]];
  }
  return null;
}

/** Where a troop building's door lamp hangs: over its south door on a
 * road, else on a side wall by a road, low on it; none on its north side
 * (its roof's edge from above, behind it at a slant). */
function doorPoint(map: CityMap, r: Rect): { x: number; y: number } | null {
  const road = (x: number, y: number) => cellInBounds(x, y) && map.type[cellIndex(x, y)] === CellType.ROAD;
  for (let x = r.x; x < r.x + r.w; x++) if (road(x, r.y + r.h)) return { x: r.x + r.w / 2, y: r.y + r.h + 0.25 };
  for (let y = r.y + r.h - 1; y >= r.y; y--) {
    if (road(r.x - 1, y)) return { x: r.x - 0.25, y: y + 0.6 };
    if (road(r.x + r.w, y)) return { x: r.x + r.w + 0.25, y: y + 0.6 };
  }
  return null;
}

/** Tiny road stones for the gravel texture and its torchlit relief. */
export type Stone = { x: number; y: number; s: number; shade: number };
export function roadStones(map: CityMap): Stone[] {
  const out: Stone[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (map.type[i] !== CellType.ROAD) continue;
    const cx = i % CELLS_W,
      cy = (i - cx) / CELLS_W;
    const n = 2 + (hash(i, 5) % 3);
    for (let k = 0; k < n; k++)
      out.push({
        x: cx + 0.12 + hash01(i, k, 1) * 0.76,
        y: cy + 0.12 + hash01(i, k, 2) * 0.76,
        s: 0.09 + hash01(i, k, 3) * 0.09,
        shade: hash01(i, k, 4),
      });
  }
  return out;
}

export class DefendLighting {
  private shadowLayer: HTMLCanvasElement | null = null;
  private shadowKey = '';
  private dominantRevision = 0;
  lights: Light[] = [];
  private map: CityMap | null = null;
  private stones: Stone[] = [];
  private bakes = new Map<number, Baked | null>();
  private queue = new Set<number>();
  /** Per cell: brightest light's id (-1 = none) and its level. */
  readonly domId = new Int32Array(CELL_COUNT).fill(-1);
  readonly domVal = new Float32Array(CELL_COUNT);
  private domDirty = true;
  private relief: HTMLCanvasElement | null = null;
  private reliefKey = "";
  private dark: HTMLCanvasElement | null = null;
  private glow: HTMLCanvasElement | null = null;
  private flameSprite: HTMLCanvasElement | null = null;
  /** This frame's darkness and glow, summed at the bakes' resolution. */
  private field: LightField | null = null;
  private small: { dark: HTMLCanvasElement; glow: HTMLCanvasElement; torch: HTMLCanvasElement; darkImg: ImageData; glowImg: ImageData; torchImg: ImageData } | null = null;
  private dyn: HTMLCanvasElement | null = null;
  private ground: HTMLCanvasElement | null = null;
  private groundKey = "";
  /** What stands, painted from the buildings' own art at `MASK` pixels a
   * cell: `body` their pixels, `rim` their outlines. Null until the city
   * layer first paints them (then torches clip to open cells). */
  private masks: { body: HTMLCanvasElement; rim: HTMLCanvasElement; covered: Uint8Array; pixels: Uint8Array; rims: Uint8Array; bodies: Uint8Array } | null = null;
  /** Bumped whenever the masks change, for `rimPieces`. */
  private masksVersion = 0;
  private rimPieces: { key: string; board: Region[] } | null = null;
  private bodyPieces: { key: string; board: Region[] } | null = null;
  private bodyUp: HTMLCanvasElement | null = null;
  private rimUp: HTMLCanvasElement | null = null;
  private tint: HTMLCanvasElement | null = null;
  private tintKey = "";
  private buildingGrown: HTMLCanvasElement | null = null;
  private buildingGrownKey = "";
  private rimLit: HTMLCanvasElement | null = null;
  private buildingRimLit: HTMLCanvasElement | null = null;
  private upKey = "";
  /** How brightly each light still burns, 0 (out) to 1; set each frame
   * while the city's lights are going out, else null (all burning). */
  burning: ((l: Light) => number) | null = null;

  /** Null retains standalone/legacy rendering; live scenes use solar time. */
  solarTime: number | null = null;
  /** How brightly light `l` burns now. Its dusk offset follows where it
   * stands, not its id, which a building placed elsewhere can renumber. */
  burn(l: Light) {
    return (this.burning ? this.burning(l) : 1) * (this.solarTime === null ? 1 : torchLevel(this.solarTime, 0, l.x, l.y));
  }

  /** Point the lighting at a (new) city. With `changed` (the cells whose
   * look differs from the last city's, `map-change.ts`), every light still
   * standing just where it stood keeps its bake, so it burns on while the
   * lights near the change are baked again (the new ones as soon as they
   * can be); returns the lights that came or went, which the city layer
   * draws brackets for. Without, every light is baked afresh. */
  setMap(map: CityMap, changed?: Uint8Array): Light[] {
    if (map === this.map) return [];
    const was = this.map ? this.lights : [], old = this.bakes, oldMap = this.map;
    this.map = map;
    this.lights = cityLights(map);
    this.stones = roadStones(map);
    this.bakes = new Map();
    this.domDirty = true;
    this.reliefKey = "";
    this.lastOn = "";
    if (!changed || !oldMap) {
      this.queue = new Set(this.lights.map((l) => l.id));
      return [];
    }
    const key = (m: CityMap, l: Light) => `${l.kind}|${l.x}|${l.y}|${l.radius}|${l.strength}|${l.inside}|${l.pillars.join(",")}|${lot(m.buildings[l.owner])}`;
    const lot = (b: Building | undefined) => (b ? `${b.kind},${b.rect.x},${b.rect.y},${b.rect.w},${b.rect.h}` : "-");
    const before = new Map<string, Light>();
    for (const l of was) before.set(key(oldMap, l), l);
    const moved: Light[] = [];
    this.queue = new Set();
    for (const l of this.lights) {
      const k = key(map, l), prior = before.get(k), bake = prior && old.get(prior.id);
      before.delete(k);
      if (bake) this.bakes.set(l.id, bake);
      else this.queue.add(l.id);
      if (!prior) moved.push(l);
    }
    moved.push(...before.values());
    const cells: number[] = [];
    for (let i = 0; i < changed.length; i++) if (changed[i]) cells.push(i);
    this.invalidate(cells);
    return moved;
  }

  /** Takes what stands from cached building art, including its outline.
   * Occlusion follows native sprite pixels, including padded/rounded edges. */
  setMasks(body: HTMLCanvasElement, rim: HTMLCanvasElement) {
    this.tintKey = this.buildingGrownKey = "";
    // Read only cached source masks, never a rendered scene. Resolve light
    // occlusion at native art pixels so rounded corners are not whole cells.
    const covered = new Uint8Array(CELL_COUNT), pixels = new Uint8Array(CELLS_W * ART * CELLS_H * ART), rims = new Uint8Array(CELL_COUNT), bodies = new Uint8Array(CELL_COUNT);
    readMasks(body, rim, { x0: 0, y0: 0, x1: CELLS_W, y1: CELLS_H }, covered, pixels, rims, bodies);
    const old = this.masks?.covered, oldPixels = this.masks?.pixels;
    this.masks = { body, rim, covered, pixels, rims, bodies };
    this.masksVersion++;
    this.upKey = "";
    if (!old) {
      this.bakes.clear();
      this.queue = new Set(this.lights.map((l) => l.id));
      this.domDirty = true;
      return;
    }
    const width = CELLS_W * ART;
    const changed: number[] = [];
    for (let i = 0; i < covered.length; i++) if (covered[i] !== old[i]) changed.push(i);
    if(oldPixels) {
      const cells=new Set(changed);
      for(let i=0;i<pixels.length;i++) if(pixels[i]!==oldPixels[i]) cells.add(cellIndex(Math.floor((i%width)/ART),Math.floor(i/width/ART)));
      this.invalidate([...cells]);
    } else this.invalidate(changed);
  }

  /** The masks given to `setMasks` were repainted in place inside `boxes`
   * (in cells) only: rereads just those, as `setMasks` would have read the
   * whole, and rebakes the lights near what changed. */
  patchMasks(boxes: readonly CellBox[]) {
    const m = this.masks;
    if (!m) return;
    // The masks drawn up to the board, their tint and their grown copy are
    // redrawn only inside the boxes too, next time they're asked for.
    if (this.upKey) this.upPatches.push(...boxes);
    const cells = new Set<number>();
    for (const box of boxes) for (const i of readMasks(m.body, m.rim, box, m.covered, m.pixels, m.rims, m.bodies)) cells.add(i);
    this.masksVersion++;
    this.invalidate([...cells]);
  }

  get roadStones() {
    return this.stones;
  }

  /** Mark lights near changed cells for rebaking. */
  invalidate(cells: number[]) {
    if (!cells.length) return;
    const pts = [...new Set(cells)].map((c) => [(c % CELLS_W) + 0.5, Math.floor(c / CELLS_W) + 0.5]);
    for (const l of this.lights) {
      const r2 = (l.radius + 1) ** 2;
      if (pts.some(([x, y]) => (x - l.x) ** 2 + (y - l.y) ** 2 <= r2)) this.queue.add(l.id);
    }
  }

  /** Bake a few queued lights (spread over frames so a big collapse never
   * stalls a frame). */
  bakePending(solid: Uint8Array, budget = 6) {
    if (!this.map) return;
    for (const id of this.queue) {
      if (budget-- <= 0) break;
      this.queue.delete(id);
      const l = this.lights[id];
      const pair: [Bake, Bake] = [bakeLight(l, this.map, solid, -SWAY, this.masks?.pixels), bakeLight(l, this.map, solid, SWAY, this.masks?.pixels)];
      const pool = { ...poolSamples([pair[0].values, pair[1].values], pair[0].cols, glowColor), cols: pair[0].cols, rows: pair[0].rows, left: pair[0].left, top: pair[0].top };
      this.bakes.set(id, { pair, pool });
      this.domDirty = true;
    }
  }

  private active(l: Light, intact: (id: number) => boolean) {
    return intact(l.owner) && this.burn(l) > 0 && this.bakes.get(l.id);
  }

  private rebuildDominant(intact: (id: number) => boolean) {
    if (!this.domDirty) return;
    this.dominantRevision++;
    this.domDirty = false;
    this.domId.fill(-1);
    this.domVal.fill(0);
    for (const l of this.lights) {
      const baked = this.active(l, intact);
      if (!baked) continue;
      const b = baked.pair[0];
      const x0 = Math.max(0, b.left),
        y0 = Math.max(0, b.top);
      const x1 = Math.min(CELLS_W, b.left + b.cols / RES),
        y1 = Math.min(CELLS_H, b.top + b.rows / RES);
      for (let cy = y0; cy < y1; cy++)
        for (let cx = x0; cx < x1; cx++) {
          const sx = (cx - b.left) * RES + (RES >> 1),
            sy = (cy - b.top) * RES + (RES >> 1);
          const v = b.values[sy * b.cols + sx] * l.strength;
          const i = cellIndex(cx, cy);
          if (v > this.domVal[i]) {
            this.domVal[i] = v;
            this.domId[i] = l.id;
          }
        }
    }
    this.reliefKey = "";
  }

  /** Fold building state into the lighting. Call once per frame. */
  update(solid: Uint8Array, changed: number[], intact: (id: number) => boolean) {
    this.invalidate(changed);
    this.bakePending(solid);
    // A light going out or coming back also changes who dominates.
    const onKey = this.lights.map((l) => (intact(l.owner) && this.burn(l) > 0 ? 1 : 0)).join("");
    if (onKey !== this.lastOn) {
      this.lastOn = onKey;
      this.domDirty = true;
    }
    this.rebuildDominant(intact);
  }
  private lastOn = "";

  /** Unit shadows, stepped away from each unit's dominant light. Batched by
   * opacity into a handful of fills, so it scales to hundreds of units. */
  drawUnitShadows(c: CanvasRenderingContext2D, px: number, units: { x: number; y: number; size: number }[], strength: number, tick?: number) {
    // Positions only change on simulation ticks. Reuse the union between ticks,
    // but invalidate for zoom, light changes and night strength too.
    if (units.length > 1000 && tick !== undefined) {
      const { W, H } = boardSize(px);
      this.shadowLayer = sized(this.shadowLayer, W, H);
      const key = `${tick}:${px}:${strength}:${this.dominantRevision}`;
      if (key !== this.shadowKey) {
        this.shadowKey = key;
        const off = this.shadowLayer.getContext('2d')!;
        off.clearRect(0, 0, W, H);
        this.paintUnitShadows(off, px, units, strength, true);
      }
      c.drawImage(this.shadowLayer, 0, 0);
      return;
    }
    this.shadowKey = '';
    this.paintUnitShadows(c, px, units, strength);
  }

  private paintUnitShadows(c: CanvasRenderingContext2D, px: number, units: { x: number; y: number; size: number }[], strength: number, coalesce = false) {
    const buckets: number[][] = [[], [], [], []];
    // At crowd scale many units cover the same pixel. One shadow per pixel,
    // size and dominant light avoids tessellating thousands of overlapping paths.
    const occupied = coalesce ? new Set<string>() : null;
    for (const u of units) {
      const cx = Math.floor(u.x),
        cy = Math.floor(u.y);
      if (cx < 0 || cy < 0 || cx >= CELLS_W || cy >= CELLS_H) continue;
      const i = cellIndex(cx, cy);
      const id = this.domId[i];
      const v = this.domVal[i];
      if (id < 0 || v < 0.06) continue;
      if (occupied) {
        const key = `${Math.floor(u.x * px)}:${Math.floor(u.y * px)}:${u.size}:${id}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
      }
      const l = this.lights[id];
      let dx = u.x - l.x,
        dy = u.y - l.y;
      const d = Math.hypot(dx, dy) || 0.01;
      dx /= d;
      dy /= d;
      const len = u.size * (0.7 + Math.min(1.6, d * 0.35));
      const bucket = Math.min(3, Math.floor(v * 4));
      buckets[bucket].push(u.x, u.y, dx, dy, len, u.size);
    }
    c.save();
    for (let b = 0; b < 4; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      const alpha = (0.18 + b * 0.1) * strength;
      c.fillStyle = `rgba(0,0,0,${alpha})`;
      c.beginPath();
      for (let k = 0; k < list.length; k += 6) {
        const x = list[k], y = list[k + 1], dx = list[k + 2], dy = list[k + 3], len = list[k + 4], size = list[k + 5];
        for (const t of [0.35, 0.7, 1]) {
          const s = size * (1 - t * 0.25) * px;
          const rx = (x + dx * len * t) * px - s / 2, ry = (y + dy * len * t) * px - s / 2;
          c.rect(rx, ry, s, s);
        }
      }
      c.fill();
    }
    c.restore();
  }

  /** Darkness carved by light, then warm glow blended as light — the main
   * game's recipe. `ambient` is the overlay colour and opacity. The pools
   * and torches are summed in a `LightField`, then drawn scaled up into
   * the board-sized darkness and glow, as each pool once was. */
  drawLight(c: CanvasRenderingContext2D, frame: LightFrame, ambient: Ambient, carried: Carried, sheen = true) {
    const { W, H } = boardSize(frame.px);
    const field = (this.field ??= new LightField());
    field.clear();
    this.addPools(field, frame, ambient.glow);
    const small = (this.small ??= smallLayers());
    field.paintDark(small.darkImg.data, rgbOf(ambient.color), ambient.alpha);
    const doublings = field.paintGlow(small.glowImg.data);
    small.dark.getContext("2d")!.putImageData(small.darkImg, 0, 0);
    small.glow.getContext("2d")!.putImageData(small.glowImg, 0, 0);
    this.dark = upscale(this.dark, small.dark, frame.px, W, H);
    this.glow = upscale(this.glow, small.glow, frame.px, W, H, doublings);
    this.drawCarried(field, frame, ambient.glow, carried);
    const up = this.masksAt(W, H);
    if (up) this.unlightBodies(up.body, ambient);
    c.save();
    c.drawImage(this.dark, 0, 0);
    c.globalCompositeOperation = "soft-light";
    c.drawImage(this.glow, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = LIGHTING_CONFIG.glow.bloom;
    c.drawImage(this.glow, 0, 0);
    c.restore();
    if (up && sheen) this.shine(c, up.rim, (r) => r.drawImage(this.glow!, 0, 0), { body: up.body, by: frame.px / ART / 4 });
  }

  /** Lights outlines from this frame's glow (from the last `drawLight`),
   * as if the torchlight caught their edges: `outline` paints them onto
   * a screen-sized canvas, drawn unmoved; `c`'s transform places the
   * board; only their inner half beside `inner.body` shines (see `hug`).
   * For the units' contours. */
  shineOutlines(c: CanvasRenderingContext2D, outline: (r: CanvasRenderingContext2D) => void, inner: Inner, near?: readonly Region[] | null) {
    const glow = this.glow;
    if (!glow) return;
    const m = c.getTransform();
    const { width, height } = c.canvas;
    const r = (this.rimLit = sized(this.rimLit, width, height)).getContext("2d")!;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalCompositeOperation = "source-over";
    if (near) {
      this.shinePieces(c, r, outline, inner, pieceRegions(near, Math.ceil(inner.by) + 2, width, height), m);
      return;
    }
    r.clearRect(0, 0, width, height);
    outline(r);
    this.hug(r, inner);
    r.globalCompositeOperation = "source-in";
    r.setTransform(m);
    r.drawImage(glow, 0, 0);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    shineOnto(c, this.rimLit!);
    c.restore();
  }

  /** `shineOutlines` within `pieces` alone (whole pixels, never
   * overlapping, holding every pixel of the body grown by `inner.by`):
   * past the body grown, `hug` leaves nothing to shine. */
  private shinePieces(c: CanvasRenderingContext2D, r: CanvasRenderingContext2D, outline: (r: CanvasRenderingContext2D) => void, inner: Inner, pieces: Region[], m: DOMMatrix) {
    if (!pieces.length) return;
    const { width, height } = r.canvas;
    for (const p of pieces) r.clearRect(p.x, p.y, p.w, p.h);
    // Past the pieces the canvas keeps whatever it held: it's never used.
    outline(r);
    const grown = (this.grown = sized(this.grown, width, height)).getContext("2d")!;
    for (const p of pieces) {
      grown.save();
      grown.beginPath(); grown.rect(p.x, p.y, p.w, p.h); grown.clip();
      grown.globalCompositeOperation = "source-over";
      grown.clearRect(p.x, p.y, p.w, p.h);
      for (const dy of [-inner.by, 0, inner.by]) for (const dx of [-inner.by, 0, inner.by]) grown.drawImage(inner.body, dx, dy);
      grown.restore();
    }
    for (const p of pieces) {
      r.save();
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.beginPath(); r.rect(p.x, p.y, p.w, p.h); r.clip();
      r.globalCompositeOperation = "destination-in";
      r.drawImage(this.grown!, 0, 0);
      r.restore();
    }
    // The glow is drawn scaled: clipped, it would sample a shade
    // differently at some zooms, so it goes over the whole canvas.
    r.save();
    r.globalCompositeOperation = "source-in";
    r.setTransform(m);
    r.drawImage(this.glow!, 0, 0);
    r.restore();
    r.globalCompositeOperation = "source-over";
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const p of pieces) {
      c.save();
      c.beginPath(); c.rect(p.x, p.y, p.w, p.h); c.clip();
      shineOnto(c, this.rimLit!);
      c.restore();
    }
    c.restore();
  }

  /** The board rectangles (whole pixels, never overlapping) holding every
   * outline pixel of the rim drawn up to `W` x `H`; null when unknown or
   * the board is rotated or skewed. */
  private rimRegions(W: number, H: number, of: "rims" | "bodies" = "rims"): Region[] | null {
    const m = this.masks;
    if (!m) return null;
    const key = `${this.masksVersion}:${W}x${H}`, held = of === "rims" ? "rimPieces" : "bodyPieces";
    if (this[held]?.key === key) return this[held]!.board;
    const cols = Math.ceil(W / RIM_CELL), rows = Math.ceil(H / RIM_CELL), on = new Uint8Array(cols * rows), flags = m[of];
    for (let cy = 0; cy < CELLS_H; cy++) for (let cx = 0; cx < CELLS_W; cx++) {
      if (!flags[cellIndex(cx, cy)]) continue;
      // The cell drawn up (nearest), two pixels out for rounding.
      const a = Math.max(0, Math.floor((Math.floor((cx * W) / CELLS_W) - 2) / RIM_CELL)), b = Math.min(cols - 1, Math.floor((Math.ceil(((cx + 1) * W) / CELLS_W) + 2) / RIM_CELL));
      const t = Math.max(0, Math.floor((Math.floor((cy * H) / CELLS_H) - 2) / RIM_CELL)), u = Math.min(rows - 1, Math.floor((Math.ceil(((cy + 1) * H) / CELLS_H) + 2) / RIM_CELL));
      for (let r = t; r <= u; r++) on.fill(1, r * cols + a, r * cols + b + 1);
    }
    const board = cellPieces(on, cols, rows, RIM_CELL, { x: 0, y: 0, w: W, h: H });
    this[held] = { key, board };
    return board;
  }

  /** Keeps what is on `r` to within `by` pixels of `body` (the body grown
   * by `by` each way): the half of an outline hugging what it rings, so
   * the shine is half the outline's width. */
  private hug(r: CanvasRenderingContext2D, inner: Inner, fixed = false) {
    const grown = this.grow(r.canvas.width, r.canvas.height, inner, fixed);
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalCompositeOperation = "destination-in";
    r.drawImage(grown, 0, 0);
  }
  /** The body grown by `by` each way, `width` x `height` (kept between
   * frames for the buildings, `fixed`, and patched where they change). */
  private grow(width: number, height: number, { body, by }: Inner, fixed = false) {
    const key = `${width}:${height}:${by}`;
    let grown: HTMLCanvasElement;
    if (fixed) grown = this.buildingGrown = sized(this.buildingGrown, width, height);
    else grown = this.grown = sized(this.grown, width, height);
    const whole = !fixed || key !== this.buildingGrownKey;
    if (whole || this.grownPatches.length) {
      const g = grown.getContext("2d")!;
      for (const r of whole ? [{ x: 0, y: 0, w: width, h: height }] : this.grownPatches) {
        // A patch grows past its box by `by`, as the body inside it does.
        const x = Math.floor(r.x - by), y = Math.floor(r.y - by), w = Math.ceil(r.w + 2 * by) + 1, h = Math.ceil(r.h + 2 * by) + 1;
        g.save();
        g.beginPath();
        g.rect(x, y, w, h);
        g.clip();
        g.globalCompositeOperation = "source-over";
        g.clearRect(x, y, w, h);
        for (const dy of [-by, 0, by]) for (const dx of [-by, 0, by]) g.drawImage(body, dx, dy);
        g.restore();
      }
      if (fixed) this.buildingGrownKey = key, this.grownPatches = [];
    }
    return grown;
  }
  private grown: HTMLCanvasElement | null = null;
  /** Boxes (cells) the masks were patched in since they were drawn up. */
  private upPatches: CellBox[] = [];
  /** Board regions where the drawn-up masks changed, still to redo in the tint and grown copy. */
  private tintPatches: Region[] = [];
  private grownPatches: Region[] = [];

  /** The masks drawn up to the board at this zoom, or null before any. */
  private masksAt(W: number, H: number) {
    const m = this.masks;
    if (!m) return null;
    const key = `${W}x${H}`;
    if (key !== this.upKey || !this.bodyUp || !this.rimUp) {
      this.upKey = key;
      this.upPatches = [];
      this.tintKey = this.buildingGrownKey = "";
      this.bodyUp = nearest(this.bodyUp, m.body, W, H);
      this.rimUp = nearest(this.rimUp, m.rim, W, H);
    } else if (this.upPatches.length) {
      // Only some buildings changed: redraw round them (`patchMasks`).
      const regions = this.upPatches.map((b) => region(b, W, H));
      this.upPatches = [];
      for (const r of regions) {
        nearest(this.bodyUp, m.body, W, H, r);
        nearest(this.rimUp, m.rim, W, H, r);
      }
      this.tintPatches.push(...regions);
      this.grownPatches.push(...regions);
    }
    return { body: this.bodyUp, rim: this.rimUp };
  }

  /** Buildings' own pixels take no torchlight (flames burn at street
   * level, never over the roofs): the glow is cut out of them and the
   * night's full darkness laid back over them. */
  private unlightBodies(body: HTMLCanvasElement, ambient: Ambient) {
    const dk = this.dark!.getContext("2d")!,
      gl = this.glow!.getContext("2d")!;
    // Only round the cells with any body: elsewhere the body (and so its
    // tint) is clear, and taking or laying clear pixels changes nothing.
    const pieces = this.rimRegions(body.width, body.height, "bodies") ?? [{ x: 0, y: 0, w: body.width, h: body.height }];
    const each = (c: CanvasRenderingContext2D, paint: () => void) => {
      for (const p of pieces) { c.save(); c.beginPath(); c.rect(p.x, p.y, p.w, p.h); c.clip(); paint(); c.restore(); }
    };
    gl.globalCompositeOperation = "destination-out";
    each(gl, () => gl.drawImage(body, 0, 0));
    gl.globalCompositeOperation = "source-over";
    const key = `${body.width}:${body.height}:${ambient.color}`;
    const whole = key !== this.tintKey || !this.tint;
    for (const r of whole ? [{ x: 0, y: 0, w: body.width, h: body.height }] : this.tintPatches) {
      this.tintKey = key;
      const t = (this.tint = sized(this.tint, body.width, body.height)).getContext("2d")!;
      t.save();
      t.beginPath();
      t.rect(r.x, r.y, r.w, r.h);
      t.clip();
      t.globalCompositeOperation = "source-over";
      t.clearRect(r.x, r.y, r.w, r.h);
      t.drawImage(body, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = ambient.color;
      t.fillRect(r.x, r.y, r.w, r.h);
      t.restore();
    }
    this.tintPatches = [];
    dk.globalCompositeOperation = "destination-out";
    each(dk, () => dk.drawImage(body, 0, 0));
    dk.globalCompositeOperation = "source-over";
    dk.globalAlpha = ambient.alpha;
    each(dk, () => dk.drawImage(this.tint!, 0, 0));
    dk.globalAlpha = 1;
  }

  /** The glow kept to `rim` and added over it, so outlines in torchlight
   * shine warm (board space, like the glow). */
  private shine(c: CanvasRenderingContext2D, rim: HTMLCanvasElement, glow: (r: CanvasRenderingContext2D) => void, inner: Inner) {
    // Building masks are board-sized; unit masks are viewport-sized. Sharing
    // their scratch canvas reallocates its pixel storage twice every frame.
    const r = (this.buildingRimLit = sized(this.buildingRimLit, rim.width, rim.height)).getContext("2d")!;
    r.setTransform(1, 0, 0, 1, 0, 0);
    r.globalCompositeOperation = "source-over";
    r.clearRect(0, 0, rim.width, rim.height);
    // Only round the cells with any outline: elsewhere the rim is clear, so
    // what is kept and added there is nothing. Whole-pixel rectangle clips
    // keep every pixel as it was.
    const m = c.getTransform();
    const pieces = m.b || m.c ? null : this.rimRegions(rim.width, rim.height);
    if (!pieces) {
      r.drawImage(rim, 0, 0);
      this.hug(r, inner, true);
      r.globalCompositeOperation = "source-in";
      glow(r);
      shineOnto(c, this.buildingRimLit!);
      return;
    }
    if (!pieces.length) return;
    this.grow(r.canvas.width, r.canvas.height, inner, true);
    for (const p of pieces) {
      r.save();
      r.beginPath(); r.rect(p.x, p.y, p.w, p.h); r.clip();
      r.globalCompositeOperation = "source-over";
      r.drawImage(rim, 0, 0);
      r.globalCompositeOperation = "destination-in";
      r.drawImage(this.buildingGrown!, 0, 0);
      r.globalCompositeOperation = "source-in";
      glow(r);
      r.restore();
    }
    r.globalCompositeOperation = "source-over";
    // Onto the screen, each piece's box there (whole pixels) at a time.
    const lit = this.buildingRimLit!;
    for (const p of pieces) {
      const xs = [p.x, p.x + p.w].map((x) => m.a * x + m.e), ys = [p.y, p.y + p.h].map((y) => m.d * y + m.f);
      const x0 = Math.floor(Math.min(...xs)) - 1, y0 = Math.floor(Math.min(...ys)) - 1, x1 = Math.ceil(Math.max(...xs)) + 1, y1 = Math.ceil(Math.max(...ys)) + 1;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      c.setTransform(m);
      shineOnto(c, lit);
      c.restore();
    }
  }

  /** Lays this frame's darkness (from the last `drawLight`) over what is
   * on `c`, through its current composite (source-atop keeps it to what is
   * drawn): for what stands over the lighting pass, like the trees. */
  darken(c: CanvasRenderingContext2D) {
    if (this.dark) c.drawImage(this.dark, 0, 0);
  }

  /** Each fixed light's baked pool, blended between its two swayed bakes
   * by how far the flame leans. */
  private addPools(field: LightField, frame: LightFrame, glow: number) {
    for (const l of this.lights) {
      const baked = this.active(l, frame.intact);
      if (baked) addPool(field, frame, glow, { l, pool: baked.pool, burn: this.burn(l) });
    }
  }

  /** Units' hand torches: small unoccluded pools that move with them,
   * summed fresh each frame on their own layer, drawn up to the board and
   * clipped to open ground (a torch in the street never lights a roof),
   * then carved into the darkness and added to the glow like the fixed
   * lights. */
  private drawCarried(field: LightField, { px, now, reduceMotion }: LightFrame, glow: number, carried: Carried) {
    if (!carried.torches.length) return;
    const reached: number[] = [];
    for (const t of carried.torches) {
      const f = getTorchFlicker({ x: t.id * 11, y: t.id * 5 }, now, reduceMotion);
      // Explosion flashes pass their own reach and brightness.
      const alpha = Math.min(1, (t.k ?? 0.8) * f), reach = (t.r || CARRIED_RADIUS) * (0.95 + (f - 1) * 0.6);
      field.addTorch(t.x, t.y, reach, alpha);
      if (reach > 0 && alpha > 0) reached.push(t.x, t.y, reach);
    }
    const small = this.small!;
    field.paintTorches(small.torchImg.data);
    small.torch.getContext("2d")!.putImageData(small.torchImg, 0, 0);
    const dk = this.dark!.getContext("2d")!,
      gl = this.glow!.getContext("2d")!;
    const W = dk.canvas.width,
      H = dk.canvas.height;
    this.dyn = upscale(this.dyn, small.torch, px, W, H);
    if (this.masks) {
      // With the buildings' masks the pools need no clipping to the ground,
      // and each is carved and added only in the board squares it reaches (a
      // cell past its reach, for the smoothing), where the rest is clear. The
      // drawing up stays whole: a clip there could move its sampling.
      const cols = Math.ceil(W / RIM_CELL), rows = Math.ceil(H / RIM_CELL), on = new Uint8Array(cols * rows);
      for (let i = 0; i < reached.length; i += 3) {
        const x = reached[i], y = reached[i + 1], r = reached[i + 2] + 1;
        const a = Math.max(0, Math.floor(((x - r) * px - 2) / RIM_CELL)), b = Math.min(cols - 1, Math.floor(((x + r) * px + 2) / RIM_CELL));
        const t = Math.max(0, Math.floor(((y - r) * px - 2) / RIM_CELL)), u = Math.min(rows - 1, Math.floor(((y + r) * px + 2) / RIM_CELL));
        for (let row = t; row <= u; row++) if (a <= b) on.fill(1, row * cols + a, row * cols + b + 1);
      }
      const pieces = cellPieces(on, cols, rows, RIM_CELL, { x: 0, y: 0, w: W, h: H }), dyn = this.dyn;
      dk.globalCompositeOperation = "destination-out";
      dk.globalAlpha = 0.85;
      for (const p of pieces) dk.drawImage(dyn, p.x, p.y, p.w, p.h, p.x, p.y, p.w, p.h);
      dk.globalCompositeOperation = "source-over";
      dk.globalAlpha = 1;
      gl.globalCompositeOperation = "lighter";
      gl.globalAlpha = Math.min(1, glow * 0.8);
      for (const p of pieces) gl.drawImage(dyn, p.x, p.y, p.w, p.h, p.x, p.y, p.w, p.h);
      gl.globalCompositeOperation = "source-over";
      gl.globalAlpha = 1;
      return;
    }
    const d = this.dyn.getContext("2d")!;
    // With the buildings' masks, `unlightBodies` takes it off them after.
    if (!this.masks) {
      d.globalCompositeOperation = "destination-in";
      d.drawImage(this.groundMask(carried, px, W, H), 0, 0);
    }
    dk.globalCompositeOperation = "destination-out";
    dk.globalAlpha = 0.85;
    dk.drawImage(this.dyn, 0, 0);
    dk.globalCompositeOperation = "source-over";
    dk.globalAlpha = 1;
    gl.globalCompositeOperation = "lighter";
    gl.globalAlpha = Math.min(1, glow * 0.8);
    gl.drawImage(this.dyn, 0, 0);
    gl.globalCompositeOperation = "source-over";
    gl.globalAlpha = 1;
  }

  /** White wherever the ground is open (no standing building or wall). */
  private groundMask({ solid, version }: Carried, px: number, W: number, H: number) {
    const key = `${version}:${W}x${H}`;
    if (key === this.groundKey && this.ground) return this.ground;
    this.groundKey = key;
    this.ground = sized(this.ground, W, H);
    const g = this.ground.getContext("2d")!;
    g.clearRect(0, 0, W, H);
    g.fillStyle = "#fff";
    const open = (i: number) => !solid[i] || (this.map?.owner[i] ?? 0) < 0;
    for (let cy = 0; cy < CELLS_H; cy++) fillOpenRuns(g, px, cy, open);
    return this.ground;
  }

  /** Gravel catching the torchlight: each stone gets a bright lip on the
   * side facing its dominant light and a dark one on the far side. Baked
   * into one board-sized layer; redrawn when the lights change. */
  drawRelief(c: CanvasRenderingContext2D, px: number, alpha: number) {
    const { W, H } = boardSize(px);
    const key = `${W}x${H}`;
    if (key !== this.reliefKey || !this.relief) {
      this.reliefKey = key;
      this.relief = sized(this.relief, W, H);
      const r = this.relief.getContext("2d")!;
      r.clearRect(0, 0, W, H);
      const lip = Math.max(1, px * 0.06);
      for (const st of this.stones) {
        const i = cellIndex(Math.floor(st.x), Math.floor(st.y));
        const id = this.domId[i];
        const v = this.domVal[i];
        if (id < 0 || v < 0.05) continue;
        const l = this.lights[id];
        let dx = l.x - st.x,
          dy = l.y - st.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const s = st.s * px;
        const x = st.x * px,
          y = st.y * px;
        r.fillStyle = `rgba(255,226,170,${Math.min(0.9, v * 1.1)})`;
        r.fillRect(x + dx * s * 0.5 - lip / 2, y + dy * s * 0.5 - lip / 2, lip, lip);
        r.fillStyle = `rgba(0,0,0,${Math.min(0.8, v)})`;
        r.fillRect(x - dx * s * 0.6 - lip / 2, y - dy * s * 0.6 - lip / 2, lip, lip);
      }
    }
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(this.relief!, 0, 0);
    c.restore();
  }

  /** Flames: lantern hoods, tower braziers — a hot flickering core. */
  drawFlames(c: CanvasRenderingContext2D, { px, now, reduceMotion, intact }: LightFrame) {
    this.flameSprite ??= makeFlameSprite();
    const slant = angled(), lit = this.lights.filter((l) => this.active(l, intact) && !(l.back && slant));
    const rise = (l: Light) => (slant && !l.inside ? -WALL_RISE : 0);
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const l of lit) {
      const f = getTorchFlicker({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const b = this.burn(l);
      const r = px * (l.kind === "lantern" || l.kind === "door" ? 0.9 : 1.4) * f * (0.4 + 0.6 * b);
      c.globalAlpha = Math.min(1, 0.7 * f * b);
      c.drawImage(this.flameSprite, (l.x + sway.x) * px - r, (l.y + rise(l) + sway.y) * px - r, r * 2, r * 2);
    }
    c.restore();
    // The fire itself, burning as the Obsidian Palace's torches do, in
    // finer pixels (`TORCH_FIRE_ART` a cell) and the city's own flame.
    const dot = artPen(c, (px * ART) / TORCH_FIRE_ART), t = reduceMotion ? 0 : now / 1000;
    for (const l of lit) {
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion), b = this.burn(l);
      const small = l.kind === "lantern" || l.kind === "door";
      c.globalAlpha = Math.min(1, b);
      fireTongues(c, dot, TORCH_FIRE, Math.round((l.x + sway.x) * TORCH_FIRE_ART), Math.round((l.y + rise(l) + sway.y * 0.5) * TORCH_FIRE_ART) + 1, l.id * 7919 + 17, t, (small ? 0.7 : 1) * (0.4 + 0.6 * b) * sway.stretch);
    }
    c.globalAlpha = 1;
  }
}

/** How far (cells) Angle view raises a flame hung on a wall (a lantern,
 * a door lamp, a brazier), up with the raised building onto its wall. */
const WALL_RISE = 0.4;

/** The city torches' fire: art pixels a cell (twice as fine as the board's
 * art), and its colours, hottest first. */
const TORCH_FIRE_ART = ART * 2;
const TORCH_FIRE = [FLAME[4], FLAME[3], FLAME[2], FLAME[1]] as const;

/** What the lights are drawn for this frame: canvas pixels per cell, the
 * time, and whether each light's building still stands. */
export type LightFrame = { px: number; now: number; reduceMotion: boolean; intact: (id: number) => boolean };
/** The darkness overlay's colour and opacity, and the glow's strength. */
export type Ambient = { color: string; alpha: number; glow: number };
/** A moving light: a unit's hand torch or a blast's flash (with its own
 * reach `r` and brightness `k`). */
export type CarriedLight = { x: number; y: number; id: number; r?: number; k?: number };
/** Hand torches, masked to the open ground of `solid` (at map `version`). */
export type Carried = { torches: CarriedLight[]; solid: Uint8Array; version: number };
/** One light's pool at `burn` brightness, blended between its two swayed
 * bakes by how far the flame leans, carved into the darkness and added to the glow. */
function addPool(field: LightField, { now, reduceMotion }: LightFrame, glow: number, { l, pool, burn }: { l: Light; pool: PoolSamples; burn: number }) {
  const flicker = getTorchFlicker({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
  const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
  const lean = Math.max(0, Math.min(1, 0.5 + sway.x / (2 * LIGHTING_CONFIG.flicker.swayX)));
  const k = l.strength * flicker * burn;
  // Canvas clamps globalAlpha to 0–1; a bake leaned all but away from is left out.
  const clamp = (a: number, w: number) => (w <= 0.01 ? 0 : Math.max(0, Math.min(1, a * w)));
  field.addPool(pool, sway.y * RES, clamp(0.95 * k, 1 - lean), clamp(glow * k, 1 - lean), clamp(0.95 * k, lean), clamp(glow * k, lean));
}

/** The field-sized darkness and glow, and their pixels. */
function smallLayers() {
  const make = () => {
    const cv = document.createElement("canvas");
    cv.width = FIELD_W;
    cv.height = FIELD_H;
    return cv;
  };
  const img = () => new ImageData(FIELD_W, FIELD_H);
  return { dark: make(), glow: make(), torch: make(), darkImg: img(), glowImg: img(), torchImg: img() };
}

/** Fills each run of open cells along row `cy`. */
function fillOpenRuns(g: CanvasRenderingContext2D, px: number, cy: number, open: (i: number) => boolean) {
  let run = -1;
  for (let cx = 0; cx <= CELLS_W; cx++) {
    const here = cx < CELLS_W && open(cellIndex(cx, cy));
    if (here && run < 0) run = cx;
    if (!here && run >= 0) {
      g.fillRect(Math.floor(run * px), Math.floor(cy * px), Math.ceil((cx - run) * px) + 1, Math.ceil(px) + 1);
      run = -1;
    }
  }
}

/** `src` (the field) drawn smoothly over the whole board, `px` pixels a
 * cell, into a board-sized canvas, then added onto itself `doublings`
 * times (a summed layer painted at a half or a quarter). */
function upscale(cv: HTMLCanvasElement | null, src: HTMLCanvasElement, px: number, W: number, H: number, doublings = 0) {
  const out = sized(cv, W, H);
  const c = out.getContext("2d")!;
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = 1;
  c.clearRect(0, 0, W, H);
  c.imageSmoothingEnabled = true;
  c.drawImage(src, 0, 0, CELLS_W * px, CELLS_H * px);
  if (doublings) {
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < doublings; i++) c.drawImage(out, 0, 0);
    c.globalCompositeOperation = "source-over";
  }
  return out;
}

const rgbCache = new Map<string, number[]>();
/** "rgb(r,g,b)" as numbers. */
function rgbOf(color: string) {
  let rgb = rgbCache.get(color);
  if (!rgb) {
    rgb = (color.match(/\d+(\.\d+)?/g) ?? ["0", "0", "0"]).slice(0, 3).map(Number);
    rgbCache.set(color, rgb);
  }
  return rgb;
}

/** Squares of the board (pixels) the outlines' shine is worked in. */
const RIM_CELL = 64;

/** Pixels a cell in the buildings' masks: two an art pixel, fine enough
 * for half-art-pixel outlines. */
export const MASK = 16;

/** Per cell, 1 where the body mask covers at least half of it. */
/** A box of cells, `x1`/`y1` exclusive. */
export type CellBox = { x0: number; y0: number; x1: number; y1: number; layerOnly?: boolean };

/** Reads `box` of the body and rim masks into `covered` (a cell is covered
 * while the body fills half of it) and `pixels` (an art pixel stands while
 * either mask covers any of its samples), returning the cells whose value
 * or art pixels changed. */
function readMasks(body: HTMLCanvasElement, rim: HTMLCanvasElement, box: CellBox, covered: Uint8Array, pixels: Uint8Array, rims: Uint8Array, bodies: Uint8Array) {
  const changed: number[] = [];
  const w = (box.x1 - box.x0) * MASK, h = (box.y1 - box.y0) * MASK;
  if (w <= 0 || h <= 0) return changed;
  const a = body.getContext("2d", { willReadFrequently: true })!.getImageData(box.x0 * MASK, box.y0 * MASK, w, h).data;
  const b = rim.getContext("2d", { willReadFrequently: true })!.getImageData(box.x0 * MASK, box.y0 * MASK, w, h).data;
  const half = (MASK * MASK) / 2, ratio = MASK / ART, width = CELLS_W * ART;
  for (let cy = box.y0; cy < box.y1; cy++)
    for (let cx = box.x0; cx < box.x1; cx++) {
      const ly = (cy - box.y0) * MASK, lx = (cx - box.x0) * MASK;
      let n = 0;
      for (let y = ly; y < ly + MASK; y++) {
        let k = (y * w + lx) * 4 + 3;
        for (let x = 0; x < MASK; x++, k += 4) if (a[k] >= 128) n++;
      }
      let any = 0, solid = 0;
      for (let y = ly; y < ly + MASK && !any; y++) {
        let k = (y * w + lx) * 4 + 3;
        for (let x = 0; x < MASK; x++, k += 4) if (b[k]) { any = 1; break; }
      }
      for (let y = ly; y < ly + MASK && !solid; y++) {
        let k = (y * w + lx) * 4 + 3;
        for (let x = 0; x < MASK; x++, k += 4) if (a[k]) { solid = 1; break; }
      }
      bodies[cellIndex(cx, cy)] = solid;
      const i = cellIndex(cx, cy), v = n >= half ? 1 : 0;
      rims[i] = any;
      let moved = covered[i] !== v;
      covered[i] = v;
      for (let py = 0; py < ART; py++) for (let px = 0; px < ART; px++) {
        let on = 0;
        for (let sy = 0; sy < ratio && !on; sy++) for (let sx = 0; sx < ratio; sx++) {
          const k = ((ly + py * ratio + sy) * w + lx + px * ratio + sx) * 4 + 3;
          if (a[k] >= 128 || b[k] >= 128) { on = 1; break; }
        }
        const j = (cy * ART + py) * width + cx * ART + px;
        if (pixels[j] !== on) { pixels[j] = on; moved = true; }
      }
      if (moved) changed.push(i);
    }
  return changed;
}

/** `src` drawn up to w × h without smoothing. */
function nearest(cv: HTMLCanvasElement | null, src: HTMLCanvasElement, w: number, h: number, only?: Region) {
  const out = sized(cv, w, h);
  const c = out.getContext("2d")!;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (only) {
    c.beginPath();
    c.rect(only.x, only.y, only.w, only.h);
    c.clip();
  }
  c.globalCompositeOperation = "source-over";
  c.clearRect(0, 0, w, h);
  c.imageSmoothingEnabled = false;
  c.drawImage(src, 0, 0, w, h);
  c.restore();
  return out;
}

/** A box of canvas pixels. */
type Region = { x: number; y: number; w: number; h: number };

/** Square `PIECE_CELL`-pixel cells of a `width` x `height` canvas touched by
 * `regions` grown by `pad`, as non-overlapping rectangles. */
const PIECE_CELL = 64;
function pieceRegions(regions: readonly Region[], pad: number, width: number, height: number): Region[] {
  const cols = Math.ceil(width / PIECE_CELL), rows = Math.ceil(height / PIECE_CELL), on = new Uint8Array(cols * rows);
  for (const g of regions) {
    const a = Math.max(0, Math.floor((g.x - pad) / PIECE_CELL)), b = Math.min(cols - 1, Math.floor((g.x + g.w + pad) / PIECE_CELL));
    const t = Math.max(0, Math.floor((g.y - pad) / PIECE_CELL)), u = Math.min(rows - 1, Math.floor((g.y + g.h + pad) / PIECE_CELL));
    for (let y = t; y <= u; y++) if (a <= b) on.fill(1, y * cols + a, y * cols + b + 1);
  }
  return cellPieces(on, cols, rows, PIECE_CELL, { x: 0, y: 0, w: width, h: height });
}
/** Cell box `b` on a `w` × `h` board, out to whole pixels. */
function region(b: CellBox, w: number, h: number): Region {
  const x = Math.floor((b.x0 * w) / CELLS_W), y = Math.floor((b.y0 * h) / CELLS_H);
  return { x, y, w: Math.ceil((b.x1 * w) / CELLS_W) - x, h: Math.ceil((b.y1 * h) / CELLS_H) - y };
}

/** What an outline rings and how far out its shining half reaches. */
export type Inner = { body: CanvasImageSource; by: number };

/** Lit outlines added onto `c` at `LIGHTING_CONFIG.glow.rim`. The glow is
 * summed afresh each frame from every torch's flicker, so they flicker
 * with the torches. */
function shineOnto(c: CanvasRenderingContext2D, lit: HTMLCanvasElement) {
  c.save();
  c.globalCompositeOperation = "lighter";
  c.globalAlpha = LIGHTING_CONFIG.glow.rim;
  c.drawImage(lit, 0, 0);
  c.restore();
}

function sized(cv: HTMLCanvasElement | null, w: number, h: number) {
  const c = cv ?? document.createElement("canvas");
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

/** Reach of a unit's hand torch, in cells. */
const CARRIED_RADIUS = 2.4;

function makeFlameSprite() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const c = cv.getContext("2d")!;
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,230,170,0.95)");
  g.addColorStop(0.3, "rgba(255,170,80,0.45)");
  g.addColorStop(1, "rgba(255,120,40,0)");
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  return cv;
}

/** Bake one light's pool with occlusion (optionally nudged sideways). */
function bakeLight(l: Light, map: CityMap, solid: Uint8Array, offsetX: number, pixels?: Uint8Array): Bake {
  const R = l.radius;
  const left = Math.floor(l.x - R - 1),
    top = Math.floor(l.y - R - 1);
  const size = Math.ceil(R * 2 + 3);
  const cols = size * RES,
    rows = size * RES;
  const src: Source = {
    l,
    o: { x: l.x + offsetX, y: l.y },
    blocks: (x: number, y: number) => {
      const i = cellIndex(Math.floor(x), Math.floor(y));
      if (l.inside && map.owner[i] === l.owner) return false;
      return pixels ? !!pixels[Math.floor(y * ART) * CELLS_W * ART + Math.floor(x * ART)] : solid[i] === 1 && map.owner[i] >= 0;
    },
  };
  const raw = new Float32Array(cols * rows);
  for (let sy = 0; sy < rows; sy++) {
    const wy = top + (sy + 0.5) / RES;
    for (let sx = 0; sx < cols; sx++) raw[sy * cols + sx] = lightAt(src, left + (sx + 0.5) / RES, wy);
  }
  // Buildings' own pixels are kept dark when drawn (`unlightBodies`), so
  // the light reaches right up to their edges.
  const values = blur({ src: raw, cols, rows });
  return { values, cols, rows, left, top };
}

type Point = { x: number; y: number };

/** A light being baked: its flame `o` (maybe nudged) and which cells cast
 * its shadows. */
type Source = { l: Light; o: Point; blocks: (x: number, y: number) => boolean };

/** The light reaching sample point (wx, wy), 0 when out of reach or shadowed. */
function lightAt(src: Source, wx: number, wy: number) {
  const { l, o } = src;
  const d = Math.hypot(wx - o.x, wy - o.y);
  if (d >= l.radius || !cellInBounds(wx, wy)) return 0;
  if (rayBlocked(src, wx, wy, d) || pillarBlocked(src, { x: wx, y: wy }, d)) return 0;
  return lightFalloff(d, l.radius);
}

/** Marches from the flame to the sample `d` away: the first solid art pixel
 * other than the sample's own casts the shadow (so building faces toward the
 * light glow). */
function rayBlocked({ o, blocks }: Source, wx: number, wy: number, d: number) {
  const tcx = Math.floor(wx * ART),
    tcy = Math.floor(wy * ART);
  const steps = Math.ceil(d * ART * 2);
  for (let k = 1; k < steps; k++) {
    const px = o.x + ((wx - o.x) * k) / steps,
      py = o.y + ((wy - o.y) * k) / steps;
    const cx = Math.floor(px),
      cy = Math.floor(py);
    if (Math.floor(px * ART) === tcx && Math.floor(py * ART) === tcy) return false;
    if (cellInBounds(cx, cy) && blocks(px, py)) return true;
  }
  return false;
}

/** A roof pillar stands between the flame and the sample `d` away. */
function pillarBlocked({ l, o }: Source, w: Point, d: number) {
  return l.pillars.some(([px, py, pr]) => segmentPointDist(o, w, { x: px, y: py }) < pr && Math.hypot(px - o.x, py - o.y) < d);
}

/** Distance from `p` to the segment a–b. */
function segmentPointDist(a: Point, b: Point, p: Point) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

type Field = { src: Float32Array; cols: number; rows: number };

/** One 3×3 box-blur pass: softens occlusion edges into penumbras. */
function blur(f: Field): Float32Array {
  const out = new Float32Array(f.src.length);
  for (let y = 0; y < f.rows; y++) for (let x = 0; x < f.cols; x++) out[y * f.cols + x] = boxAverage(f, x, y);
  return out;
}

const inField = (x: number, y: number, cols: number, rows: number) => x >= 0 && y >= 0 && x < cols && y < rows;

/** The mean of the samples around (x, y) that lie inside the field. */
function boxAverage({ src, cols, rows }: Field, x: number, y: number) {
  let acc = 0,
    n = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx,
        yy = y + dy;
      if (!inField(xx, yy, cols, rows)) continue;
      acc += src[yy * cols + xx];
      n++;
    }
  return acc / n;
}
