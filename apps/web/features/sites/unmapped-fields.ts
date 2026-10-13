export type UnmappedField={tag:string;rawValue:unknown;rawUnit:string};
export function unmappedFields(value:unknown):UnmappedField[]{
 if(!value||typeof value!=='object')return [];
 const rows=Array.isArray(value)?value.map((field,index)=>[String(index),field] as const):Object.entries(value);
 return rows.map(([key,field])=>{if(field&&typeof field==='object'&&!Array.isArray(field)){const record=field as Record<string,unknown>;return {tag:typeof record.tag==='string'?record.tag:key,rawValue:record.rawValue??record.value??null,rawUnit:typeof record.rawUnit==='string'?record.rawUnit:typeof record.unit==='string'?record.unit:''};}return {tag:key,rawValue:field,rawUnit:''};});
}
