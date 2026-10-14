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

/** Audit evidence retains business changes without duplicating payment identifiers or image bytes. */
export function financialAuditEvidence(value:unknown) {
  const sensitive=new Set(['accountNumber','promptpayId','logoUrl','signatureDataUri']);
  const redact=(entry:JsonValue,key=''):JsonValue=>{
    if(typeof entry==='string'&&sensitive.has(key))return entry?{sha256:createHash('sha256').update(entry,'utf8').digest('hex')}:null;
    if(Array.isArray(entry))return entry.map(item=>redact(item));
    if(entry!==null&&typeof entry==='object')return Object.fromEntries(Object.entries(entry).map(([name,item])=>[name,redact(item,name)]));
    return entry;
  };
  const evidence=redact(JSON.parse(canonicalFinancialConfiguration(value))) as Record<string,JsonValue>;
  return {...evidence,configHash:financialConfigurationHash(value)};
}
