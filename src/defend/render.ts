import { CityLife } from "./city-life.ts";
import { drawCityLife } from "./city-life-art.ts";
import { torchLevel } from "./city-torches.ts";
import { worldSky } from "../daylight.ts";
import { SunShadows } from "./sun-shadows.ts";
import { BlightGround } from "./blight-art.ts";
import { CellType } from "./citygen.ts";
import { bareAt, groundArt, turfAt as parkTurfAt } from "./ground-art.ts";
import { pondDisc, pondField } from "./park-geometry.ts";
import { shadedAt, turfAt as forestTurfAt } from "./forest-art.ts";
import { CollapseView } from "./collapse-view.ts";
import type { GridColor } from "../settings.ts";
import type { Flag } from "../profile/model.ts";
import { DarkDrain } from "./dark-drain.ts";
import { drawMines } from "./mine-art.ts";
import { enemySize } from "./catalog.ts";
/** Canvas renderer for DEFEND: the camera, and each frame's passes in order.
 * The city (ground, streets, houses, walls; city-layer.ts) is painted once
 * into an offscreen layer and only repainted when a building falls or is
 * rebuilt. Over it each frame: the forest's ground outside the walls
 * (forest-art.ts), park fences, damage, unit shadows, the
 * overcast and torchlight (lighting.ts), the keep's banner, scorches, the
 * fire mages' burning ground (mage-art.ts), units and effects
 * (battle-art.ts, with the valkyries' charges from valkyrie-art.ts), the
 * black lightning (dark-art.ts), the trees over them (park-trees.ts, then the
 * forest's), the
 * fallen defenders' ghosts rising (ghosts.ts), the chimneys' smoke (chimney-smoke.ts), the
 * planted war banner, the magic boats' water (flood-art.ts) over the ground, the wizards' fire, the building grid and drag overlay (edit-overlay.ts), then
 * rain in screen space. */
import { onPixelArt, pixelArtOn, pixelKey } from "./pixel-sprites.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, boardSize, cellIndex, hash01, type TilePos } from "./grid.ts";
import type { CityMap } from "./citygen.ts";
import type { DefendSim } from "./sim.ts";
import { DefendLighting, MASK, type LightFrame } from "./lighting.ts";
import { Fences } from "./fences.ts";
import { Rain, Snow, ambientFor, type Weather } from "./weather.ts";
import { areaFade, type AreaId } from "./areas.ts";
import { gateArtRect } from "./wood-gate-art.ts";
import { FACE_HANG, damageKey, gateSpriteOf, hangingFaces, onCityArtLoaded, paintBuildingMask, paintCityLayer, paintFences, paintSpikePoints, paintStanding, stageOf } from "./city-layer.ts";
import { GATE_FRAMES } from "./gate-art.ts";
import { peopleAt } from "./gates.ts";
import type { GateRanks } from "../gate-upgrades.ts";
import { drawBallistas, drawSpikeThrusts } from "./wall-defense-art.ts";
import { UnitOutline, type UnitInks } from "./unit-outline.ts";
import { garrisoned } from "./garrison-icons.ts";
import { carriedLights, drawDamage, drawScorches, drawUnits, shadowCasters, type Brush, type Burning } from "./battle-art.ts";
import { drawGrid, drawLifting, drawOverlay, type Overlay } from "./edit-overlay.ts";
import { drawInspect, type Armed } from "./inspect.ts";
import { drawShimmer } from "./placed-shimmer.ts";
import { ART } from "./park-art.ts";
import { drawFlag, drawWarBanner } from "./structure-art.ts";
import { RallyFlagArt } from "./rally-flag-art.ts";
import { bannerReach } from "./war-banner.ts";
import { ParkGrass, type Walker } from "./park-grass.ts";
import { PondWater } from "./pond-water.ts";
import { RiverLife } from "./river-art.ts";
import { ENEMIES } from "./catalog.ts";
import { GroundRelief, type ReliefLight } from "./ground-relief.ts";
import { WizardArt, flameLights } from "./wizard-art.ts";
import { drawBlazes, mageLights } from "./mage-art.ts";
import { stabLights } from "./valkyrie-art.ts";
import { heroLights } from "./hero-art.ts";
import { SkyPalaceArt } from "./sky-palace-art.ts";
import { DarkArt, darkLights } from "./dark-art.ts";
import { raisingLights } from "./necro-art.ts";
import { meteorLights } from "./meteor-art.ts";
import { drawRime, frostLights } from "./frost-art.ts";
import { drawLandings, reinforceLights } from "./reinforce-art.ts";
import { ParkTrees, type Under } from "./park-trees.ts";
import { FloodArt } from "./flood-art.ts";
import { ChimneySmoke } from "./chimney-smoke.ts";
import { Ghosts } from "./ghosts.ts";
import { AtmosphereArt } from "./atmosphere-art.ts";
import { ForestArt } from "./forest-art.ts";
import { ForestGrass } from "./forest-grass.ts";
import { hasForest } from "./forest.ts";

export type DrawOptions = {
  /** Optional natural daylight and board tint; absent in ordinary modes. */
  sun?: { x: number; y: number; strength: number };
  tint?: { color: string; strength: number };
  area?: AreaId;
  /** The tile grid's opacity, 0 to hide it: shown while the
   * player is editing, if they turned it on. */
  grid: number;
  gridColor?: GridColor;
  weather: Weather | null;
  /** How far night has fallen, 0–1 (boss waves). */
  night: number;
  now: number;
  reduceMotion: boolean;
  /** Draw the live park grass and pond effects. */
  effects?: boolean;
  healthbars?: boolean;
  /** Enemies as plain squares (the Settings page's Simple enemies). */
  simpleEnemies?: boolean;
  /** Your troops as plain squares (Simple troops). */
  simpleTroops?: boolean;
  /** Units outlined together, round their combined shape (`unit-outline.ts`). */
  mergedOutlines?: boolean;
  sides?: UnitInks;
  keepFlag?: Flag | null;
  collapsed?: ReadonlySet<number>;
  /** Optional scenery in board coordinates, below trees. */
  scenery?: (c: CanvasRenderingContext2D, px: number) => void;
  /** Player order markers remain above the trees. */
  markers?: (c: CanvasRenderingContext2D, px: number) => void;
  /** The run is over: the city's torches go out in a wave from the keep. */
  over?: boolean;
  /** Leave out the planted war banner (while the player carries it). */
  hideBanner?: boolean;
  /** Developer timing, disabled by default. */
  timings?: boolean;
  /** Each structure's path by uid, for the paths with their own look
   * (`PATH_LOOKS`); presentation only. */
  looks?: Readonly<Record<number, string>>;
  /** The gates' upgrades while building (the battle's own once it runs),
   * for the small ballistas Gate towers put on the gatehouses. */
  gate?: GateRanks;
  /** The building the player tapped (its id in the map), outlined with its
   * reach and troops. */
  inspect?: { id: number; armed: Armed; aim?: { point?: { x: number; y: number; tower?: number }; since: number } };
  /** A city tile being held to lift, and how far the hold has come (0–1):
   * a gold square grows from its middle out to its edges. */
  lifting?: { tile: TilePos; t: number };
  /** Now and then trace a gold line round each piece the player placed
   * (`placed-shimmer.ts`): on while building. */
  shimmer?: boolean;
};

/** The torches going out after a lost run: seconds before the first, then
 * seconds a cell further from the keep, the most a torch may be early or
 * late (so neighbours go one by one), and how long one takes to gutter out. */
const DOUSE = { delay: 1.2, perCell: 0.16, jitter: 0.6, fade: 0.7 };

export class DefendRenderer {
  private readonly collapse = new CollapseView();
  readonly timings = { entityMs: 0, effectsMs: 0, terrainMs: 0 };
  readonly lighting = new DefendLighting();
  readonly fences = new Fences();
  readonly grass = new ParkGrass();
  readonly water = new PondWater();
  /** An Ambush river's current, glints, rain rings and fish. */
  private readonly river = new RiverLife();
  readonly relief = new GroundRelief();
  readonly wizard = new WizardArt();
  readonly trees = new ParkTrees();
  readonly dark = new DarkArt();
  readonly floods = new FloodArt();
  readonly smoke = new ChimneySmoke();
  readonly ghosts = new Ghosts();
  private readonly rallyFlag = new RallyFlagArt();
  private readonly sky = new SkyPalaceArt();
  readonly atmosphere = new AtmosphereArt();
  private readonly darkDrain = new DarkDrain();
  readonly cityLife = new CityLife();
  private lifeSim: DefendSim | null = null;
  private lifeTime = 0;
  private readonly sunlight = new SunShadows();
  private worldLighting = false;
  private readonly deadPark = new BlightGround();
  private readonly deadForest = new BlightGround();
  private deadParkMap: CityMap | null = null;
  private deadParkWater: { x: number; y: number; r: number }[] = [];
  readonly forest = new ForestArt();
  readonly forestGrass = new ForestGrass();
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
  /** The open ground the wall's brick faces hang over, as of the layer. */
  private faces: { y: number; x0: number; x1: number }[] = [];
  private faced = new Uint8Array(CELL_COUNT);
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
  private protectCombat = false;
  private actors: HTMLCanvasElement | null = null;
  private combatLayer: HTMLCanvasElement | null = null;
  private combatSim: DefendSim | null = null;
  private combatKey = '';
  private outline: UnitOutline | null = null;
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
    onPixelArt(() => (this.layerKey = ""));
  }

  /** Matches the canvas to its box, which fills the view. The board's scale
   * comes from the stage (`refW` × `refH` CSS pixels, the room the view has
   * with no panel open), so it holds still while a panel slides open and the
   * view narrows; the board point in the middle of the view stays there. */
  resize(refW: number, refH: number) {
    this.ref = { w: refW, h: refH };
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr)),
      h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    const fit = Math.max(1, Math.min((refW * dpr) / CELLS_W, (refH * dpr) / CELLS_H));
    // Crisp: a whole number of device pixels an art pixel, the board at its
    // fit or a little past it.
    const px = this.crisp ? ART * Math.max(1, Math.floor(fit / ART)) : fit;
    const old = { w: this.canvas.width, h: this.canvas.height, px: this.px };
    if (w === old.w && h === old.h && px === old.px && !this.rescale) return;
    this.rescale = false;
    const scale = this.cam.s * old.px,
      cx = (old.w / 2 - this.cam.x) / scale,
      cy = (old.h / 2 - this.cam.y) / scale;
    this.canvas.width = w;
    this.canvas.height = h;
    this.px = px;
    this.cam.s = this.snap(this.want);
    this.cam.x = w / 2 - cx * this.cam.s * px;
    this.cam.y = h / 2 - cy * this.cam.s * px;
    this.clampCam();
  }
  private ref = { w: 0, h: 0 };

  /** Crisp pixels: the board's scale (`px`) a whole number of art pixels'
   * worth of device pixels and the zoom stepping so every art pixel covers
   * the same whole number of device pixels, so outlines never change width
   * as the view zooms (the Mine's rule). Off, the zoom is smooth. */
  get crisp() {
    return this.crispOn;
  }
  set crisp(on: boolean) {
    if (on === this.crispOn) return;
    this.crispOn = on;
    this.rescale = true;
    if (this.ref.w) this.resize(this.ref.w, this.ref.h);
  }
  private crispOn = false;
  private rescale = false;
  /** The zoom asked for, which the crisp zoom steps round. */
  private want = 1;

  /** The zoom nearest `s` the view may take: with crisp pixels, a whole
   * number of device pixels an art pixel. */
  private snap(s: number) {
    if (!this.crisp) return s;
    const b = this.px / ART;
    return Math.max(b, Math.min(Math.floor(DefendRenderer.MAX_ZOOM * b), Math.round(s * b))) / b;
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

  /** Board position in cells → client (CSS) point, through the camera. */
  toClient(fx: number, fy: number) {
    const r = this.canvas.getBoundingClientRect();
    const x = fx * this.px * this.cam.s + this.cam.x, y = fy * this.px * this.cam.s + this.cam.y;
    return { x: r.left + (x / (this.canvas.width || 1)) * r.width, y: r.top + (y / (this.canvas.height || 1)) * r.height };
  }

  /** Zoom by `factor`, keeping the board point under the client point fixed. */
  zoomAt(clientX: number, clientY: number, factor: number) {
    const p = this.toCanvas(clientX, clientY);
    this.want = Math.max(1, Math.min(DefendRenderer.MAX_ZOOM, this.want * factor));
    const s = this.snap(this.want);
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
    this.cam.s = this.want = 1;
    this.cam.x = this.cam.y = 0;
    this.clampCam();
  }

  private clampCam() {
    const { W, H } = this.board;
    this.cam.x = clampAxis(this.cam.x, this.canvas.width, W * this.cam.s);
    this.cam.y = clampAxis(this.cam.y, this.canvas.height, H * this.cam.s);
    // Art pixels start on whole device pixels.
    if (this.crisp) {
      this.cam.x = Math.round(this.cam.x);
      this.cam.y = Math.round(this.cam.y);
    }
  }

  draw(map: CityMap, sim: DefendSim | null, overlay: Overlay | null, opts: DrawOptions) {
    const sky = worldSky();
    this.worldLighting = !!sky;
    if (sky) opts = { ...opts, sun: sky.sun, tint: sky.tint, night: sky.night, weather: opts.weather ?? { rain: false, clear: true } };
    // The shared darkness value also rises at sunset/dusk/dawn. Blight's
    // halo belongs only to night; leave all other world lighting untouched.
    const blightNight = sky && sky.phase !== "night" ? 0 : opts.night;
    this.lit = false;
    if (sim && opts.collapsed) sim = this.collapse.view(sim,map,opts.collapsed);
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
    this.protectCombat = this.darkDrain.prepare(sim, opts.now, blightNight);
    this.refreshLayer(map, sim, opts.looks);
    if (opts.timings) this.timings.terrainMs = performance.now() - start;
    // Beyond the board's edges: the dark ground the city stands on.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = BEYOND;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.douse(sim, opts);
    const dt = this.lastNow ? (opts.now - this.lastNow) / 1000 : 0;
    this.lastNow = opts.now;
    this.lighting.solarTime = sky?.time ?? null;
    this.cityLife.sync(map, sim, hasForest(this.area));
    const lifeDt = sim ? (sim === this.lifeSim ? Math.max(0, sim.time - this.lifeTime) : 0) : dt;
    this.lifeSim = sim; this.lifeTime = sim?.time ?? 0;
    this.cityLife.update(lifeDt, sky?.time ?? 0, sky ? torchLevel(sky.time,0) > .5 : opts.night > .5, opts.reduceMotion, sim?.enemies ?? []);
    const cityStart = opts.timings ? performance.now() : 0;
    this.drawCity(map, sim, opts, dt);
    if (opts.timings) this.timings.terrainMs += performance.now() - cityStart;
    if (!sim && sky && opts.weather && opts.night > .001) {
      this.lighting.update(this.cityLife.solid, [], standing(map, null));
      if(opts.tint?.strength) { this.ctx.save(); this.ctx.globalCompositeOperation='soft-light'; this.ctx.globalAlpha=opts.tint.strength; this.ctx.fillStyle=opts.tint.color; this.ctx.fillRect(0,0,this.board.W,this.board.H); this.ctx.restore(); }
      this.drawLighting(map, null, opts.weather, opts); this.lit = true;
    }
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
    if (sim) this.drawBattleUnits(sim, opts.weather && !(opts.sun && opts.night === 0) ? this.burning ?? (() => 1) : null, opts);
    if (this.lit) this.lighting.drawUnitShadows(this.ctx, this.px, this.cityLife.visible, .65);
    drawCityLife(this.ctx, this.px, this.cityLife, sky?.time ?? 0, opts.now, opts.reduceMotion);
    opts.scenery?.(this.ctx, this.px);
    this.drawTrees(map, sim, opts, dt);
    this.drawForest(sim, opts, dt);
    this.ghosts.watch(sim, opts.now / 1000);
    this.ghosts.draw(this.ctx, this.px, opts.now / 1000, opts.reduceMotion);
    if (opts.effects ?? true) this.drawSmoke(map, sim, opts);
    // Cloudborne palaces sail over everything on the ground.
    this.sky.draw(this.ctx, this.px, map, sim, opts.looks, { now: opts.now, dt, reduceMotion: opts.reduceMotion, night: opts.night });
    // Rain is world scenery too: wash it before the visibility/UI overlays.
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (sim && !opts.reduceMotion) {
      const old = this.previousArea ? this.previousWeather : null;
      const rainAlpha = (opts.weather?.rain ? this.areaMix : 0) + (old?.rain ? 1 - this.areaMix : 0);
      this.ctx.save();
      if (rainAlpha) { this.ctx.globalAlpha = rainAlpha; this.drawRain(dt); }
      this.ctx.restore();
    }
    this.ctx.restore();
    this.darkDrain.draw(this.ctx, this.px, sim, opts.now, blightNight, this.protectCombat ? this.actors : null);
    if (sim) this.outline?.drawContours(this.ctx, opts.reduceMotion ? 0 : opts.now / 1000);
    if (sim && this.lit) this.outline?.shineContours(this.ctx, this.lighting);
    opts.markers?.(this.ctx,this.px);
    this.rallyFlag.draw(this.ctx, this.px, sim, sim?.warBanner?.flag && !opts.hideBanner ? sim.warBanner : null, opts);
    if (sim?.warBanner && !sim.warBanner.flag && !opts.hideBanner) drawWarBanner(this.ctx, this.px, sim.warBanner, bannerReach(sim), { t: opts.now / 1000, reduceMotion: opts.reduceMotion });
    if (sim) this.wizard.drawFire(this.ctx, this.px);
    if (opts.shimmer && !opts.reduceMotion) drawShimmer(this.ctx, this.px, map, opts.now, (c, b) => paintStanding(c, ART, map, b, this.area, opts.looks), opts.looks);
    if (opts.inspect) drawInspect(this.ctx, this.px, map, sim, opts.inspect.id, opts.inspect.armed, opts.now, opts.reduceMotion, opts.inspect.aim);
    this.drawEditing(overlay, opts.grid, opts.gridColor);
    if (opts.lifting) drawLifting(this.ctx, this.px, opts.lifting.tile, opts.lifting.t);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.timings) this.timings.effectsMs = performance.now() - start - this.timings.terrainMs - this.timings.entityMs;
  }

  /** The building grid (brighter during a drag) and the drag's overlay. */
  private drawEditing(overlay: Overlay | null, grid: number, color?: GridColor) {
    if (grid > 0) drawGrid(this.ctx, this.px, overlay ? Math.min(1, grid * 1.8) : grid, color);
    if (overlay) drawOverlay(this.ctx, this.px, overlay);
  }

  /** The city layer through the camera, the live park grass and ponds over
   * it, and the park fences. */
  private drawCity(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    const ctx = this.ctx;
    ctx.setTransform(this.cam.s, 0, 0, this.cam.s, this.cam.x, this.cam.y);
    ctx.imageSmoothingEnabled = !pixelArtOn() && this.cam.s / this.layerScale < 1;
    const { W, H } = this.board;
    ctx.drawImage(this.layer, 0, 0, W, H);
    if (this.previousArea && this.previousLayer) {
      ctx.save();
      ctx.globalAlpha = 1 - this.areaMix;
      ctx.drawImage(this.previousLayer, 0, 0, W, H);
      ctx.restore();
    }
    ctx.imageSmoothingEnabled = false;
    drawBallistas(ctx, this.px, map, sim, sim ? sim.bonuses.gate : opts.gate);
    drawSpikeThrusts(ctx, this.px, map, sim);
    const feet = this.drawParkLife(map, sim, opts, dt);
    // The forest's grass, dirt, rocks and shadows outside the walls, and
    // the grass's live blades.
    this.forest.sync(map, sim);
    this.forest.setSun(this.worldLighting ? opts.sun : undefined);
    this.forest.drawFloor(ctx, this.px, this.forestShare());
    this.forest.drawWater(ctx, this.px, opts.now, this.forestShare(), opts.reduceMotion);
    if (sim && this.forestShare() > 0) {
      ctx.save(); ctx.globalAlpha *= this.forestShare();
      this.deadForest.draw(ctx, this.px, sim.blight, sim.time, forestTurfAt, shadedAt, this.forest.floorVersion);
      ctx.restore();
    }
    this.river.sync(map);
    this.river.draw({
      c: ctx, px: this.px, now: opts.now, dt, rain: !!(sim && opts.weather?.rain), cold: sim?.cold ?? !!opts.weather?.snow, thawed: sim?.thawedPonds,
      walkers: feet, reduceMotion: opts.reduceMotion || !(opts.effects ?? true),
    });
    if (this.forestShare() > 0) {
      this.drawFaces();
      paintSpikePoints(ctx, this.px, map, sim);
    }
    if ((opts.effects ?? true) && this.forestShare() > 0) {
      this.forestGrass.sync(this.forest.forestPlan!);
      this.forestGrass.draw({
        damage: this.forest.damage, blight: sim?.blight,
        c: ctx, px: this.px, now: opts.now, dt, reduceMotion: opts.reduceMotion, alpha: this.forestShare(),
        wind: sim && opts.weather?.rain ? "rain" : opts.weather ? "cloud" : "calm",
        walkers: feet,
        faced: this.faced, hangRows: Math.ceil(ART * FACE_HANG),
      });
    }
    // An outpost's wooden fences stand on the forest's grass, and the gates
    // swing over it.
    if (this.forestShare() > 0) paintFences(ctx, this.px, map, sim, true);
    this.drawGates(map, sim, opts, dt);
    // Park fences sit on the ground layer, under the lighting and units.
    this.fences.sync(map);
    if (sim) this.fences.update(sim);
    this.fences.draw(ctx, this.px);
    if (this.worldLighting && opts.sun) this.sunlight.draw(ctx, this.px, map, sim, opts.sun, opts.looks);
    // Magic boats' water over the ground, sinking what it reaches.
    if (sim) this.floods.draw({ c: ctx, px: this.px, sim, area: this.area, rain: !!opts.weather?.rain, reduceMotion: opts.reduceMotion, reflections: opts.effects ?? true, layer: this.layer, layerScale: this.layerScale });
  }

  /** The wall's brick faces hang over the open ground south of it, which
   * the forest's floor covers: copied back over it from the city layer
   * (and the fading one), exactly as they were painted. */
  private drawFaces() {
    const ctx = this.ctx, k = this.layerScale, P = this.px * k, hang = Math.round(P * FACE_HANG);
    const copy = (layer: HTMLCanvasElement) => {
      for (const f of this.faces) {
        const sx = Math.round(f.x0 * P), sy = Math.round(f.y * P), sw = Math.round(f.x1 * P) - sx;
        ctx.drawImage(layer, sx, sy, sw, hang, sx / k, sy / k, sw / k, hang / k);
      }
    };
    copy(this.layer);
    if (this.previousArea && this.previousLayer) {
      ctx.save();
      ctx.globalAlpha = 1 - this.areaMix;
      copy(this.previousLayer);
      ctx.restore();
    }
  }

  /** The city gates swing open while any of the city's people are at
   * them, and shut behind them; the layer shows them shut (a wooden
   * gate's leaves, shut or not, are drawn here over its posts). */
  private drawGates(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    for (const b of map.buildings) {
      if (b.kind !== "gate" || !b.gate) continue;
      if (sim && !sim.intact(b)) {
        this.gateOpen.delete(b.id);
        continue;
      }
      // Open while the sim holds it open to the enemy too, or anyone of the city is at it.
      const near = !!(sim && (sim.gateOpen.has(b.id) || peopleAt(sim, b))) || this.cityLife.nearGate(b);
      const was = this.gateOpen.get(b.id) ?? 0;
      const open = opts.reduceMotion ? (near ? 1 : 0) : Math.max(0, Math.min(1, was + (near ? 2.5 : -1.5) * Math.min(dt, 0.1)));
      this.gateOpen.set(b.id, open);
      const frame = Math.round(open * (GATE_FRAMES - 1));
      if (!frame && !b.woodGate) continue;
      const r = gateArtRect(b), px = this.px;
      const x = Math.round(r.x * px), y = Math.round(r.y * px);
      const art = gateSpriteOf(b, frame, stageOf(sim, b));
      if (art) this.ctx.drawImage(art, x, y, Math.round((r.x + r.w) * px) - x, Math.round((r.y + r.h) * px) - y);
    }
  }

  /** Pond drips, rings and reflections, then the grass swaying and parting
   * around everyone walking through the parks. */
  private drawParkLife(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number): Walker[] {
    const rain = !!(sim && opts.weather?.rain);
    this.water.sync(map);
    const feet = [...(sim ? walkers(sim) : []), ...this.cityLife.visible];
    if (sim?.cold || opts.weather?.snow || (opts.effects ?? true)) this.water.draw({ c: this.ctx, px: this.px, now: opts.now, rain, cold: sim?.cold ?? !!opts.weather?.snow, thawedPonds: sim?.thawedPonds, night: opts.night, walkers: feet, reduceMotion: opts.reduceMotion, layer: this.layer, layerScale: this.layerScale });
    if (sim) {
      if (map !== this.deadParkMap) {
        this.deadParkMap = map; this.deadParkWater = [];
        for (let i = 0; i < map.type.length; i++) if (map.type[i] === CellType.WATER) this.deadParkWater.push(pondDisc(i % CELLS_W, Math.floor(i / CELLS_W), 1));
      }
      const ground = groundArt(map);
      this.deadPark.draw(this.ctx, this.px, sim.blight, sim.time, (x, y) => {
        const cx = Math.floor(x / ART), cy = Math.floor(y / ART);
        return (map.type[cellIndex(cx, cy)] === CellType.PARK || parkTurfAt(ground, x, y))
          && !bareAt(ground, x, y) && pondField(this.deadParkWater, (x + .5) / ART, (y + .5) / ART) < -.04;
      }, undefined, sim.mapVersion);
    }
    if (!(opts.effects ?? true)) return feet;
    this.grass.sync(map);
    this.grass.draw({
      c: this.ctx, px: this.px, now: opts.now, dt, reduceMotion: opts.reduceMotion,
      wind: rain ? "rain" : opts.weather ? "cloud" : "calm",
      walkers: feet, blight: sim?.blight,
    });
    return feet;
  }

  /** What a battle lays over the city before its units: damage, and in
   * weather (battles are always under cloud, so the city's lights are always
   * lit) unit shadows, the overcast and the torchlight. */
  private drawBattle(map: CityMap, sim: DefendSim, opts: DrawOptions) {
    const weather = opts.weather;
    this.drawBattleGround(map, sim, weather, opts.night, opts.sun);
    if (opts.tint?.strength) {
      this.ctx.save();
      this.ctx.globalCompositeOperation = 'soft-light';
      this.ctx.globalAlpha = opts.tint.strength;
      this.ctx.fillStyle = opts.tint.color;
      this.ctx.fillRect(0, 0, this.board.W, this.board.H);
      this.ctx.restore();
    }
    if (!weather) return;
    if (opts.sun && opts.night === 0) return;
    const { W, H } = this.board;
    const overcast = (w: Weather) => w.clear ? .04 : w.rain ? .3 : .18;
    const strength = overcast(weather);
    const old = this.previousArea && this.previousWeather ? overcast(this.previousWeather) : strength;
    Rain.overcast(this.ctx, old + (strength - old) * this.areaMix, W, H);
    this.drawLighting(map, sim, weather, opts);
    this.lit = true;
  }

  /** The keep's banner, while the keep stands. */
  private drawKeepFlag(map: CityMap, sim: DefendSim | null, opts: DrawOptions) {
    const keep = standingKeep(map, sim);
    if (!keep || opts.keepFlag === null) return;
    drawFlag(this.ctx, this.px, { x: (keep.x + keep.w / 2) * this.px, y: (keep.y + keep.h / 2) * this.px, t: opts.now / 1000, reduceMotion: opts.reduceMotion }, true, opts.keepFlag);
  }

  /** Blast scorches, burning ground and the wizards' ice, then units, projectiles and
   * effects (carrying torches in weather), and the frost on the chilled. */
  private drawBattleUnits(sim: DefendSim, torches: Burning | null, opts: DrawOptions) {
    const c = this.ctx;
    if (this.burning || opts.over) this.paintCombat(c, sim, torches, opts);
    else {
      // Combat art advances on the fixed simulation clock. Keep screen pixels
      // (including artPen's camera snapping), never rescale a cached frame.
      const key = `${sim.time}:${sim.mapVersion}:${sim.effects.length}:${sim.scorches.length}:${sim.enemies.length}:${sim.soldiers.length}:${sim.civilians.length}:${this.px}:${c.canvas.width}:${c.canvas.height}:${this.cam.s}:${this.cam.x}:${this.cam.y}:${!!torches}:${opts.healthbars === true}:${!!opts.simpleEnemies}:${!!opts.simpleTroops}:${!!opts.mergedOutlines}:${opts.reduceMotion}:${this.protectCombat}:${pixelKey()}${opts.sides ? ":" + sim.soldiers.map(u => `${u.id}=${opts.sides!.ink(u.id) ?? ""}`).join(",") : ""}`;
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
    drawMines(c, this.px, sim, opts.reduceMotion);
    drawRime(c, this.px, sim);
    drawLandings(c, this.px, sim);
    this.wizard.drawIce(c, this.px, sim.frosts, sim.time * 1000, flameLights(sim).relief);
    let actors = c;
    if (this.protectCombat) {
      this.actors ??= document.createElement("canvas");
      if (this.actors.width !== c.canvas.width || this.actors.height !== c.canvas.height) {
        this.actors.width = c.canvas.width; this.actors.height = c.canvas.height;
      }
      actors = this.actors.getContext("2d")!;
      actors.setTransform(1, 0, 0, 1, 0, 0); actors.clearRect(0, 0, this.actors.width, this.actors.height);
      actors.setTransform(c.getTransform()); actors.imageSmoothingEnabled = false;
    }
    drawUnits({ c: actors, px: this.px }, sim, torches, opts.healthbars === true, opts.timings ? this.timings : undefined, { enemies: opts.simpleEnemies, troops: opts.simpleTroops, reduceMotion: opts.reduceMotion, merged: !!opts.mergedOutlines, effects: opts.effects !== false }, (this.outline ??= new UnitOutline()), opts.sides, { defer: true });
    this.dark.draw(actors, this.px, sim);
    if (actors !== c) {
      c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(this.actors!, 0, 0); c.restore();
    }
  }

  /** The trees over everyone, half faded over anyone under them, and in a
   * battle's weather darkened with the city below them. */
  private drawTrees(map: CityMap, sim: DefendSim | null, opts: DrawOptions, dt: number) {
    this.trees.sync(map);
    this.trees.update([...(sim ? beneath(sim) : []), ...this.cityLife.visible], dt, opts.reduceMotion);
    const dim = this.lit && opts.weather ? (o: CanvasRenderingContext2D) => {
      o.fillStyle = `rgba(118,118,118,${opts.weather!.rain ? 0.2 : 0.12})`;
      o.fillRect(0, 0, this.board.W, this.board.H);
      this.lighting.darken(o);
    } : undefined;
    this.trees.draw(this.ctx, this.px, dim, sim?.blight);
  }

  /** How much of the forest shows: all of it in an area with one, fading
   * in or out across an area boundary. */
  private forestShare() {
    const now = hasForest(this.area) ? this.areaMix : 0;
    return now + (this.previousArea && hasForest(this.previousArea) ? 1 - this.areaMix : 0);
  }

  /** The forest's trees over everyone outside the walls, blown up by the
   * battle's blasts, leaning in the wind and darkened like the parks'. */
  private drawForest(sim: DefendSim | null, opts: DrawOptions, dt: number) {
    const alpha = this.forestShare();
    this.forest.update(sim, [...(sim ? beneath(sim) : []), ...this.cityLife.visible], dt, opts.reduceMotion);
    if (alpha <= 0) return;
    const w = sim ? opts.weather : null;
    const wind = opts.reduceMotion || !(opts.effects ?? true) ? 0 : w?.rain ? 2 : w && !w.clear ? 1.4 : 1;
    const shade = this.lit && opts.weather ? (o: CanvasRenderingContext2D) => {
      o.fillStyle = `rgba(118,118,118,${opts.weather!.rain ? 0.2 : 0.12})`;
      o.fillRect(0, 0, this.board.W, this.board.H);
      this.lighting.darken(o);
    } : undefined;
    this.forest.drawTrees(this.ctx, this.px, { now: opts.now, alpha, wind, still: opts.reduceMotion, shade });
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
    for (const u of [...sim.soldiers.filter((o) => !garrisoned(o)), ...sim.civilians]) {
      const b = burns(u.x, u.y, u.id);
      if (b > 0) moving.push({ x: u.x, y: u.y, r: 2.2, k: 0.45 * b, color: "#ffc68a" });
    }
    const out = this.lighting.lights.filter((l) => this.lighting.burn(l) <= 0).length;
    // The forest's grass hides the flagstones.
    const bare = 1 - Math.min(1, this.forestShare());
    if (bare > 0) this.relief.draw(this.ctx, this.px, { version: `${sim.mapVersion}:${out}`, lights: fixed }, moving, (0.6 + opts.night * 0.4) * bare);
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
    const key = `${W}:${k}:${this.area}:${pixelKey()}:${this.worldLighting}:${sim ? `${sim.mapVersion}:${damageKey(sim)}` : -1}:${looks ? Object.entries(looks).join(",") : ""}`;
    if (this.previousArea && (key !== this.previousKey || !this.layerKey)) {
      this.previousLayer ??= document.createElement("canvas");
      this.previousLayer.width = W * k;
      this.previousLayer.height = H * k;
      this.lighting.setMap(map);
      paintCityLayer(this.previousLayer.getContext("2d")!, this.px * k, { map, sim, area: this.previousArea, lights: this.lighting.lights, stones: this.lighting.roadStones, looks, omitSunShadows: this.worldLighting });
      this.previousKey = key;
    }
    if (map === this.map && key === this.layerKey) return;
    this.map = map;
    this.layerKey = key;
    this.lighting.setMap(map);
    this.layer.width = W * k;
    this.layer.height = H * k;
    paintCityLayer(this.lctx, this.px * k, { map, sim, area: this.area, lights: this.lighting.lights, stones: this.lighting.roadStones, looks, omitSunShadows: this.worldLighting });
    this.paintMasks(map, sim, looks);
    this.faces = hangingFaces(map, sim);
    this.faced.fill(0);
    for (const f of this.faces) for (let x = f.x0; x < f.x1; x++) this.faced[cellIndex(x, f.y)] = 1;
  }

  /** The buildings' art as masks for the lighting: their pixels and
   * their outlines, so light runs up to them and shines on their edges. */
  private paintMasks(map: CityMap, sim: DefendSim | null, looks?: Readonly<Record<number, string>>) {
    const { W, H } = boardSize(MASK);
    const paint = (cv: HTMLCanvasElement, mode: "body" | "rim") => {
      cv.width = W;
      cv.height = H;
      paintBuildingMask(cv.getContext("2d", { willReadFrequently: true })!, MASK, { map, sim, area: this.area, looks, lights: this.lighting.lights, stones: this.lighting.roadStones }, mode);
      return cv;
    };
    this.lighting.setMasks(paint(this.bodyMask, "body"), paint(this.rimMask, "rim"));
  }
  /** The lighting was drawn this frame (its glow is current). */
  private lit = false;
  private bodyMask = document.createElement("canvas");
  private rimMask = document.createElement("canvas");

  /** Folds fallen and rebuilt buildings into the lighting, then draws what
   * lies on the ground: building damage, and (in weather) unit shadows. */
  private drawBattleGround(map: CityMap, sim: DefendSim, weather: Weather | null, night: number, sun?: DrawOptions['sun']) {
    const changed = sim.changed.splice(0);
    if (weather) this.lighting.update(sim.solid, changed, standing(map, sim));
    else if (changed.length) this.lighting.invalidate(changed);
    drawDamage({ c: this.ctx, px: this.px }, sim);
    if (sun && sun.strength > 0) {
      const c = this.ctx, px = this.px, length = Math.hypot(sun.x, sun.y), angle = Math.atan2(sun.y, sun.x);
      c.save(); c.globalAlpha = sun.strength; c.fillStyle = '#05060c'; c.beginPath();
      for (const u of shadowCasters(sim)) {
        const x = (u.x + sun.x / 2) * px, y = (u.y + sun.y / 2) * px;
        c.moveTo(x, y); c.ellipse(x, y, (u.size + length) * px / 2, u.size * px * 0.3, angle, 0, Math.PI * 2);
      }
      c.fill(); c.restore();
    } else if (weather) this.lighting.drawUnitShadows(this.ctx, this.px, shadowCasters(sim), 0.8 + 0.2 * night, this.burning || this.cam.s !== 1 ? undefined : sim.time);
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
  private drawLighting(map: CityMap, sim: DefendSim | null, weather: Weather, opts: DrawOptions) {
    const frame: LightFrame = { px: this.px, now: opts.now, reduceMotion: opts.reduceMotion, intact: standing(map, sim) };
    const empty = { carried: [], relief: [] };
    const flames = sim ? flameLights(sim) : empty, mages = sim ? mageLights(sim) : empty, stabs = sim ? stabLights(sim) : empty, hero = sim ? heroLights(sim) : empty, dark = sim ? darkLights(sim) : empty, meteors = sim ? meteorLights(sim) : empty;
    const ambient = ambientFor(weather, opts.night, this.previousArea ? this.previousWeather : null, this.areaMix);
    if (opts.sun) ambient.alpha *= Math.min(1, opts.night * 3);
    this.lighting.drawLight(this.ctx, frame, ambient, {
      torches: [...(sim ? this.carried(sim) : []), ...this.cityLife.lights(this.lighting.solarTime ?? 0), ...flames.carried, ...mages.carried, ...stabs.carried, ...hero.carried, ...dark.carried, ...meteors.carried],
      solid: sim?.solid ?? this.cityLife.solid,
      version: sim?.mapVersion ?? -1,
    });
    this.lighting.drawRelief(this.ctx, this.px, weather.rain ? 0.85 : 0.65);
    if (sim) this.drawGroundRelief(map, sim, opts, [...flames.relief, ...mages.relief, ...stabs.relief, ...hero.relief, ...dark.relief, ...raisingLights(sim), ...meteors.relief, ...frostLights(sim), ...reinforceLights(sim)]);
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
  for (const e of sim.enemies) if (!e.raidProxy && !ENEMIES[e.kind].flying) out.push({ id: e.id, x: e.x, y: e.y, size: enemySize(e) });
  for (const s of sim.soldiers) if (!garrisoned(s)) out.push({ id: s.id, x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ id: c.id, x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Everyone a tree can stand over. */
function beneath(sim: DefendSim): (Under & { foot?: boolean })[] {
  const out: (Under & { foot?: boolean })[] = [];
  for (const e of sim.enemies) if (!e.raidProxy) out.push({ x: e.x, y: e.y, size: enemySize(e), foot: !ENEMIES[e.kind].flying });
  for (const s of sim.soldiers) if (!garrisoned(s)) out.push({ x: s.x, y: s.y, size: 0.4 });
  for (const c of sim.civilians) out.push({ x: c.x, y: c.y, size: 0.3 });
  return out;
}

/** Whether building `id` still stands in the battle. */
const standing = (map: CityMap, sim: DefendSim | null) => (id: number) => !!map.buildings[id] && (!sim || sim.intact(map.buildings[id]));
