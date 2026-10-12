import type {PayloadField} from '../sites/payload-contracts';
export function parsePayloadFieldsJson(text:string,singleField=false):PayloadField[]{
 const value:unknown=JSON.parse(text);
 if(!Array.isArray(value))throw new Error('JSON ต้องเป็นรายการข้อมูลแบบ array');
 if(singleField&&value.length!==1)throw new Error('ต้องมีข้อมูลหนึ่งรายการ');
 const tags=new Set<string>();
 for(const item of value){
  if(!item||typeof item!=='object'||Array.isArray(item))throw new Error('แต่ละรายการต้องเป็น object');
  for(const key of ['tag','displayName','pollGroup','sourceUnit','targetUnit'])if(typeof item[key]!=='string')throw new Error(`${key} ต้องเป็นข้อความ`);
  if(!['identity','wh-to-kwh','varh-to-kvarh','auto-v1'].includes(item.conversion))throw new Error('conversion ไม่ถูกต้อง');
  if(item.role!==undefined&&!['billing-import','active-power','none'].includes(item.role))throw new Error('role ไม่ถูกต้อง');
  if(item.required!==undefined&&typeof item.required!=='boolean')throw new Error('required ต้องเป็น boolean');
  if(item.sourceTag!==undefined&&typeof item.sourceTag!=='string')throw new Error('sourceTag ต้องเป็นข้อความ');
  if(item.tag&&tags.has(item.tag))throw new Error(`tag ซ้ำ: ${item.tag}`);
  tags.add(item.tag);
 }
 return value;
}
