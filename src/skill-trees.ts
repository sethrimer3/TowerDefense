/** The Upgrades page's skill trees, bought with Valor (one for each wave a
 * defense holds past the best before it). Each skill has ranks; every rank
 * applies its effect once more, to every defense from the next one on.
 * Node positions are percentages of the tree's view: x of its width, y of
 * its height, so a tree taller than one screen (`height`, in the same
 * units, 100 by default) scrolls. */
import type { BonusTarget } from "./progression.ts";

export type SkillId =
  | "drillSergeant" | "veterans" | "bladework" | "fletchers" | "gunpowder" | "ballistics" | "warBanner"
  | "masonry" | "bastions" | "guilds" | "plunder" | "ironworks" | "scholars" | "tactician";
export type TreeId = "command" | "stewardship";

/** What one rank of a skill does: `per` added to a target's percent (a
 * negative `per` on a time makes it shorter), or, for `slots` and
 * `ironPerWave`, a whole number added. */
export type SkillEffect = { target: BonusTarget | "slots" | "ironPerWave"; per: number };
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
  ironworks: { id: "ironworks", name: "Ironworks", icon: "▬", max: 2, base: 3, effect: { target: "ironPerWave", per: 1 }, text: "+1 iron bar for every wave held a rank" },
  scholars: { id: "scholars", name: "War college", icon: "✦", max: 3, base: 2, effect: { target: "xp", per: 15 }, text: "+15% experience from every kill a rank" },
  tactician: { id: "tactician", name: "Tactician", icon: "⌛", max: 1, base: 6, effect: { target: "slots", per: 1 }, text: "One more Training slot" },
};

export const TREES: SkillTree[] = [
  { id: "command", name: "Command", description: "Earn Valor by holding past your best wave. Command sharpens the garrison and its towers.", nodes: [
    { id: "drillSergeant", x: 50, y: 10, requires: [] },
    { id: "veterans", x: 22, y: 32, requires: ["drillSergeant"] },
    { id: "bladework", x: 78, y: 32, requires: ["drillSergeant"] },
    { id: "fletchers", x: 78, y: 56, requires: ["bladework"] },
    { id: "gunpowder", x: 22, y: 56, requires: ["veterans"] },
    { id: "ballistics", x: 50, y: 70, requires: ["fletchers", "gunpowder"] },
    { id: "warBanner", x: 50, y: 90, requires: ["ballistics"] },
  ] },
  { id: "stewardship", name: "Stewardship", description: "Earn Valor by holding past your best wave. Stewardship strengthens the city and fills its coffers.", nodes: [
    { id: "masonry", x: 50, y: 10, requires: [] },
    { id: "bastions", x: 22, y: 32, requires: ["masonry"] },
    { id: "guilds", x: 78, y: 32, requires: ["masonry"] },
    { id: "plunder", x: 78, y: 56, requires: ["guilds"] },
    { id: "scholars", x: 22, y: 56, requires: ["bastions"] },
    { id: "ironworks", x: 78, y: 80, requires: ["plunder"] },
    { id: "tactician", x: 30, y: 84, requires: ["scholars", "plunder"] },
  ] },
];

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Valor the next rank of `id` costs, with `level` ranks owned. */
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
