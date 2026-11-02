import { LANGUAGE_CHOICES } from "./i18n/languages.ts";

/** Fixed canvas colours; save files store only the names. */
export const GRID_COLORS = { white: "#ffffff", brown: "#8b5a2b", black: "#000000", gray: "#808080", gold: "#d8b572" } as const;
export type GridColor = keyof typeof GRID_COLORS;
/** A setting that is on or off. */
type Toggle = { kind: "toggle"; default: boolean; page?: { id: string; label: string; invert?: true } };
/** A setting that is one of a fixed list of values, each with its label. */
type Choice = { kind: "choice"; default: string | number; choices: readonly (readonly [string | number, string])[]; page?: { id: string; label: string } };
/** A number kept within `min`–`max`; saved values are clamped and snapped
 * to `step` increments, not rejected. */
type Range = { kind: "range"; default: number; min: number; max: number; step: number; page?: { id: string; label: string; aria: string } };
export type Setting = Toggle | Choice | Range;

/** Every player setting: its default, what a save may hold, and, when it has
 * a `page`, its control's id and label on the Settings page. The Settings
 * type, the defaults and the save decoder all come from this table, so a new
 * setting is one row here. Rows are in saved key order. */
export const SETTINGS = {
  showHealthbars: { kind: "toggle", default: true, page: { id: "enemy-healthbars", label: "Healthbars for tough enemies" } },
  dayNightCycle: { kind: "toggle", default: true, page: { id: "day-night-cycle", label: "Day/night cycle" } },
  fasterSunCatchup: { kind: "toggle", default: true, page: { id: "faster-sun-catchup", label: "Faster sun during catch-up" } },
  timeOfDay: { kind: "choice", default: "day", choices: [["day", "Day"], ["sunset", "Sunset"], ["dusk", "Dusk"], ["twilight", "Twilight"], ["night", "Night"], ["dawn", "Dawn"]], page: { id: "time-of-day", label: "Time of day" } },
  reduceMotion: { kind: "toggle", default: false, page: { id: "motion", label: "Reduce motion" } },
  /** The city's live dressing: wind-blown park grass, and drips, ripples
   * and reflections on the ponds. */
  effectsOff: { kind: "toggle", default: false, page: { id: "effects", label: "Grass and water effects", invert: true } },
  /** Enemies, and the player's troops, drawn in battle as plain squares
   * in their colours, quicker to draw than their sprites. */
  simpleEnemies: { kind: "toggle", default: false, page: { id: "simple-enemies", label: "Simple square enemies" } },
  simpleTroops: { kind: "toggle", default: false, page: { id: "simple-troops", label: "Simple square troops" } },
  /** Units in battle outlined together: touching units share one black
   * outline round their combined shape instead of each its own. */
  mergedOutlines: { kind: "toggle", default: true, page: { id: "merged-outlines", label: "Merged unit outlines" } },
  /** The Defend board's zoom steps so every art pixel covers the same
   * whole number of screen pixels: outlines keep one width at every zoom. */
  crispZoom: { kind: "toggle", default: true, page: { id: "crisp-zoom", label: "Crisp pixel zoom" } },
  /** The Amber Desert's detailed dunes: rippled, in dithered sand tones,
   * instead of one sand colour shaped only by light and shadow. */
  hdSand: { kind: "toggle", default: false, page: { id: "hd-sand", label: "HD Sand" } },
  /** The Defend palette lists items the player has none of (greyed); off, only those owned. */
  showEmpty: { kind: "toggle", default: false, page: { id: "show-empty", label: "Show items you have none of" } },
  /** Items dragged on the Defend board ride a few blocks above the pointer,
   * clear of the finger. Until the player sets it, on for touch screens and
   * off for a mouse (`touchFirst`). */
  raiseDrag: { kind: "toggle", default: false, page: { id: "raise-drag", label: "Carry dragged items above the finger" } },
  /** While dragging on the Defend board (placing, aiming), a box above the
   * finger shows the board zoomed in round where the item would go. */
  magnifier: { kind: "toggle", default: false, page: { id: "magnifier", label: "Magnifying glass while placing" } },
  /** In battle, the rally flag takes a triple tap rather than a double, for
   * players who plant it by accident. */
  tripleTapFlag: { kind: "toggle", default: false, page: { id: "triple-tap-flag", label: "Triple tap to place the rally flag" } },
  /** Lines round the Defend board's tiles: strength in percent and colour. */
  tileGrid: { kind: "toggle", default: false, page: { id: "tile-grid", label: "Tile grid lines" } },
  gridOpacity: { kind: "range", default: 30, min: 0, max: 100, step: 5, page: { id: "grid-opacity", label: "Grid line opacity", aria: "Tile grid line opacity, percent" } },
  gridColor: { kind: "choice", default: "gold", choices: [["white", "White"], ["brown", "Brown"], ["black", "Black"], ["gray", "Gray"], ["gold", "Gold"]], page: { id: "grid-color", label: "Grid line color" } },
  /** The synthesized knocks, chimes, horns and bells. */
  soundOff: { kind: "toggle", default: false, page: { id: "sound", label: "Sound", invert: true } },
  /** The world's background: rain, wind, thunder, birdsong, crickets. */
  ambienceOff: { kind: "toggle", default: false, page: { id: "ambience", label: "Ambient sound", invert: true } },
  /** Retained visual preference for procedural cloth, glazing and sampling.
   * The checkbox no longer enables any PNG sprite replacements. */
  pixelArt: { kind: "toggle", default: true, page: { id: "pixel-art", label: "Pixel Art" } },
  /** Use the selected legacy tab icons instead of the current navigation art. */
  legacyGraphics: { kind: "toggle", default: false, page: { id: "legacy-graphics", label: "Show legacy graphics" } },
  /** Alembic, the game's own pixel font, for every word on the page; off, Cinzel. */
  pixelFont: { kind: "toggle", default: true, page: { id: "pixel-font", label: "Use Custom Font" } },
  /** Master switch for developer controls, including the enemy tester. */
  developerMode: { kind: "toggle", default: false, page: { id: "developer-mode", label: "Developer mode" } },
  /** Dev: unlimited money. Every currency shows ∞, and every purchase
   * (Armory, Mine, Library, Smithy points, Knowledge) costs nothing. */
  devMode: { kind: "toggle", default: false, page: { id: "dev-mode", label: "Unlimited money" } },
  /** Dev: the palette holds at least one of every structure (granted when
   * turned on; turning it off takes nothing back). */
  devTowers: { kind: "toggle", default: false, page: { id: "dev-towers", label: "All towers unlocked" } },
  /** Dev: the enemy journal shows every species, discovered or not (the save's
   * discoveries are untouched, and show alone again once off). */
  devJournal: { kind: "toggle", default: false, page: { id: "dev-journal", label: "All journal entries unlocked" } },
  /** Dev: Smithy and Knowledge research completes when started, without workers. */
  instantResearch: { kind: "toggle", default: false, page: { id: "dev-instant", label: "Instantaneous research (Study only)" } },
  /** Dev: every rank of the Smithy's rows (or of one skill tree) counts as bought, while on
   * (the ranks actually bought are kept, and count again once off). */
  devSmithy: { kind: "toggle", default: false, page: { id: "dev-smithy", label: "Smithy" } },
  devCommand: { kind: "toggle", default: false, page: { id: "dev-command", label: "Command" } },
  devStewardship: { kind: "toggle", default: false, page: { id: "dev-stewardship", label: "Stewardship" } },
  devMine: { kind: "toggle", default: false, page: { id: "dev-mine", label: "Mine" } },
  devLibrary: { kind: "toggle", default: false, page: { id: "dev-library", label: "Library" } },
  language: { kind: "choice", default: "en", choices: LANGUAGE_CHOICES, page: { id: "language", label: "Language" } },
} as const satisfies Record<string, Setting>;

export type SettingKey = keyof typeof SETTINGS;
export const DEV_OPTIONS = ["devMode", "devTowers", "devJournal", "instantResearch", "devSmithy", "devCommand", "devStewardship", "devMine", "devLibrary"] as const satisfies readonly SettingKey[];
type ValueOf<S> = S extends { kind: "toggle" } ? boolean
  : S extends { choices: readonly (readonly [infer V, string])[] } ? V
  : number;
export type Settings = { -readonly [K in SettingKey]: ValueOf<(typeof SETTINGS)[K]> };

const KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): Settings {
  const out = Object.fromEntries(KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;
  out.raiseDrag = touchFirst();
  return out;
}

/** Whether the device's main pointer is a finger: a phone or tablet. */
function touchFirst(): boolean {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

/** A saved value for `setting` if the save may hold it, otherwise undefined. */
export function settingValue(setting: Setting, v: unknown): boolean | string | number | undefined {
  switch (setting.kind) {
    case "toggle": return typeof v === "boolean" ? v : undefined;
    case "choice": return setting.choices.some(([c]) => c === v) ? v as string | number : undefined;
    case "range": {
      if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
      const clamped = Math.min(setting.max, Math.max(setting.min, v));
      return Math.min(setting.max, setting.min + Math.round((clamped - setting.min) / setting.step) * setting.step);
    }
  }
}

/** Settings from a save: each value it may hold, the rest defaulted. */
export function decodeSettings(raw: any): Settings {
  const s = raw ?? {}, out = defaultSettings() as Record<SettingKey, unknown>;
  for (const k of KEYS) out[k] = settingValue(SETTINGS[k], s[k]) ?? out[k];
  // Existing saves with enabled cheats keep them when acquiring the master switch.
  if (typeof s.developerMode !== "boolean") out.developerMode = DEV_OPTIONS.some(k => out[k] === true);
  if (!out.developerMode) for (const k of DEV_OPTIONS) out[k] = false;
  return out as Settings;
}
