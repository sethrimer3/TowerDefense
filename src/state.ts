import { entrance, floorFor } from "./delve/labyrinth.ts";
import { isDeadlocked } from "./analysis.ts";
import { chooseStep } from "./automation.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { doorBlockedMessage, doorName, KEY_ORDER } from "./doors.ts";
import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  TOWER_START_X,
  TOWER_SECTION,
  xpForKill,
  cost,
  UPGRADES,
  GOLD_SHOP,
  type UpgradeId,
  type GoldItemId,
  type KeyColor,
} from "./config.ts";
import {
  type Save,
  type Run,
  type RunCore,
  type TowerRun,
  type DelveRun,
  type ModeSave,
  type Tile,
  type Enemy,
  type Mode,
  type MoveSnapshot,
  type Player,
  type ClearTier,
} from "./entities.ts";
import { World, LAYOUT_VERSION } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import type { CombatPrediction } from "./combat.ts";
import { ATTACK_SHARD, DEFENSE_SHARD, isLethal, resolveStep, type StepBlocked, type StepEffect } from "./step-effects.ts";
import { OutsideWorld } from "./outside.ts";
import { ClearLedger } from "./tower/clear-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { rollTreasureLoot } from "./loot.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { loadout } from "./loadout.ts";
import {
  creditMaterials,
  craftEquipment as craftEquipmentItem,
  salvageEquipment as salvageEquipmentItem,
  equipItem as equipItemAction,
  unequipSlot as unequipSlotAction,
  craftConsumable as craftConsumableItem,
  CONSUMABLES,
  type ConsumableId,
} from "./crafting.ts";
import type { EquipmentSlot } from "./equipment.ts";
import type { MaterialStack, MetalId } from "./materials.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number };
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "stairsDown", "oneway", "openedChest"]);
export class Game {
  mode: Mode = "tower";
  world!: Board;
  run!: Run;
  route: Step[] = [];
  blocked = { x: 0, y: 0, until: 0 };
  auto = false;
  paused = false;
  message = "";
  effect = { text: "", x: 0, y: 0, until: 0 };
  summary: null | {
    height: number;
    kills: number;
    reason: string;
    dead?: boolean;
    /** True when the fatal move happened while Automove was on — the
     * summary page is skipped and the player is dropped outside directly. */
    autoDeath?: boolean;
    record: boolean;
  } = null;
  /** `rng` is the game's randomness: new run seeds, enemy drops and
   * treasure loot all draw from it, so a seeded stream replays a game. */
  /** Delve Automove's committed route and last weighed decisions. */
  readonly delvePlan = new DelvePlan();
  constructor(public save: Save, private rng: () => number = Math.random) {
    this.loadMode();
  }
  get undoCapacity() {
    return loadout(this.save).undoCapacity;
  }
  /** Grants unlimited currency, every Tower section, and every game mode.
   * Reversible: turning Dev Mode back off leaves the grants in place, since
   * there is no meaningful "undo" for progress the player has already seen. */
  setDevMode(on: boolean) {
    this.save.settings.devMode = on;
    if (!on) return;
    this.save.gold = 999_999_999;
    this.save.tower.inspiration = 999_999_999;
    this.save.delve.courage = 999_999_999;
    for (const material of MATERIALS) {
      if (material.category === "metal" || material.category.startsWith("monster-")) {
        this.save.materials[material.id] = 999_999_999;
      }
    }
    this.save.upgrades.delve = 1;
    this.save.upgrades.legacy = 1;
    const maxSection = Math.max(20, ...Object.keys(this.save.tower.sectionHp).map(Number)) + 5;
    for (let s = 1; s <= maxSection; s++) this.save.tower.sectionHp[s] ??= 999;
    this.save.tower.reached = Math.max(this.save.tower.reached, maxSection * TOWER_SECTION);
    this.save.tower.best = Math.max(this.save.tower.best, this.save.tower.reached);
    this.save.delve.reached = Math.max(this.save.delve.reached, maxSection * TOWER_SECTION);
    this.save.delve.best = Math.max(this.save.delve.best, this.save.delve.reached);
  }
  switchMode(next: Mode) {
    if (next === this.mode) return;
    if (next === "delve" && !this.save.upgrades.delve) return;
    this.claimRewards();
    this.mode = next;
    this.loadMode();
  }
  loadMode() {
    const run = this.slice.run;
    if (!run) this.newRun();
    else {
      if (!run.outside) this.upgradeLayout();
      this.adoptRun(run);
    }
    this.syncRewards();
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.blocked = { x: 0, y: 0, until: 0 };
  }
  /** Makes `run` the live run of this mode and rebuilds its board. */
  private adoptRun(run: Run) {
    this.run = run;
    this.slice.run = run;
    this.world = this.buildWorld();
  }
  /** The live run's board, regenerated from its seed and changes. */
  private buildWorld(): Board {
    const r = this.run;
    return r.outside ? new OutsideWorld(r.seed, this.mode) : this.rules.board(r);
  }
  /** Map edits saved under an older layout can't be applied to the new one:
   * they are dropped, and progress, stats and inventory are kept. */
  private upgradeLayout() {
    if (this.slice.run!.layoutVersion === this.rules.layoutVersion) return;
    if (this.mode === "delve") this.reshapeDelve(this.save.delve.run!);
    else this.reshapeTower(this.save.tower.run!);
  }
  /** Returns the player to their section's entrance on the new labyrinth. */
  private reshapeDelve(run: DelveRun) {
    this.save.delve.history = [];
    this.save.delve.revival = null;
    run.layoutVersion = LAYOUT_VERSION;
    run.changes = {};
    run.milestone = Math.floor(run.height / 100);
    Object.assign(run.player, entrance(run.seed, run.milestone));
    run.floor = floorFor(run.seed, run.milestone);
    this.forgetLabyrinth();
    this.message =
      "The tower has reshaped. Progress kept; returned to this section’s entrance.";
  }
  /** The floor's geometry changed: stand at its entrance, and let
   * syncRewards pay out any clear chests whose old spots may now be wall. */
  private reshapeTower(run: TowerRun) {
    run.layoutVersion = TOWER_LAYOUT_VERSION;
    run.changes = {};
    run.floors = {};
    run.player.x = TOWER_START_X;
    run.player.y = 0;
  }
  /** Revive is only offered until the next move. */
  private settleRevival() {
    this.slice.revival = null;
  }
  /** Pays what the run still owes; returns whether it set a new record. */
  private payout(): boolean {
    const record = this.run.height > this.slice.reached;
    this.recordProgress();
    this.claimRewards();
    this.save.gold += this.rules.endGold(this.run);
    return record;
  }
  snapshot(): MoveSnapshot {
    return { run: structuredClone(this.run), best: this.slice.best };
  }
  restore(snapshot: MoveSnapshot) {
    this.claimRewards();
    // The snapshot's board brings back any chest it had; one already paid
    // pays nothing when opened again.
    this.adoptRun(this.rewound(snapshot.run));
    this.syncRewards();
    // Lifetime achievements are never rolled back by movement undo.
    this.recordProgress();
    this.route = [];
    this.auto = false;
    this.summary = null;
    this.paused = false;
    this.blocked.until = 0;
  }
  /** A copy of an earlier state of the run. Damage taken and keys spent on
   * this floor stay on record, so undo never wins back a better clear tier. */
  private rewound(past: Run): Run {
    const run = structuredClone(past);
    if (this.mode !== "tower") return run;
    const now = this.towerRun, then = run as TowerRun;
    const sameRun = now.seed === then.seed;
    if (sameRun && now.damaged) then.damaged = true;
    if (sameRun && now.height === then.height && now.keysSpent) then.keysSpent = true;
    return run;
  }
  undo() {
    const slice = this.slice;
    if (slice.revival) {
      const snapshot = slice.revival.snapshot;
      slice.revival = null;
      slice.history = [];
      this.restore(snapshot);
      this.feedback("Revived - fatal move undone");
      return true;
    }
    if (this.summary) return false;
    const snapshot = slice.history.pop();
    if (!snapshot) return false;
    this.restore(snapshot);
    this.feedback("Move undone");
    return true;
  }
  private reject(x: number, y: number, message: string) {
    this.route = [];
    this.blocked = { x, y, until: performance.now() + 1000 };
    this.message = message;
  }
  previewRoute(x: number, y: number): Step[] | null {
    return routeTo(this, x, y);
  }
  /** Simulates walking a multi-tile route without mutating state, so the UI
   * can preview cumulative HP/ATK/DEF/key changes before the player commits
   * to the walk. Stops early at a lethal fight or a door it can't afford. */
  previewRouteEffects(route: Step[]): RouteEffects | null {
    if (route.length < 2) return null;
    const start = this.run.player;
    let end = start;
    for (const step of route) {
      const outcome = resolveStep(end, this.world.tile(step.x, step.y));
      if (outcome.blocked) break;
      end = outcome.player;
      if (end.hp <= 0) break;
    }
    const result: RouteEffects = {
      hp: [start.hp, end.hp],
      attack: [start.attack, end.attack],
      defense: [start.defense, end.defense],
      keys: {},
    };
    for (const color of KEY_ORDER)
      if (end.keys[color] !== start.keys[color]) result.keys[color] = [start.keys[color], end.keys[color]];
    return result;
  }
  walkTo(x: number, y: number) {
    if (this.paused || this.summary) return;
    this.auto = false;
    const route = routeTo(this, x, y);
    if (!route) {
      this.reject(x, y, "No route to that space.");
      return;
    }
    // The whole tap-to-walk route counts as a single undo step, not one per tile.
    if (route.length) {
      this.settleRevival();
      const slice = this.slice;
      slice.history.push(this.snapshot());
      slice.history = slice.history.slice(-this.undoCapacity);
    }
    this.route = route;
    this.message = route.length ? "Walking to destination." : "Already here.";
  }
  /** A step the player takes themselves: it drops any queued route and Automove. */
  stepManually(dx: number, dy: number) {
    this.route = [];
    this.auto = false;
    return this.move(dx, dy, true);
  }
  cancelRoute() {
    this.route = [];
  }
  toggleAuto() {
    this.route = [];
    this.auto = !this.auto;
    this.message = this.auto ? "Wayfinder is searching for a route." : "Manual climbing";
  }
  /** One Automove step: the step it chooses, or a note that none is safe. */
  autoTurn() {
    const step = chooseStep(this);
    if (step) {
      this.move(step.dx, step.dy, false);
      this.message = step.label;
    } else this.message = "Waiting · no safe route. Explore or retire this ascent.";
  }
  /** Closes the run summary for the next run, in the forest; a death has
   * already started it. */
  nextRun() {
    const dead = this.summary?.dead;
    this.summary = null;
    if (!dead) this.newRun({ outside: true });
    this.message = "Follow the forest path to the entrance.";
  }
  /** Erases all progress and starts again outside the Tower. */
  eraseAll() {
    this.save = defaults();
    this.summary = null;
    this.mode = "tower";
    this.newRun({ outside: true });
  }
  routeStep() {
    const step = this.route.shift();
    if (!step) return false;
    const result = this.move(step.dx, step.dy, true, false);
    if (!result) this.route = [];
    return result;
  }
  /** Starts a new run in this mode, rolling its seed unless `start` gives
   * one. */
  newRun({ outside = false, seed = Math.floor(this.rng() * 2 ** 32) }: RunStart = {}) {
    if (this.run) this.claimRewards();
    this.settleRevival();
    this.slice.history = [];
    this.route = [];
    this.summary = null;
    const { attack, defense, maxHp, keys } = loadout(this.save);
    // Tower ascents begin at the first floor of the chosen section.
    const section = this.mode === "tower" ? this.startSection() : 0,
      height = section * TOWER_SECTION;
    const player = {
      x: this.rules.entranceX,
      y: 0,
      hp: this.sectionStartHp(section, maxHp),
      maxHp,
      attack,
      defense,
      keys,
    };
    // The provisions bought for this run are spent on it.
    for (const item of GOLD_SHOP) this.save.provisions[item.id] = 0;
    const core: RunCore = {
      layoutVersion: this.rules.layoutVersion,
      seed,
      height,
      maxHeight: height,
      kills: 0,
      treasures: 0,
      changes: {},
      floor: 0,
      player,
    };
    this.run = this.mode === "tower"
      ? { damaged: false, keysSpent: false, ...core }
      : { ...core, milestone: 0 };
    this.run.loadout = { attack, defense, maxHp };
    this.world = this.rules.board(this.run);
    if (outside) {
      this.run.outside = true;
      this.world = new OutsideWorld(seed, this.mode);
      this.message = "Follow the forest path to the entrance.";
    } else this.forgetLabyrinth();
    this.slice.run = this.run;
    this.auto = false;
    this.paused = false;
  }
  /** A Tower section can be started in once its first floor has been
   * reached (which records its starting HP); section 0 always can. */
  sectionUnlocked(section: number) {
    return section === 0 || !!this.save.tower.sectionHp[section];
  }
  startSection() {
    const s = this.save.tower.startSection;
    return this.sectionUnlocked(s) ? s : 0;
  }
  /** Section 0 starts at full HP; later sections start with the best HP
   * the player ever arrived there with (never above current max HP). */
  private sectionStartHp(section: number, maxHp: number) {
    return section === 0 ? maxHp : Math.min(maxHp, this.save.tower.sectionHp[section]);
  }
  /** Choose where future ascents begin. A Tower run still on the forest
   * path hasn't entered yet, so it moves to the new section at once; a run
   * already inside keeps going and the choice applies to the next one. */
  setStartSection(section: number) {
    if (!this.sectionUnlocked(section)) return false;
    this.save.tower.startSection = section;
    const run = this.save.tower.run;
    if (run?.outside) {
      run.height = run.maxHeight = section * TOWER_SECTION;
      run.floors = {};
      run.changes = {};
      run.player.hp = this.sectionStartHp(section, run.player.maxHp);
      this.save.tower.history = [];
    }
    return true;
  }
  private feedback(text: string) {
    this.message = text;
    this.effect = {
      text,
      x: this.run.player.x,
      y: this.run.player.y,
      until: performance.now() + 1300,
    };
  }
  gainXp(enemy: Enemy) {
    this.save.xp += xpForKill(enemy.tier, enemy.attack);
  }
  /** The single path that ends the current run, whether by death, by a
   * detected deadlock, or by the player choosing to retire. Captures the
   * dying run's stats into the summary before any new run is created, pays
   * out exactly once, and only opens a Revive opportunity for an actual
   * fatal player choice (never for a deadlock or a manual retire). */
  private finalizeRun(
    reason: string,
    options: { dead?: boolean; allowRevive?: boolean; preFatalSnapshot?: MoveSnapshot } = {},
  ) {
    if (this.summary) return;
    const { dead = false, allowRevive = false, preFatalSnapshot } = options;
    const wasAuto = this.auto;
    this.settleRevival();
    // Capture the dying run's own stats — height/kills/record — and pay out
    // rewards while `this.run` still refers to this run, before newRun()
    // (below) replaces it.
    const record = this.payout();
    this.slice.history = [];
    this.route = [];
    // Automove keeps running through death only when the player has
    // researched Steadfast wayfinder and switched off the default
    // turn-off-on-death behavior.
    const keepAuto =
      dead &&
      wasAuto &&
      !!this.save.upgrades.autoPersist &&
      !this.save.settings.autoOffOnDeath;
    const summary = {
      height: this.run.height,
      kills: this.run.kills,
      reason,
      dead,
      autoDeath: dead && wasAuto,
      record,
    };
    if (dead) this.newRun({ outside: true });
    else this.slice.run = null;
    if (allowRevive && dead && preFatalSnapshot && this.save.upgrades.revive)
      this.slice.revival = { snapshot: preFatalSnapshot };
    this.summary = summary;
    this.auto = keepAuto;
    if (dead)
      this.message = "Returned to the forest. Follow the path to begin again.";
  }
  /** Runs only after a meaningful Tower state change (never every frame):
   * a defeated enemy, a collected pickup, a consumed door, or a floor
   * transition. Lethal (but non-impervious) enemies never count as viable
   * progress here, matching automation's own avoidance of them. */
  checkDeadlock() {
    if (this.mode !== "tower" || !this.playing) return;
    if (isDeadlocked(this.towerRun))
      this.finalizeRun("No viable moves remain", { dead: false });
  }
  /** Keys every physical enemy kill / treasure chest by seed (+height for
   * Tower, whose x/y space is reused per room) so persistent loot can be
   * gated outside `run` — undoing a kill/chest reverts the tile, but never
   * re-grants the reward for the same physical kill/chest. */
  private lootKey(x: number, y: number): string {
    return this.rules.lootKey(this.run, x, y);
  }
  /** Inside a run that hasn't ended: not in the forest, no summary showing. */
  private get playing() {
    return !this.run.outside && !this.summary;
  }
  /** A single orthogonal step while play is live. */
  private canStep(dx: number, dy: number) {
    return !this.paused && !this.summary && Math.abs(dx) + Math.abs(dy) === 1;
  }
  move(dx: number, dy: number, force = true, track = true) {
    if (!this.canStep(dx, dy)) return false;
    const p = this.run.player,
      dest = this.world.step(p.x, p.y, dx, dy);
    if (!dest) {
      this.reject(p.x, p.y, "That edge is closed.");
      return false;
    }
    const t = this.world.tile(dest.x, dest.y);
    // The step is resolved once, before any snapshot/undo bookkeeping, so a
    // wall, lock, impervious enemy, or (automation's) declined lethal fight
    // never touches history, damages the player, alters the enemy, or ends the run.
    const outcome = resolveStep(p, t);
    if (outcome.blocked) return this.rejectStep(outcome, t, dest.x, dest.y);
    if (!force && isLethal(outcome)) {
      this.feedback("Lethal encounter. Inspect the enemy before proceeding.");
      return false;
    }
    if (!this.enter(t, outcome, dest, track)) return false;
    this.land(t, dest.x, dest.y, outcome);
    return true;
  }
  /** Commits a resolved step: undo history, stats, and the door or fight on
   * the way in. Returns false when the player fell. */
  private enter(t: Tile, outcome: StepEffect, dest: { x: number; y: number }, track: boolean) {
    this.settleRevival();
    const before = this.snapshot();
    if (track) this.remember(before);
    this.applyStats(outcome.player);
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent);
    return t.kind !== "enemy" || this.winFight(t.enemy!, outcome.combat!, before, dest);
  }
  /** Moves the player onto the tile and applies what standing there does. */
  private land(t: Tile, x: number, y: number, outcome: StepEffect) {
    const p = this.run.player;
    p.x = x;
    p.y = y;
    // Walking into a torch destroys it immediately: light, collision and
    // sprite all disappear the same frame since rendering only ever draws
    // active torches from this same list.
    this.world.breakTorchAt?.(x, y);
    if (this.run.outside) {
      if (t.kind === "stairs") this.enterFromOutside();
      return;
    }
    if (t.kind === "reward") {
      this.run.changes[`${x},${y}`] = { kind: "openedChest", tier: t.tier };
      this.claimRewards(t.tier);
      return;
    }
    this.collect(t, x, y, outcome);
    this.consumeTile(t, x, y);
    this.checkClear();
    this.afterStep(t, x, y);
  }
  /** Mode-specific progress once the player stands on the new tile. */
  private afterStep(t: Tile, x: number, y: number) {
    if (this.mode === "delve") this.afterDelveStep(t, x, y);
    else if (t.kind === "stairs") this.advanceTowerRoom();
    else if (t.kind === "stairsDown") this.descendTowerRoom();
    if (t.kind !== "floor" && t.kind !== "oneway") this.checkDeadlock();
  }
  private rejectStep(outcome: StepBlocked, t: Tile, x: number, y: number): false {
    if (outcome.blocked === "wall") this.reject(x, y, "A wall blocks the way.");
    else if (outcome.blocked === "locked") this.reject(x, y, doorBlockedMessage(t));
    else {
      this.reject(x, y, `Impervious — requires ${outcome.combat.requiredAttack} more ATK`);
      this.checkDeadlock();
    }
    return false;
  }
  private remember(snapshot: MoveSnapshot) {
    const slice = this.slice;
    slice.history.push(snapshot);
    slice.history = slice.history.slice(-this.undoCapacity);
  }
  /** Copies resolved stats onto the live player, keeping its object identity. */
  private applyStats(next: Player) {
    const p = this.run.player;
    p.hp = next.hp;
    p.attack = next.attack;
    p.defense = next.defense;
    Object.assign(p.keys, next.keys);
  }
  /** Marks the Tower floor as no longer cleared without damage, or
   * without spending keys; the Delve has no clear tiers. */
  private mar(what: "damaged" | "keysSpent") {
    if (this.mode === "tower") this.towerRun[what] = true;
  }
  private openDoor(t: Tile, keysSpent: KeyColor[]) {
    const n = keysSpent.length;
    if (n) this.mar("keysSpent");
    this.feedback(`${doorName(t)} opened${n ? ` · ${n} key${n === 1 ? "" : "s"} spent` : " · full HP"}`);
  }
  /** Settles a fight whose damage is already applied. Returns false (and ends
   * the run, allowing Revive) when the player fell. */
  private winFight(enemy: Enemy, combat: CombatPrediction, before: MoveSnapshot, at: { x: number; y: number }) {
    if (combat.damage > 0) this.mar("damaged");
    if (this.run.player.hp <= 0) {
      this.finalizeRun("Fallen in battle", {
        dead: true,
        allowRevive: true,
        preFatalSnapshot: before,
      });
      return false;
    }
    this.run.kills++;
    this.gainXp(enemy);
    const dropText = this.creditEnemyDrops(enemy, at.x, at.y);
    this.feedback(
      (combat.damage
        ? `−${combat.damage} HP · ${enemy.name} defeated`
        : "Unscathed victory") + dropText,
    );
    return true;
  }
  /** Persistent drops are gated by lootedTiles (outside `run`), so undo can
   * restore the enemy but can never duplicate its material reward. */
  private creditEnemyDrops(enemy: Enemy, x: number, y: number): string {
    const slice = this.slice,
      key = this.lootKey(x, y);
    if (slice.lootedTiles[key]) return "";
    slice.lootedTiles[key] = true;
    const drops = this.rules.enemyDrops(enemy.name, this.rng);
    if (!drops.length) return "";
    creditMaterials(this.save, drops);
    return " · +" + drops.map(d => `${d.quantity} ${materialDef(d.id).name}${d.quantity > 1 ? "s" : ""}`).join(", +");
  }
  private enterFromOutside() {
    const p = this.run.player;
    this.run.outside = false;
    p.x = this.rules.entranceX;
    p.y = 0;
    this.world = this.rules.board(this.run);
    this.forgetLabyrinth();
    this.route = [];
    this.feedback(this.rules.words.enter);
  }
  /** Removes what the step used up: chests stay behind opened, fixtures stay. */
  private consumeTile(t: Tile, x: number, y: number) {
    if (t.kind === "treasure") this.run.changes[`${x},${y}`] = { kind: "openedChest" };
    else if (!PERMANENT_TILES.has(t.kind)) this.world.clear(x, y);
  }
  /** Clears Automove's memory when the labyrinth behind it is gone: a Delve
   * run entering it (a death sends the player to the forest first, so
   * Revive keeps the memory), a sealed milestone gate, or a reshaped layout. */
  private forgetLabyrinth() {
    if (this.mode === "delve") this.save.delve.memory = { known: {}, visited: {} };
  }
  private afterDelveStep(t: Tile, x: number, y: number) {
    const world = this.world;
    if (!(world instanceof World)) return;
    // The world keeps the run's milestone and floor itself.
    if (t.kind === "oneway" && world.cross(x, y)) {
      this.forgetLabyrinth();
      this.save.delve.history = []; // Milestone passages cannot be reversed with undo.
      this.route = [];
      this.feedback(`Depth ${world.milestone * 100} · the passage seals behind you.`);
    }
    const visited = this.save.delve.memory.visited;
    visited[`${x},${y}`] = (visited[`${x},${y}`] ?? 0) + 1;
    this.run.height = Math.max(this.run.height, world.depth(x, y));
    this.run.maxHeight = Math.max(this.run.maxHeight ?? 0, this.run.height);
    world.maintain(y);
    this.recordProgress();
  }
  advanceTowerRoom() {
    this.claimRewards();
    const { board, sectionStart } = this.climb.up();
    this.enterTowerFloor(board);
    if (sectionStart) this.enterTowerSection();
    else this.feedback("A new chamber opens.");
  }
  /** Crossing into a new 10-floor section: the way down is sealed (its
   * first room has no down stairs), ATK/DEF gathered from items in the
   * last section are dropped, and the HP carried in becomes this section's
   * starting HP if it beats the previous best. */
  private enterTowerSection() {
    const section = this.run.height / TOWER_SECTION,
      p = this.run.player,
      base = this.run.loadout ?? loadout(this.save),
      best = this.save.tower.sectionHp[section] ?? 0;
    p.attack = base.attack;
    p.defense = base.defense;
    if (p.hp > best) this.save.tower.sectionHp[section] = p.hp;
    this.feedback(
      `Floor ${this.run.height + 1} · ATK/DEF reset` +
        (p.hp > best ? ` · new best start HP ${p.hp}` : ""),
    );
  }
  /** Step back onto the stairs at the foot of the current room, returning
   * to the previous room exactly as it was left: cleared tiles stay clear,
   * surviving enemies and unclaimed loot are still there to finish off. */
  descendTowerRoom() {
    if (this.climb.sealedBelow) return;
    this.claimRewards();
    this.enterTowerFloor(this.climb.down()!.board);
    this.feedback("You descend to the room below.");
  }
  /** Stands on the floor the climb just reached, as it was left. Keys reset
   * per visit; damage taken anywhere in the run keeps counting toward the
   * whole-ascent Gold clear. */
  private enterTowerFloor(board: RoomWorld) {
    this.towerRun.keysSpent = false;
    this.recordProgress();
    this.world = board;
    this.syncRewards();
  }
  private get climb() {
    return new TowerClimb(this.towerRun);
  }
  recordProgress() {
    if (this.run.outside) return 0;
    const slice = this.slice;
    const reached = Math.max(slice.reached, this.run.height);
    const earned = milestones(this.rules, slice.reached, reached);
    slice.reached = reached;
    slice.best = Math.max(slice.best, reached);
    this.rules.credit(this.save, earned);
    return earned;
  }
  /** How the current mode differs from the other. */
  private get rules(): ModeProfile {
    return MODES[this.mode];
  }
  /** The current mode's save slice: its run, undo history and records. */
  private get slice(): ModeSave {
    return this.save[this.mode];
  }
  /** The live run as a Tower ascent; only Tower code asks for it. */
  get towerRun(): TowerRun {
    if (this.mode !== "tower") throw new Error("Not a Tower run");
    return this.run as TowerRun;
  }
  /** The live run as a Delve descent; only Delve code asks for it. */
  get delveRun(): DelveRun {
    if (this.mode !== "delve") throw new Error("Not a Delve run");
    return this.run as DelveRun;
  }
  /** Clear rewards live in the Tower's log, beside this run. */
  private get ledger() {
    return new ClearLedger(this.save.tower);
  }
  private syncRewards() {
    if (this.mode === "tower" && this.world instanceof RoomWorld) this.ledger.settle(this.towerRun);
  }
  private claimRewards(tier?: ClearTier) {
    if (this.mode !== "tower") return 0;
    const earned = tier ? this.ledger.open(tier, this.towerRun) : this.ledger.claimAll(this.towerRun);
    if (earned) this.feedback(`+${earned} Inspiration · clear reward${earned > 1 ? "s" : ""}`);
    return earned;
  }
  /** Once a Tower floor has no enemies or doors left, earns its clear tiers
   * and sets their chests by the stairs. */
  private checkClear() {
    if (this.mode !== "tower") return;
    for (const tier of this.ledger.check(this.world, this.towerRun))
      this.feedback(`${tier[0].toUpperCase() + tier.slice(1)} clear · reward by the stairs`);
  }
  /** Pickup feedback and treasure payouts; stats were already applied. */
  private collect(t: Tile, x: number, y: number, outcome: StepEffect) {
    if (t.kind === "key") this.feedback(`+1 ${t.color} key`);
    if (t.kind === "potion") this.feedback(`+${outcome.healed} HP`);
    if (t.kind === "attack") this.feedback(`+${ATTACK_SHARD} attack`);
    if (t.kind === "defense") this.feedback(`+${DEFENSE_SHARD} defense`);
    if (t.kind === "treasure") {
      this.run.treasures++;
      // Generated treasure never upgrades gear directly — it always grants
      // Gold, plus independent chances at metal, an Empty Vial, and gems.
      // Gated by lootedTiles so undo/reopen can't duplicate the payout.
      const key = this.lootKey(x, y);
      const slice = this.slice;
      if (!slice.lootedTiles[key]) {
        slice.lootedTiles[key] = true;
        const E = this.rules.equivalentFloor(this.rules.progressAt(this.run, y));
        const loot = rollTreasureLoot(E, this.rng);
        this.save.gold += loot.gold;
        creditMaterials(this.save, loot.materials);
        const extra = loot.materials.map(m => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`);
        this.feedback([`+${loot.gold} Gold`, ...extra].join(" · "));
      }
    }
  }
  finish(reason: string) {
    this.finalizeRun(reason, { dead: false });
  }
  buy(id: UpgradeId) {
    if (!skillAvailable(id, this.save.upgrades)) return false;
    const u = UPGRADES.find((u) => u.id === id)!;
    const n = this.save.upgrades[id],
      price = cost(id, n),
      balance =
        u.currency === "courage" ? this.save.delve.courage : this.save.tower.inspiration;
    if (n >= u.max || price > balance) return false;
    if (u.currency === "courage") this.save.delve.courage -= price;
    else this.save.tower.inspiration -= price;
    this.save.upgrades[id]++;
    return true;
  }
  buyGold(id: GoldItemId) {
    const item = GOLD_SHOP.find((g) => g.id === id)!;
    if (this.save.gold < item.cost) return false;
    this.save.gold -= item.cost;
    this.save.provisions[id]++;
    return true;
  }
  /** A gear change applies at once to the runs of both modes: each gains
   * or loses exactly what it changed in the loadout, so ATK/DEF gathered
   * from items and the provisions a run started with are kept. A run still
   * outside hasn't started, so it also starts with the HP it now would. */
  private changeGear(change: () => boolean | void) {
    const before = loadout(this.save);
    if (change() === false) return false;
    const after = loadout(this.save);
    for (const mode of ["tower", "delve"] as const) {
      const run = this.save[mode].run;
      if (!run) continue;
      for (const stats of [run.player, run.loadout])
        if (stats)
          for (const stat of ["attack", "defense", "maxHp"] as const) stats[stat] += after[stat] - before[stat];
      const p = run.player;
      p.hp = run.outside
        ? mode === "tower" ? this.sectionStartHp(run.height / TOWER_SECTION, p.maxHp) : p.maxHp
        : Math.max(1, Math.min(p.hp, p.maxHp));
    }
    return true;
  }
  craftEquipment(slot: EquipmentSlot, metal: MetalId, enhancements: MaterialStack[]) {
    return craftEquipmentItem(this.save, slot, metal, enhancements);
  }
  salvageEquipment(itemId: string) {
    return salvageEquipmentItem(this.save, itemId);
  }
  equipItem(itemId: string) {
    return this.changeGear(() => equipItemAction(this.save, itemId));
  }
  unequipSlot(slot: EquipmentSlot) {
    this.changeGear(() => unequipSlotAction(this.save, slot));
  }
  craftConsumable(id: ConsumableId) {
    return craftConsumableItem(this.save, id);
  }
  useConsumable(id: ConsumableId) {
    if (!this.playing || (this.save.consumables[id] ?? 0) <= 0) return false;
    const def = CONSUMABLES.find(c => c.id === id)!;
    const p = this.run.player;
    const n = Math.min(p.maxHp - p.hp, def.healAmount);
    p.hp += n;
    this.save.consumables[id]--;
    this.feedback(`${def.name} · +${n} HP`);
    return true;
  }
}
