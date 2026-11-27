export type SupportedLanguage = "bg" | "en";

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";
export const LANGUAGE_STORAGE_KEY = "HomeBudget_Language";

export interface LanguageOption {
  code: SupportedLanguage;
  flag: string;
  nativeName: string;
  englishName: string;
  locale: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  {
    code: "bg",
    flag: "🇧🇬",
    nativeName: "Български",
    englishName: "Bulgarian",
    locale: "bg-BG",
  },
  {
    code: "en",
    flag: "🇬🇧",
    nativeName: "English",
    englishName: "English",
    locale: "en-US",
  },
];

export type TranslationShape<T> = {
  readonly [K in keyof T]: T[K] extends readonly string[]
    ? readonly string[]
    : T[K] extends string
    ? string
    : TranslationShape<T[K]>;
};
