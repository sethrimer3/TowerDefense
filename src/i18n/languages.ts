/** Available UI languages, in the same order as the translation columns. */
export const LANGUAGES = [
  { code: "en", name: "English", script: "latin" },
  { code: "es", name: "Español", script: "latin" },
  { code: "fr", name: "Français", script: "latin" },
  { code: "de", name: "Deutsch", script: "latin" },
  { code: "pt-BR", name: "Português", script: "latin" },
  { code: "it", name: "Italiano", script: "latin" },
  { code: "ja", name: "日本語", script: "cjk" },
  { code: "ko", name: "한국어", script: "cjk" },
  { code: "zh-CN", name: "简体中文", script: "cjk" },
] as const;
export type Language = (typeof LANGUAGES)[number]["code"];
export const LANGUAGE_CHOICES = LANGUAGES.map(l => [l.code, l.name] as const);
export const isLanguage = (value: unknown): value is Language => LANGUAGES.some(l => l.code === value);
export type TranslationRow = readonly [key: string, en: string, es: string, fr: string, de: string, pt: string, it: string, ja: string, ko: string, zh: string];
