/** A setting that is on or off. */
type Toggle = { kind: "toggle"; default: boolean; page?: { id: string; label: string; invert?: true } };
/** A setting that is one of a fixed list of values, each with its label. */
type Choice = { kind: "choice"; default: string | number; choices: readonly (readonly [string | number, string])[]; page?: { id: string; label: string } };
/** A number kept within `min`–`max`; out-of-range saved values are clamped
 * and rounded, not rejected. */
type Range = { kind: "range"; default: number; min: number; max: number; step: number; page?: { id: string; label: string; aria: string } };
export type Setting = Toggle | Choice | Range;

/** Every player setting: its default, what a save may hold, and, when it has
 * a `page`, its control's id and label on the Settings page. The Settings
 * type, the defaults and the save decoder all come from this table, so a new
 * setting is one row here. Rows are in saved key order. */
export const SETTINGS = {
  showHealthbars: { kind: "toggle", default: true, page: { id: "enemy-healthbars", label: "Healthbars for tough enemies" } },
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
  /** The Defend palette lists items the player has none of (greyed); off, only those owned. */
  showEmpty: { kind: "toggle", default: false, page: { id: "show-empty", label: "Show items you have none of" } },
  /** Items dragged on the Defend board ride a few blocks above the pointer,
   * clear of the finger. Until the player sets it, on for touch screens and
   * off for a mouse (`touchFirst`). */
  raiseDrag: { kind: "toggle", default: false, page: { id: "raise-drag", label: "Carry dragged items above the finger" } },
  /** Faint lines round the Defend board's tiles, and how strong, in percent. */
  tileGrid: { kind: "toggle", default: false, page: { id: "tile-grid", label: "Tile grid lines" } },
  gridOpacity: { kind: "range", default: 15, min: 5, max: 60, step: 1, page: { id: "grid-opacity", label: "Grid line opacity", aria: "Tile grid line opacity, percent" } },
  /** The synthesized knocks, chimes, horns and bells. */
  soundOff: { kind: "toggle", default: false, page: { id: "sound", label: "Sound", invert: true } },
  /** The world's background: rain, wind, thunder, birdsong, crickets. */
  ambienceOff: { kind: "toggle", default: false, page: { id: "ambience", label: "Ambient sound", invert: true } },
  /** Retained visual preference for procedural cloth, glazing and sampling.
   * The checkbox no longer enables any PNG sprite replacements. */
  pixelArt: { kind: "toggle", default: true, page: { id: "pixel-art", label: "Pixel Art" } },
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
  /** Dev: Smithy and Knowledge research completes when started, without workers. */
  instantResearch: { kind: "toggle", default: false, page: { id: "dev-instant", label: "Instantaneous research (Study only)" } },
  /** Dev: every rank of the Smithy's rows (or of one skill tree) counts as bought, while on
   * (the ranks actually bought are kept, and count again once off). */
  devSmithy: { kind: "toggle", default: false, page: { id: "dev-smithy", label: "Smithy" } },
  devCommand: { kind: "toggle", default: false, page: { id: "dev-command", label: "Command" } },
  devStewardship: { kind: "toggle", default: false, page: { id: "dev-stewardship", label: "Stewardship" } },
  devMine: { kind: "toggle", default: false, page: { id: "dev-mine", label: "Mine" } },
  devLibrary: { kind: "toggle", default: false, page: { id: "dev-library", label: "Library" } },
} as const satisfies Record<string, Setting>;

export type SettingKey = keyof typeof SETTINGS;
export const DEV_OPTIONS = ["devMode", "devTowers", "instantResearch", "devSmithy", "devCommand", "devStewardship", "devMine", "devLibrary"] as const satisfies readonly SettingKey[];
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
    case "range": return typeof v === "number" && Number.isFinite(v) ? Math.round(Math.min(setting.max, Math.max(setting.min, v))) : undefined;
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
