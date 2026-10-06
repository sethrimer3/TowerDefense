/** How the Upgrades page is organized: every upgrade in the game sits in
 * exactly one topic of one subject. Each topic's Forge holds its plain,
 * permanent numbers (more copies of a building, the Armory's levels, the
 * Smithy's rows); its Study holds what Knowledge buys (the skills), and
 * the paths still to be written, shown as drafts. Pure data, so a test can
 * check nothing is left out or listed twice. */
import type { PaletteItem, UpgradeId } from "./defend/catalog.ts";
import type { TrainingId } from "./progression.ts";
import type { SkillId } from "./skill-trees.ts";
import type { UiSprite } from "./ui/dom.ts";

export type SubjectId = "realm" | "city" | "towers" | "units" | "mine" | "library";
/** One-off buys that aren't palette items or levels. */
export type Extra = "bomb" | "speed3";
/** A path planned for a topic's Study, not built yet. */
export type DraftPath = { name: string; text: string };
export type Topic = {
  id: string;
  name: string;
  /** The palette item it is about: its icon, and copies bought in the Forge. */
  item?: PaletteItem;
  /** Further palette items whose copies its Forge sells. */
  items?: PaletteItem[];
  upgrades?: UpgradeId[];
  training?: TrainingId[];
  extras?: Extra[];
  skills?: SkillId[];
  /** A tab elsewhere where more of it is raised (the mine's and library's buildings). */
  elsewhere?: "mine" | "library";
  paths?: DraftPath[];
};
export type Subject = { id: SubjectId; name: string; sprite: UiSprite; blurb: string; topics: Topic[] };

export const SUBJECTS: Subject[] = [
  {
    id: "realm", name: "Realm", sprite: "upgrades", blurb: "Every troop, every tower, every defense.",
    topics: [
      { id: "troops", name: "All troops", upgrades: ["barracksCapacity", "barracksTraining", "soldierArms"], training: ["troopHp", "troopDamage", "drill"], skills: ["drillSergeant", "veterans", "bladework", "warBanner"] },
      { id: "towers", name: "All towers", training: ["towerDamage", "towerReload"], skills: ["fletchers", "ballistics"] },
      { id: "battle", name: "Battle", upgrades: ["bombSafe"], training: ["bombDamage"], extras: ["bomb", "speed3"], skills: ["gunpowder"] },
      { id: "spoils", name: "Spoils", training: ["gold"], skills: ["plunder", "ironworks"] },
    ],
  },
  {
    id: "city", name: "City", sprite: "defense", blurb: "Its tiles, walls, keep and people.",
    topics: [
      { id: "walls", name: "Walls & keep", item: "cityTile", items: ["cityGate", "wallSpikes", "wallBallista"], upgrades: ["wallStrength", "keepStrength"], training: ["wallHp", "keepHp"], skills: ["masonry", "bastions"] },
      { id: "civilians", name: "Civilians", upgrades: ["civilianCount", "civilianHealth", "rebuildSpeed"], training: ["rebuild"], skills: ["guilds"] },
      {
        id: "bait", name: "Monster bait", item: "monsterBait", upgrades: ["baitRestock", "baitBlast"],
        paths: [
          { name: "Powder kegs", text: "Fallen bait explodes and sets the ground alight." },
          { name: "Restocking", text: "Civilians rebuild fallen bait again and again." },
        ],
      },
    ],
  },
  {
    id: "towers", name: "Towers", sprite: "attack", blurb: "What stands and shoots.",
    topics: [
      {
        id: "archerTower", name: "Archer tower", item: "archerTower", upgrades: ["archerDamage", "archerRange", "archerRate"],
        paths: [
          { name: "Fire arrows", text: "Arrows set their targets burning." },
          { name: "Sharpshooters", text: "Longer range and critical hits." },
        ],
      },
      {
        id: "cannonTower", name: "Cannon tower", item: "cannonTower", upgrades: ["cannonDamage", "cannonRate", "cannonSafe"],
        paths: [
          { name: "Gunnery drills", text: "Shells spare your own people, then grapeshot." },
          { name: "Siege shot", text: "Slow, enormous single blasts." },
        ],
      },
      {
        id: "watchTower", name: "Watch tower", item: "watchTower", upgrades: ["watchRadius"],
        paths: [
          { name: "Spotters", text: "Marked enemies take more damage." },
          { name: "Signal fires", text: "Marked enemies are slowed." },
        ],
      },
      {
        id: "wizardTower", name: "Wizard tower", item: "wizardTower", upgrades: ["wizardFlame", "wizardIce"],
        paths: [
          { name: "Pyromancy", text: "Flames only, far stronger." },
          { name: "Rime", text: "Ice only: slows, then freezes solid." },
          { name: "Stormcalling", text: "Lightning instead of flames; at its peak it becomes the Dark wizard keep." },
        ],
      },
      { id: "darkKeep", name: "Dark wizard keep", item: "darkKeep", upgrades: ["darkKeepCompact", "chainReach", "chainCount"] },
    ],
  },
  {
    id: "units", name: "Units", sprite: "health", blurb: "The buildings that train your people.",
    topics: [
      {
        id: "barracks", name: "Barracks", item: "barracks", upgrades: ["soldierReach"],
        paths: [
          { name: "Crusaders", text: "Immovable and heavily armoured; at its peak the barracks becomes the Valkyrie palace." },
          { name: "Assassins", text: "Fast, with critical strikes, hunting across the city." },
        ],
      },
      {
        id: "archerBarracks", name: "Archer barracks", item: "archerBarracks", upgrades: ["archerSight", "archerHunt"],
        paths: [
          { name: "Rangers", text: "Long sight; they track enemies through the streets." },
          { name: "Skirmishers", text: "They shoot on the move, in volleys." },
        ],
      },
      {
        id: "mageGuild", name: "Mage Guild", item: "mageGuild", upgrades: ["mageFireball", "mageEmbers"],
        paths: [
          { name: "Pyroclasm", text: "Bigger, harder fireballs." },
          { name: "Cinders", text: "The ground burns longer and hotter." },
        ],
      },
      { id: "valkyriePalace", name: "Valkyrie palace", item: "valkyriePalace", upgrades: ["palaceCompact", "valkyrieReach"] },
    ],
  },
  {
    id: "mine", name: "Mine", sprite: "mine", blurb: "The crew, the shaft and the smithy.",
    topics: [{ id: "mine", name: "Mine", elsewhere: "mine", skills: ["coffee", "waterproofing", "scholars", "tactician"] }],
  },
  {
    id: "library", name: "Library", sprite: "library", blurb: "Its shelves, its staff and its fires.",
    topics: [{ id: "library", name: "Library", elsewhere: "library", skills: ["fireproofWood", "fireTraining", "nightWatch"] }],
  },
];

/** Every palette item a topic's Forge sells copies of. */
export const topicItems = (t: Topic): PaletteItem[] => [...(t.item ? [t.item] : []), ...(t.items ?? [])];
