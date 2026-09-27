/** How the Tower and the Delve differ, one profile per mode: the currency a
 * mode pays and how progress maps to an equivalent floor, where a run enters
 * and how its board is built, what its enemies drop, and the words the game
 * uses for it. Code that needs a per-mode answer asks `MODES[mode]` rather
 * than branching on the mode; features only the Tower has still test for it. */
import { START_X, TOWER_START_X, TOWER_WIDTH, WIDTH, goldReward } from "./config.ts";
import type { MaterialStack } from "./materials.ts";
import type { Mode, Run, Save } from "./entities.ts";
import { LAYOUT_VERSION, World } from "./delve/world.ts";
import { RoomWorld, TOWER_LAYOUT_VERSION } from "./tower/room-world.ts";
import type { Board } from "./board.ts";
import { rollEnemyDrops, towerEnemyDrops } from "./loot.ts";

export type ModeProfile = {
  /** The balance of the currency this mode pays, and paying it. */
  balance(save: Save): number;
  credit(save: Save, amount: number): void;
  /** The equivalent floor `progress` counts as: the scale every loot table
   * is gated on, and each new one reached pays one currency. */
  equivalentFloor(progress: number): number;
  /** The progress loot at row `y` of the run's board is measured at. */
  progressAt(run: Run, y: number): number;
  /** The board's width, and the column a run enters at from the forest. */
  width: number;
  entranceX: number;
  /** The generator version a run's saved map edits belong to. */
  layoutVersion: number;
  /** The board a run inside the mode plays on, regenerated from its seed. */
  board(run: Run): Board;
  /** What a beaten enemy drops. */
  enemyDrops(name: string, rng: () => number): MaterialStack[];
  /** Gold paid when a run ends. */
  endGold(run: Run): number;
  /** Keys a kill or treasure so it pays out once, whatever undo does. */
  lootKey(run: Run, x: number, y: number): string;
  words: {
    /** The currency, as the player sees it. */
    currency: string;
    /** What the progress count measures. */
    progress: string;
    /** A run in this mode. */
    run: string;
    /** What a retired run is replaced with. */
    fresh: string;
    /** The board's title in the forest outside, and inside. */
    outsideTitle: string;
    title: string;
    subtitle: string;
    /** Feedback on stepping through the entrance. */
    enter: string;
    /** The inspect text for the forest entrance and a plain floor tile. */
    entrance: string;
    floor: string;
  };
};

/** Milestone currency for progress rising from `from` to `to`: one per new
 * equivalent floor. */
export function milestones(profile: ModeProfile, from: number, to: number) {
  return profile.equivalentFloor(to) - profile.equivalentFloor(from);
}

export const MODES: Record<Mode, ModeProfile> = {
  tower: {
    balance: (save) => save.tower.inspiration,
    credit: (save, amount) => { save.tower.inspiration += amount; },
    equivalentFloor: (height) => height,
    progressAt: (run) => run.height,
    width: TOWER_WIDTH,
    entranceX: TOWER_START_X,
    layoutVersion: TOWER_LAYOUT_VERSION,
    board: (run) => new RoomWorld(run.seed, run.height, run.changes),
    enemyDrops: (name) => towerEnemyDrops(name),
    endGold: () => 0,
    // Tower floors reuse the same x/y space, so the floor is part of the key.
    lootKey: (run, x, y) => `${run.seed}:${run.height}:${x},${y}`,
    words: {
      currency: "Inspiration",
      progress: "height",
      run: "ascent",
      fresh: "tower",
      outsideTitle: "THE TOWER APPROACH",
      title: "THE ASCENT TRIALS",
      subtitle: "ONE CHAMBER AT A TIME",
      enter: "You enter the tower.",
      entrance: "Begin the climb — Floor 1",
      floor: "Well-worn stone floor.",
    },
  },
  delve: {
    balance: (save) => save.delve.courage,
    credit: (save, amount) => { save.delve.courage += amount; },
    equivalentFloor: (depth) => Math.floor(depth / 10),
    progressAt: (_run, y) => y,
    width: WIDTH,
    entranceX: START_X,
    layoutVersion: LAYOUT_VERSION,
    board: (run) => new World(run),
    enemyDrops: (name, rng) => rollEnemyDrops(name, rng),
    endGold: (run) => goldReward(run.kills, run.treasures),
    lootKey: (run, x, y) => `${run.seed}:${x},${y}`,
    words: {
      currency: "Courage",
      progress: "depth",
      run: "delve",
      fresh: "descent",
      outsideTitle: "THE MOUNTAIN HOLLOW",
      title: "THE HOLLOW SPIRE",
      subtitle: "HIGHER DANGERS · GREATER REWARDS",
      enter: "You enter the mountain cave.",
      entrance: "Descend into the cave",
      floor: "Ancient cavern floor.",
    },
  },
};
