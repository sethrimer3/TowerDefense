/** Canvas renderer for DEFEND: the camera, and each frame's passes in order.
 * The city (ground, streets, houses, walls; city-layer.ts) is painted once
 * into an offscreen layer and only repainted when a building falls or is
 * rebuilt. Over it each frame: park fences, damage, unit shadows, the
 * overcast and torchlight (lighting.ts), the keep's banner, scorches, units
 * and effects (battle-art.ts), the trees over them (park-trees.ts), the
 * wizards' fire, the building grid and drag overlay (edit-overlay.ts), then
 * rain in screen space. */
import { CELLS_H, CELLS_W, boardSize, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { DefendLighting, type LightFrame } from "./lighting.ts";
import { Fences } from "./fences.ts";
import { Rain, ambientFor, type Weather } from "./weather.ts";
import { onCityArtLoaded, paintCityLayer } from "./city-layer.ts";
import { carriedLights, drawDamage, drawScorches, drawUnits, shadowCasters, type Brush, type Burning } from "./battle-art.ts";
import { drawGrid, drawOverlay, type Overlay } from "./edit-overlay.ts";
import { drawFlag, keepStage } from "./structure-art.ts";
import { ParkGrass, type Walker } from "./park-grass.ts";
import { PondWater } from "./pond-water.ts";
import { ENEMIES } from "./catalog.ts";
import { GroundRelief, type ReliefLight } from "./ground-relief.ts";
import { WizardArt, flameLights } from "./wizard-art.ts";
import { ParkTrees, type Under } from "./park-trees.ts";

export type DrawOptions = {
  /** Show the (dim, gold) tile grid — while the player is editing. */
  grid: boolean;
  weather: Weather | null;
  /** How far night has fallen, 0–1 (boss waves). */
  night: number;
  now: number;
  reduceMotion: boolean;
  /** Draw the live park grass and pond effects. */
  effects?: boolean;
  /** The run is over: the city's torches go out in a wave from the keep. */
  over?: boolean;
};

/** The torches going out after a lost run: seconds before the first, then
 * seconds a cell further from the keep, the most a torch may be early or
 * late (so neighbours go one by one), and how long one takes to gutter out. */
const DOUSE = { delay: 1.2, perCell: 0.16, jitter: 0.6, fade: 0.7 };

export class DefendRenderer {
  readonly lighting = new DefendLighting();
  readonly fences = new Fences();
  readonly grass = new ParkGrass();
  readonly water = new PondWater();
  readonly relief = new GroundRelief();
  readonly wizard = new WizardArt();
  readonly trees = new ParkTrees();
  /** The battle time the wizard art last advanced to. */
  private wizardTime = 0;
  private rain = new Rain();
  private lastNow = 0;
  private layerScale = 1;
  /** Camera: zoom `s` and translation (canvas pixels) applied to the whole
   * board. s = 1 fits the board to the stage it sits in; along an edge the
   * view is wider than the board it is centred, elsewhere clamped to it. */
  readonly cam = { s: 1, x: 0, y: 0 };
  static readonly MAX_ZOOM = 6;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private layer: HTMLCanvasElement;
  private lctx: CanvasRenderingContext2D;
  private layerKey = "";
  private map: CityMap | null = null;
  px = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.layer = document.createElement("canvas");
    this.lctx = this.layer.getContext("2d")!;
    onCityArtLoaded(() => (this.layerKey = ""));
  }

  /** Matches the canvas to its box, which fills the view. The board's scale
   * comes from the stage (`refW` × `refH` CSS pixels, the room the view has
   * with no panel open), so it holds still while a panel slides open and the
   * view narrows; the board point in the middle of the view stays there. */
  resize(refW: number, refH: number) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const px = Math.max(1, Math.min((refW * dpr) / CELLS_W, (refH * dpr) / CELLS_H));
    const old = { w: this.canvas.width, h: this.canvas.height, px: this.px };
    if (w === old.w && h === old.h && px === old.px) return;
    const scale = this.cam.s * old.px,
      cx = (old.w / 2 - this.cam.x) / scale,
      cy = (old.h / 2 - this.cam.y) / scale;
    this.canvas.width = w;
    this.canvas.height = h;
    this.px = px;
    this.cam.x = w / 2 - cx * this.cam.s * px;
    this.cam.y = h / 2 - cy * this.cam.s * px;
    this.clampCam();
  }

  /** The whole board's size in canvas pixels, unzoomed. */
  get board() {
    return boardSize(this.px);
  }

  /** Client (CSS) point → canvas pixels. */
  private toCanvas(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * this.canvas.width, y: ((clientY - r.top) / r.height) * this.canvas.height };
  }

  /** Client point → board position in cells (through the camera). */
  toCell(clientX: number, clientY: number) {
    const p = this.toCanvas(clientX, clientY);
    return { fx: (p.x - this.cam.x) / this.cam.s / this.px, fy: (p.y - this.cam.y) / this.cam.s / this.px };
  }

  /** Zoom by `factor`, keeping the board point under the client point fixed. */
  zoomAt(clientX: number, clientY: number, factor: number) {
    const p = this.toCanvas(clientX, clientY);
    const s = Math.max(1, Math.min(DefendRenderer.MAX_ZOOM, this.cam.s * factor));
    const k = s / this.cam.s;
    this.cam.x = p.x - (p.x - this.cam.x) * k;
    this.cam.y = p.y - (p.y - this.cam.y) * k;
    this.cam.s = s;
    this.clampCam();
  }

  /** Pan by a client-pixel delta. */
  panBy(dx: number, dy: number) {
    const r = this.canvas.getBoundingClientRect();
    this.cam.x += (dx / r.width) * this.canvas.width;
    this.cam.y += (dy / r.height) * this.canvas.height;
    this.clampCam();
  }

  resetCam() {
    this.cam.s = 1;
    this.cam.x = this.cam.y = 0;
    this.clampCam();
  }

  private clampCam() {
    const { W, H } = this.board;
    this.cam.x = clampAxis(this.cam.x, this.canvas.width, W * this.cam.s);
    this.cam.y = clampAxis(this.cam.y, this.canvas.height, H * this.cam.s);
  }

  draw(map: CityMap, sim: DefendSim | null, overlay: Overlay | null, opts: DrawOptions) {
    this.refreshLayer(map, sim);
    // Beyond the board's edges: the dark ground the city stands on.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = BEYOND;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.douse(sim, opts);
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    this.drawCity(map, sim, opts, dt);
    if (sim) this.advanceWizard(sim);
    if (sim) this.drawBattle(map, sim, opts);
    this.drawKeepFlag(map, sim, opts);
    if (sim) this.drawBattleUnits(sim, opts.weather ? this.burning ?? (() => 1) : null, opts);
    this.drawTrees(map, sim, opts, dt);
    if (sim) this.wizard.drawFire(this.ctx, this.px);
    this.drawEditing(overlay, opts.grid);
    // Rain falls in screen space, in front of the camera.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sim && opts.weather?.rain) this.drawRain(dt);
  }

  /** The building grid (brighter during a drag) and the drag's overlay. */
  private drawEditing(overlay: Overlay | null, grid: boolean) {
    if (grid) drawGrid(this.ctx, this.px, overlay ? 0.2 : 0.11);
    if (overlay) drawOverlay(this.ctx, this.px, overlay);
  }

  /** The city layer through the camera, the live park grass and ponds over
   * it, and the park fences. */
  private drawCity(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.x, this.cam.y);
    ctx.imageSmoothingEnabled = this.cam.s / this.layerScale < 1;
    const { W, H } = this.board;
    ctx.drawImage(this.layer, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
    if (opts.effects ?? true) this.drawParkLife(map, sim, opts, dt);
    // Park fences sit on the ground layer, under the lighting and units.
    this.fences.sync(map);
    if (sim) this.fences.update(sim);
    this.fences.draw(ctx, this.px);
  }

  /** Pond drips, rings and reflections, then the grass swaying and parting
   * around everyone walking through the parks. */
  private drawParkLife(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    const rain = !!(sim && opts.weather?.rain);
    this.water.sync(map);
    const feet = sim ? walkers(sim) : [];
    this.water.draw({ c: this.ctx, px: this.px, now: opts.now, rain, night: opts.night, walkers: feet, reduceMotion: opts.reduceMotion, layer: this.layer, layerScale: this.layerScale });
    this.grass.sync(map);
    this.grass.draw({
      c: this.ctx, px: this.px, now: opts.now, dt, reduceMotion: opts.reduceMotion,
      wind: rain ? "rain" : opts.weather ? "cloud" : "calm",
      walkers: feet,
    });
  }

  /** What a battle lays over the city before its units: damage, and in
   * weather (battles are always under cloud, so the city's lights are always
   * lit) unit shadows, the overcast and the torchlight. */
  private drawBattle(map: CityMap, sim: DefendSim, opts: DrawOptions) {
    const weather = opts.weather;
    this.drawBattleGround(map, sim, weather, opts.night);
    if (!weather) return;
    const { W, H } = this.board;
    Rain.overcast(this.ctx, weather.rain ? 0.3 : 0.18, W, H);
    this.drawLighting(map, sim, weather, opts);
  }

  /** The keep's banner, while the keep stands. */
  private drawKeepFlag(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    const keep = standingKeep(map, sim);
    if (!keep) return;
    drawFlag(this.ctx, this.px, { x: (keep.x + keep.w / 2) * this.px, y: (keep.y + keep.h / 2) * this.px, t: opts.now / 1000, reduceMotion: opts.reduceMotion });
  }

  /** Blast scorches and the wizards' ice, then units, projectiles and
   * effects (carrying torches in weather), and the frost on the chilled. */
  private drawBattleUnits(sim: DefendSim, torches: Burning | null, opts: DrawOptions) {
    const brush: Brush = { c: this.ctx, px: this.px };
    drawScorches(brush, sim);
    this.wizard.drawIce(this.ctx, this.px, sim.frosts, sim.time * 1000, flameLights(sim).relief);
    drawUnits(brush, sim, torches);
    this.wizard.drawChill(this.ctx, this.px, sim, opts.now);
  }

  /** The trees over everyone, half faded over anyone under them, and in a
   * battle's weather darkened with the city below them. */
  private drawTrees(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    this.trees.sync(map);
    this.trees.update(sim ? beneath(sim) : [], dt, opts.reduceMotion);
    const dim = sim && opts.weather ? (o: CanvasRenderingContext2D) => {
      o.fillStyle = `rgba(118,118,118,${opts.weather!.rain ? 0.2 : 0.12})`;
      o.fillRect(0, 0, this.board.W, this.board.H);
      this.lighting.darken(o);
    } : undefined;
    this.trees.draw(this.ctx, this.px, dim);
  }

  /** The wizards' fire and ice move on battle time, so they keep pace with
   * the battle's speed and stop while it is paused. */
  private advanceWizard(sim: DefendSim) {
    if (sim.time < this.wizardTime) this.wizardTime = 0;
    const dt = Math.min(0.25, sim.time - this.wizardTime);
    this.wizardTime = sim.time;
    this.wizard.update(sim, dt, sim.time * 1000);
  }

  /** Light catching the flagstones' bumps outside the city: the fixed
   * fires and lanterns (baked until a building falls or rises), then the
   * moving lights: wizard fire and ice, blasts and hand torches. */
  private drawGroundRelief(map: CityMap, sim: DefendSim, opts: DrawOptions, flames: ReliefLight[]) {
    if (!(opts.effects ?? true) || !this.relief.sync(map, this.px, this.board.W, this.board.H)) return;
    const intact = standing(map, sim);
    const fixed = () =>
      this.lighting.lights
        .filter((l) => (l.owner < 0 || intact(l.owner)) && this.lighting.burn(l) > 0)
        .map((l) => ({ x: l.x, y: l.y, r: l.radius * 0.8, k: l.strength * 0.55, color: "#ffc68a" }));
    const moving: ReliefLight[] = [...flames, ...this.wizard.iceLights(sim.frosts, sim.time * 1000)];
    for (const fx of sim.effects) if (fx.kind === "boom") moving.push({ x: fx.x, y: fx.y, r: fx.r * 2.4, k: 1.4 * (1 - fx.t / 0.6), color: "#ffcf8a" });
    const burns = this.burning ?? (() => 1);
    for (const u of [...sim.soldiers, ...sim.civilians]) {
      const b = burns(u.x, u.y, u.id);
      if (b > 0) moving.push({ x: u.x, y: u.y, r: 2.2, k: 0.45 * b, color: "#ffc68a" });
    }
    const out = this.lighting.lights.filter((l) => this.lighting.burn(l) <= 0).length;
    this.relief.draw(this.ctx, this.px, { version: `${sim.mapVersion}:${out}`, lights: fixed }, moving, 0.6 + opts.night * 0.4);
  }

  private drawRain(dt: number) {
    this.rain.update(dt, this.canvas.width, this.canvas.height);
    this.rain.draw(this.ctx, this.px);
  }

  /** Repaints the city layer if the map, size, zoom band, buildings or the
   * keep's damage changed. Zoomed in, the city is painted at 2–4× so edges
   * stay crisp. */
  private refreshLayer(map: CityMap, sim: DefendSim | null) {
    const { W, H } = this.board;
    let k = this.cam.s >= 4 ? 4 : this.cam.s >= 2.5 ? 3 : this.cam.s >= 1.4 ? 2 : 1;
    while (k > 1 && W * H * k * k > 18e6) k--;
    this.layerScale = k;
    // The keep's damage stage is painted into the layer too.
    const key = `${W}:${k}:${sim ? `${sim.mapVersion}:${keepStage(sim.keepHp(), sim.keepMaxHp())}` : -1}`;
    if (map === this.map && key === this.layerKey) return;
    this.map = map;
    this.layerKey = key;
    this.lighting.setMap(map);
    this.layer.width = W * k;
    this.layer.height = H * k;
    paintCityLayer(this.lctx, this.px * k, { map, sim, lights: this.lighting.lights, stones: this.lighting.roadStones });
  }

  /** Folds fallen and rebuilt buildings into the lighting, then draws what
   * lies on the ground: building damage, and (in weather) unit shadows. */
  private drawBattleGround(map: CityMap, sim: DefendSim, weather: Weather | null, night: number) {
    const changed = sim.changed.splice(0);
    if (weather) this.lighting.update(sim.solid, changed, standing(map, sim));
    else if (changed.length) this.lighting.invalidate(changed);
    drawDamage({ c: this.ctx, px: this.px }, sim);
    if (weather) this.lighting.drawUnitShadows(this.ctx, this.px, shadowCasters(sim), 0.8 + 0.2 * night);
  }

  /** Notes when a run ends (or a new one starts), and from then on tells
   * the lighting how brightly each torch still burns. */
  private douse(sim: DefendSim | null, opts: DrawOptions) {
    if (!sim || !(opts.over || sim.lost)) {
      this.dousing = null;
      this.burning = null;
      this.lighting.burning = null;
      return;
    }
    if (this.dousing?.sim !== sim) this.dousing = { sim, at: opts.now };
    const k = sim.keep.rect,
      kx = k.x + k.w / 2,
      ky = k.y + k.h / 2;
    const t = (opts.now - this.dousing.at) / 1000;
    const burns: Burning = (x, y, id) => {
      const u = (t - DOUSE.delay - Math.sqrt((x - kx) * (x - kx) + (y - ky) * (y - ky)) * DOUSE.perCell - hash01(id, 97) * DOUSE.jitter) / DOUSE.fade;
      if (u <= 0) return 1;
      if (u >= 1) return 0;
      // A last sputter as it gutters out.
      return (1 - u) * (opts.reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(u * 37 + id));
    };
    this.burning = burns;
    this.lighting.burning = (l) => burns(l.x, l.y, l.id + 5000);
  }
  private dousing: { sim: DefendSim; at: number } | null = null;
  /** How brightly a torch still burns while the city's lights go out. */
  private burning: Burning | null = null;

  /** The moving lights, hand torches dimmed as they go out. */
  private carried(sim: DefendSim) {
    const burns = this.burning;
    if (!burns) return carriedLights(sim);
    return carriedLights(sim).flatMap((t) => {
      if (t.r) return [t];
      const b = burns(t.x, t.y, t.id);
      return b > 0 ? [{ ...t, k: 0.8 * b }] : [];
    });
  }

  /** Darkness and torchlight, the gravel's lit relief, and the flames. */
  private drawLighting(map: CityMap, sim: DefendSim, weather: Weather, opts: DrawOptions) {
    const frame: LightFrame = { px: this.px, now: opts.now, reduceMotion: opts.reduceMotion, intact: standing(map, sim) };
    const flames = flameLights(sim);
    this.lighting.drawLight(this.ctx, frame, ambientFor(weather, opts.night), {
      torches: [...this.carried(sim), ...flames.carried],
      solid: sim.solid,
      version: sim.mapVersion,
    });
    this.lighting.drawRelief(this.ctx, this.px, weather.rain ? 0.85 : 0.65);
    this.drawGroundRelief(map, sim, opts, flames.relief);
    this.lighting.drawFlames(this.ctx, frame);
  }

}

/** What shows around the board when the view is wider or taller than it. */
const BEYOND = "#0b0907";

/** A camera offset along one axis: centred when the board (`board` canvas
 * pixels at this zoom) is narrower than the view, else kept on the board. */
function clampAxis(at: number, view: number, board: number) {
  return board <= view ? (view - board) / 2 : Math.min(0, Math.max(view - board, at));
}

/** The keep's rect while it stands (its banner flies over it), else null. */
function standingKeep(map: CityMap, sim: DefendSim | null) {
  const keep = map.buildings.find((b) => b.kind === "keep");
  if (!keep) return null;
  return !sim || sim.intact(keep) ? keep.rect : null;
}

/** Everyone on foot, for the grass to part around. */
function walkers(sim: DefendSim): Walker[] {
  const out: Walker[] = [];
  for (const e of sim.enemies) if (!ENEMIES[e.kind].flying) out.push({ x: e.x, y: e.y, size: ENEMIES[e.kind].size });
  for (const s of sim.soldiers) out.push({ x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Everyone a tree can stand over. */
function beneath(sim: DefendSim): Under[] {
  const out: Under[] = [];
  for (const e of sim.enemies) out.push({ x: e.x, y: e.y, size: ENEMIES[e.kind].size });
  for (const s of sim.soldiers) out.push({ x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Whether building `id` still stands in the battle. */
const standing = (map: CityMap, sim: DefendSim) => (id: number) => sim.intact(map.buildings[id]);
