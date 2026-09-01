import { th } from "./th.js";
export type TranslationDictionary = typeof th;
export type TranslationVariables = Record<string, string | number>;
export function createTranslator(dictionary: TranslationDictionary) { return function t(key: string, variables: TranslationVariables = {}): string { const segments = key.split("."); let current: unknown = dictionary; for (const segment of segments) { if (typeof current !== "object" || current === null || !(segment in current)) return key; current = (current as Record<string, unknown>)[segment]; } if (typeof current !== "string") return key; return current.replace(/\{(\w+)\}/g, (_, name: string) => String(variables[name] ?? `{${name}}`)); }; }
export const t = createTranslator(th);
