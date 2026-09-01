import { th } from "./th.js";

export type TranslationDictionary = typeof th;

export function createTranslator(dictionary: TranslationDictionary) {
  return function t(key: string): string {
    const segments = key.split(".");
    let current: unknown = dictionary;

    for (const segment of segments) {
      if (typeof current !== "object" || current === null || !(segment in current)) {
        return key;
      }

      current = (current as Record<string, unknown>)[segment];
    }

    return typeof current === "string" ? current : key;
  };
}

export const t = createTranslator(th);

