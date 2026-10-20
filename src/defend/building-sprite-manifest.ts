/** Native PNG layouts for the first clean-art building families. Presentation
 * metadata only: the catalog remains the source of gameplay footprints.
 * Each column is a path look; rows are intact, successive damage, then rubble. */
import type { StructureKind } from "./catalog.ts";

export const BUILDING_PALETTE = {
  ink: "#14120F", recess: "#28251F",
  stoneDark: "#3C3B36", stone: "#64645B", stoneLight: "#929185", stoneBright: "#CAC7B5",
  steelDark: "#252D36", steel: "#465260", steelLight: "#7B8995", steelBright: "#C2CCD0",
  woodDark: "#34271E", wood: "#60432B", woodLight: "#91643C", woodBright: "#BD925B",
  redDark: "#581F22", red: "#96372E", redLight: "#D85A3C",
  goldDark: "#6D4A23", gold: "#BE8D3D", goldLight: "#F1D58A",
  greenDark: "#253D2A", green: "#476044", greenLight: "#78955B", bright: "#EAE2C9",
  arcaneDark: "#352943", arcane: "#65567D", arcaneLight: "#A391B3",
  frostDark: "#325B70", frost: "#6FA3B8", frostLight: "#C2E5E6",
} as const;

export const BUILDING_ART = {
  keep: { kind: "keep", sheet: "v2/defend/keep", icon: "v2/ui/keep", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [1, 1, 30, 30], overhang: [0, 0, 0, 0], looks: [""], stages: 5 },
  barracks: { kind: "barracks", sheet: "v2/defend/barracks", icon: "v2/ui/barracks", footprint: [4, 6], size: [32, 48], anchor: [16, 24], contentBounds: [3, 3, 26, 42], overhang: [0, 0, 0, 0], looks: ["", "crusaders", "berserkers", "halberdiers"], stages: 4 },
  barracksWide: { kind: "barracks", sheet: "v2/defend/barracks-wide", icon: "v2/ui/barracks", footprint: [6, 4], size: [48, 32], anchor: [24, 16], contentBounds: [3, 3, 42, 26], overhang: [0, 0, 0, 0], looks: ["", "crusaders", "berserkers", "halberdiers"], stages: 4 },
  watchTower: { kind: "watchTower", sheet: "v2/defend/watch-tower", icon: "v2/ui/watch-tower", footprint: [2, 2], size: [16, 16], anchor: [8, 8], contentBounds: [1, 1, 14, 14], overhang: [0, 0, 0, 0], looks: ["", "spotters", "signalFires"], stages: 4 },
  meleeGuild: { kind: "meleeGuild", sheet: "v2/defend/melee-guild", icon: "v2/ui/melee-guild", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [3, 3, 26, 26], overhang: [0, 0, 0, 0], looks: [""], stages: 4 },
  rangedGuild: { kind: "rangedGuild", sheet: "v2/defend/ranged-guild", icon: "v2/ui/ranged-guild", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [3, 3, 26, 26], overhang: [0, 0, 0, 0], looks: [""], stages: 4 },
  archerBarracks: { kind: "archerBarracks", sheet: "v2/defend/archer-barracks", icon: "v2/ui/archer-barracks", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [3, 3, 26, 26], overhang: [0, 0, 0, 0], looks: ["", "rangers", "skirmishers"], stages: 4 },
  archerTower: { kind: "archerTower", sheet: "v2/defend/archer-tower", icon: "v2/ui/archer-tower", footprint: [2, 2], size: [16, 16], anchor: [8, 8], contentBounds: [1, 1, 14, 14], overhang: [0, 0, 0, 0], looks: ["", "fireArrows", "sharpshooters"], stages: 4 },
  cannonTower: { kind: "cannonTower", sheet: "v2/defend/cannon-tower", icon: "v2/ui/cannon-tower", footprint: [2, 2], size: [16, 16], anchor: [8, 8], contentBounds: [1, 1, 14, 14], overhang: [0, 0, 0, 0], looks: ["", "gunnery", "siegeShot"], stages: 4 },
  assassinDen: { kind: "assassinDen", sheet: "v2/defend/assassin-den", icon: "v2/ui/assassin-den", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [3, 3, 26, 26], overhang: [0, 0, 0, 0], looks: ["", "bloodletters", "shadowcloak", "venom", "headhunters"], stages: 4 },
  sniperLodge: { kind: "sniperLodge", sheet: "v2/defend/sniper-lodge", icon: "v2/ui/sniper-lodge", footprint: [4, 4], size: [32, 32], anchor: [16, 16], contentBounds: [3, 3, 26, 26], overhang: [0, 0, 0, 0], looks: ["", "marksmen", "ricochet", "suppressors", "deadeye", "piercing"], stages: 4 },
  musketHall: { kind: "musketHall", sheet: "v2/defend/musket-hall", icon: "v2/ui/musket-hall", footprint: [6, 4], size: [48, 32], anchor: [24, 16], contentBounds: [3, 3, 42, 26], overhang: [0, 0, 0, 0], looks: ["", "grenadiers", "volleyFire", "bayonets", "sharpMuskets"], stages: 4 },
  wizardTower: { kind: "wizardTower", sheet: "v2/defend/wizard-tower", icon: "v2/ui/wizard-tower", footprint: [2, 2], size: [16, 16], anchor: [8, 8], contentBounds: [1, 1, 14, 14], overhang: [0, 0, 0, 0], looks: ["", "pyromancy", "rime", "storm"], stages: 4 },
  mageGuild: { kind: "mageGuild", sheet: "v2/defend/mage-guild", icon: "v2/ui/mage-guild", footprint: [4, 6], size: [32, 48], anchor: [16, 24], contentBounds: [3, 3, 26, 42], overhang: [0, 0, 0, 0], looks: ["", "pyroclasm", "cinders"], stages: 4 },
  monsterBait: { kind: "monsterBait", sheet: "v2/defend/monster-bait", icon: "v2/ui/monster-bait", footprint: [2, 2], size: [16, 16], anchor: [8, 8], contentBounds: [1, 1, 14, 14], overhang: [0, 0, 0, 0], looks: ["", "oilSoaked", "fortified"], stages: 4 },
} as const;

export const BUILDING_PNGS = [...new Set(Object.values(BUILDING_ART).flatMap(a => [a.sheet, a.icon])), "v2/defend/keep-flag", "v2/defend/scaffold"] as const;
export type BuildingPng = (typeof BUILDING_PNGS)[number];
export type BuildingArt = (typeof BUILDING_ART)[keyof typeof BUILDING_ART];
export const BUILDING_PIXELS_PER_CELL = 8;
export const BUILDING_ICON_SIZE = 24;
export const KEEP_FLAG = { sheet: "v2/defend/keep-flag", size: [16, 16], anchor: [4, 8], frames: 4, seconds: 0.2 } as const;
const FAMILIES = Object.values(BUILDING_ART);

/** Exact footprint matching prevents accidental stretching of a new sprite. */
export function buildingArt(kind: StructureKind, cw: number, ch: number): BuildingArt | undefined {
  return FAMILIES.find(a => a.kind === kind && a.footprint[0] === cw && a.footprint[1] === ch);
}

export function buildingLook(art: BuildingArt, path?: string) {
  return Math.max(0, (art.looks as readonly string[]).indexOf(path ?? ""));
}

/** All frame bounds and pivots stay fixed through damage, path and rubble. */
export function buildingFrame(art: BuildingArt, stage = 0, path?: string, rubble = false) {
  return { sx: buildingLook(art, path) * art.size[0], sy: (rubble ? art.stages : Math.max(0, Math.min(art.stages - 1, stage))) * art.size[1], sw: art.size[0], sh: art.size[1] };
}
