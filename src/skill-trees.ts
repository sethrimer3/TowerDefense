/** The skills, bought with Knowledge (which the Library earns by the hour,
 * and each wave a defense holds past the best before it pays) in the
 * Study beneath the Library (`upgrade-subjects.ts` says where each is shown).
 * Each skill has ranks; every rank applies its effect once more: Command's
 * and Stewardship's to every defense from the next one on, the Library's
 * and the Mine's to the library and the mine at once. The trees group them
 * for their requirements and the dev research settings. */
import type { BonusTarget } from "./progression.ts";

export type SkillId =
  | "drillSergeant" | "veterans" | "bladework" | "fletchers" | "gunpowder" | "ballistics" | "warBanner" | "bannerCooldown" | "bannerDefense" | "bannerReach" | "bannerDamage" | "bannerMarch" | "bannerLife" | "bannerRegen"
  | "masonry" | "bastions" | "outskirts" | "guilds" | "plunder" | "ironworks" | "scholars" | "tactician"
  | "fireproofWood" | "fireTraining" | "nightWatch" | "enchantedInk" | "coffee" | "waterproofing";
export type TreeId = "command" | "stewardship" | "mine" | "library";

/** What one rank of a skill does: `per` added to a target's percent (a
 * time's percent makes it shorter), or, for `smiths` (room in the mine's
 * smithy) and `copperPerWave`, a whole number added. The Library's and the
 * Mine's skills are read as ranks (`library/sim.ts`: `accidentChance`,
 * `fireDrill`; `mine/sim.ts`: `nightShift`, the shaft house's seal,
 * `extraSmiths`); Outlying districts by the Defend page, as whether city
 * tiles may stand apart (`withOutskirts`). */
export type SkillEffect = { target: BonusTarget | "smiths" | "copperPerWave" | "fireproof" | "fireTraining" | "nightWatch" | "enchant" | "coffee" | "waterproof" | "outskirts" | "bannerCooldown" | "bannerDefense" | "bannerReach" | "bannerDamage" | "bannerMarch" | "bannerLife" | "bannerRegen"; per: number };
export type Skill = { id: SkillId; name: string; icon: string; max: number; base: number; effect: SkillEffect; text: string };
export type SkillNode = { id: SkillId; requires: SkillId[]; full?: SkillId[] };
export type SkillTree = { id: TreeId; name: string; description: string; nodes: SkillNode[] };

export const SKILLS: Record<SkillId, Skill> = {
  drillSergeant: { id: "drillSergeant", name: "Drill sergeant", icon: "⚑", max: 3, base: 1, effect: { target: "drill", per: 10 }, text: "Barracks train recruits 10% faster a rank" },
  veterans: { id: "veterans", name: "Veterans", icon: "♥", max: 3, base: 2, effect: { target: "troopHp", per: 10 }, text: "+10% swordsman and archer HP a rank" },
  bladework: { id: "bladework", name: "Bladework", icon: "⚔", max: 3, base: 2, effect: { target: "troopDamage", per: 10 }, text: "+10% swordsman and archer damage a rank" },
  fletchers: { id: "fletchers", name: "Fletchers", icon: "➶", max: 3, base: 3, effect: { target: "towerDamage", per: 10 }, text: "+10% archer and cannon tower damage a rank" },
  ballistics: { id: "ballistics", name: "Ballistics", icon: "◎", max: 3, base: 3, effect: { target: "towerReload", per: 8 }, text: "Towers reload 8% faster a rank" },
  gunpowder: { id: "gunpowder", name: "Gunpowder", icon: "✹", max: 3, base: 2, effect: { target: "bombDamage", per: 20 }, text: "+20% bomb damage a rank" },
  warBanner: { id: "warBanner", name: "War banner", icon: "♛", max: 3, base: 5, effect: { target: "troopDamage", per: 15 }, text: "+15% swordsman and archer damage a rank" },
  bannerCooldown: { id: "bannerCooldown", name: "Rapid deployment", icon: "⚑", max: 3, base: 3, effect: { target: "bannerCooldown", per: 3 }, text: "Banner placement cooldown: 10 seconds initially, then 7, 4 and 1 seconds" },
  bannerDefense: { id: "bannerDefense", name: "Sheltering standard", icon: "▦", max: 1, base: 5, effect: { target: "bannerDefense", per: 10 }, text: "Units within banner influence take 10% less damage from every source" },
  bannerReach: { id: "bannerReach", name: "Broad standard", icon: "◎", max: 1, base: 5, effect: { target: "bannerReach", per: 2 }, text: "Increase banner influence radius from 5 to 7 cells" },
  bannerDamage: { id: "bannerDamage", name: "Battle standard", icon: "⚔", max: 1, base: 8, effect: { target: "bannerDamage", per: 25 }, text: "Units deal 25% more damage while within banner influence" },
  bannerMarch: { id: "bannerMarch", name: "Forced march", icon: "⚑", max: 1, base: 8, effect: { target: "bannerMarch", per: 50 }, text: "Units moving toward the banner walk 50% faster, even outside its influence" },
  bannerLife: { id: "bannerLife", name: "Vital standard", icon: "♥", max: 1, base: 8, effect: { target: "bannerLife", per: 25 }, text: "Units have 25% more maximum life within banner influence; entering and leaving preserve their health percentage" },
  bannerRegen: { id: "bannerRegen", name: "Restoring standard", icon: "♥", max: 1, base: 12, effect: { target: "bannerRegen", per: 5 }, text: "Living units within banner influence regenerate 5% of maximum life per second" },
  masonry: { id: "masonry", name: "Masonry", icon: "▦", max: 3, base: 1, effect: { target: "wallHp", per: 10 }, text: "+10% wall HP a rank" },
  bastions: { id: "bastions", name: "Bastions", icon: "♜", max: 3, base: 2, effect: { target: "keepHp", per: 10 }, text: "+10% keep HP a rank" },
  outskirts: { id: "outskirts", name: "Outlying districts", icon: "⌂", max: 1, base: 8, effect: { target: "outskirts", per: 1 }, text: "City tiles can be placed anywhere but the top row, not only against the city: each district apart from the keep's is walled on its own" },
  guilds: { id: "guilds", name: "Builders' guilds", icon: "⚒", max: 3, base: 2, effect: { target: "rebuild", per: 10 }, text: "Civilians rebuild 10% faster a rank" },
  plunder: { id: "plunder", name: "Plunder", icon: "¤", max: 3, base: 2, effect: { target: "gold", per: 10 }, text: "+10% Gold from every defense a rank" },
  ironworks: { id: "ironworks", name: "Copperworks", icon: "▬", max: 2, base: 3, effect: { target: "copperPerWave", per: 1 }, text: "+1 copper for every wave held a rank" },
  scholars: { id: "scholars", name: "Smiths' guild", icon: "✦", max: 3, base: 2, effect: { target: "smithing", per: 15 }, text: "The Smithy's upgrades are worked 15% faster a rank" },
  tactician: { id: "tactician", name: "Master smith", icon: "⚒", max: 1, base: 6, effect: { target: "smiths", per: 1 }, text: "Room for one more smith in the mine's smithy" },
  fireproofWood: { id: "fireproofWood", name: "Fireproof wood", icon: "▤", max: 10, base: 5, effect: { target: "fireproof", per: 1 }, text: "The library's tables catch fire 10% less often a rank (1% a minute to start, then 0.9%, 0.81%…)" },
  coffee: { id: "coffee", name: "Coffee", icon: "♨", max: 12, base: 2, effect: { target: "coffee", per: 5 }, text: "5% more of the mine's crew work the night shift a rank (20% to start, up to 80%)" },
  waterproofing: { id: "waterproofing", name: "Waterproofing", icon: "☂", max: 4, base: 4, effect: { target: "waterproof", per: 15 }, text: "The shaft house keeps 15% more of the rain's runoff out of the shaft a rank (20% to start, up to 80%)" },
  nightWatch: { id: "nightWatch", name: "Night watch", icon: "☾", max: 9, base: 4, effect: { target: "nightWatch", per: 5 }, text: "At night, librarians detect fires sooner and fill, carry and throw buckets 15% faster per rank" },
  enchantedInk: { id: "enchantedInk", name: "Enchanted ink", icon: "✧", max: 10, base: 10, effect: { target: "enchant", per: 1 }, text: "Each book on the library's shelves has a 1 in 10,000 chance a minute a rank of taking on glowing runes along its spine; read, an enchanted book gives two hours of the library's Knowledge at once" },
  fireTraining: { id: "fireTraining", name: "Fire training", icon: "♒", max: 5, base: 8, effect: { target: "fireTraining", per: 1 }, text: "More librarians fight a fire, fetching and throwing water faster and further, and each splash more likely to douse the flames" },
};

export const TREES: SkillTree[] = [
  { id: "command", name: "Command", description: "Earn Knowledge in the Library and by holding past your best wave. Command sharpens the garrison and its towers.", nodes: [
    { id: "drillSergeant", requires: [] },
    { id: "veterans", requires: ["drillSergeant"] },
    { id: "bladework", requires: ["drillSergeant"] },
    { id: "fletchers", requires: ["bladework"] },
    { id: "gunpowder", requires: ["veterans"] },
    { id: "ballistics", requires: ["fletchers", "gunpowder"] },
    { id: "warBanner", requires: ["ballistics"] },
    { id: "bannerCooldown", requires: ["warBanner"] },
    { id: "bannerDefense", requires: ["bannerCooldown"], full: ["bannerCooldown"] },
    { id: "bannerReach", requires: ["bannerDefense"] },
    { id: "bannerDamage", requires: ["bannerReach"] },
    { id: "bannerMarch", requires: ["bannerReach"] },
    { id: "bannerLife", requires: ["bannerReach"] },
    { id: "bannerRegen", requires: ["bannerLife"] },
  ] },
  { id: "stewardship", name: "Stewardship", description: "Earn Knowledge in the Library and by holding past your best wave. Stewardship strengthens the city and fills its coffers.", nodes: [
    { id: "masonry", requires: [] },
    { id: "bastions", requires: ["masonry"] },
    { id: "guilds", requires: ["masonry"] },
    { id: "outskirts", requires: ["masonry"] },
    { id: "plunder", requires: [] },
    { id: "scholars", requires: [] },
    { id: "ironworks", requires: ["plunder"] },
    { id: "tactician", requires: ["scholars"] },
  ] },
  { id: "mine", name: "Mine", description: "Earn Knowledge in the Library. Mine skills keep the crew working and the shaft dry.", nodes: [
    { id: "coffee", requires: [] },
    { id: "waterproofing", requires: [] },
  ] },
  { id: "library", name: "Library", description: "Earn Knowledge in the Library: shelves × librarians an hour. Library skills guard it from fire, while you play and while you are away.", nodes: [
    { id: "fireproofWood", requires: [] },
    { id: "fireTraining", requires: [] },
    { id: "nightWatch", requires: [] },
    { id: "enchantedInk", requires: [] },
  ] },
];

export const SKILL_IDS = Object.keys(SKILLS) as SkillId[];

/** Knowledge the next rank of `id` costs, with `level` ranks owned. */
export const skillCost = (id: SkillId, level: number) => SKILLS[id].base * (level + 1);

/** Whether every skill `id` requires has a rank. */
export function skillAvailable(id: SkillId, levels: Record<SkillId, number>) {
  const node = TREES.flatMap((t) => t.nodes).find((n) => n.id === id);
  return !!node && node.requires.every((key) => levels[key] >= (node.full?.includes(key) ? SKILLS[key].max : 1));
}
