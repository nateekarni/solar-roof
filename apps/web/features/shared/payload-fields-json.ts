import type {PayloadField} from '../sites/payload-contracts';

export function formatJsonSyntaxError(text: string, err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const posMatch = msg.match(/position\s+(\d+)/i);
  if (posMatch) {
    const pos = Number(posMatch[1]);
    const slice = text.slice(0, pos);
    const lines = slice.split('\n');
    const line = lines.length;
    const col = (lines[lines.length - 1]?.length ?? 0) + 1;
    return `SyntaxError (line ${line}, col ${col}): ${msg}`;
  }
  return `SyntaxError: ${msg}`;
}

export function parsePayloadFieldsJson(text:string,singleField=false):PayloadField[]{
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new Error(formatJsonSyntaxError(text, err));
  }
  if(!Array.isArray(value))throw new Error('[root] JSON ต้องเป็นรายการข้อมูลแบบ array ([...])');
  if(singleField&&value.length!==1)throw new Error(`[root] ต้องมีข้อมูล 1 รายการ (พบ ${value.length} รายการ)`);
  const tags=new Set<string>();
  for(let i=0;i<value.length;i++){
    const item = value[i];
    if(!item||typeof item!=='object'||Array.isArray(item))throw new Error(`[item #${i}] ต้องเป็น object ({...})`);
    const rec = item as Record<string, unknown>;
    for(const key of ['tag','displayName','pollGroup','sourceUnit','targetUnit']) {
      if(typeof rec[key]!=='string' || !String(rec[key]).trim()) {
        throw new Error(`[item #${i}] missing or invalid "${key}": string required`);
      }
    }
    if(!['identity','wh-to-kwh','varh-to-kvarh','auto-v1'].includes(String(rec.conversion))) {
      throw new Error(`[item #${i}] invalid "conversion": expected "identity" | "wh-to-kwh" | "varh-to-kvarh" | "auto-v1"`);
    }
    if(rec.role!==undefined&&!['billing-import','active-power','none'].includes(String(rec.role))) {
      throw new Error(`[item #${i}] invalid "role": expected "billing-import" | "active-power" | "none"`);
    }
    if(rec.required!==undefined&&typeof rec.required!=='boolean') {
      throw new Error(`[item #${i}] invalid "required": boolean required`);
    }
    if(rec.sourceTag!==undefined&&typeof rec.sourceTag!=='string') {
      throw new Error(`[item #${i}] invalid "sourceTag": string required`);
    }
    if(rec.registerAddress!==undefined&&typeof rec.registerAddress!=='string') {
      throw new Error(`[item #${i}] invalid "registerAddress": string required`);
    }
    const tag = String(rec.tag);
    if(tag&&tags.has(tag))throw new Error(`[item #${i}] duplicate "tag": "${tag}"`);
    tags.add(tag);
  }
  return value as PayloadField[];
}

