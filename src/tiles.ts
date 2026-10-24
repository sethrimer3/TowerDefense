/** The tile collection, as the Tiles tab shows it: everything the player
 * owns to put into a defense is a tile, a real piece of the realm. City
 * tiles and the wall's pieces, the unit buildings (Barracks), the towers,
 * and the consumables (bombs and the war banner) are all tiles of one of
 * four types. A kind's tiles (`tileStacks`): its quantity, and how many of
 * it stand in the city. Each copy carries the Knowledge upgrades it was
 * given (`tileCopies`, `tileMarks`); copies with the same upgrades stack
 * (`tileGroups`), and kinds whose upgrades every copy shares (`universal`)
 * are always one stack. The shop sells more of a
 * kind (`shopOffer`, `buyTile`); a kind's upgrades live where they are made,
 * the Mine's Smithy and the Library's Study (`tileTopic`); a kind's higher
 * tier is its line's ultimate (`higherTier`). Pure functions over the
 * save, so the page and the tests share them. */
import { metalPriceText } from "./metals.ts";
import { BASIC_BUILDINGS, BOMB_PRICE, ITEM_CATEGORY, ITEM_NAMES, PALETTE_ITEMS, purchasePrice, type PaletteItem, type Price } from "./defend/catalog.ts";
import { available, buyBomb, buyItem, canAfford, type Wallet } from "./defend/progress.ts";
import { pathById, type PathHue } from "./knowledge-paths.ts";
import { GATE_PATHS } from "./gate-upgrades.ts";
import { BALLISTA_PATHS } from "./ballista-upgrades.ts";
import { REVOLUTIONARY_PATHS } from "./revolutionary-upgrades.ts";
import { SHADOW_PATHS } from "./shadow-upgrades.ts";
import { NANO_PATHS } from "./nanobot-upgrades.ts";
import { sideRank } from "./side-ranks.ts";
import { hasTree, placeOf, rootOf, upgradedFrom, type SpecialtyTarget, type Wear } from "./specializations.ts";
import { WALL_PATHS, wallRank } from "./wall-upgrades.ts";
import type { PlacedKind } from "./defend/layout.ts";
import { METALS } from "./mine/sim.ts";
import type { Save } from "./save.ts";
import { SUBJECTS, topicItems, type Subject, type Topic } from "./upgrade-subjects.ts";

/** The four types of tile, and the filters the page offers (All shows every type). */
export type TileType = "city" | "units" | "towers" | "consumables";
export type TileFilter = "all" | TileType;
export const TILE_FILTERS: { id: TileFilter; name: string }[] = [
  { id: "all", name: "All" },
  { id: "city", name: "City" },
  { id: "units", name: "Barracks" },
  { id: "towers", name: "Towers" },
  { id: "consumables", name: "Skills" },
];
export const TILE_TYPE_NAMES: Record<TileType, string> = { city: "City", units: "Barracks", towers: "Tower", consumables: "Skill" };

/** Tiles used up (or carried) in battle rather than placed in the city. */
export type Consumable = "bomb" | "warBanner" | "necromancy" | "meteor" | "frostNova" | "reinforcements";
export const CONSUMABLES: Consumable[] = ["bomb", "warBanner", "necromancy", "meteor", "frostNova", "reinforcements"];
export type TileId = PaletteItem | Consumable;

const TYPE_ORDER: TileType[] = ["city", "units", "towers", "consumables"];
export const TILE_TYPE: Record<TileId, TileType> = { ...ITEM_CATEGORY, bomb: "consumables", warBanner: "consumables", necromancy: "consumables", meteor: "consumables", frostNova: "consumables", reinforcements: "consumables" };
/** Every kind of tile, by type and within a type in the palette's order. */
export const TILE_IDS: TileId[] = TYPE_ORDER.flatMap((type) => [...PALETTE_ITEMS, ...CONSUMABLES].filter((id) => TILE_TYPE[id] === type));
export const TILE_NAMES: Record<TileId, string> = { ...ITEM_NAMES, bomb: "Bomb", warBanner: "War banner", necromancy: "Necromancy", meteor: "Meteor strike", frostNova: "Frost nova", reinforcements: "Reinforcements" };
export const isConsumable = (id: TileId): id is Consumable => (CONSUMABLES as string[]).includes(id);
export const inFilter = (id: TileId, filter: TileFilter) => filter === "all" || TILE_TYPE[id] === filter;

/** What a consumable does, as its tile reads. */
export const CONSUMABLE_TEXT: Record<Consumable, string> = {
  bomb: "Drag onto the battlefield mid-defense to blast everything around where it lands. Used up when it goes off. Shaped charges spare your own people; the Smithy and Gunpowder make it hit harder.",
  warBanner: "Plant it mid-defense and every troop with nothing in reach marches to it and fights round it. Never used up: lift it and plant it again. Wait 10 seconds between placements; research reduces this to 7, 4 and 1 second, strengthens and enlarges its influence, and unlocks damage, marching speed, life and regeneration upgrades.",
  necromancy: "A strike spell: cast it mid-defense and every enemy that fell within 3 cells of where it lands in the last 10 seconds rises as a friendly undead warrior, one for each, for a minute. Never used up; ready again 30 seconds after each cast. While it is held, a skull marks every enemy that can still be raised. The Smithy makes the risen tougher and harder hitting, and its Grave time keeps the fallen raisable for 20, then 30 seconds; the Study's paths raise bone archers, warriors as strong as the enemies they were, or one giant of all the fallen.",
  meteor: "A strike spell: cast it mid-defense and a meteor falls where it lands a moment later, blasting every enemy within 2.5 cells (your own people are spared). Never used up; ready again 40 seconds after each cast. The Smithy makes it hit harder and wider; the Study's paths break it into a shower of fragments, leave a burning crater, or turn it into a comet of ice that chills and freezes.",
  frostNova: "A strike spell: cast it mid-defense and ice bursts out where it lands, freezing every enemy within 3 cells solid for 2 seconds, then leaves a patch of rime for 6 seconds that slows and bites whatever walks through it. Never used up; ready again 35 seconds after each cast. The Smithy makes it last longer and reach farther; the Study's paths make the frozen shatter, set the rime wandering after enemies as a blizzard, or turn it into a ward over your own people.",
  reinforcements: "A strike spell: cast it mid-defense and four soldiers drop out of the sky where it lands, hold that ground against every enemy that comes within 6 cells, and march off after 30 seconds. Never used up; ready again 45 seconds after each cast. The Smithy makes them tougher, harder hitting and slower to leave; the Study's paths land them with shockwaves and a champion, muster a bigger levy with bowmen and reserves, or bind them by oath to hold together, fight longer and make a last stand.",
};

/** One kind's stack: how many there are, how many stand in the city, and
 * how many wait in the palette. A lasting tile (the war banner) is one
 * tile that is never used up. */
export type TileStack = { id: TileId; type: TileType; count: number; placed: number; ready: number; lasting: boolean };

/** The stack of one kind. */
export function tileStack(save: Save, id: TileId): TileStack {
  const d = save.defend, type = TILE_TYPE[id];
  if (id === "bomb") return { id, type, count: d.bombs, placed: 0, ready: d.bombs, lasting: false };
  if (id === "warBanner" || id === "necromancy" || id === "meteor" || id === "frostNova" || id === "reinforcements") return { id, type, count: 1, placed: 0, ready: 1, lasting: true };
  const ready = available(d, id);
  return { id, type, count: d.owned[id], placed: d.owned[id] - ready, ready, lasting: false };
}

/** The stacks the page shows: owned kinds in the filter (or, for the shop,
 * every kind in the filter that is for sale), by type, then palette order. */
export function tileStacks(save: Save, filter: TileFilter, shop = false): TileStack[] {
  return TILE_IDS.filter((id) => inFilter(id, filter))
    .map((id) => tileStack(save, id))
    .filter((s) => (shop ? !("reason" in shopOffer(save, s.id)) : s.count > 0));
}

/** Kinds whose copies are always alike: their upgrades are shared by every
 * copy (the Smithy's levels, the walls' one tree) or they have none, so they
 * always stack. A building with its own Knowledge tree is upgraded one copy
 * at a time, so its copies are shown apart. */
export const universal = (id: TileId): boolean => isConsumable(id) || !hasTree(id);

/** One copy of a kind, as the spread view and the opened stack lay them
 * out: the city's first, then the palette's kept copies, then its plain
 * ones. `group` names the copies wearing the same upgrades (the kind, or
 * `kind~path~rank`); `key` is the group and the copy's place in it. */
export type TileCopy = { key: string; id: TileId; index: number; placed: boolean; wear?: Wear; group: string };
export function tileCopies(save: Save, stack: TileStack, limit = Infinity): TileCopy[] {
  const d = save.defend, id = stack.id, wears: (Wear | undefined)[] = [];
  if (!universal(id)) {
    const standing = id === "wallSpikes" ? d.layout.spikes : d.layout.structures.filter((o) => o.kind === id);
    for (let i = 0; i < stack.placed; i++) {
      const o = standing[i];
      wears.push(o?.path && o.rank ? { path: o.path, rank: o.rank } : undefined);
    }
    for (const k of d.kept) if (k.kind === id && wears.length < stack.count) wears.push({ path: k.path, rank: k.rank });
  }
  const n = Math.min(stack.count, limit), seen = new Map<string, number>();
  return Array.from({ length: n }, (_, index) => {
    const wear = wears[index], group = wear ? `${id}~${wear.path}~${wear.rank}` : id, nth = seen.get(group) ?? 0;
    seen.set(group, nth + 1);
    return { key: `${group}#${nth}`, id, index, placed: index < stack.placed, ...(wear ? { wear } : {}), group };
  });
}

/** The copy a tile's `key` names (a spread copy's own key, or a stack's
 * group, whose first copy stands for it), else the kind's first copy. */
export function tileCopyAt(save: Save, stack: TileStack, key: string | null | undefined): TileCopy | undefined {
  const copies = tileCopies(save, stack);
  return copies.find((c) => c.key === key) ?? copies.find((c) => c.group === key) ?? copies[0];
}

/** The upgrade tree a held tile opens in Defend: the walls', gates' and
 * wall ballistas' shared trees, or the copy's own (where it stands in the
 * city, else its palette copy). None for a kind without one. */
export type TileTree = SpecialtyTarget | { side: "walls" | "gate" | "ballistas" };
export function tileTree(save: Save, id: TileId, key?: string | null): TileTree | null {
  if (id === "wallBlock") return { side: "walls" };
  if (id === "cityGate") return { side: "gate" };
  if (id === "wallBallista") return { side: "ballistas" };
  if (universal(id) || !hasTree(id)) return null;
  const stack = tileStack(save, id), copy = tileCopyAt(save, stack, key);
  if (!copy) return null;
  const d = save.defend;
  if (copy.placed) {
    if (id === "wallSpikes") { const spot = d.layout.spikes[copy.index]; if (spot) return { spikes: { tx: spot.tx, ty: spot.ty, side: spot.side } }; }
    else { const o = d.layout.structures.filter((s) => s.kind === id)[copy.index]; if (o) return { uid: o.uid }; }
  }
  return { copy: id, ...(copy.wear ? { wear: copy.wear } : {}) };
}

/** Copies of a kind wearing the same upgrades, stacked together: plain
 * copies first, then by how far they were upgraded. */
export type TileGroup = { key: string; id: TileId; wear?: Wear; count: number; placed: number; marks: TileMark[] };
export function tileGroups(save: Save, stack: TileStack): TileGroup[] {
  const groups = new Map<string, TileGroup>();
  for (const c of tileCopies(save, stack)) {
    const g = groups.get(c.group) ?? { key: c.group, id: c.id, ...(c.wear ? { wear: c.wear } : {}), count: 0, placed: 0, marks: tileMarks(save, c.id, c.wear) };
    g.count++;
    if (c.placed) g.placed++;
    groups.set(c.group, g);
  }
  return [...groups.values()].sort((a, b) => a.marks.length - b.marks.length || a.key.localeCompare(b.key));
}

/** One Knowledge upgrade a tile carries, in the order it was taken: the
 * building becoming another kind, or a rank of a path (`name` its path's). */
export type TileMark = { type: "became"; name: string } | { type: "rank"; name: string; rank: number; hue: PathHue };

/** The Knowledge upgrades a tile of `id` wearing `wear` carries: every kind
 * it grew through from its basic building (an evolved one's whole crowned
 * path first), then its own path's ranks. The walls, the gates and the
 * wall ballistas carry their shared trees' ranks. Empty for a tile with none. */
export function tileMarks(save: Save, id: TileId, wear?: Wear): TileMark[] {
  const marks: TileMark[] = [];
  const ranks = (name: string, hue: PathHue, n: number) => { for (let r = 1; r <= n; r++) marks.push({ type: "rank", name, rank: r, hue }); };
  if (id === "wallBlock") {
    for (const p of WALL_PATHS) ranks(p.name, p.hue, wallRank(save.defend.wallRanks, p.id));
    return marks;
  }
  if (id === "cityGate" || id === "wallBallista") {
    const have = (id === "cityGate" ? save.defend.gateRanks : save.defend.ballistaRanks) as Partial<Record<string, number>> | undefined;
    for (const p of id === "cityGate" ? GATE_PATHS : BALLISTA_PATHS) ranks(p.name, p.hue, sideRank(have, p.id));
    return marks;
  }
  if (universal(id)) return marks;
  const kinds: PlacedKind[] = [];
  if (id !== "wallSpikes") for (let k: PlacedKind | undefined = id as PlacedKind; k; k = upgradedFrom(k)) kinds.unshift(k);
  for (const k of kinds.slice(1)) marks.push({ type: "became", name: ITEM_NAMES[k] });
  if (wear) { const p = pathById(wear.path); ranks(p.name, p.hue, wear.rank); }
  // The Revolutionaries' shared branches.
  if (id === "revolutionary") for (const p of REVOLUTIONARY_PATHS) ranks(p.name, p.hue, sideRank(save.defend.revolutionaryRanks, p.id));
  if (id === "shadow") for (const p of SHADOW_PATHS) ranks(p.name, p.hue, sideRank(save.defend.shadowRanks, p.id));
  if (id === "nanoTower") for (const p of NANO_PATHS) ranks(p.name, p.hue, sideRank(save.defend.nanoRanks, p.id));
  return marks;
}

/** A tile's upgrades in words: "Watch tower → Archer tower → Fire arrows II". */
export function marksText(id: TileId, marks: TileMark[]): string {
  if (!marks.length) return "No Knowledge upgrades";
  const parts: string[] = [];
  if (id !== "wallBlock" && id !== "wallSpikes" && !isConsumable(id)) parts.push(ITEM_NAMES[rootOf(id as PlacedKind)]);
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i], next = marks[i + 1];
    if (m.type === "became") parts.push(m.name);
    else if (!(next?.type === "rank" && next.name === m.name)) parts.push(specialtyLabelOf(m.name, m.rank));
  }
  return parts.join(" → ");
}
const ROMAN = ["", "I", "II", "III", "IV", "V"];
const specialtyLabelOf = (name: string, rank: number) => `${name} ${ROMAN[rank]}`;

/** The shop's metal price, or why a kind isn't sold. */
export type ShopOffer = { price: Price } | { reason: string };
export function shopOffer(save: Save, id: TileId): ShopOffer {
  if (id === "bomb") return { price: BOMB_PRICE };
  if (id === "warBanner") return { reason: "Always at hand in battle: one banner, never used up." };
  if (id === "necromancy" || id === "meteor" || id === "frostNova" || id === "reinforcements") return { reason: "Always at hand in battle: a spell, never used up." };
  // Only the basic buildings are sold: every other tower or troop building
  // is one of them upgraded, a building at a time.
  const from = ITEM_CATEGORY[id] !== "city" && !BASIC_BUILDINGS.includes(id) ? rootOf(id as PlacedKind) : undefined;
  if (from) return { reason: `Not sold: place a ${ITEM_NAMES[from]} and upgrade it into one with Knowledge (tap it in Defend while building).` };
  return { price: purchasePrice(id, save.defend.owned[id]) };
}

/** Whether the player can pay for the offer now. */
export function canBuyTile(save: Save, id: TileId): boolean {
  const offer = shopOffer(save, id);
  if (save.settings.devMode) return !("reason" in offer);
  if ("price" in offer && offer.price) return canAfford({ ...save.smithy }, offer.price);
  return false;
}

/** Buys another copy with mine metal; free with Unlimited money. */
export function buyTile(save: Save, id: TileId): boolean {
  const offer = shopOffer(save, id), free = save.settings.devMode;
  if ("reason" in offer) return false;
  if (id === "warBanner" || id === "necromancy" || id === "meteor" || id === "frostNova" || id === "reinforcements") return false;
  const w: Wallet = { ...save.smithy, free };
  if (!(id === "bomb" ? buyBomb(save.defend, w) : buyItem(save.defend, w, id))) return false;
  if (!free) for (const k of METALS) save.smithy[k] = w[k];
  return true;
}

/** Consumables' upgrades live in their Spells topics. */
const CONSUMABLE_TOPIC: Record<Consumable, string> = { bomb: "battle", warBanner: "warBanner", necromancy: "necromancy", meteor: "meteor", frostNova: "frostNova", reinforcements: "reinforcements" };
/** The topic a kind's upgrades are filed in, and its subject. */
export function tileTopic(id: TileId): { subject: Subject; topic: Topic } {
  for (const subject of SUBJECTS)
    for (const topic of subject.topics)
      if (isConsumable(id) ? topic.id === CONSUMABLE_TOPIC[id] : topicItems(topic).includes(id)) return { subject, topic };
  throw new Error(`No topic holds ${id}`);
}

/** Where a kind stands among the tiers: the ultimate three of its line,
 * each maxed on a different branch, merge into (`into`), or for an
 * ultimate the attuned building merged into it (`from`). */
export function higherTier(id: TileId): { into?: PlacedKind; from?: PlacedKind } {
  if (isConsumable(id) || id === "wallSpikes" || id === "wallBlock") return {};
  const place = placeOf(id as PlacedKind);
  if (place.tier === "attuned" || place.tier === "via") return place.a.ultimate ? { into: place.a.ultimate } : {};
  return place.tier === "ultimate" ? { from: place.a.kind } : {};
}

/** A metal price in words, including consumables. */
export function offerText(offer: ShopOffer): string {
  if ("reason" in offer) return "";
  return metalPriceText(offer.price);
}
