/** The Upgrades page's skill trees, bought with Knowledge (which the Library
 * earns by the hour, and each wave a defense holds past the best before it
 * pays). Each skill has ranks; every rank applies its effect once more:
 * Command's and Stewardship's to every defense from the next one on, the
 * Library's and the Mine's to the library and the mine at once.
 * Node positions are percentages of the tree's view: x of its width, y of
 * its height, so a tree taller than one screen (`height`, in the same
 * units, 100 by default) scrolls. */
import type { BonusTarget } from "./progression.ts";

export type SkillId =
  | "drillSergeant" | "veterans" | "bladework" | "fletchers" | "gunpowder" | "ballistics" | "warBanner"
  | "masonry" | "bastions" | "guilds" | "plunder" | "ironworks" | "scholars" | "tactician"
  | "fireproofWood" | "fireTraining" | "coffee" | "waterproofing";
export type TreeId = "command" | "stewardship" | "mine" | "library";

/** What one rank of a skill does: `per` added to a target's percent (a
 * time's percent makes it shorter), or, for `smiths` (room in the mine's
 * smithy) and `copperPerWave`, a whole number added. The Library's and the
 * Mine's skills are read as ranks (`library/sim.ts`: `accidentChance`,
 * `fireDrill`; `mine/sim.ts`: `nightShift`, the shaft house's seal,
 * `extraSmiths`). */
export type SkillEffect = { target: BonusTarget | "smiths" | "copperPerWave" | "fireproof" | "fireTraining" | "coffee" | "waterproof"; per: number };
export type Skill = { id: SkillId; name: string; icon: string; max: number; base: number; effect: SkillEffect; text: string };
export type SkillNode = { id: SkillId; x: number; y: number; requires: SkillId[] };
export type SkillTree = { id: TreeId; name: string; description: string; height?: number; nodes: SkillNode[] };

export const SKILLS: Record<SkillId, Skill> = {
  drillSergeant: { id: "drillSergeant", name: "Drill sergeant", icon: "⚑", max: 3, base: 1, effect: { target: "drill", per: 10 }, text: "Barracks train recruits 10% faster a rank" },
  veterans: { id: "veterans", name: "Veterans", icon: "♥", max: 3, base: 2, effect: { target: "troopHp", per: 10 }, text: "+10% swordsman and archer HP a rank" },
  bladework: { id: "bladework", name: "Bladework", icon: "⚔", max: 3, base: 2, effect: { target: "troopDamage", per: 10 }, text: "+10% swordsman and archer damage a rank" },
  fletchers: { id: "fletchers", name: "Fletchers", icon: "➶", max: 3, base: 3, effect: { target: "towerDamage", per: 10 }, text: "+10% archer and cannon tower damage a rank" },
  ballistics: { id: "ballistics", name: "Ballistics", icon: "◎", max: 3, base: 3, effect: { target: "towerReload", per: 8 }, text: "Towers reload 8% faster a rank" },
  gunpowder: { id: "gunpowder", name: "Gunpowder", icon: "✹", max: 3, base: 2, effect: { target: "bombDamage", per: 20 }, text: "+20% bomb damage a rank" },
  warBanner: { id: "warBanner", name: "War banner", icon: "♛", max: 3, base: 5, effect: { target: "troopDamage", per: 15 }, text: "+15% swordsman and archer damage a rank" },
  masonry: { id: "masonry", name: "Masonry", icon: "▦", max: 3, base: 1, effect: { target: "wallHp", per: 10 }, text: "+10% wall HP a rank" },
  bastions: { id: "bastions", name: "Bastions", icon: "♜", max: 3, base: 2, effect: { target: "keepHp", per: 10 }, text: "+10% keep HP a rank" },
  guilds: { id: "guilds", name: "Builders' guilds", icon: "⚒", max: 3, base: 2, effect: { target: "rebuild", per: 10 }, text: "Civilians rebuild 10% faster a rank" },
  plunder: { id: "plunder", name: "Plunder", icon: "¤", max: 3, base: 2, effect: { target: "gold", per: 10 }, text: "+10% Gold from every defense a rank" },
  ironworks: { id: "ironworks", name: "Copperworks", icon: "▬", max: 2, base: 3, effect: { target: "copperPerWave", per: 1 }, text: "+1 copper for every wave held a rank" },
  scholars: { id: "scholars", name: "Smiths' guild", icon: "✦", max: 3, base: 2, effect: { target: "smithing", per: 15 }, text: "The Smithy's upgrades are worked 15% faster a rank" },
  tactician: { id: "tactician", name: "Master smith", icon: "⚒", max: 1, base: 6, effect: { target: "smiths", per: 1 }, text: "Room for one more smith in the mine's smithy" },
  fireproofWood: { id: "fireproofWood", name: "Fireproof wood", icon: "▤", max: 10, base: 5, effect: { target: "fireproof", per: 1 }, text: "The library's tables catch fire 10% less often a rank (1% a minute to start, then 0.9%, 0.81%…)" },
  coffee: { id: "coffee", name: "Coffee", icon: "♨", max: 12, base: 2, effect: { target: "coffee", per: 5 }, text: "5% more of the mine's crew work the night shift a rank (20% to start, up to 80%)" },
  waterproofing: { id: "waterproofing", name: "Waterproofing", icon: "☂", max: 4, base: 4, effect: { target: "waterproof", per: 15 }, text: "The shaft house keeps 15% more of the rain's runoff out of the shaft a rank (20% to start, up to 80%)" },
  fireTraining: { id: "fireTraining", name: "Fire training", icon: "♒", max: 5, base: 8, effect: { target: "fireTraining", per: 1 }, text: "More librarians fight a fire, fetching and throwing water faster and further, and each splash more likely to douse the flames" },
};

export const TREES: SkillTree[] = [
  { id: "command", name: "Command", description: "Earn Knowledge in the Library and by holding past your best wave. Command sharpens the garrison and its towers.", nodes: [
    { id: "drillSergeant", x: 50, y: 10, requires: [] },
    { id: "veterans", x: 22, y: 32, requires: ["drillSergeant"] },
    { id: "bladework", x: 78, y: 32, requires: ["drillSergeant"] },
    { id: "fletchers", x: 78, y: 56, requires: ["bladework"] },
    { id: "gunpowder", x: 22, y: 56, requires: ["veterans"] },
    { id: "ballistics", x: 50, y: 70, requires: ["fletchers", "gunpowder"] },
    { id: "warBanner", x: 50, y: 90, requires: ["ballistics"] },
  ] },
  { id: "stewardship", name: "Stewardship", description: "Earn Knowledge in the Library and by holding past your best wave. Stewardship strengthens the city and fills its coffers.", nodes: [
    { id: "masonry", x: 50, y: 10, requires: [] },
    { id: "bastions", x: 22, y: 32, requires: ["masonry"] },
    { id: "guilds", x: 78, y: 32, requires: ["masonry"] },
    { id: "plunder", x: 78, y: 56, requires: ["guilds"] },
    { id: "scholars", x: 22, y: 56, requires: ["bastions"] },
    { id: "ironworks", x: 78, y: 80, requires: ["plunder"] },
    { id: "tactician", x: 30, y: 84, requires: ["scholars", "plunder"] },
  ] },
  { id: "mine", name: "Mine", description: "Earn Knowledge in the Library. Mine skills keep the crew working and the shaft dry.", nodes: [
    { id: "coffee", x: 28, y: 30, requires: [] },
    { id: "waterproofing", x: 72, y: 30, requires: [] },
  ] },
  { id: "library", name: "Library", description: "Earn Knowledge in the Library: shelves × librarians an hour. Library skills guard it from fire.", nodes: [
    { id: "fireproofWood", x: 28, y: 30, requires: [] },
    { id: "fireTraining", x: 72, y: 30, requires: [] },
  ] },
];

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Knowledge the next rank of `id` costs, with `level` ranks owned. */
export const skillCost = (id: SkillId, level: number) => SKILLS[id].base * (level + 1);

/** Whether every skill `id` requires has a rank. */
export function skillAvailable(id: SkillId, levels: Record<SkillId, number>) {
  const node = TREES.flatMap((t) => t.nodes).find((n) => n.id === id);
  return !!node && node.requires.every((key) => levels[key] > 0);
}
/** How tall `tree` is, in view heights × 100. */
export const treeHeight = (tree: SkillTree) => tree.height ?? 100;
/** `tree`'s nodes placed on its map: y as a percentage of the map's height. */
export const mapNodes = (tree: SkillTree): SkillNode[] =>
  tree.nodes.map((n) => ({ ...n, y: (n.y * 100) / treeHeight(tree) }));
