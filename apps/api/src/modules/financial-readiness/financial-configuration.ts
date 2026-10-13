import { createHash } from 'node:crypto';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Normalize with JSON semantics before sorting keys, including nested objects in arrays. */
export function canonicalFinancialConfiguration(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Financial configuration must be JSON serializable');
  const normalized: JsonValue = JSON.parse(json);
  return canonicalJson(normalized);
}

export function financialConfigurationHash(value: unknown): string {
  return createHash('sha256').update(canonicalFinancialConfiguration(value), 'utf8').digest('hex');
}
