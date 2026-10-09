import { enemySize } from "./catalog.ts";
/** Canvas renderer for DEFEND: the camera, and each frame's passes in order.
 * The city (ground, streets, houses, walls; city-layer.ts) is painted once
 * into an offscreen layer and only repainted when a building falls or is
 * rebuilt. Over it each frame: park fences, damage, unit shadows, the
 * overcast and torchlight (lighting.ts), the keep's banner, scorches, the
 * fire mages' burning ground (mage-art.ts), units and effects
 * (battle-art.ts, with the valkyries' charges from valkyrie-art.ts), the
 * black lightning (dark-art.ts), the trees over them (park-trees.ts), the
 * fallen defenders' ghosts rising (ghosts.ts), the chimneys' smoke (chimney-smoke.ts), the
 * planted war banner, the magic boats' water (flood-art.ts) over the ground, the wizards' fire, the building grid and drag overlay (edit-overlay.ts), then
 * rain in screen space. */
import { CELLS_H, CELLS_W, boardSize, hash01 } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { DefendLighting, type LightFrame } from "./lighting.ts";
import { Fences } from "./fences.ts";
import { Rain, Snow, ambientFor, type Weather } from "./weather.ts";
import { areaFade, type AreaId } from "./areas.ts";
import { damageKey, gateSprite, lotSeed, onCityArtLoaded, paintCityLayer, stageOf } from "./city-layer.ts";
import { GATE_FRAMES } from "./gate-art.ts";
import { drawBallistas, drawSpikeThrusts } from "./wall-defense-art.ts";
import { rectDist } from "./pathing.ts";
import { carriedLights, drawDamage, drawScorches, drawUnits, shadowCasters, type Brush, type Burning } from "./battle-art.ts";
import { drawGrid, drawOverlay, type Overlay } from "./edit-overlay.ts";
import { drawInspect, type Armed } from "./inspect.ts";
import { drawFlag, drawWarBanner } from "./structure-art.ts";
import { bannerReach } from "./war-banner.ts";
import { ParkGrass, type Walker } from "./park-grass.ts";
import { PondWater } from "./pond-water.ts";
import { ENEMIES } from "./catalog.ts";
import { GroundRelief, type ReliefLight } from "./ground-relief.ts";
import { WizardArt, flameLights } from "./wizard-art.ts";
import { drawBlazes, mageLights } from "./mage-art.ts";
import { stabLights } from "./valkyrie-art.ts";
import { DarkArt, darkLights } from "./dark-art.ts";
import { ParkTrees, type Under } from "./park-trees.ts";
import { FloodArt } from "./flood-art.ts";
import { ChimneySmoke } from "./chimney-smoke.ts";
import { Ghosts } from "./ghosts.ts";
import { AtmosphereArt } from "./atmosphere-art.ts";

export type DrawOptions = {
  area?: AreaId;
  /** The (dim, gold) tile grid's opacity, 0 to hide it: shown while the
   * player is editing, if they turned it on. */
  grid: number;
  weather: Weather | null;
  /** How far night has fallen, 0–1 (boss waves). */
  night: number;
  now: number;
  reduceMotion: boolean;
  /** Draw the live park grass and pond effects. */
  effects?: boolean;
  healthbars?: boolean;
  /** The run is over: the city's torches go out in a wave from the keep. */
  over?: boolean;
  /** Leave out the planted war banner (while the player carries it). */
  hideBanner?: boolean;
  /** Developer timing, disabled by default. */
  timings?: boolean;
  /** Each structure's card path by uid, for the paths with their own look
   * (`PATH_LOOKS`); presentation only. */
  looks?: Readonly<Record<number, string>>;
  /** The building the player tapped (its id in the map), outlined with its
   * reach and troops. */
  inspect?: { id: number; armed: Armed };
};

/** The torches going out after a lost run: seconds before the first, then
 * seconds a cell further from the keep, the most a torch may be early or
 * late (so neighbours go one by one), and how long one takes to gutter out. */
const DOUSE = { delay: 1.2, perCell: 0.16, jitter: 0.6, fade: 0.7 };

export class DefendRenderer {
  readonly timings = { entityMs: 0, effectsMs: 0, terrainMs: 0 };
  readonly lighting = new DefendLighting();
  readonly fences = new Fences();
  readonly grass = new ParkGrass();
  readonly water = new PondWater();
  readonly relief = new GroundRelief();
  readonly wizard = new WizardArt();
  readonly trees = new ParkTrees();
  readonly dark = new DarkArt();
  readonly floods = new FloodArt();
  readonly smoke = new ChimneySmoke();
  readonly ghosts = new Ghosts();
  readonly atmosphere = new AtmosphereArt();
  /** The battle time the wizard art last advanced to. */
  private wizardTime = 0;
  private rain = new Rain();
  private snow = new Snow();
  private area: AreaId = "moss";
  private previousArea: AreaId | null = null;
  private areaChangedAt = 0;
  private previousLayer: HTMLCanvasElement | null = null;
  private previousKey = "";
  private previousWeather: Weather | null = null;
  private lastWeather: Weather | null = null;
  private areaMix = 1;
  private lastNow = 0;
  /** How far each city gate stands open (0 shut to 1), by building id. */
  private gateOpen = new Map<number, number>();
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
  private combatLayer: HTMLCanvasElement | null = null;
  private combatSim: DefendSim | null = null;
  private combatKey = '';
  px = 8;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    // Every frame begins with an opaque ground fill, so the compositor can
    // skip destination alpha. Never `desynchronized`: a low-latency canvas
    // can be shown part way through a frame, so the lights, trees and rain
    // drawn last flicker in and out.
    this.ctx = canvas.getContext("2d", { alpha: false })!;
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
    const start = opts.timings ? performance.now() : 0;
    this.timings.entityMs = this.timings.effectsMs = this.timings.terrainMs = 0;
    const area = opts.area ?? "moss";
    if (area !== this.area) {
      this.previousArea = sim && map === this.map ? this.area : null;
      this.previousWeather = this.lastWeather;
      this.area = area;
      this.areaChangedAt = opts.now;
      this.previousKey = "";
    }
    this.areaMix = this.previousArea ? areaFade(opts.now - this.areaChangedAt, opts.reduceMotion) : 1;
    if (!sim) { this.areaMix = 1; this.previousArea = null; }
    if (this.areaMix === 1) this.previousArea = null;
    this.lastWeather = opts.weather;
    this.refreshLayer(map, sim, opts.looks);
    if (opts.timings) this.timings.terrainMs = performance.now() - start;
    // Beyond the board's edges: the dark ground the city stands on.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = BEYOND;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.douse(sim, opts);
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    const cityStart = opts.timings ? performance.now() : 0;
    this.drawCity(map, sim, opts, dt);
    if (opts.timings) this.timings.terrainMs += performance.now() - cityStart;
    if (sim) this.advanceWizard(sim);
    if (sim) this.drawBattle(map, sim, opts);
    if (sim) this.atmosphere.draw(this.ctx, this.px, sim, opts.reduceMotion, opts.effects ?? true);
    // Snow sits above terrain but below enemies, defenders, projectiles and
    // health bars: blizzards are dense without erasing combat silhouettes.
    if (sim && !opts.reduceMotion && (opts.effects ?? true)) {
      const old = this.previousArea ? this.previousWeather : null;
      const alpha = (opts.weather?.snow ? this.areaMix : 0) + (old?.snow ? 1 - this.areaMix : 0);
      if (alpha) {
        this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.globalAlpha = alpha;
        this.snow.update(dt, this.canvas.width, this.canvas.height, opts.weather?.blizzard ? 1 : opts.night);
        this.snow.draw(this.ctx, this.px); this.ctx.restore();
      }
    }
    this.drawKeepFlag(map, sim, opts);
    if (sim) this.drawBattleUnits(sim, opts.weather ? this.burning ?? (() => 1) : null, opts);
    this.drawTrees(map, sim, opts, dt);
    this.ghosts.watch(sim, opts.now / 1000);
    this.ghosts.draw(this.ctx, this.px, opts.now / 1000, opts.reduceMotion);
    if (opts.effects ?? true) this.drawSmoke(map, sim, opts);
    if (sim?.warBanner && !opts.hideBanner) drawWarBanner(this.ctx, this.px, sim.warBanner, bannerReach(sim), { t: opts.now / 1000, reduceMotion: opts.reduceMotion });
    if (sim) this.wizard.drawFire(this.ctx, this.px);
    if (opts.inspect) drawInspect(this.ctx, this.px, map, sim, opts.inspect.id, opts.inspect.armed, opts.now, opts.reduceMotion);
    this.drawEditing(overlay, opts.grid);
    // Rain falls in screen space, in front of the camera.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sim && !opts.reduceMotion) {
      const old = this.previousArea ? this.previousWeather : null;
      const rainAlpha = (opts.weather?.rain ? this.areaMix : 0) + (old?.rain ? 1 - this.areaMix : 0);
      this.ctx.save();
      if (rainAlpha) { this.ctx.globalAlpha = rainAlpha; this.drawRain(dt); }
      this.ctx.restore();
    }
    if (opts.timings) this.timings.effectsMs = performance.now() - start - this.timings.terrainMs - this.timings.entityMs;
  }

  /** The building grid (brighter during a drag) and the drag's overlay. */
  private drawEditing(overlay: Overlay | null, grid: number) {
    if (grid > 0) drawGrid(this.ctx, this.px, overlay ? Math.min(1, grid * 1.8) : grid);
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
    if (this.previousArea && this.previousLayer) {
      ctx.save();
      ctx.globalAlpha = 1 - this.areaMix;
      ctx.drawImage(this.previousLayer, 0, 0, W, H);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = false;
    if (sim) this.drawGates(map, sim, opts, dt);
    drawBallistas(ctx, this.px, map, sim);
    drawSpikeThrusts(ctx, this.px, map, sim);
    this.drawParkLife(map, sim, opts, dt);
    // Park fences sit on the ground layer, under the lighting and units.
    this.fences.sync(map);
    if (sim) this.fences.update(sim);
    this.fences.draw(ctx, this.px);
    // Magic boats' water over the ground, sinking what it reaches.
    if (sim) this.floods.draw({ c: ctx, px: this.px, sim, area: this.area, rain: !!opts.weather?.rain, reduceMotion: opts.reduceMotion, reflections: opts.effects ?? true, layer: this.layer, layerScale: this.layerScale });
  }

  /** The city gates swing open while any of the city's people are at
   * them, and shut behind them; the layer shows them shut. */
  private drawGates(map: CityMap, sim: DefendSim, opts: DrawOptions, dt: number) {
    for (const b of map.buildings) {
      if (b.kind !== "gate" || !b.gate) continue;
      if (!sim.intact(b)) {
        this.gateOpen.delete(b.id);
        continue;
      }
      const near = [...sim.soldiers, ...sim.civilians].some((u) => u.hp > 0 && rectDist(b.rect, u.x, u.y) < 1.6);
      const was = this.gateOpen.get(b.id) ?? 0;
      const open = opts.reduceMotion ? (near ? 1 : 0) : Math.max(0, Math.min(1, was + (near ? 2.5 : -1.5) * Math.min(dt, 0.1)));
      this.gateOpen.set(b.id, open);
      const frame = Math.round(open * (GATE_FRAMES - 1));
      if (!frame) continue;
      const r = b.rect, px = this.px;
      const x = Math.round(r.x * px), y = Math.round(r.y * px);
      const art = gateSprite(b.gate.side, frame, stageOf(sim, b), lotSeed(b));
      if (art) this.ctx.drawImage(art, x, y, Math.round((r.x + r.w) * px) - x, Math.round((r.y + r.h) * px) - y);
    }
  }

  /** Pond drips, rings and reflections, then the grass swaying and parting
   * around everyone walking through the parks. */
  private drawParkLife(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    const rain = !!(sim && opts.weather?.rain);
    this.water.sync(map);
    const feet = sim ? walkers(sim) : [];
    if (sim?.cold || opts.weather?.snow || (opts.effects ?? true)) this.water.draw({ c: this.ctx, px: this.px, now: opts.now, rain, cold: sim?.cold ?? !!opts.weather?.snow, thawedPonds: sim?.thawedPonds, night: opts.night, walkers: feet, reduceMotion: opts.reduceMotion, layer: this.layer, layerScale: this.layerScale });
    if (!(opts.effects ?? true)) return;
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
    const overcast = (w: Weather) => w.clear ? .04 : w.rain ? .3 : .18;
    const strength = overcast(weather);
    const old = this.previousArea && this.previousWeather ? overcast(this.previousWeather) : strength;
    Rain.overcast(this.ctx, old + (strength - old) * this.areaMix, W, H);
    this.drawLighting(map, sim, weather, opts);
  }

  /** The keep's banner, while the keep stands. */
  private drawKeepFlag(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    const keep = standingKeep(map, sim);
    if (!keep) return;
    drawFlag(this.ctx, this.px, { x: (keep.x + keep.w / 2) * this.px, y: (keep.y + keep.h / 2) * this.px, t: opts.now / 1000, reduceMotion: opts.reduceMotion });
  }

  /** Blast scorches, burning ground and the wizards' ice, then units, projectiles and
   * effects (carrying torches in weather), and the frost on the chilled. */
  private drawBattleUnits(sim: DefendSim, torches: Burning | null, opts: DrawOptions) {
    const c = this.ctx;
    if (this.burning || opts.over) this.paintCombat(c, sim, torches, opts);
    else {
      // Combat art advances on the fixed simulation clock. Keep screen pixels
      // (including artPen's camera snapping), never rescale a cached frame.
      const key = `${sim.time}:${sim.mapVersion}:${sim.effects.length}:${sim.scorches.length}:${sim.enemies.length}:${sim.soldiers.length}:${sim.civilians.length}:${this.px}:${c.canvas.width}:${c.canvas.height}:${this.cam.s}:${this.cam.x}:${this.cam.y}:${!!torches}:${opts.healthbars === true}`;
      this.combatLayer ??= document.createElement('canvas');
      const layer = this.combatLayer;
      if (sim !== this.combatSim || key !== this.combatKey) {
        this.combatSim = sim; this.combatKey = key;
        if (layer.width !== c.canvas.width || layer.height !== c.canvas.height) {
          layer.width = c.canvas.width; layer.height = c.canvas.height;
        }
        const off = layer.getContext('2d')!;
        off.setTransform(1, 0, 0, 1, 0, 0); off.clearRect(0, 0, layer.width, layer.height);
        off.setTransform(c.getTransform()); off.imageSmoothingEnabled = false;
        this.paintCombat(off, sim, torches, opts);
      }
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(layer, 0, 0); c.restore();
    }
    // Chilled enemies twinkle on wall time, independently of simulation ticks.
    this.wizard.drawChill(c, this.px, sim, opts.now);
  }

  private paintCombat(c: CanvasRenderingContext2D, sim: DefendSim, torches: Burning | null, opts: DrawOptions) {
    const brush: Brush = { c, px: this.px };
    drawScorches(brush, sim);
    drawBlazes(c, this.px, sim);
    this.wizard.drawIce(c, this.px, sim.frosts, sim.time * 1000, flameLights(sim).relief);
    drawUnits(brush, sim, torches, opts.healthbars === true, opts.timings ? this.timings : undefined);
    this.dark.draw(c, this.px, sim);
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

  /** Faint smoke drifting off the houses' chimneys, over the trees. */
  private drawSmoke(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    this.smoke.sync(map);
    const weather = sim ? opts.weather : null;
    this.smoke.draw(this.ctx, this.px, {
      now: opts.now, sim, reduceMotion: opts.reduceMotion,
      wind: weather?.rain ? 0.8 : weather ? 0.3 : 0,
      dim: weather ? opts.night : 0,
    });
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
    if (!(opts.effects ?? true) || !this.relief.sync(map, this.px, this.board.W, this.board.H, this.area)) return;
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
   * buildings' damage stages changed. Zoomed in, the city is painted at 2–4× so edges
   * stay crisp. */
  private refreshLayer(map: CityMap, sim: DefendSim | null, looks?: Readonly<Record<number, string>>) {
    const { W, H } = this.board;
    let k = this.cam.s >= 4 ? 4 : this.cam.s >= 2.5 ? 3 : this.cam.s >= 1.4 ? 2 : 1;
    while (k > 1 && W * H * k * k > 18e6) k--;
    this.layerScale = k;
    // Every building's damage stage is painted into the layer too.
    const key = `${W}:${k}:${this.area}:${sim ? `${sim.mapVersion}:${damageKey(sim)}` : -1}:${looks ? Object.entries(looks).join(",") : ""}`;
    if (this.previousArea && (key !== this.previousKey || !this.layerKey)) {
      this.previousLayer ??= document.createElement("canvas");
      this.previousLayer.width = W * k;
      this.previousLayer.height = H * k;
      this.lighting.setMap(map);
      paintCityLayer(this.previousLayer.getContext("2d")!, this.px * k, { map, sim, area: this.previousArea, lights: this.lighting.lights, stones: this.lighting.roadStones, looks });
      this.previousKey = key;
    }
    if (map === this.map && key === this.layerKey) return;
    this.map = map;
    this.layerKey = key;
    this.lighting.setMap(map);
    this.layer.width = W * k;
    this.layer.height = H * k;
    paintCityLayer(this.lctx, this.px * k, { map, sim, area: this.area, lights: this.lighting.lights, stones: this.lighting.roadStones, looks });
  }

  /** Folds fallen and rebuilt buildings into the lighting, then draws what
   * lies on the ground: building damage, and (in weather) unit shadows. */
  private drawBattleGround(map: CityMap, sim: DefendSim, weather: Weather | null, night: number) {
    const changed = sim.changed.splice(0);
    if (weather) this.lighting.update(sim.solid, changed, standing(map, sim));
    else if (changed.length) this.lighting.invalidate(changed);
    drawDamage({ c: this.ctx, px: this.px }, sim);
    if (weather) this.lighting.drawUnitShadows(this.ctx, this.px, shadowCasters(sim), 0.8 + 0.2 * night, this.burning || this.cam.s !== 1 ? undefined : sim.time);
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
    const flames = flameLights(sim), mages = mageLights(sim), stabs = stabLights(sim), dark = darkLights(sim);
    this.lighting.drawLight(this.ctx, frame, ambientFor(weather, opts.night, this.previousArea ? this.previousWeather : null, this.areaMix), {
      torches: [...this.carried(sim), ...flames.carried, ...mages.carried, ...stabs.carried, ...dark.carried],
      solid: sim.solid,
      version: sim.mapVersion,
    });
    this.lighting.drawRelief(this.ctx, this.px, weather.rain ? 0.85 : 0.65);
    this.drawGroundRelief(map, sim, opts, [...flames.relief, ...mages.relief, ...stabs.relief, ...dark.relief]);
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
  for (const e of sim.enemies) if (!ENEMIES[e.kind].flying) out.push({ id: e.id, x: e.x, y: e.y, size: enemySize(e) });
  for (const s of sim.soldiers) out.push({ id: s.id, x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ id: c.id, x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Everyone a tree can stand over. */
function beneath(sim: DefendSim): Under[] {
  const out: Under[] = [];
  for (const e of sim.enemies) out.push({ x: e.x, y: e.y, size: enemySize(e) });
  for (const s of sim.soldiers) out.push({ x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Whether building `id` still stands in the battle. */
const standing = (map: CityMap, sim: DefendSim) => (id: number) => sim.intact(map.buildings[id]);
