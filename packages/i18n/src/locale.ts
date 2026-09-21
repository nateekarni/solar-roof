import { en } from "./en.js";
import { th } from "./th.js";

export type Locale = "th" | "en";
export type TranslationDictionary = typeof th;
export type TranslationVariables = Record<string, string | number>;

export const dictionaries: Record<Locale, TranslationDictionary> = {
  th,
  en: en as unknown as TranslationDictionary,
};

export function createTranslator(localeOrDict: Locale | TranslationDictionary = "th") {
  const dictionary = typeof localeOrDict === "string" ? (dictionaries[localeOrDict] ?? dictionaries.th) : localeOrDict;
  return function t(key: string, variables: TranslationVariables = {}): string {
    const segments = key.split(".");
    let current: unknown = dictionary;
    for (const segment of segments) {
      if (typeof current !== "object" || current === null || !(segment in current)) return key;
      current = (current as Record<string, unknown>)[segment];
    }
    if (typeof current !== "string") return key;
    return current.replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? `{${name}}`));
  };
}

export const t = createTranslator("th");
