/** Small DOM, number and sprite helpers shared by every page. */

export const el = (id: string) => document.getElementById(id)!;
export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type UiSprite = "defend" | "mine" | "library" | "upgrades" | "settings" | "health" | "attack" | "defense" | "undo" | "log" | "gold" | "knowledge" | "stage-select" | "upgrade-point";
const UI_ASSET_BASE = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
export const uiSprite = (name: UiSprite, className = "ui-sprite") =>
  `<img class="${className}" src="${UI_ASSET_BASE}assets/ui/${name}.png" alt="" aria-hidden="true">`;

export const TAB_ICONS = { defend: uiSprite("defend"), mine: uiSprite("mine"), library: uiSprite("library"), upgrades: uiSprite("upgrades"), settings: uiSprite("settings") };
export type Tab = keyof typeof TAB_ICONS;
export const TAB_NAMES: Record<Tab, string> = { defend: "Defend", mine: "Mine", library: "Library", upgrades: "Upgrades", settings: "Settings" };
