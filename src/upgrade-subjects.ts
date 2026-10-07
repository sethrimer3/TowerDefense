/** How every upgrade is filed: in exactly one topic of one subject. The
 * Smithy below the Mine shows a topic's plain, permanent numbers (the
 * Armory's levels, the Smithy's rows); the Study beneath the Library shows
 * what Knowledge buys (the skills, and the paths of `knowledge-paths.ts`,
 * found by the topic's id and drawn as a tree); the Tiles tab sells the
 * copies of its palette items and links each to its topic. Pure data, so a
 * test can check nothing is left out or listed twice. */
import type { PaletteItem, UpgradeId } from "./defend/catalog.ts";
import type { TrainingId } from "./progression.ts";
import type { SkillId } from "./skill-trees.ts";
import type { UiSprite } from "./ui/dom.ts";

export type SubjectId = "realm" | "city" | "towers" | "units" | "mine" | "library";
/** One-off buys that aren't palette items or levels. */
export type Extra = "bomb" | "speed3";
export type Topic = {
  id: string;
  name: string;
  /** The palette item it is about: its icon, and the tile whose upgrades these are. */
  item?: PaletteItem;
  /** Further palette items filed here. */
  items?: PaletteItem[];
  upgrades?: UpgradeId[];
  training?: TrainingId[];
  extras?: Extra[];
  skills?: SkillId[];
};
export type Subject = { id: SubjectId; name: string; sprite: UiSprite; blurb: string; topics: Topic[] };

export const SUBJECTS: Subject[] = [
  {
    id: "realm", name: "Realm", sprite: "upgrades", blurb: "Every troop, every tower, every defense.",
    topics: [
      { id: "troops", name: "All troops", upgrades: ["barracksCapacity", "barracksTraining", "soldierArms"], training: ["troopHp", "troopDamage", "drill"], skills: ["drillSergeant", "veterans", "bladework"] },
      { id: "warBanner", name: "War banner", skills: ["warBanner", "bannerCooldown", "bannerDefense", "bannerReach", "bannerDamage", "bannerMarch", "bannerLife", "bannerRegen"] },
      { id: "towers", name: "All towers", training: ["towerDamage", "towerReload"], skills: ["fletchers", "ballistics"] },
      { id: "battle", name: "Battle", upgrades: ["bombSafe"], training: ["bombDamage"], extras: ["bomb", "speed3"], skills: ["gunpowder"] },
    ],
  },
  {
    id: "city", name: "City", sprite: "defense", blurb: "Its tiles, walls, keep and people.",
    topics: [
      { id: "walls", name: "Walls & keep", item: "cityTile", items: ["cityGate", "wallBallista"], upgrades: ["wallStrength", "keepStrength"], training: ["wallHp", "keepHp"], skills: ["masonry", "bastions", "outskirts"] },
      { id: "spikes", name: "Wall spikes", item: "wallSpikes", upgrades: ["spikeDamage", "spikeRate"] },
      { id: "civilians", name: "Civilians", upgrades: ["civilianCount", "civilianHealth", "rebuildSpeed"], training: ["rebuild"], skills: ["guilds"] },
      {
        id: "bait", name: "Monster bait", item: "monsterBait", upgrades: ["baitRestock", "baitBlast"],
      },
    ],
  },
  {
    id: "towers", name: "Towers", sprite: "attack", blurb: "What stands and shoots.",
    topics: [
      {
        id: "archerTower", name: "Archer tower", item: "archerTower", upgrades: ["archerDamage", "archerRange", "archerRate"],
      },
      {
        id: "cannonTower", name: "Cannon tower", item: "cannonTower", upgrades: ["cannonDamage", "cannonRate", "cannonSafe"],
      },
      {
        id: "watchTower", name: "Watch tower", item: "watchTower", upgrades: ["watchRadius"],
      },
      {
        id: "wizardTower", name: "Wizard tower", item: "wizardTower", upgrades: ["wizardFlame", "wizardIce"],
      },
      { id: "darkKeep", name: "Dark wizard keep", item: "darkKeep", upgrades: ["darkKeepCompact", "chainReach", "chainCount"] },
    ],
  },
  {
    id: "units", name: "Units", sprite: "health", blurb: "The buildings that train your people.",
    topics: [
      {
        id: "barracks", name: "Barracks", item: "barracks", upgrades: ["soldierReach"],
      },
      {
        id: "archerBarracks", name: "Archer barracks", item: "archerBarracks", upgrades: ["archerSight", "archerHunt"],
      },
      {
        id: "mageGuild", name: "Mage Guild", item: "mageGuild", upgrades: ["mageFireball", "mageEmbers"],
      },
      { id: "valkyriePalace", name: "Valkyrie palace", item: "valkyriePalace", upgrades: ["palaceCompact", "valkyrieReach"] },
    ],
  },
  {
    id: "mine", name: "Mine", sprite: "mine", blurb: "The crew, the shaft and the smithy.",
    topics: [{ id: "mine", name: "Mine", skills: ["coffee", "waterproofing", "scholars", "tactician"] }],
  },
  {
    id: "library", name: "Library", sprite: "library", blurb: "Its shelves, its staff and its fires.",
    topics: [{ id: "library", name: "Library", skills: ["fireproofWood", "fireTraining", "nightWatch", "enchantedInk"] }],
  },
];

/** Every palette item a topic's Forge sells copies of. */
export const topicItems = (t: Topic): PaletteItem[] => [...(t.item ? [t.item] : []), ...(t.items ?? [])];
