/** Persistent identities for owned building cards, including cards in the palette.
 * Placement is a binding, not ownership: moving or losing a building keeps its card. */
import { PALETTE_ITEMS, type PaletteItem, type Bonuses } from "./defend/catalog.ts";
import type { DefendSave } from "./defend/progress.ts";
import type { Save } from "./save.ts";
import { PATHS, pathById, type PathId, type BattlePaths } from "./knowledge-paths.ts";

export type OwnedCard = { id: number; kind: PaletteItem; path?: PathId; rank?: number; evolved?: PathId; placement?: string };
export const spikeKey = (g: { tx: number; ty: number; side: string }) => `spikes:${g.tx}:${g.ty}:${g.side}`;

/** Reconcile counts and layout, retaining valid identities and assigning new placements
 * to ready cards. Also handles developer grants and older saves without identities. */
export function syncCards(d: DefendSave) {
  d.cards ??= [];
  d.nextCardId = Math.max(d.nextCardId ?? 1, 1, ...d.cards.map(c => c.id + 1));
  const placements = new Map<string, PaletteItem>();
  for (const s of d.layout.structures) placements.set(`structure:${s.uid}`, s.kind);
  for (const g of d.layout.spikes) placements.set(spikeKey(g), "wallSpikes");
  const bound = new Set<string>();
  for (const c of d.cards) {
    if (c.placement && (placements.get(c.placement) !== c.kind || bound.has(c.placement))) delete c.placement;
    if (c.placement) bound.add(c.placement);
  }
  for (const kind of PALETTE_ITEMS) {
    const cards = d.cards.filter(c => c.kind === kind);
    const count = d.owned[kind];
    // Retain placed cards before ready cards when a developer reduces ownership.
    const keep = new Set(cards.sort((a, b) => Number(!!b.placement) - Number(!!a.placement) || a.id - b.id).slice(0, count).map(c => c.id));
    d.cards = d.cards.filter(c => c.kind !== kind || keep.has(c.id));
    for (let i = cards.length; i < count; i++) d.cards.push({ id: d.nextCardId++, kind });
  }
  for (const [placement, kind] of placements) {
    if (d.cards.some(c => c.placement === placement)) continue;
    const card = d.cards.find(c => c.kind === kind && !c.placement);
    if (card) card.placement = placement;
  }
}

export function cardTopic(c: OwnedCard) {
  const p = c.evolved ? pathById(c.evolved) : PATHS.find(p => p.evolves?.from === c.kind || p.topic === c.kind
    || (c.kind === "monsterBait" && p.topic === "bait") || (c.kind === "wallSpikes" && p.topic === "spikes"));
  return p?.topic;
}

/** Choosing a researched path is free, and a card always carries the furthest
 * rank researched on it: Pyromancy II can't be worn once III is unlocked. A
 * `rank` given must be that rank. Battle snapshots keep their original setup. */
export function equipCard(save: Save, id: number, path?: PathId, rank?: number): boolean {
  syncCards(save.defend);
  const c = save.defend.cards.find(c => c.id === id);
  if (!c || c.evolved) return false;
  if (!path) { delete c.path; delete c.rank; return true; }
  const p = pathById(path), learned = save.pathResearch[path]?.rank ?? 0;
  if (p.topic !== cardTopic(c) || learned < 1 || (rank !== undefined && rank !== learned)) return false;
  c.path = path; c.rank = learned;
  return true;
}

/** Every card on `path` takes up its furthest researched rank. */
export function followResearch(save: Save, path: PathId) {
  const learned = save.pathResearch[path]?.rank ?? 0;
  for (const c of save.defend.cards) if (c.path === path && !c.evolved && learned) c.rank = learned;
}

/** An unlocked crown transforms this one card. Different footprints return it to
 * the palette, where the player can place it again. Its identity survives. */
export function evolveCard(save: Save, id: number): boolean {
  syncCards(save.defend);
  const c = save.defend.cards.find(c => c.id === id);
  const p = c?.path ? pathById(c.path) : undefined, e = p?.evolves;
  if (!c || c.evolved || !p || !e || c.kind !== e.from || c.rank !== p.ranks.length || !save.pathResearch[p.id]?.crowned) return false;
  if (c.placement) save.defend.layout = { ...save.defend.layout,
    structures: save.defend.layout.structures.filter(s => `structure:${s.uid}` !== c.placement) };
  save.defend.owned[c.kind]--; save.defend.owned[e.item]++;
  c.kind = e.item; c.evolved = p.id; delete c.placement;
  return true;
}

/** Returning an evolved card to its base form permits another free build choice. */
export function unevolveCard(save: Save, id: number): boolean {
  syncCards(save.defend);
  const c = save.defend.cards.find(c => c.id === id);
  const e = c?.evolved ? pathById(c.evolved).evolves : undefined;
  if (!c || !e) return false;
  if (c.placement) save.defend.layout = { ...save.defend.layout,
    structures: save.defend.layout.structures.filter(s => `structure:${s.uid}` !== c.placement) };
  save.defend.owned[c.kind]--; save.defend.owned[e.from]++;
  c.kind = e.from; delete c.evolved; delete c.placement;
  return true;
}

export const cardLabel = (c: OwnedCard) => c.evolved ? pathById(c.evolved).evolves!.name
  : c.path ? `${pathById(c.path).name} ${["", "I", "II", "III"][c.rank ?? 0]}` : "Unspecialized";

/** Key battle choices by structure UID (or a spike row's permanent wall spot). */
export function cardBattlePaths(save: Save): Pick<Bonuses, "cardPaths" | "spikePaths"> {
  syncCards(save.defend);
  const cardPaths: Record<number, BattlePaths> = {}, spikePaths: Record<string, BattlePaths> = {};
  for (const c of save.defend.cards) {
    if (!c.placement || !c.path || !c.rank || c.evolved) continue;
    const topic = cardTopic(c);
    if (!topic) continue;
    const paths: BattlePaths = { [topic]: { path: c.path, rank: c.rank } };
    if (c.placement.startsWith("structure:")) cardPaths[Number(c.placement.slice(10))] = paths;
    else if (c.kind === "wallSpikes") spikePaths[c.placement] = paths;
  }
  return { ...(Object.keys(cardPaths).length ? { cardPaths } : {}), ...(Object.keys(spikePaths).length ? { spikePaths } : {}) };
}

/** Defensive card decoding. Invalid choices become unspecialized; duplicate IDs
 * and placement bindings cannot duplicate an upgrade or an owned card. */
export function decodeCards(raw: unknown, save: Save) {
  const seen = new Set<number>();
  save.defend.cards = Array.isArray(raw) ? raw.flatMap((v): OwnedCard[] => {
    if (!v || !Number.isSafeInteger(v.id) || v.id < 1 || v.id >= 1e9 || seen.has(v.id) || !PALETTE_ITEMS.includes(v.kind)) return [];
    seen.add(v.id);
    const c: OwnedCard = { id: v.id, kind: v.kind };
    if (typeof v.placement === "string") c.placement = v.placement;
    const p = PATHS.find(p => p.id === v.path), r = p ? save.pathResearch[p.id] : undefined;
    // A card wears its path's furthest researched rank, whatever it was saved at.
    if (p && p.topic === cardTopic(c) && Number.isInteger(v.rank) && v.rank > 0 && v.rank <= (r?.rank ?? 0)) {
      c.path = p.id; c.rank = r!.rank;
    }
    const evolved = PATHS.find(p => p.id === v.evolved && p.evolves?.item === c.kind);
    if (evolved && save.pathResearch[evolved.id]?.crowned) {
      c.evolved = evolved.id; c.path = evolved.id; c.rank = evolved.ranks.length;
    }
    return [c];
  }) : [];
  syncCards(save.defend);
}

/** Read a building's own choices; the global fallback supports old isolated
 * battle fixtures. Live saves always supply per-card choices. */
export const buildingPaths = (sim: { bonuses: Readonly<Bonuses> }, b?: { structureUid?: number }) =>
  b?.structureUid !== undefined ? sim.bonuses.cardPaths?.[b.structureUid] ?? sim.bonuses.paths : sim.bonuses.paths;
