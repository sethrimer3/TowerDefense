import type { TranslationRow } from "./languages.ts";
/** The building menu's labels use English fallback until their catalog translations land. */
const row = <K extends string>(key: K, english: string) =>
  [key, english, english, english, english, english, english, english, english, english] as const satisfies TranslationRow;
export const BUILDING_MENU_TEXT = [
  row("menu.tree", "Upgrade tree"),
  row("menu.inventory", "Back to the palette"),
  row("menu.sell", "Sell ({gold} gold)"),
  row("menu.targeting", "Targeting"),
  row("menu.mode.closest", "Closest"),
  row("menu.mode.first", "First"),
  row("menu.mode.strongest", "Strongest"),
  row("menu.mode.weakest", "Weakest"),
  row("menu.mode.groups", "Groups"),
  row("menu.range", "Range"),
  row("menu.flag", "Place rally flag"),
  row("menu.flagClear", "Take the rally flag away"),
  row("menu.crosshair", "Place target crosshairs"),
  row("menu.crosshairClear", "Take the crosshairs away"),
] as const;
