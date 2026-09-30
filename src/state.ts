import { entrance, floorFor } from "./delve/labyrinth.ts";
import { chooseStep } from "./automation.ts";
import { CARDS, HAND_SLOTS, deckCards, moveCard, planHand, type CardId, type CardPlan } from "./cards.ts";
import { DelvePlan } from "./delve/automove.ts";
import { defaults } from "./save.ts";
import { stream } from "./random.ts";
import { doorBlockedMessage, doorName, KEY_ORDER } from "./doors.ts";
import { skillAvailable } from "./skill-trees.ts";
import { routeTo, type Step } from "./pathfinding.ts";
import {
  TOWER_START_X,
  TOWER_SECTION,
  xpForKill,
  levelForXp,
  TRAINING,
  cost,
  UPGRADES,
  GOLD_SHOP,
  type UpgradeId,
  type TrainingId,
  type GoldItemId,
  type KeyColor,
  FOCUS_PER_RUN,
  ENEMY_GOLD,
  silverForKill,
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
import { bout, heroHpDuring, type Bout, type CombatPrediction } from "./combat.ts";
import { ATTACK_SHARD, DEFENSE_SHARD, isLethal, resolveStep, type StepBlocked, type StepEffect } from "./step-effects.ts";
import { OutsideWorld } from "./outside.ts";
import { ClearLedger } from "./tower/clear-ledger.ts";
import { TowerClimb } from "./tower/climb.ts";
import { materialDef, MATERIALS } from "./materials.ts";
import { rollTreasureLoot } from "./loot.ts";
import { MODES, milestones, type ModeProfile } from "./modes.ts";
import { loadout, trainingPoints } from "./loadout.ts";
import { RESEARCH, cancelResearch, hastenResearch, hireArchivist, researched, settleArchives, startResearch, type ResearchId, type ResearchRecord } from "./archives.ts";
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
import type { MaterialId, MaterialStack, MetalId } from "./materials.ts";
/** How a new run starts: out in the forest or at the entrance, and from
 * which seed (rolled from the game's randomness when left out). */
export type RunStart = { outside?: boolean; seed?: number };
export type RouteEffects = {
  hp: [number, number];
  attack: [number, number];
  defense: [number, number];
  keys: Partial<Record<KeyColor, [number, number]>>;
};
/** A reward just picked up, or what a door took, to rise from the tile it
 * came from: drawn as its sprite (a tile's contents, marked `spent` for a
 * key a door used, a material, or the heart a Heart Door checked), or as
 * `text` where it has none. */
export type Gain = { x: number; y: number; text: string; art: GainArt | null };
export type GainArt = { tile: Tile; spent?: true } | { material: MaterialId; quantity: number } | { heart: true };
/** A potion's heal: the HP from and to, where the hero stood, and its number. */
export type Heal = { from: number; to: number; x: number; y: number; id: number };
/** Rewards kept for the board to show; older ones are dropped unseen. */
const MAX_GAINS = 12;
/** A fight being played out round by round before it counts: the hero waits
 * at `from`, the enemy stands at `to`, and nothing changes until
 * `finishEncounter` settles it (at `start + bout.duration`, performance time). */
export type Encounter = { from: { x: number; y: number }; to: { x: number; y: number }; bout: Bout; start: number; settle: () => void };
/** Tiles that stay on the board after being stepped on. */
const PERMANENT_TILES = new Set<Tile["kind"]>(["floor", "stairs", "stairsDown", "oneway", "openedChest"]);
export class Game {
  mode: Mode = "tower";
  world!: Board;
  run!: Run;
  route: Step[] = [];
  blocked = { x: 0, y: 0, until: 0 };
  /** Inside a run, whether the hand moves the hero (the play/pause
   * button); in the forest, whether Automove walks. */
  auto = false;
  /** The card moving the hero and the path it committed to, until the
   * hero reaches its target. */
  cardPlan: CardPlan | null = null;
  /** The hand's card that made the latest step, to show it glowing. */
  activeCard: number | null = null;
  /** No card in the hand can act: the hand pauses, and the run ends only
   * when the player ends it. Each thing the player does (an item used, a
   * skill) checks the hand again, and it plays on once a card can act. */
  handStuck = false;
  paused = false;
  message = "";
  effect = { text: "", x: 0, y: 0, until: 0 };
  /** Rewards picked up since the board last took them, oldest first. */
  gains: Gain[] = [];
  /** Whether something settles fights played out (the app's frame loop).
   * A game without one (tests, tools) settles every fight at once, whatever
   * the Animate fights setting says. */
  playsFights = false;
  /** The fight being played out, if any; steps wait until it settles. */
  encounter: Encounter | null = null;
  /** The last potion that healed, picked up or crafted: the HP it healed
   * from and to, where the hero stood, and a number that grows with each, so
   * the HP bar can fill up to it and the board raise the HP healed. */
  lastHeal: Heal | null = null;
  /** When the hero last reached a new level (performance.now()), for the
   * board's level-up burst; -Infinity once undo takes the level back. */
  levelUpAt = -Infinity;
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
  /** Delve Automove's committed route and last weighed decisions. */
  readonly delvePlan = new DelvePlan();
  /** `rng` is the game's randomness: new run seeds, enemy drops and
   * treasure loot all draw from it (the `game` stream unless given), so a
   * seeded stream replays a game and no visual effect can shift it. */
  constructor(public save: Save, private rng: () => number = stream("game")) {
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
    this.finishEncounter();
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
    this.auto = !this.run.outside && this.handStartsPlaying;
    this.dropHandPlan();
    this.summary = null;
    this.encounter = null;
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
    return { run: structuredClone(this.run), best: this.slice.best, xp: this.save.xp };
  }
  restore(snapshot: MoveSnapshot) {
    this.claimRewards();
    // The snapshot's board brings back any chest it had; one already paid
    // pays nothing when opened again.
    this.adoptRun(this.rewound(snapshot.run));
    this.syncRewards();
    // Lifetime achievements are never rolled back by movement undo, but XP
    // (and any level it reached) is: the kill it paid for is undone.
    this.recordProgress();
    if (levelForXp(snapshot.xp) < levelForXp(this.save.xp)) this.levelUpAt = -Infinity;
    this.save.xp = snapshot.xp;
    this.route = [];
    // Undo pauses the hand, so the player can act before it carries on.
    this.auto = false;
    this.dropHandPlan();
    this.summary = null;
    this.encounter = null;
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
    // A fight still playing out counts first, so undo takes it back.
    this.finishEncounter();
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
    if (this.paused || this.summary || this.encounter) return;
    if (!this.manualMoves) {
      this.handMovesNote();
      return;
    }
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
  /** Whether the player may move the hero themselves: in the forest, or
   * with Dev mode on. Inside a run the hand moves the hero. */
  get manualMoves() {
    return !!this.run.outside || this.save.settings.devMode;
  }
  /** Inside a run the hand plays from the start, except in Dev mode, where
   * it waits so the player can walk by hand. */
  private get handStartsPlaying() {
    // The browser UI suite starts it paused too, so no snapshot races a card's step.
    return !this.save.settings.devMode && !(globalThis as { __handStartsPaused?: boolean }).__handStartsPaused;
  }
  /** A step the player takes themselves: it drops any queued route and Automove. */
  stepManually(dx: number, dy: number) {
    if (this.encounter) return false;
    if (!this.manualMoves) return this.handMovesNote();
    this.route = [];
    this.auto = false;
    return this.move(dx, dy, true);
  }
  cancelRoute() {
    this.route = [];
  }
  private handMovesNote(): false {
    this.message = "The hand moves you inside a run.";
    return false;
  }
  /** Inside a run, plays or pauses the hand; in the forest, turns Automove on or off. */
  toggleAuto() {
    this.route = [];
    this.auto = !this.auto;
    if (!this.run.outside) {
      this.dropHandPlan();
      this.message = this.auto ? "The hand takes over." : "Paused · the hand waits.";
    } else this.message = this.auto ? "Wayfinder is searching for a route." : "Manual climbing";
  }
  /** One turn of automatic movement: the hand's step inside a run, or
   * Automove's in the forest. */
  autoTurn() {
    if (!this.run.outside) return this.handTurn();
    const step = chooseStep(this);
    if (step) {
      this.move(step.dx, step.dy, false);
      this.message = step.label;
    } else this.message = "Waiting · no safe route. Explore or retire this ascent.";
  }
  /** One step by the hand: follow the committed path, or, with none, the
   * first card in priority order that can reach a target. When none can,
   * the hero waits and the End Run button lights up. */
  private handTurn() {
    let plan = this.cardPlan, lost: CardId | null = null;
    const focused = this.run.focused;
    if (!plan && focused) {
      // The focused card keeps the lead while it has a path to a target.
      plan = planHand(this, this.hand, this.mode, this.hand.indexOf(focused));
      if (!plan) {
        this.run.focused = undefined;
        lost = focused;
      }
    }
    plan ??= planHand(this, this.hand, this.mode);
    this.handStuck = !plan;
    if (!plan) {
      this.cardPlan = null;
      this.activeCard = null;
      this.auto = false;
      this.message = "No card can move · end the run, or use an item or skill.";
      return;
    }
    const step = plan.path.shift()!;
    this.cardPlan = plan.path.length ? plan : null;
    this.activeCard = plan.card;
    const id = this.hand[plan.card];
    this.message = lost
      ? `Focus lost · ${CARDS[lost].name} has no path to a target · ${CARDS[id].name} leads.`
      : `${id === this.run.focused ? "Focus · " : ""}${CARDS[id].name} · ${CARDS[id].text}`;
    // The board changes only as the hero moves, so a refused step means the
    // plan is stale: drop it and let the next turn choose again.
    if (!this.move(step.dx, step.dy, true)) this.cardPlan = null;
    // The focused card's last step reaches its target: the focus is spent.
    else if (!this.cardPlan && id === this.run.focused) this.run.focused = undefined;
  }
  /** After something the player does inside a run (an item used, a skill),
   * a stuck hand checks its cards again and plays on if one can act. */
  private afterPlayerAction() {
    if (!this.handStuck || !this.playing) return;
    const plan = planHand(this, this.hand, this.mode);
    if (!plan) return;
    this.handStuck = false;
    this.cardPlan = plan;
    this.auto = true;
  }
  /** A run going inside keeps the hand as it was ordered on the way in,
   * and gets its Focus uses. */
  private dealHand() {
    this.run.hand = [...this.save.hand];
    this.run.focus = this.focusPerRun;
  }
  /** Focus uses a run starts with: none without the Focus skill, and more
   * with Focus Count research. */
  private get focusPerRun() {
    return this.save.upgrades.focus ? researched(this.save.archives, "focusPerRun", FOCUS_PER_RUN) : 0;
  }
  /** Silver held this run. */
  get silver() {
    return this.run.silver ?? 0;
  }
  /** Focus uses left: this run's inside one, or in the forest what the
   * next run will start with. */
  get focusLeft() {
    if (this.run.outside) return this.focusPerRun;
    return this.run.focus ?? 0;
  }
  /** Puts the hand's card in slot `card` ahead of the others until it
   * reaches its target, spending a Focus use; the hand plays on to it. A
   * card with no path to a target fails and costs nothing, and the card
   * already moving the hero can't be focused. */
  focus(card: number): "focused" | "unavailable" | "active" | "spent" | "noPath" {
    const id = this.hand[card];
    if (!this.save.upgrades.focus || this.run.outside || this.summary || !id) return "unavailable";
    if (this.run.focused === id || (card === this.activeCard && !this.handStuck)) return "active";
    if (this.focusLeft < 1) return "spent";
    const plan = planHand(this, this.hand, this.mode, card);
    if (!plan) return "noPath";
    this.run.focus = this.focusLeft - 1;
    this.run.focused = id;
    this.route = [];
    // During a fight, the path is found again once the hero has stepped in.
    this.cardPlan = this.encounter ? null : plan;
    this.activeCard = card;
    this.handStuck = false;
    this.auto = true;
    this.message = `Focus · ${CARDS[id].name} · ${CARDS[id].text}`;
    return "focused";
  }
  /** Forgets the hand's committed path and which card glows. */
  private dropHandPlan() {
    this.cardPlan = null;
    this.activeCard = null;
    this.handStuck = false;
  }
  /** Settles the fight being played out, as if it had played to the end.
   * Returns whether there was one. */
  finishEncounter() {
    const fight = this.encounter;
    if (!fight) return false;
    this.encounter = null;
    fight.settle();
    return true;
  }
  /** The hero's HP as the HUD shows it at `now` (performance time): during
   * a fight being played out, what the strikes so far have left. */
  shownHp(now: number) {
    const fight = this.encounter, hp = this.run.player.hp;
    return fight ? heroHpDuring(fight.bout, hp, now - fight.start) : hp;
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
    this.slice.runGold = 0;
    this.route = [];
    this.summary = null;
    this.encounter = null;
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
    } else {
      this.forgetLabyrinth();
      this.dealHand();
    }
    this.slice.run = this.run;
    this.auto = !outside && this.handStartsPlaying;
    this.dropHandPlan();
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
  /** Queues a reward to rise from (x, y). */
  private gain(x: number, y: number, text: string, art: GainArt | null = null) {
    this.gains.push({ x, y, text, art });
    if (this.gains.length > MAX_GAINS) this.gains.shift();
  }
  gainXp(enemy: Enemy) {
    const level = levelForXp(this.save.xp);
    this.save.xp += xpForKill(enemy.tier, enemy.attack);
    if (levelForXp(this.save.xp) > level) this.levelUpAt = performance.now();
  }
  /** The single path that ends the current run, whether by death or by
   * the player ending or retiring it. Captures the
   * dying run's stats into the summary before any new run is created, pays
   * out exactly once, and only opens a Revive opportunity for an actual
   * fatal player choice (never for an ended or retired run). */
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
    this.dropHandPlan();
    if (dead)
      this.message = "Returned to the forest. Follow the path to begin again.";
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
    return !this.paused && !this.summary && !this.encounter && Math.abs(dx) + Math.abs(dy) === 1;
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
    // The Animate fights setting plays the fight out before it counts.
    if (t.kind === "enemy" && this.playsFights && this.save.settings.fightAnimation) {
      this.encounter = {
        from: { x: p.x, y: p.y }, to: dest, bout: bout(p, t.enemy!), start: performance.now(),
        settle: () => this.take(t, outcome, dest, track),
      };
      return true;
    }
    return this.take(t, outcome, dest, track);
  }
  /** Takes a resolved step: in through its door or fight, then onto the tile. */
  private take(t: Tile, outcome: StepEffect, dest: { x: number; y: number }, track: boolean) {
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
    if (t.kind === "door") this.openDoor(t, outcome.keysSpent, dest);
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
      this.claimRewards(t.tier, { x, y });
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
  }
  private rejectStep(outcome: StepBlocked, t: Tile, x: number, y: number): false {
    if (outcome.blocked === "wall") this.reject(x, y, "A wall blocks the way.");
    else if (outcome.blocked === "locked") this.reject(x, y, doorBlockedMessage(t));
    else {
      this.reject(x, y, `Impervious — requires ${outcome.combat.requiredAttack} more ATK`);
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
  /** Each key the door took rises from it with a minus sign; a Heart Door,
   * which takes nothing, raises a checked heart. */
  private openDoor(t: Tile, keysSpent: KeyColor[], at: { x: number; y: number }) {
    const n = keysSpent.length;
    if (n) this.mar("keysSpent");
    for (const color of keysSpent) this.gain(at.x, at.y, `−1 ${color} key`, { tile: { kind: "key", color }, spent: true });
    if (!n) this.gain(at.x, at.y, "Full HP ✓", { heart: true });
    this.message = `${doorName(t)} opened${n ? ` · ${n} key${n === 1 ? "" : "s"} spent` : " · full HP"}`;
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
    // Silver belongs to the run, so it isn't gated like Gold: undo takes it back.
    const silver = silverForKill(enemy.strength, this.rules.equivalentFloor(this.rules.progressAt(this.run, at.y)));
    this.run.silver = this.silver + silver;
    const { gold, drops } = this.creditEnemyLoot(enemy, at.x, at.y);
    if (gold) this.gain(at.x, at.y, `+${gold} Gold`);
    this.gain(at.x, at.y, `+${silver} Silver`);
    for (const d of drops) this.gain(at.x, at.y, materialText(d), { material: d.id, quantity: d.quantity });
    this.message = [combat.damage ? `−${combat.damage} HP · ${enemy.name} defeated` : "Unscathed victory",
      ...(gold ? [`+${gold} Gold`] : []), `+${silver} Silver`, ...drops.map(materialText)].join(" · ");
    return true;
  }
  /** An enemy's Gold (by its strength) and material drops. Both are gated
   * by lootedTiles (outside `run`), so undo can restore the enemy but can
   * never pay for it twice. */
  private creditEnemyLoot(enemy: Enemy, x: number, y: number): { gold: number; drops: MaterialStack[] } {
    const slice = this.slice,
      key = this.lootKey(x, y);
    if (slice.lootedTiles[key]) return { gold: 0, drops: [] };
    slice.lootedTiles[key] = true;
    const gold = ENEMY_GOLD[enemy.strength];
    this.save.gold += gold;
    slice.runGold += gold;
    const drops = this.rules.enemyDrops(enemy.name, this.rng);
    creditMaterials(this.save, drops);
    return { gold, drops };
  }
  private enterFromOutside() {
    const p = this.run.player;
    this.run.outside = false;
    this.dealHand();
    p.x = this.rules.entranceX;
    p.y = 0;
    this.world = this.rules.board(this.run);
    this.forgetLabyrinth();
    this.route = [];
    // Inside, the hand takes over from the player (or Automove).
    this.auto = this.handStartsPlaying;
    this.dropHandPlan();
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
  /** Pays clear rewards: the chest opened at `at`, or every tier still owed. */
  private claimRewards(tier?: ClearTier, at?: { x: number; y: number }) {
    if (this.mode !== "tower") return 0;
    const earned = tier ? this.ledger.open(tier, this.towerRun) : this.ledger.claimAll(this.towerRun);
    if (!earned) return 0;
    const text = `+${earned} Inspiration`;
    if (at) {
      this.gain(at.x, at.y, text);
      this.message = `${text} · clear reward`;
    } else this.feedback(`${text} · clear reward${earned > 1 ? "s" : ""}`);
    return earned;
  }
  /** Once a Tower floor has no enemies or doors left, earns its clear tiers
   * and sets their chests by the stairs. */
  private checkClear() {
    if (this.mode !== "tower") return;
    for (const tier of this.ledger.check(this.world, this.towerRun))
      this.feedback(`${tier[0].toUpperCase() + tier.slice(1)} clear · reward by the stairs`);
  }
  /** Pickup rewards and treasure payouts; stats were already applied. */
  private collect(t: Tile, x: number, y: number, outcome: StepEffect) {
    const text = t.kind === "key" ? `+1 ${t.color} key`
      : t.kind === "potion" ? `+${outcome.healed} HP`
      : t.kind === "attack" ? `+${ATTACK_SHARD} attack`
      : t.kind === "defense" ? `+${DEFENSE_SHARD} defense`
      : null;
    if (text) {
      this.gain(x, y, text, { tile: { ...t } });
      if (t.kind === "potion") this.recordHeal(outcome.healed);
      this.message = text;
    }
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
        slice.runGold += loot.gold;
        creditMaterials(this.save, loot.materials);
        this.gain(x, y, `+${loot.gold} Gold`);
        for (const m of loot.materials) this.gain(x, y, materialText(m), { material: m.id, quantity: m.quantity });
        this.message = [`+${loot.gold} Gold`, ...loot.materials.map(materialText)].join(" · ");
      }
    }
  }
  finish(reason: string) {
    this.finishEncounter();
    this.finalizeRun(reason, { dead: false });
  }
  /** Spends training points on one rank of a stat; false if short. */
  /** Inside a run, the hand it went in with; in the forest, the hand the
   * next run will take, as the Deck orders it. */
  get hand(): readonly CardId[] {
    return this.run.hand ?? this.save.hand;
  }
  /** Moves the hand's card in slot `from` to slot `to`, the cards between
   * shifting over one (Hand Ordering, in the forest only). */
  arrangeHand(from: number, to: number) {
    const n = this.save.hand.length;
    if (!this.save.upgrades.handOrdering || !this.run.outside || !(from >= 0 && from < n && to >= 0 && to < n)) return false;
    this.save.hand = moveCard(this.save.hand, from, to);
    return true;
  }
  /** Puts a deck card into the hand's first empty slot (Combat Stance, in
   * the forest only). */
  addToHand(id: CardId) {
    const hand = this.save.hand;
    if (!this.canChooseCards || !deckCards(this.save.upgrades).includes(id) || hand.includes(id) || hand.length >= HAND_SLOTS) return false;
    hand.push(id);
    return true;
  }
  /** Takes a card out of the hand, back to the deck; STAIRS always stays. */
  removeFromHand(id: CardId) {
    const hand = this.save.hand;
    if (!this.canChooseCards || id === "stairs" || !hand.includes(id)) return false;
    this.save.hand = hand.filter((c) => c !== id);
    return true;
  }
  private get canChooseCards() {
    return !!this.save.upgrades.combatStance && !!this.run.outside;
  }
  train(id: TrainingId) {
    const row = TRAINING.find((t) => t.id === id)!;
    return this.changeLoadout(() => {
      if (trainingPoints(this.save).left < row.cost) return false;
      this.save.training[id]++;
    });
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
  /** The wall clock the Archives' research runs on (ms); tests set it. */
  clock: () => number = () => Date.now();
  /** Sets archivist `slot` to research `id`'s next level, paying its Gold. */
  startResearch(slot: number, id: ResearchId) {
    this.settleResearch();
    return !!this.save.upgrades.archives && startResearch(this.save, slot, id, this.clock());
  }
  /** Stops archivist `slot`'s research, refunding its Gold and keeping the
   * time already spent on it for when it starts again. */
  cancelResearch(slot: number) {
    return cancelResearch(this.save, slot, this.clock());
  }
  /** Whether archivist `slot` starts the next level on its own. */
  setAutoContinue(slot: number, on: boolean) {
    const s = this.save.archives.slots[slot];
    if (s) s.autoContinue = on;
  }
  /** Dev mode: finishes archivist `slot`'s research now. */
  finishResearchNow(slot: number) {
    const job = this.save.archives.slots[slot]?.job;
    if (!this.save.settings.devMode || !job) return [];
    hastenResearch(this.save.archives, slot, Math.max(0, job.completesAt - this.clock()));
    return this.settleResearch();
  }
  hireArchivist() {
    return !!this.save.upgrades.archives && hireArchivist(this.save);
  }
  /** Completes the research that the clock has reached, saying so in the
   * status line. */
  settleResearch(): ResearchRecord[] {
    const done = settleArchives(this.save, this.clock());
    const last = done.at(-1);
    if (last) this.message = `Archives · ${RESEARCH[last.research].name} level ${last.level} complete.`;
    return done;
  }
  buyGold(id: GoldItemId) {
    const item = GOLD_SHOP.find((g) => g.id === id)!;
    if (this.save.gold < item.cost) return false;
    this.save.gold -= item.cost;
    this.save.provisions[id]++;
    return true;
  }
  /** A gear change or training applies at once to the runs of both modes: each gains
   * or loses exactly what it changed in the loadout, so ATK/DEF gathered
   * from items and the provisions a run started with are kept. A run still
   * outside hasn't started, so it also starts with the HP it now would. */
  private changeLoadout(change: () => boolean | void) {
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
    return this.changeLoadout(() => equipItemAction(this.save, itemId));
  }
  unequipSlot(slot: EquipmentSlot) {
    this.changeLoadout(() => unequipSlotAction(this.save, slot));
  }
  craftConsumable(id: ConsumableId) {
    return craftConsumableItem(this.save, id);
  }
  useConsumable(id: ConsumableId) {
    if (!this.playing || this.encounter || (this.save.consumables[id] ?? 0) <= 0) return false;
    const def = CONSUMABLES.find(c => c.id === id)!;
    const p = this.run.player;
    const n = Math.min(p.maxHp - p.hp, def.healAmount);
    p.hp += n;
    this.save.consumables[id]--;
    this.recordHeal(n);
    this.message = `${def.name} · +${n} HP`;
    this.afterPlayerAction();
    return true;
  }
  /** Records a potion's heal of `n` HP, already applied, where the hero stands. */
  private recordHeal(n: number) {
    if (n <= 0) return;
    const p = this.run.player;
    this.lastHeal = { from: p.hp - n, to: p.hp, x: p.x, y: p.y, id: (this.lastHeal?.id ?? 0) + 1 };
  }
}

/** "+2 Slime Gels": a material reward as the board and status line name it. */
const materialText = (m: MaterialStack) => `+${m.quantity} ${materialDef(m.id).name}${m.quantity > 1 ? "s" : ""}`;
