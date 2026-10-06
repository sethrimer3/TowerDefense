/** Distinct destinations, twenty waves each. Endless waves revisit them in order.
 * Enemy families are selected separately in area-enemies.ts. */
export const WAVES_PER_AREA = 20;
export const AREA_FADE_MS = 3000;
export const AREAS = [
  { id: "moss", name: "Mossbound Ruins", climate: "temperate", rainChance: .3, color: "#a9c878", dark: "#263b23" },
  { id: "desert", name: "Amber Desert", climate: "dry", rainChance: 0, color: "#f1c263", dark: "#604019" },
  { id: "ember", name: "Ember Forge", climate: "dry", rainChance: 0, color: "#ffac64", dark: "#632d20" },
  { id: "drowned", name: "Drowned Temple", climate: "wet", rainChance: .75, color: "#88d9d8", dark: "#204c51" },
  { id: "fungal", name: "Fungal Hollow", climate: "underground", rainChance: 0, color: "#e6a8c1", dark: "#593649" },
  { id: "frozen", name: "Frozen Vault", climate: "cold", rainChance: 0, color: "#c2e9ff", dark: "#304f69" },
  { id: "crystal", name: "Violet Geode", climate: "underground", rainChance: 0, color: "#d4a2f5", dark: "#49305e" },
  { id: "obsidian", name: "Obsidian Crypt", climate: "dry", rainChance: 0, color: "#ba9c9c", dark: "#382d33" },
  { id: "astral", name: "Astral Sanctuary", climate: "dry", rainChance: 0, color: "#e4d299", dark: "#273d63" },
  { id: "nadir", name: "Nadir", climate: "underground", rainChance: 0, color: "#ab9acb", dark: "#171322" },
] as const;
export type Area = typeof AREAS[number];
export type AreaId = Area["id"];
/** Nadir reuses the crypt masonry beneath its own dark floor wash. */
export const areaArtId = (area: AreaId) => area === "nadir" ? "obsidian" : area;
export function areaForWave(wave: number): Area {
  const safe = Number.isFinite(wave) ? Math.max(1, Math.floor(wave)) : 1;
  return AREAS[Math.floor((safe - 1) / WAVES_PER_AREA) % AREAS.length];
}
export const areaStyle = (area: Area) => `--area-color:${area.color};--area-dark:${area.dark}`;
export function areaFade(elapsedMs: number, reduceMotion = false) {
  if (reduceMotion) return 1;
  const t = Math.max(0, Math.min(1, elapsedMs / AREA_FADE_MS));
  return t * t * (3 - 2 * t);
}
