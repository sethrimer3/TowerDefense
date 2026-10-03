import { stepBlackHoles } from "./hostile-attacks.ts";
/** Real-time DEFEND simulation. Units move freely in continuous cell
 * coordinates (1 unit = 1 cell); the procedural city supplies the solid
 * obstacles. Enemies follow a flow field toward the keep in which buildings
 * and walls are passable at a cost (they must be smashed first), so enemies
 * prefer the streets but will break through when that is much shorter.
 *
 * A run starts from a freshly generated city and never resets between
 * waves: whatever is destroyed stays destroyed unless civilians rebuild it.
 *
 * `DefendSim` owns the world (buildings, crowds, waves, the enemy index)
 * and what happens to it (damage, rebuilding, blasts, movement). What each
 * kind of unit decides to do lives beside it: `enemies.ts`, `troops.ts`,
 * `mages.ts`, `valkyries.ts`, `dark-wizards.ts`, `civilians.ts` and
 * `towers.ts`, with grid pathing in `pathing.ts`. */
import { MAX_WAVE_ENEMIES, buildWave } from "./waves.ts";
export { buildWave } from "./waves.ts";
import { dist, sq } from "../exact.ts";
import { CELL_COUNT, CELLS_H, CELLS_W, cellIndex, cellX, cellY, rng, sideCells } from "./grid.ts";
import {
  BOMB_DAMAGE,
  BOMB_RADIUS,
  ENEMIES,
  FRIENDLY_FIRE,
  HOUSE_HP_PER_CELL,
  STRUCTURES,
  keepHp,
  wallHp,
  watchRadius,
  NO_BONUSES,
  type Bonuses,
  type EnemyKind,
  type UpgradeId,
} from "./catalog.ts";
import { CellType, type Building, type CityMap } from "./citygen.ts";
import { atHome, Builders } from "./civilians.ts";
import { stepEnemy } from "./enemies.ts";
import { blocked, cellAt, cellCenter, center, fillFlowField, nearestOpen, type FieldTerrain, type Point } from "./pathing.ts";
import { stepArrows, stepShells, Towers } from "./towers.ts";
import { Barracks, stepArcher, stepSwordsman } from "./troops.ts";
import { stepBlazes, stepFireballs, stepMage, type Blaze, type Fireball } from "./mages.ts";
import { stepStabs, stepValkyrie, type Stab } from "./valkyries.ts";
import { Wizards, stepFlames, stepFrosts, type Flame, type Frost } from "./wizard.ts";
import { DarkKeeps, stepBolts, stepDarkWizard, type Bolt } from "./dark-wizards.ts";

export type Levels = Record<UpgradeId, number>;

export type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  /** Personal offset inside each cell so a crowd spreads across the street. */
  jx: number;
  jy: number;
  distract: number;
  distractT: number;
  rollT: number;
  marked: boolean;
  flash: number;
  /** Seconds left chilled by a wizard's ice (slowed); absent when not, so
   * a run without ice keeps its state exactly as before. */
  chill?: number;
  slash?: { dx: number; dy: number; t: number };
  dive?: number;
  leader?: number;
  shieldHp?: number;
  breath?: { dx: number; dy: number; t: number };
};

export type Soldier = {
  id: number;
  /** Swordsmen chase and hack; archers roam and shoot; fire mages roam
   * and hurl fireballs; valkyries hunt and charge-stab; the dark wizard
   * hunts and casts chain lightning. */
  kind: "sword" | "archer" | "mage" | "valkyrie" | "darkWizard";
  home: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  cd: number;
  target: number;
  path: number[];
  thinkT: number;
  flash: number;
  /** Seconds left that nothing can hurt her (a valkyrie after a charge);
   * absent otherwise, so runs without valkyries keep their state as before. */
  guard?: number;
};

export type Civilian = {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  job: number;
  state: "toJob" | "working" | "home";
  work: number;
  path: number[];
  home: number;
  thinkT: number;
  flash: number;
};

export type Arrow = { x: number; y: number; target: number; damage: number; tx: number; ty: number; life: number };
export type Effect = { kind: "boom" | "dust" | "spark"; x: number; y: number; t: number; r: number; seed?: number };
/** A cannon shell in flight: lobbed from the tower to where the target was. */
export type Shell = { x0: number; y0: number; x1: number; y1: number; t: number; dur: number; damage: number; r: number };
/** Glowing cracks left where something exploded; they cool and fade. */
export type Scorch = { x: number; y: number; r: number; seed: number; t: number; life: number };
export type SimEvent = { type: "waveStart" | "waveCleared" | "lost"; wave: number };

/** How a unit moves this step. Flying units ignore buildings. */
export type Stride = { speed: number; dt: number; flying?: boolean };
/** A blast's radius and centre damage (40% at the edge); with friendly fire
 * it also hurts your own people. */
export type Blast = { r: number; damage: number; friendlyFire: boolean };

const STEP = 1 / 30;
const STEP_SOLDIER: Record<Soldier["kind"], (sim: DefendSim, s: Soldier, dt: number) => void> = {
  sword: stepSwordsman,
  archer: stepArcher,
  mage: stepMage,
  valkyrie: stepValkyrie,
  darkWizard: stepDarkWizard,
};
/** How long a struck building flashes, in seconds. */
export const BUILDING_FLASH = 0.14;
const BREAK_SECONDS = 3;
/** Where a Mother's young land around her, as fractions of her half-size:
 * the corners of a triangle (exact constants, so every engine agrees). */
const HATCH_SPOTS = [
  { x: 0, y: -1 },
  { x: -0.866, y: 0.5 },
  { x: 0.866, y: 0.5 },
];

export class DefendSim {
  readonly map: CityMap;
  readonly levels: Levels;
  /** Training and skill-tree multipliers (all 1 without them). */
  readonly bonuses: Readonly<Bonuses>;
  /** Enemies slain this run, by kind: what the run pays out. Not part of
   * the replayed state. */
  readonly slain: Record<EnemyKind, number> = { roach: 0, orc: 0, ogre: 0, bat: 0, warlord: 0, mother: 0, broodling: 0, snake: 0, dragon: 0, shieldBearer: 0, aegis: 0, darkKnight: 0, bombOrc: 0, bombBird: 0, voidSparrow: 0 };
  /** 1 while a cell is part of a standing (built) building. */
  readonly solid: Uint8Array;
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;
  /** Built cells per building; == cells.length when intact. */
  readonly built: Int32Array;
  readonly field = new Float64Array(CELL_COUNT);
  /** Seconds left on each building's hit flash. */
  readonly flash: Float32Array;
  /** Cells whose solidity changed since the renderer last drained this. */
  changed: number[] = [];
  enemies: Enemy[] = [];
  soldiers: Soldier[] = [];
  civilians: Civilian[] = [];
  arrows: Arrow[] = [];
  shells: Shell[] = [];
  /** Wizard towers' fire and ice. */
  flames: Flame[] = [];
  frosts: Frost[] = [];
  /** Fire mages' fireballs in flight, and the ground they set burning. */
  fireballs: Fireball[] = [];
  blazes: Blaze[] = [];
  /** Valkyries' charge stabs, fading. */
  stabs: Stab[] = [];
  /** Black lightning from dark keeps' turrets and dark wizards, fading. */
  bolts: Bolt[] = [];
  scorches: Scorch[] = [];
  effects: Effect[] = [];
  events: SimEvent[] = [];
  wave = 0;
  time = 0;
  lost = false;
  breakT = 1.5;
  spawnQueue: EnemyKind[] = [];
  private spawnInterval = 0;
  blackHoles: { x: number; y: number; r: number; damage: number; life: number; pulse: number; seed: number }[] = [];
  private waveSpawned = 0;
  private shieldGenerators: Enemy[] = [];
  spawnT = 0;
  /** Bumped whenever a building is destroyed or rebuilt (static art changes). */
  mapVersion = 0;
  speed = 1;
  /** The run's random stream. Units draw from it in step order, so a run
   * replays exactly from its seed. */
  readonly rand: () => number;
  readonly keepId: number;
  /** Open city streets, for archers to wander between. */
  readonly streets: number[];
  private fieldDirty = true;
  private fieldT = 0;
  private acc = 0;
  private nextId = 1;
  private terrain: FieldTerrain;
  private towers = new Towers();
  private barracks = new Barracks();
  private wizards = new Wizards();
  private darkKeeps = new DarkKeeps();
  private builders: Builders;
  private grid: Enemy[][] = Array.from({ length: CELL_COUNT }, () => []);
  private gridUsed: number[] = [];

  constructor(map: CityMap, levels: Levels, seed = 1, bonuses: Readonly<Bonuses> = NO_BONUSES) {
    this.map = map;
    this.levels = levels;
    this.bonuses = bonuses;
    this.rand = rng(seed);
    const n = map.buildings.length;
    this.solid = new Uint8Array(CELL_COUNT);
    this.hp = new Float32Array(n);
    this.maxHp = new Float32Array(n);
    this.built = new Int32Array(n);
    this.flash = new Float32Array(n);
    for (const b of map.buildings) {
      this.hp[b.id] = this.maxHp[b.id] = maxHpOf(b, levels, bonuses);
      this.built[b.id] = b.cells.length;
      for (const c of b.cells) this.solid[c] = 1;
    }
    // Ponds block movement like buildings do, but belong to no building.
    for (let i = 0; i < CELL_COUNT; i++) if (map.type[i] === CellType.WATER) this.solid[i] = 1;
    this.keepId = map.buildings.find((b) => b.kind === "keep")!.id;
    this.builders = new Builders(levels);
    this.streets = streetCells(map);
    this.terrain = {
      solid: this.solid,
      impassable: (i) => map.type[i] === CellType.WATER,
      cost: (i) => this.enterCost(i),
    };
  }

  get keep(): Building {
    return this.map.buildings[this.keepId];
  }
  keepHp() {
    return this.hp[this.keepId];
  }
  keepMaxHp() {
    return this.maxHp[this.keepId];
  }
  intact(b: Building) {
    return this.built[b.id] === b.cells.length;
  }
  newId() {
    return this.nextId++;
  }

  /** Advance by real elapsed seconds (fixed internal timestep). */
  update(seconds: number) {
    if (this.lost) return;
    this.acc += Math.min(seconds, 0.25) * this.speed;
    while (this.acc >= STEP && !this.lost) {
      this.acc -= STEP;
      this.step(STEP);
    }
  }

  step(dt: number) {
    this.time += dt;
    this.fieldT -= dt;
    if (this.fieldDirty && this.fieldT <= 0) this.computeField();
    this.runWaves(dt);
    this.indexEnemies();
    this.markEnemies();
    this.stepUnits(dt);
    stepBlackHoles(this, dt);
    this.sweepAway();
    this.tick(dt);
    if (this.hp[this.keepId] <= 0 && !this.lost) {
      this.lost = true;
      this.events.push({ type: "lost", wave: this.wave });
    }
  }

  /** Everyone acts, in a fixed order (it decides the random draws). */
  private stepUnits(dt: number) {
    for (const e of this.enemies) if (e.hp > 0) stepEnemy(this, e, dt);
    this.towers.step(this, dt);
    stepArrows(this, dt);
    stepShells(this, dt);
    this.wizards.step(this, dt);
    stepFlames(this, this.wizards, dt);
    stepFrosts(this, dt);
    this.darkKeeps.step(this, dt);
    this.barracks.step(this, dt);
    for (const s of this.soldiers) STEP_SOLDIER[s.kind](this, s, dt);
    stepFireballs(this, dt);
    stepBlazes(this, dt);
    this.builders.step(this, dt);
  }

  /** The dead, and civilians who made it indoors, leave the board; a
   * Mother's brood bursts out where she fell. */
  private sweepAway() {
    const hatched: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.hp > 0) continue;
      this.slain[e.kind]++;
      const splits = ENEMIES[e.kind].splits;
      if (splits) for (let n = 0; n < splits.count && this.waveSpawned < MAX_WAVE_ENEMIES; n++, this.waveSpawned++) hatched.push(this.hatch(splits.into, e, n, splits.count));
    }
    this.enemies = this.enemies.filter((e) => e.hp > 0);
    this.shieldGenerators = this.shieldGenerators.filter(e => e.hp > 0);
    this.enemies.push(...hatched);
    this.soldiers = this.soldiers.filter((s) => s.hp > 0);
    this.civilians = this.civilians.filter((c) => c.hp > 0 && !atHome(this, c));
  }

  /** Effects age, scorches cool, hit flashes fade. */
  private tick(dt: number) {
    for (const fx of this.effects) fx.t += dt;
    this.effects = this.effects.filter((fx) => fx.t < 0.6);
    for (const s of this.scorches) s.t += dt;
    this.scorches = this.scorches.filter((s) => s.t < s.life);
    for (const units of [this.enemies, this.soldiers, this.civilians]) for (const u of units) u.flash = Math.max(0, u.flash - dt);
    for (const e of this.enemies) if (e.slash && (e.slash.t -= dt) <= 0) delete e.slash;
    for (const e of this.enemies) if (e.breath && (e.breath.t -= dt) <= 0) delete e.breath;
    for (const e of this.enemies)
      if (e.chill !== undefined && (e.chill -= dt) <= 0) delete e.chill;
    for (const s of this.soldiers)
      if (s.guard !== undefined && (s.guard -= dt) <= 0) delete s.guard;
    stepStabs(this, dt);
    stepBolts(this, dt);
    for (let i = 0; i < this.flash.length; i++) if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt);
  }

  // ── Waves ─────────────────────────────────────────────────────────────
  private runWaves(dt: number) {
    if (this.spawnQueue.length) {
      this.spawnT -= dt;
      while (this.spawnT <= 0 && this.spawnQueue.length) {
        // Release every wave over five seconds, including at the fixed 30 Hz step.
        if (!this.spawnInterval) this.spawnInterval = 5 / this.spawnQueue.length;
        this.spawnT += this.spawnInterval;
        this.spawnEnemy(this.spawnQueue.pop()!);
      }
      return;
    }
    if (this.enemies.length) return;
    if (this.wave > 0 && this.breakT === BREAK_SECONDS) this.events.push({ type: "waveCleared", wave: this.wave });
    this.breakT -= dt;
    if (this.breakT <= 0) {
      this.wave++;
      this.breakT = BREAK_SECONDS;
      this.spawnQueue = buildWave(this.wave, this.rand);
      this.spawnInterval = 0;
      this.waveSpawned = 0;
      this.spawnT = 0;
      this.events.push({ type: "waveStart", wave: this.wave });
    }
  }

  private spawnEnemy(kind: EnemyKind) {
    if (this.waveSpawned >= MAX_WAVE_ENEMIES) return;
    for (let tries = 0; tries < 20; tries++) {
      const x = 1 + this.rand() * (CELLS_W - 2);
      const y = 0.5 + this.rand() * 2;
      if (blocked(this.solid, x, y)) continue;
      this.enemies.push(this.newEnemy(kind, x, y));
      this.waveSpawned++;
      let leader = this.enemies[this.enemies.length - 1];
      const length = ENEMIES[kind].chainLength ?? 1;
      for (let n = 1; n < length && this.waveSpawned < MAX_WAVE_ENEMIES; n++) {
        const segment = this.newEnemy(kind, x, Math.max(0.25, y - n * 0.3));
        segment.leader = leader.id;
        this.enemies.push(segment);
        this.waveSpawned++;
        leader = segment;
      }
      return;
    }
  }

  /** The `n`th of `count` young of `kind` bursting from `mother`: spread
   * evenly around where she fell, or on the spot if that is inside a wall. */
  private hatch(kind: EnemyKind, mother: Enemy, n: number, count: number): Enemy {
    const k = HATCH_SPOTS[n % HATCH_SPOTS.length];
    const r = ENEMIES[mother.kind].size * 0.5;
    const x = mother.x + k.x * r,
      y = mother.y + k.y * r;
    const free = x > 0 && y > 0 && x < CELLS_W && y < CELLS_H && !blocked(this.solid, x, y);
    const young = free ? this.newEnemy(kind, x, y) : this.newEnemy(kind, mother.x, mother.y);
    // They burst out at a run, then scatter before they think to fight.
    young.cd = 0.4 + (n / count) * 0.2;
    return young;
  }

  private newEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const hp = ENEMIES[kind].hp;
    const enemy: Enemy = {
      id: this.newId(),
      kind,
      x,
      y,
      hp,
      maxHp: hp,
      cd: 0,
      jx: (this.rand() - 0.5) * 0.5,
      jy: (this.rand() - 0.5) * 0.5,
      distract: -1,
      distractT: 0,
      rollT: this.rand() * 0.5,
      marked: false,
      flash: 0,
      ...(ENEMIES[kind].shield ? { shieldHp: ENEMIES[kind].shield!.hp } : {}),
    };
    if (ENEMIES[kind].shield) this.shieldGenerators.push(enemy);
    return enemy;
  }

  // ── Flow field ────────────────────────────────────────────────────────
  /** Cost of stepping out of a cell for a ground enemy. */
  private enterCost(i: number): number {
    if (this.solid[i]) {
      const b = this.map.owner[i];
      return 3 + this.hp[b] / 6;
    }
    return this.map.type[i] === CellType.ROAD ? 1 : 1.25;
  }

  computeField() {
    this.fieldDirty = false;
    this.fieldT = 0.25;
    fillFlowField(this.field, this.keep.cells, this.terrain);
  }

  // ── Enemy index ───────────────────────────────────────────────────────
  private indexEnemies() {
    for (const i of this.gridUsed) this.grid[i].length = 0;
    this.gridUsed.length = 0;
    for (const e of this.enemies) {
      const i = cellAt(e.x, e.y);
      if (!this.grid[i].length) this.gridUsed.push(i);
      this.grid[i].push(e);
    }
  }

  /** Enemies within `r` of a point (uses the cell index). */
  enemiesNear(x: number, y: number, r: number): Enemy[] {
    const out: Enemy[] = [];
    const x0 = Math.max(0, Math.floor(x - r)),
      x1 = Math.min(CELLS_W - 1, Math.floor(x + r));
    const y0 = Math.max(0, Math.floor(y - r)),
      y1 = Math.min(CELLS_H - 1, Math.floor(y + r));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (const e of this.grid[cellIndex(cx, cy)]) if (e.hp > 0 && sq(e.x - x) + sq(e.y - y) <= r * r) out.push(e);
    return out;
  }

  private markEnemies() {
    for (const e of this.enemies) e.marked = false;
    const r = watchRadius(this.levels.watchRadius);
    for (const b of this.map.buildings) {
      if (b.kind !== "watchTower" || !this.intact(b)) continue;
      const c = center(b.rect);
      for (const e of this.enemiesNear(c.x, c.y, r)) e.marked = true;
    }
  }

  /** The living soldier or civilian nearest (x, y) within `r`. */
  nearestDefender(x: number, y: number, r: number): Soldier | Civilian | null {
    let best: Soldier | Civilian | null = null, bd = r * r;
    // Keep the original last-wins tie order without allocating a list per enemy.
    for (let team = 0; team < 2; team++) {
      const units = team === 0 ? this.soldiers : this.civilians;
      for (const u of units) {
        if (u.hp <= 0) continue;
        const d = sq(u.x - x) + sq(u.y - y);
        if (d <= bd) { best = u; bd = d; }
      }
    }
    return best;
  }

  // ── Damage and rebuilding ─────────────────────────────────────────────
  /** Hurts `e` (double when marked); a steady burn hurts it without the
   * flash of a blow. */
  hurtEnemy(e: Enemy, amount: number, flash = true, source: "ranged" | "melee" = "ranged") {
    if (e.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return false;
    if (source === "ranged") {
      const shields = this.shieldGenerators.filter(g => g.hp > 0 && (g.shieldHp ?? 0) > 0 &&
        sq(g.x - e.x) + sq(g.y - e.y) <= sq(ENEMIES[g.kind].shield!.radius));
      const shield = shields.find(g => g.shieldHp === Infinity) ?? shields[0];
      if (shield) {
        if (shield.shieldHp !== Infinity) shield.shieldHp = Math.max(0, shield.shieldHp! - amount);
        return false;
      }
    }
    e.hp -= e.marked ? amount * 2 : amount;
    if (flash) e.flash = 0.12;
    if (e.hp <= 0) this.effects.push({ kind: "spark", x: e.x, y: e.y, t: 0, r: ENEMIES[e.kind].size });
    return true;
  }

  damageBuilding(id: number, amount: number) {
    if (this.hp[id] <= 0) return;
    this.hp[id] -= amount;
    this.flash[id] = BUILDING_FLASH;
    if (this.hp[id] <= 0) this.collapse(this.map.buildings[id]);
  }

  private collapse(b: Building) {
    this.hp[b.id] = 0;
    this.built[b.id] = 0;
    for (const c of b.cells) this.solid[c] = 0;
    this.changed.push(...b.cells);
    const p = center(b.rect);
    this.effects.push({ kind: "dust", x: p.x, y: p.y, t: 0, r: Math.max(b.rect.w, b.rect.h) * 0.7 });
    this.fieldDirty = true;
    this.mapVersion++;
  }

  /** Civilians restore a building one cell at a time; it regains its
   * function once the last cell is back. */
  rebuildCell(cell: number) {
    const id = this.map.owner[cell];
    if (id < 0 || this.solid[cell]) return;
    const b = this.map.buildings[id];
    this.solid[cell] = 1;
    this.changed.push(cell);
    this.built[id]++;
    this.hp[id] = Math.min(this.maxHp[id], this.hp[id] + this.maxHp[id] / b.cells.length);
    this.pushOut(cell);
    this.fieldDirty = true;
    this.mapVersion++;
  }

  /** Nudge any unit on foot standing in a cell that just became solid. */
  private pushOut(cell: number) {
    const cx = cellX(cell),
      cy = cellY(cell);
    const units: Point[] = [...this.enemies.filter((e) => !ENEMIES[e.kind].flying), ...this.soldiers, ...this.civilians];
    for (const u of units) {
      if (Math.floor(u.x) !== cx || Math.floor(u.y) !== cy) continue;
      const to = nearestOpen(this.solid, cx, cy, u);
      if (to) [u.x, u.y] = to;
    }
  }

  /** A blast: full damage at the centre falling to 40% at the edge. Returns
   * the seed its fireball and scorch are drawn from. */
  explode(x: number, y: number, { r, damage, friendlyFire }: Blast): number {
    this.indexEnemies();
    const hit = (d: number) => damage * (1 - 0.6 * Math.min(1, d / r));
    for (const e of this.enemiesNear(x, y, r)) this.hurtEnemy(e, hit(dist(e.x - x, e.y - y)));
    if (friendlyFire)
      for (const u of [...this.soldiers, ...this.civilians]) {
        const d = dist(u.x - x, u.y - y);
        if (d > r || u.hp <= 0 || ("guard" in u && u.guard)) continue;
        u.hp -= hit(d) * FRIENDLY_FIRE;
        u.flash = 0.12;
      }
    const seed = (this.rand() * 1e9) | 0;
    this.effects.push({ kind: "boom", x, y, t: 0, r, seed });
    this.scorches.push({ x, y, r, seed, t: 0, life: 1 + Math.min(2, r * 0.45) + this.rand() * 0.5 });
    return seed;
  }

  // ── Movement ──────────────────────────────────────────────────────────
  /** An open cell beside a building, preferring streets. */
  doorOf(b: Building): number {
    const sides = sideCells(b.rect).filter((i) => !this.solid[i]);
    return sides.find((i) => this.map.type[i] === CellType.ROAD) ?? sides[0] ?? -1;
  }

  /** Steer a unit toward a point with light crowd separation; returns false
   * if it made no headway (stuck against something). */
  moveToward(u: Point, to: Point, { speed, dt, flying = false }: Stride): boolean {
    let dx = to.x - u.x,
      dy = to.y - u.y;
    const len = dist(dx, dy);
    if (len < 0.02) return true;
    dx /= len;
    dy /= len;
    const [sx, sy] = "kind" in u && ENEMIES[(u as Enemy).kind]?.unyielding ? [0, 0] : this.separation(u);
    const step = Math.min(len, speed * dt);
    const mx = dx * step + sx * 0.5 * speed * dt * 4;
    const my = dy * step + sy * 0.5 * speed * dt * 4;
    if (flying) {
      u.x += mx;
      u.y += my;
      return true;
    }
    const ox = u.x,
      oy = u.y;
    if (!blocked(this.solid, u.x + mx, u.y)) u.x += mx;
    if (!blocked(this.solid, u.x, u.y + my)) u.y += my;
    return Math.abs(u.x - ox) + Math.abs(u.y - oy) > step * 0.1;
  }

  /** A push away from enemies crowding within 0.45 cells. */
  private separation(u: Point): [number, number] {
    let sx = 0,
      sy = 0;
    const x0 = Math.max(0, Math.floor(u.x - .45)), x1 = Math.min(CELLS_W - 1, Math.floor(u.x + .45));
    const y0 = Math.max(0, Math.floor(u.y - .45)), y1 = Math.min(CELLS_H - 1, Math.floor(u.y + .45));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const list = this.grid[cellIndex(x, y)];
      // Dense crowds use at most 8 representatives per cell. Ordinary crowds
      // keep exact separation; bounded work avoids quadratic pile-ups at walls.
      const stride = Math.max(1, Math.ceil(list.length / 8));
      const offset = ('id' in u ? (u.id as number) : 0) % stride;
      for (let i = offset; i < list.length; i += stride) {
        const o = list[i];
        if (o === u) continue;
        const ox = u.x - o.x,
          oy = u.y - o.y;
        if (o.hp <= 0 || sq(ox) + sq(oy) > .45 * .45) continue;
        const d = dist(ox, oy) || 0.01;
        sx += (ox / d) * (0.45 - d);
        sy += (oy / d) * (0.45 - d);
      }
    }
    return [sx, sy];
  }

  /** Walk a planned route cell by cell, dropping it when something was
   * (re)built across it or the unit is wedged; with no route, head straight
   * for `chase` if given. */
  followPath(u: Point & { path: number[] }, chase: Point | null, speed: number, dt: number) {
    while (u.path.length) {
      const c = u.path[0];
      const p = cellCenter(c);
      if (dist(p.x - u.x, p.y - u.y) < 0.3) {
        u.path.shift();
        continue;
      }
      if (this.solid[c] || !this.moveToward(u, p, { speed, dt })) u.path = [];
      return;
    }
    if (chase) this.moveToward(u, chase, { speed, dt });
  }

  // ── Consumables ───────────────────────────────────────────────────────
  dropBomb(x: number, y: number) {
    this.explode(x, y, { r: BOMB_RADIUS, damage: BOMB_DAMAGE * this.bonuses.bombDamage, friendlyFire: !this.levels.bombSafe });
  }
}

function maxHpOf(b: Building, levels: Levels, bonuses: Readonly<Bonuses>) {
  if (b.kind === "wall") return wallHp(levels.wallStrength) * bonuses.wallHp;
  if (b.kind === "house") return HOUSE_HP_PER_CELL * b.cells.length;
  if (b.kind === "keep") return keepHp(levels.keepStrength) * bonuses.keepHp;
  return STRUCTURES[b.kind].maxHp;
}

/** Road cells inside the city. */
function streetCells(map: CityMap) {
  const out: number[] = [];
  for (let i = 0; i < CELL_COUNT; i++) if (map.city[i] && map.type[i] === CellType.ROAD) out.push(i);
  return out;
}
