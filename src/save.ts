import { GOLD_SHOP, SAVE_KEY, TOWER_WIDTH, TRAINING, UPGRADES, WIDTH } from "./config.ts";
import type { AutomoveMemory, DelveRun, FloorRecord, ModeSave, MoveSnapshot, Revival, Run, Save, TowerRun } from "./entities.ts";
import { emptyMaterials, MATERIAL_IDS, type MaterialId } from "./materials.ts";
import { EQUIPMENT_SLOTS, type CraftedEquipment, type EquipmentSlot } from "./equipment.ts";
import { CONSUMABLES, type ConsumableId } from "./crafting.ts";
import { decodeDefendSave, defaultDefendSave } from "./defend/progress.ts";
import { decodeSettings, defaultSettings } from "./settings.ts";
import { loadout } from "./loadout.ts";
import { BASE_HAND, CARD_IDS, HAND_SLOTS, type CardId } from "./cards.ts";
export function defaults(): Save {
  return {
    version: 3,
    tower: { run: null, history: [], revival: null, best: 0, reached: 0, inspiration: 0, log: {}, lootedTiles: {}, runGold: 0, startSection: 0, sectionHp: {} },
    delve: { run: null, history: [], revival: null, best: 0, reached: 0, courage: 0, lootedTiles: {}, runGold: 0, memory: { known: {}, visited: {} } },
    gold: 0,
    provisions: Object.fromEntries(
      GOLD_SHOP.map((g) => [g.id, 0]),
    ) as Save["provisions"],
    xp: 0,
    training: Object.fromEntries(TRAINING.map((t) => [t.id, 0])) as Save["training"],
    upgrades: Object.fromEntries(
      UPGRADES.map((u) => [u.id, 0]),
    ) as Save["upgrades"],
    settings: defaultSettings(),
    materials: emptyMaterials(),
    equipmentInventory: [],
    equipped: {},
    consumables: Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Save["consumables"],
    hand: [...BASE_HAND],
    tutorials: { deck: false, removeCard: false, addCard: false },
    defend: defaultDefendSave(),
  };
}
const finite = (n: unknown, max = 1e9) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
const isRecord = (v: any) => !!v && typeof v === "object" && !Array.isArray(v);
/** A floored count from `raw` when it is a finite number within `max`. */
const count = (raw: any, fallback: number, max?: number) =>
  finite(raw, max) ? Math.floor(raw) : fallback;
const CHEST_TIERS = ["silver", "gold", "platinum"] as const;
const KEY_COLORS = ["yellow", "blue", "red"] as const;
const POINT_KEY = /^\d+,\d+$/;
/** Every key is an `x,y` point and every value passes `valid`. */
const pointMap = (m: any, valid: (v: any) => boolean) =>
  isRecord(m) && Object.entries(m).every(([k, v]) => POINT_KEY.test(k) && valid(v));

// --- Runs ---
const validChange = (v: any) =>
  v?.kind === "floor" || v?.kind === "wall" ||
  (v?.kind === "openedChest" && (v.tier === undefined || CHEST_TIERS.includes(v.tier))) ||
  (v?.kind === "reward" && CHEST_TIERS.includes(v.tier));
const validChanges = (m: any) => pointMap(m, validChange);
const validFloors = (m: any) =>
  m === undefined ||
  (isRecord(m) && Object.entries(m).every(([k, v]) => /^\d+$/.test(k) && validChanges(v)));
/** Outside runs only exist in the forest clearing below the first floor. */
const validOutside = (r: any) =>
  (r.outside === undefined || typeof r.outside === "boolean") &&
  (!r.outside || (r.height === 0 && r.player?.y < 12 && r.floor === 0));
const validCounters = (r: any) =>
  Number.isInteger(r.seed) && finite(r.height) && finite(r.floor) && r.floor <= r.player?.y &&
  finite(r.kills) && finite(r.treasures);
const validPlayer = (p: any, width: number) =>
  !!p &&
  Number.isInteger(p.x) && p.x >= 0 && p.x < width &&
  Number.isInteger(p.y) && finite(p.y) &&
  finite(p.hp) && p.hp > 0 && finite(p.maxHp) && p.hp <= p.maxHp &&
  finite(p.attack) && finite(p.defense) &&
  KEY_COLORS.every((k) => finite(p.keys?.[k]));
/** Checks every run passes, whatever its mode; `width` is the mode's board. */
const validCore = (r: any, width: number) =>
  !!r && validOutside(r) && validCounters(r) && validPlayer(r.player, width) && validChanges(r.changes);
const validDelveState = (r: any) => Number.isInteger(r.milestone) && finite(r.milestone);
const TOWER_FIELDS = ["damaged", "keysSpent", "floors"];
const DELVE_FIELDS = ["milestone"];
/** Drops fields a run of this mode doesn't keep: the other mode's, and an
 * older run's clear chest list and Automove memory (clear chests stand in
 * `changes` now, and the memory beside the run). */
function without<R>(r: any, fields: string[]): R {
  for (const k of ["rewards", "known", "visited", ...fields]) delete r[k];
  if (r.hand !== undefined && !validHand(r.hand)) delete r.hand;
  return r;
}
/** A hand as the Deck can order it: known cards, each once, no more than
 * the hand holds, STAIRS among them. */
const validHand = (h: any) =>
  Array.isArray(h) && h.length <= HAND_SLOTS && new Set(h).size === h.length &&
  h.every((id) => CARD_IDS.includes(id)) && h.includes("stairs");
/** Validate an untrusted Tower run; null unless it has the shape a
 * TowerRun needs. */
function decodeTowerRun(r: any): TowerRun | null {
  if (!validCore(r, TOWER_WIDTH) || !validFloors(r.floors)) return null;
  // Older runs have no damage/key history; do not assume a perfect attempt.
  r.damaged = r.damaged !== false;
  r.keysSpent = r.keysSpent !== false;
  return without(r, DELVE_FIELDS);
}
/** Validate an untrusted Delve run; null unless it has the shape a
 * DelveRun needs. */
function decodeDelveRun(r: any): DelveRun | null {
  if (!validCore(r, WIDTH) || !validDelveState(r)) return null;
  return without(r, TOWER_FIELDS);
}

// --- Mode slices ---
type DecodedMode<R extends Run> = Pick<ModeSave<R>, "run" | "history" | "revival" | "lootedTiles" | "runGold">;
type RunDecoder<R extends Run> = (raw: any) => R | null;
function snapshot<R extends Run>(value: any, decodeRun: RunDecoder<R>): MoveSnapshot<R> | null {
  if (!value || !finite(value.best) || !finite(value.xp)) return null;
  const run = decodeRun(value.run);
  return run ? { run, best: value.best, xp: Math.floor(value.xp) } : null;
}
/** Undo history only survives for the same seed and layout as the live run. */
function decodeHistory<R extends Run>(raw: any, run: R, undoCapacity: number, decodeRun: RunDecoder<R>): MoveSnapshot<R>[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-undoCapacity)
    .map((item) => snapshot(item, decodeRun))
    .filter((item): item is MoveSnapshot<R> =>
      !!item && item.run.seed === run.seed && item.run.layoutVersion === run.layoutVersion);
}
function decodeRevival<R extends Run>(raw: any, run: R, decodeRun: RunDecoder<R>): Revival<R> | null {
  const item = snapshot(raw?.snapshot, decodeRun);
  return item && item.run.layoutVersion === run.layoutVersion ? { snapshot: item } : null;
}
/** Automove's memory, each half kept only when every entry is well formed. */
function decodeMemory(raw: any): AutomoveMemory {
  return {
    known: pointMap(raw?.known, (v) => v === true) ? raw.known : {},
    visited: pointMap(raw?.visited, (v) => finite(v)) ? raw.visited : {},
  };
}
function decodeLootedTiles(raw: any): Record<string, true> {
  const lootedTiles: Record<string, true> = {};
  if (isRecord(raw))
    for (const key of Object.keys(raw))
      if (/^-?\d+:(-?\d+:)?-?\d+,-?\d+$/.test(key)) lootedTiles[key] = true;
  return lootedTiles;
}
function decodeMode<R extends Run>(s: any, undoCapacity: number, decodeRun: RunDecoder<R>): DecodedMode<R> {
  const run = decodeRun(s?.run);
  return {
    run,
    history: run ? decodeHistory(s.history, run, undoCapacity, decodeRun) : [],
    revival: run ? decodeRevival(s.revival, run, decodeRun) : null,
    lootedTiles: decodeLootedTiles(s?.lootedTiles),
    runGold: run ? count(s.runGold, 0) : 0,
  };
}
function applyMode<R extends Run>(slice: ModeSave<R>, decoded: DecodedMode<R>) {
  slice.run = decoded.run;
  slice.history = decoded.history;
  slice.revival = decoded.revival;
  slice.lootedTiles = decoded.lootedTiles;
  slice.runGold = decoded.runGold;
}

// --- Inventory ---
function decodeMaterials(s: any): Record<MaterialId, number> {
  const materials = emptyMaterials();
  if (s && typeof s === "object")
    for (const id of MATERIAL_IDS) materials[id] = count(s[id], materials[id]);
  return materials;
}
const validStacks = (arr: any): boolean =>
  Array.isArray(arr) &&
  arr.every((m: any) => MATERIAL_IDS.includes(m?.id) && finite(m?.quantity, 999));
const validEquipment = (e: any) =>
  typeof e?.id === "string" && e.id.length > 0 && e.id.length < 100 &&
  EQUIPMENT_SLOTS.includes(e.slot) &&
  typeof e.name === "string" && e.name.length < 100 &&
  ["iron", "steel", "silversteel", "embersteel", "starsteel", "voidsteel"].includes(e.metal) &&
  finite(e.flatAttack, 9999) && finite(e.flatDefense, 9999) && finite(e.flatMaxHp, 9999) &&
  finite(e.percentAttack, 10) && finite(e.percentDefense, 10) && finite(e.percentMaxHp, 10) &&
  validStacks(e.baseRecipe) && validStacks(e.enhancements) &&
  finite(e.createdAt, 1e15);
function decodeEquipmentInventory(s: any): CraftedEquipment[] {
  return Array.isArray(s) ? s.filter(validEquipment) : [];
}
const owns = (inventory: CraftedEquipment[], id: unknown, slot: EquipmentSlot) =>
  typeof id === "string" && inventory.some((e) => e.id === id && e.slot === slot);
function decodeEquipped(s: any, inventory: CraftedEquipment[]): Partial<Record<EquipmentSlot, string>> {
  const equipped: Partial<Record<EquipmentSlot, string>> = {};
  if (isRecord(s))
    for (const slot of EQUIPMENT_SLOTS) if (owns(inventory, s[slot], slot)) equipped[slot] = s[slot];
  return equipped;
}
function decodeConsumables(s: any): Record<ConsumableId, number> {
  const consumables = Object.fromEntries(CONSUMABLES.map((c) => [c.id, 0])) as Record<ConsumableId, number>;
  if (s && typeof s === "object")
    for (const c of CONSUMABLES) consumables[c.id] = count(s[c.id], consumables[c.id], 999);
  return consumables;
}
/** Older (version-2) saves intentionally get an empty material/equipment
 * inventory rather than being invalidated. */
function decodeInventory(s: any, d: Save) {
  d.materials = decodeMaterials(s.materials);
  d.equipmentInventory = decodeEquipmentInventory(s.equipmentInventory);
  d.equipped = decodeEquipped(s.equipped, d.equipmentInventory);
  d.consumables = decodeConsumables(s.consumables);
}

// --- Settings, currencies and records ---
function decodeUpgrades(raw: any, d: Save) {
  for (const u of UPGRADES) d.upgrades[u.id] = count(raw?.[u.id], d.upgrades[u.id], u.max);
}
function decodeProgress(s: any, d: Save, undoCapacity: number) {
  d.gold = count(s.gold, d.gold);
  for (const g of GOLD_SHOP) d.provisions[g.id] = count(s.provisions?.[g.id], d.provisions[g.id], 999);
  d.xp = count(s.xp, d.xp);
  for (const t of TRAINING) d.training[t.id] = count(s.training?.[t.id], d.training[t.id], 1e6);
  d.tower.inspiration = count(s.tower?.inspiration ?? s.tower?.shards, d.tower.inspiration);
  d.tower.best = count(s.tower?.best, d.tower.best);
  d.delve.courage = count(s.delve?.courage ?? s.delve?.essence, d.delve.courage);
  d.delve.best = count(s.delve?.best, d.delve.best);
  applyMode(d.tower, decodeMode(s.tower, undoCapacity, decodeTowerRun));
  applyMode(d.delve, decodeMode(s.delve, undoCapacity, decodeDelveRun));
  d.delve.memory = decodeMemory(s.delve?.memory);
}
/** Version 1 had a single run (the endless climb); it becomes the Delve slice. */
function migrateV1(s: any, d: Save, undoCapacity: number) {
  d.delve.best = count(s.best, d.delve.best);
  d.delve.courage = count(s.essence, d.delve.courage);
  applyMode(d.delve, decodeMode({ run: s.run, history: s.history, revival: s.revival }, undoCapacity, decodeDelveRun));
}
/** Existing records are already rewarded; preserve old balances without double-paying. */
function decodeReached(s: any, d: Save) {
  for (const mode of ["tower", "delve"] as const) {
    d[mode].reached = count(s?.[mode]?.reached, d[mode].best);
    d[mode].best = Math.max(d[mode].best, d[mode].reached);
  }
}
function decodeTowerLog(raw: any): Save["tower"]["log"] {
  const log: Save["tower"]["log"] = {};
  if (!raw || typeof raw !== "object") return log;
  for (const [floor, record] of Object.entries(raw) as [string, any][]) {
    if (!/^\d+$/.test(floor) || !finite(Number(floor)) || !record || typeof record !== "object") continue;
    // Older saves list the tiers: { earned: [...], claimed: [...] }.
    const listed = Array.isArray(record.earned);
    const entry: FloorRecord = {};
    for (const t of CHEST_TIERS) {
      const state = listed
        ? record.earned.includes(t) && (Array.isArray(record.claimed) && record.claimed.includes(t) ? "claimed" : "earned")
        : record[t];
      if (state === "earned" || state === "claimed") entry[t] = state;
    }
    if (Object.keys(entry).length) log[floor] = entry;
  }
  return log;
}
function decodeSectionHp(raw: any): Record<string, number> {
  const sectionHp: Record<string, number> = {};
  if (raw && typeof raw === "object")
    for (const [section, hp] of Object.entries(raw) as [string, any][])
      if (/^[1-9]\d*$/.test(section) && finite(hp) && hp > 0) sectionHp[section] = Math.floor(hp);
  return sectionHp;
}
function decodeSections(tower: any, d: Save) {
  d.tower.log = decodeTowerLog(tower?.log);
  d.tower.sectionHp = decodeSectionHp(tower?.sectionHp);
  // A section can only be the start once it has been reached (has a recorded HP).
  const start = tower?.startSection;
  const unlocked = start === 0 || !!d.tower.sectionHp[start];
  if (finite(start) && unlocked) d.tower.startSection = Math.floor(start);
}
const touchedDelve = (d: Save) =>
  !!(d.delve.run || d.delve.best || d.delve.courage) ||
  UPGRADES.some((u) => u.currency === "courage" && d.upgrades[u.id]);
/** Preserve access and purchases in saves made before skill trees existed. */
function migratePreSkillTrees(upgrades: any, d: Save) {
  if (!upgrades || "delve" in upgrades) return;
  if (touchedDelve(d)) d.upgrades.delve = 1;
  if (["quality", "yellow", "blue", "red"].some((id) => upgrades[id] > 0)) d.upgrades.legacy = 1;
}

type VersionStep = (s: any, d: Save, undoCapacity: number) => void;
/** What each save version carries beyond upgrades and settings. A Map, so
 * lookups match versions strictly (no "3" or prototype keys). */
const VERSION_STEPS = new Map<unknown, VersionStep[]>([
  [1, [migrateV1]],
  [2, [decodeProgress]],
  [3, [decodeProgress, decodeInventory]],
]);
/** The saved hand's known cards in order, each once and no more than the
 * hand holds, or the base hand when the save has none or lost its STAIRS
 * card, which every hand must hold. */
function decodeHand(raw: any): CardId[] {
  if (!Array.isArray(raw)) return [...BASE_HAND];
  const hand = [...new Set(raw.filter((id): id is CardId => CARD_IDS.includes(id)))].slice(0, HAND_SLOTS);
  return validHand(hand) ? hand : [...BASE_HAND];
}
export function decode(raw: string | null): Save {
  const d = defaults();
  try {
    const s = JSON.parse(raw ?? "null") ?? {};
    decodeUpgrades(s.upgrades, d);
    const { undoCapacity } = loadout(d);
    d.settings = decodeSettings(s.settings);
    for (const step of VERSION_STEPS.get(s.version) ?? []) step(s, d, undoCapacity);
    decodeReached(s, d);
    decodeSections(s.tower, d);
    migratePreSkillTrees(s.upgrades, d);
    d.defend = decodeDefendSave(s.defend);
    d.hand = decodeHand(s.hand);
    for (const k of ["deck", "removeCard", "addCard"] as const) d.tutorials[k] = s.tutorials?.[k] === true;
  } catch {}
  return d;
}
export function load(): Save {
  try {
    return decode(localStorage.getItem(SAVE_KEY));
  } catch {
    return defaults();
  }
}
export function persist(save: Save): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}
