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
  reduceMotion: { kind: "toggle", default: false, page: { id: "motion", label: "Reduce motion" } },
  /** The city's live dressing: wind-blown park grass, and drips, ripples
   * and reflections on the ponds. */
  effectsOff: { kind: "toggle", default: false, page: { id: "effects", label: "Grass and water effects", invert: true } },
  /** The synthesized knocks, chimes, horns and bells. */
  soundOff: { kind: "toggle", default: false, page: { id: "sound", label: "Sound", invert: true } },
  /** Unlimited currency: the Armory, Training and skill trees show ∞. */
  devMode: { kind: "toggle", default: false, page: { id: "dev-mode", label: "Dev mode (unlimited currency)" } },
  /** Dev: every purchase is allowed and costs nothing, and Training
   * completes at once. Unlocks and grants nothing itself. */
  freePurchases: { kind: "toggle", default: false, page: { id: "free-purchases", label: "Dev: free purchases (instant training)" } },
} as const satisfies Record<string, Setting>;

export type SettingKey = keyof typeof SETTINGS;
type ValueOf<S> = S extends { kind: "toggle" } ? boolean
  : S extends { choices: readonly (readonly [infer V, string])[] } ? V
  : number;
export type Settings = { -readonly [K in SettingKey]: ValueOf<(typeof SETTINGS)[K]> };

const KEYS = Object.keys(SETTINGS) as SettingKey[];

export function defaultSettings(): Settings {
  return Object.fromEntries(KEYS.map((k) => [k, SETTINGS[k].default])) as Settings;
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
  return out as Settings;
}
