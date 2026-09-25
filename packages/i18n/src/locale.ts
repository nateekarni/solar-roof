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
    let found = true;
    for (const segment of segments) {
      if (typeof current !== "object" || current === null || !(segment in current)) {
        found = false;
        break;
      }
      current = (current as Record<string, unknown>)[segment];
    }
    if (!found || typeof current !== "string") {
      if (dictionary !== dictionaries.th) {
        let fallbackCurrent: unknown = dictionaries.th;
        let fallbackFound = true;
        for (const segment of segments) {
          if (typeof fallbackCurrent !== "object" || fallbackCurrent === null || !(segment in fallbackCurrent)) {
            fallbackFound = false;
            break;
          }
          fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[segment];
        }
        if (fallbackFound && typeof fallbackCurrent === "string") {
          current = fallbackCurrent;
        } else {
          return key;
        }
      } else {
        return key;
      }
    }
    return (current as string).replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? `{${name}}`));
  };
}

export const t = createTranslator("th");
