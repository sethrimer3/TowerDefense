/** Small DOM, number and sprite helpers shared by every page. */

export const el = (id: string) => document.getElementById(id)!;
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type UiSprite = "defend" | "mine" | "library" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "log" | "gold" | "knowledge" | "stage-select" | "upgrade-point";
const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  `<img class="${className}" src="${UI_ASSET_BASE}assets/ui/${name}.png" alt="" aria-hidden="true">`;

/** The Tiles tab's icon is a city tile, painted by the board's own art once the shell is built. */
export const TAB_ICONS = { defend: uiSprite("defend"), mine: uiSprite("mine"), library: uiSprite("library"), tiles: `<canvas class="ui-sprite" width="48" height="48" data-icon="cityTile"></canvas>`, settings: uiSprite("settings") };
export type Tab = keyof typeof TAB_ICONS;
export const TAB_NAMES: Record<Tab, string> = { defend: "Defend", mine: "Mine", library: "Library", tiles: "Tiles", settings: "Settings" };
