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
import { LIGHTING_CONFIG, getTorchFlicker, getTorchSway } from "../lighting.ts";
import { glowColor, lightFalloff } from "../torch-light.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, ORTHO, boardSize, cellInBounds, cellIndex, hash, hash01, type Rect } from "./grid.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { FIELD_H, FIELD_W, LightField, RES, poolSamples, type PoolSamples } from "./light-field.ts";

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
  return lights;
}

type NewLight = Omit<Light, "id">;

/** Reach of each tower's fire, in cells. */
const TOWER_RADIUS: Partial<Record<Building["kind"], number>> = { archerTower: 7.5, cannonTower: 5.5, watchTower: 6.5, wizardTower: 5, mageGuild: 5.5 };

/** A building's own lights: a tower's fire (and the Mage Guild's fire
 * well), the keep's braziers, a barracks or palace door lamp. */
function buildingLights(map: CityMap, b: Building): NewLight[] {
  const r = b.rect;
  const radius = TOWER_RADIUS[b.kind];
  if (radius !== undefined) return [towerFire(b, radius)];
  if (b.kind === "keep") return keepBraziers(b);
  if (b.kind !== "barracks" && b.kind !== "archerBarracks" && b.kind !== "valkyriePalace" && b.kind !== "darkKeep") return [];
  const door = doorPoint(map, r);
  return door ? [{ kind: "door", x: door.x, y: door.y, radius: 4.5, strength: 0.85, owner: b.id, inside: false, pillars: [] }] : [];
}

/** A fire inside a tower. An archer tower's roof stands on four corner
 * pillars, which block it. */
function towerFire(b: Building, radius: number): NewLight {
  const r = b.rect;
  const inset = 0.22;
  return {
    kind: b.kind as LightKind,
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    radius,
    strength: 1,
    owner: b.id,
    inside: true,
    pillars:
      b.kind === "archerTower"
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
  ].map(([cx, cy]) => ({ kind: "door" as const, x: cx, y: cy, radius: 4.5, strength: 0.9, owner: b.id, inside: false, pillars: [] }));
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

/** The first house beside road cell (cx, cy): its direction and id. */
function lanternMount(map: CityMap, cx: number, cy: number): [number, number, number] | null {
  for (const [dx, dy] of ORTHO) {
    const nx = cx + dx,
      ny = cy + dy;
    if (!cellInBounds(nx, ny)) continue;
    const n = cellIndex(nx, ny);
    if (map.type[n] === CellType.HOUSE) return [dx, dy, map.owner[n]];
  }
  return null;
}

function doorPoint(map: CityMap, r: Rect): { x: number; y: number } | null {
  for (let x = r.x; x < r.x + r.w; x++)
    for (const [y, dy] of [
      [r.y + r.h, 1],
      [r.y - 1, -1],
    ]) {
      if (y < 0 || y >= CELLS_H) continue;
      if (map.type[cellIndex(x, y)] === CellType.ROAD) return { x: r.x + r.w / 2, y: dy > 0 ? r.y + r.h + 0.25 : r.y - 0.25 };
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
  /** How brightly each light still burns, 0 (out) to 1; set each frame
   * while the city's lights are going out, else null (all burning). */
  burning: ((l: Light) => number) | null = null;

  /** How brightly light `l` burns now. */
  burn(l: Light) {
    return this.burning ? this.burning(l) : 1;
  }

  /** Point the lighting at a (new) city. */
  setMap(map: CityMap) {
    if (map === this.map) return;
    this.map = map;
    this.lights = cityLights(map);
    this.stones = roadStones(map);
    this.bakes.clear();
    this.queue = new Set(this.lights.map((l) => l.id));
    this.domDirty = true;
    this.reliefKey = "";
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
      const pair: [Bake, Bake] = [bakeLight(l, this.map, solid, -SWAY), bakeLight(l, this.map, solid, SWAY)];
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
  drawLight(c: CanvasRenderingContext2D, frame: LightFrame, ambient: Ambient, carried: Carried) {
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
    c.save();
    c.drawImage(this.dark, 0, 0);
    c.globalCompositeOperation = "soft-light";
    c.drawImage(this.glow, 0, 0);
    c.globalCompositeOperation = "lighter";
    c.globalAlpha = LIGHTING_CONFIG.glow.bloom;
    c.drawImage(this.glow, 0, 0);
    c.restore();
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
    for (const t of carried.torches) {
      const f = getTorchFlicker({ x: t.id * 11, y: t.id * 5 }, now, reduceMotion);
      // Explosion flashes pass their own reach and brightness.
      const alpha = Math.min(1, (t.k ?? 0.8) * f);
      field.addTorch(t.x, t.y, (t.r || CARRIED_RADIUS) * (0.95 + (f - 1) * 0.6), alpha);
    }
    const small = this.small!;
    field.paintTorches(small.torchImg.data);
    small.torch.getContext("2d")!.putImageData(small.torchImg, 0, 0);
    const dk = this.dark!.getContext("2d")!,
      gl = this.glow!.getContext("2d")!;
    const W = dk.canvas.width,
      H = dk.canvas.height;
    this.dyn = upscale(this.dyn, small.torch, px, W, H);
    const d = this.dyn.getContext("2d")!;
    d.globalCompositeOperation = "destination-in";
    d.drawImage(this.groundMask(carried, px, W, H), 0, 0);
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
    const lit = this.lights.filter((l) => this.active(l, intact));
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const l of lit) {
      const f = getTorchFlicker({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      const b = this.burn(l);
      const r = px * (l.kind === "lantern" || l.kind === "door" ? 0.9 : 1.4) * f * (0.4 + 0.6 * b);
      c.globalAlpha = Math.min(1, 0.7 * f * b);
      c.drawImage(this.flameSprite, (l.x + sway.x) * px - r, (l.y + sway.y) * px - r, r * 2, r * 2);
    }
    c.restore();
    // A pixel of actual flame on top.
    const s = Math.max(1, px * 0.18);
    for (const l of lit) {
      const sway = getTorchSway({ x: l.id * 7, y: l.id * 13 }, now, reduceMotion);
      c.globalAlpha = this.burn(l);
      c.fillStyle = "#ffe6a8";
      c.fillRect((l.x + sway.x) * px - s / 2, (l.y + sway.y * 0.5) * px - s / 2, s, s * sway.stretch);
    }
    c.globalAlpha = 1;
  }
}

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
function bakeLight(l: Light, map: CityMap, solid: Uint8Array, offsetX: number): Bake {
  const R = l.radius;
  const left = Math.floor(l.x - R - 1),
    top = Math.floor(l.y - R - 1);
  const size = Math.ceil(R * 2 + 3);
  const cols = size * RES,
    rows = size * RES;
  const src: Source = {
    l,
    o: { x: l.x + offsetX, y: l.y },
    blocks: (i: number) => solid[i] === 1 && map.owner[i] >= 0 && !(l.inside && map.owner[i] === l.owner),
  };
  const raw = new Float32Array(cols * rows);
  for (let sy = 0; sy < rows; sy++) {
    const wy = top + (sy + 0.5) / RES;
    for (let sx = 0; sx < cols; sx++) raw[sy * cols + sx] = lightAt(src, left + (sx + 0.5) / RES, wy);
  }
  const values = blur({ src: raw, cols, rows });
  unlightStanding(values, { left, top, cols, rows }, map, solid);
  return { values, cols, rows, left, top };
}

type Point = { x: number; y: number };

/** A light being baked: its flame `o` (maybe nudged) and which cells cast
 * its shadows. */
type Source = { l: Light; o: Point; blocks: (i: number) => boolean };

/** The light reaching sample point (wx, wy), 0 when out of reach or shadowed. */
function lightAt(src: Source, wx: number, wy: number) {
  const { l, o } = src;
  const d = Math.hypot(wx - o.x, wy - o.y);
  if (d >= l.radius || !cellInBounds(wx, wy)) return 0;
  if (rayBlocked(src, wx, wy, d) || pillarBlocked(src, { x: wx, y: wy }, d)) return 0;
  return lightFalloff(d, l.radius);
}

/** Marches from the flame to the sample `d` away: the first solid cell
 * other than the sample's own casts the shadow (so building faces toward the
 * light glow). */
function rayBlocked({ o, blocks }: Source, wx: number, wy: number, d: number) {
  const tcx = Math.floor(wx),
    tcy = Math.floor(wy);
  const steps = Math.ceil(d / 0.2);
  for (let k = 1; k < steps; k++) {
    const px = o.x + ((wx - o.x) * k) / steps,
      py = o.y + ((wy - o.y) * k) / steps;
    const cx = Math.floor(px),
      cy = Math.floor(py);
    if (cx === tcx && cy === tcy) return false;
    if (cellInBounds(cx, cy) && blocks(cellIndex(cx, cy))) return true;
  }
  return false;
}

/** A roof pillar stands between the flame and the sample `d` away. */
function pillarBlocked({ l, o }: Source, w: Point, d: number) {
  return l.pillars.some(([px, py, pr]) => segmentPointDist(o, w, { x: px, y: py }) < pr && Math.hypot(px - o.x, py - o.y) < d);
}

/** Light lands on open ground only: standing buildings and wall stones stay
 * unlit, so flames read as street-level, never hovering above the roofs. */
function unlightStanding(values: Float32Array, f: { left: number; top: number; cols: number; rows: number }, map: CityMap, solid: Uint8Array) {
  const standing = (cx: number, cy: number) => cellInBounds(cx, cy) && solid[cellIndex(cx, cy)] && map.owner[cellIndex(cx, cy)] >= 0;
  for (let sy = 0; sy < f.rows; sy++) {
    const cy = Math.floor(f.top + (sy + 0.5) / RES);
    for (let sx = 0; sx < f.cols; sx++) if (standing(Math.floor(f.left + (sx + 0.5) / RES), cy)) values[sy * f.cols + sx] = 0;
  }
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
