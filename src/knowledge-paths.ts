/** Knowledge paths: the Study's choices that change how a building works.
 * A topic (one tower or troop building) offers a few paths, each a chain of
 * ranks bought with Knowledge in order. Learning a path's first rank chooses
 * it and shuts the others; unlearning returns every point of Knowledge spent
 * on it and opens them again. The battle reads the choices from `Bonuses`'s
 * optional `paths` (`battlePaths`); with none chosen it plays exactly as
 * before. A path's crown (`evolves`) turns the building into a greater one,
 * shown and not yet learnable. Pure data and functions over the save. */
import type { PaletteItem } from "./defend/catalog.ts";
import type { Save } from "./save.ts";

export type PathTopic = "wizardTower" | "barracks";
export type PathId = "pyromancy" | "rime" | "storm" | "crusaders" | "assassins";
/** The pixel icons `ui/path-icons.ts` draws, one a rank. */
export type PathIcon =
  | "flame" | "tongue" | "inferno" | "snowflake" | "shard" | "iceBlock" | "bolt" | "fork" | "thunderhead"
  | "mail" | "heart" | "cross" | "boot" | "dagger" | "skull" | "crown";
/** Each path's colours, as `ui/path-icons.ts` and the page's CSS name them. */
export type PathHue = "ember" | "frost" | "storm" | "steel" | "shadow";
export type PathRank = { name: string; icon: PathIcon; cost: number; text: string };
export type KnowledgePath = {
  id: PathId;
  topic: PathTopic;
  name: string;
  /** One line on what the path makes of the building. */
  motto: string;
  hue: PathHue;
  ranks: PathRank[];
  /** The greater building the path's crown turns it into. */
  evolves?: { item: PaletteItem; name: string; text: string };
};

// ── What each rank does in battle ─────────────────────────────────────────
/** Pyromancy: flames only, hotter (by rank), longer from II, burning longer at III. */
export const PYRO = { damage: [1, 1.3, 1.3, 1.8], reach: 1.5, burn: 1.5 };
/** Rime: ice only, chill lasting longer; harder and further from II;
 * freezing solid at III for `freeze` seconds. */
export const RIME = { chill: 1.5, damage: 1.6, reach: 1.5, freeze: 1.2 };
/** Stormcalling: a chain bolt in place of each flame, striking up to
 * `links[rank]` enemies `jump[rank]` cells apart for `damage` times the
 * flame's damage a second, half again at III. */
export const STORM = { links: [0, 3, 5, 7], jump: [0, 2.5, 3, 3.5], damage: 1.2, surge: 1.5 };
/** Crusaders: heavier (HP by rank, slower), healing from II, harder hitting at III. */
export const CRUSADE = { hp: [1, 1.5, 1.5, 2.2], speed: 0.85, heal: 3, damage: 1.5 };
/** Assassins: faster and frailer, every `every[rank]`th strike critical for
 * `crit` times the damage; quicker strokes from II, the whole city their
 * hunting ground at III. */
export const ASSASSIN = { speed: 1.3, hp: 0.8, every: [0, 4, 3, 2], crit: 3, cooldown: 0.75 };

export const PATHS: KnowledgePath[] = [
  {
    id: "pyromancy", topic: "wizardTower", name: "Pyromancy", motto: "Flames only, far hotter", hue: "ember",
    ranks: [
      { name: "Kindling", icon: "flame", cost: 4, text: "The tower gives up its ice and burns 30% hotter" },
      { name: "Long tongues", icon: "tongue", cost: 8, text: "Its flames reach 1.5 cells further" },
      { name: "Inferno", icon: "inferno", cost: 14, text: "Flames burn 80% hotter in all and half again as long" },
    ],
  },
  {
    id: "rime", topic: "wizardTower", name: "Rime", motto: "Ice only, then frozen solid", hue: "frost",
    ranks: [
      { name: "Hoarfrost", icon: "snowflake", cost: 4, text: "The tower gives up its flames; ice comes twice as often and chills half again as long" },
      { name: "Black ice", icon: "shard", cost: 8, text: "Ice waves hit 60% harder and run 1.5 cells further" },
      { name: "Deep freeze", icon: "iceBlock", cost: 14, text: "Enemies the ice hits freeze solid for a moment" },
    ],
  },
  {
    id: "storm", topic: "wizardTower", name: "Stormcalling", motto: "Lightning in place of flames", hue: "storm",
    ranks: [
      { name: "Stormcalling", icon: "bolt", cost: 5, text: "Each flame becomes a bolt of lightning leaping through 3 enemies; the ice stays" },
      { name: "Forked bolts", icon: "fork", cost: 9, text: "Bolts leap through 5 enemies, further apart" },
      { name: "Thunderhead", icon: "thunderhead", cost: 15, text: "Bolts leap through 7 enemies and strike half again as hard" },
    ],
    evolves: { item: "darkKeep", name: "Dark wizard keep", text: "At the storm's height the tower becomes a Dark wizard keep" },
  },
  {
    id: "crusaders", topic: "barracks", name: "Crusaders", motto: "Immovable, armoured, enduring", hue: "steel",
    ranks: [
      { name: "Chain mail", icon: "mail", cost: 4, text: "Swordsmen have 50% more HP, and walk a little slower" },
      { name: "Field dressing", icon: "heart", cost: 8, text: "They heal 3 HP a second" },
      { name: "Templars", icon: "cross", cost: 14, text: "120% more HP in all, and 50% more damage" },
    ],
    evolves: { item: "valkyriePalace", name: "Valkyrie palace", text: "Crowned, the barracks becomes a Valkyrie palace" },
  },
  {
    id: "assassins", topic: "barracks", name: "Assassins", motto: "Swift, frail, deadly strikes", hue: "shadow",
    ranks: [
      { name: "Light feet", icon: "boot", cost: 4, text: "Swordsmen run 30% faster with 20% less HP; every 4th strike is critical, 3× damage" },
      { name: "Cutthroats", icon: "dagger", cost: 8, text: "Every 3rd strike is critical, and they strike 33% faster" },
      { name: "Shadows", icon: "skull", cost: 14, text: "Every other strike is critical, and they hunt anywhere in the city" },
    ],
  },
];

export const PATH_TOPICS = [...new Set(PATHS.map((p) => p.topic))];
export const pathById = (id: PathId) => PATHS.find((p) => p.id === id)!;
export const pathsOf = (topic: string) => PATHS.filter((p) => p.topic === topic);

/** A topic's chosen path, how many of its ranks are learned, and the
 * Knowledge they cost (what unlearning returns). */
export type PathChoice = { path: PathId; rank: number; spent: number };
export type PathChoices = Partial<Record<PathTopic, PathChoice>>;
/** What the battle reads: each topic's path and rank. */
export type BattlePaths = Partial<Record<PathTopic, { path: PathId; rank: number }>>;

/** The rank of `path` the battle fights with (0 when not chosen). */
export const pathRank = (paths: BattlePaths | undefined, topic: PathTopic, path: PathId) => {
  const c = paths?.[topic];
  return c && c.path === path ? c.rank : 0;
};

/** Where one path stands for the page: its ranks learned, whether another
 * path shuts it, and its next rank's cost. */
export function pathState(save: Save, id: PathId) {
  const p = pathById(id), choice = save.paths[p.topic];
  const rank = choice?.path === id ? choice.rank : 0;
  const sealed = !!choice && choice.path !== id;
  const next = p.ranks[rank];
  const affordable = !!next && (save.settings.devMode || save.knowledge >= next.cost);
  return { rank, sealed, next, maxed: !next, affordable, canLearn: !sealed && !!next && affordable };
}

/** Learns `id`'s next rank (choosing the path with its first). */
export function learnPath(save: Save, id: PathId): boolean {
  const st = pathState(save, id), p = pathById(id);
  if (!st.canLearn) return false;
  const cost = save.settings.devMode ? 0 : st.next!.cost;
  save.knowledge -= cost;
  const was = save.paths[p.topic];
  save.paths[p.topic] = { path: id, rank: st.rank + 1, spent: (was?.spent ?? 0) + cost };
  return true;
}

/** Forgets a topic's path, returning the Knowledge spent on it; 0 when none. */
export function unlearnPath(save: Save, topic: PathTopic): number {
  const choice = save.paths[topic];
  if (!choice) return 0;
  save.knowledge += choice.spent;
  delete save.paths[topic];
  return choice.spent;
}

/** Each topic's path and rank, for `bonuses`; undefined with none chosen. */
export function battlePaths(save: Save): BattlePaths | undefined {
  const out: BattlePaths = {};
  for (const [topic, c] of Object.entries(save.paths) as [PathTopic, PathChoice][]) out[topic] = { path: c.path, rank: c.rank };
  return Object.keys(out).length ? out : undefined;
}

/** Keeps only well formed choices: a known topic, its own path, a rank it
 * has, and Knowledge spent as a finite count. */
export function decodePaths(raw: unknown): PathChoices {
  const out: PathChoices = {};
  if (!raw || typeof raw !== "object") return out;
  for (const topic of PATH_TOPICS) {
    const c = (raw as Record<string, unknown>)[topic] as Partial<PathChoice> | undefined;
    if (!c || typeof c !== "object") continue;
    const p = PATHS.find((p) => p.id === c.path && p.topic === topic);
    if (!p || !Number.isInteger(c.rank) || c.rank! < 1 || c.rank! > p.ranks.length) continue;
    if (typeof c.spent !== "number" || !Number.isFinite(c.spent) || c.spent < 0) continue;
    out[topic] = { path: p.id, rank: c.rank!, spent: c.spent };
  }
  return out;
}
