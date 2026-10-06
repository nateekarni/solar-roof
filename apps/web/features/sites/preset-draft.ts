import type {PayloadProfile,PayloadRevision} from './payload-contracts';
import {assignStandardFieldRole} from '../shared/payload-field-roles';
import {derivedConversion} from '@solar/api-contracts/unit-conversion';
export function mergePresetCatalog(catalog:PayloadRevision[],updated:PayloadRevision[],deviceType:string){return [...catalog.filter(r=>r.config.deviceType!==deviceType),...updated];}
export function presetDeviceType(catalog:PayloadRevision[],device:{profileRevisionId:string;profileDeviceType?:string;deviceType?:string}){
 return device.profileDeviceType??catalog.find(r=>r.id===device.profileRevisionId)?.config.deviceType??(device.deviceType==='logger'?'solar-logger':'energy-meter');
}
export function nextPresetVersion(revisions:PayloadRevision[],profileId:string){
 const versions=revisions.filter(r=>r.profileId===profileId).map(r=>r.version.split('.').map(Number)).sort((a,b)=>b[0]!-a[0]!||b[1]!-a[1]!||b[2]!-a[2]!);
 const current=versions[0]??[1,0,-1];return `${current[0]}.${current[1]}.${current[2]!+1}`;
}
export function editPresetDraft(revision:PayloadRevision,revisions:PayloadRevision[]):PayloadProfile{
 return {...structuredClone(revision.config),version:nextPresetVersion(revisions,revision.profileId),sourceProfile:revision.config.sourceProfile??{id:revision.config.id,version:revision.config.version}};
}
export function presetFromPayload(input:unknown):PayloadProfile{
 const root=input as Record<string,any>;
 if(!root||typeof root!=='object')throw Error('JSON ต้องเป็น object');
 const list=root.payloads?Object.values(root.payloads):[root];
 const messages=list.filter((m:any)=>m?.messageType==='telemetry') as Record<string,any>[];
 const first=messages[0];if(!first?.device?.profileId||!first.device.profileVersion)throw Error('ต้องมี telemetry, profileId และ profileVersion');
 const related=messages.filter(m=>m.device?.deviceId===first.device.deviceId);
 const fields=new Map<string,PayloadProfile['fields'][number]>();
 for(const m of related){
  if(m.device.profileId!==undefined&&m.device.profileId!==first.device.profileId||m.device.profileVersion!==undefined&&m.device.profileVersion!==first.device.profileVersion)throw Error('อุปกรณ์เดียวกันมี source profile ต่างกัน');
  for(const tag of Object.keys(m.data?.values??{})){
   const unit=m.data?.units?.[tag];if(typeof unit!=='string')throw Error(`ไม่มีหน่วยของ ${tag}`);
   const targetUnit=unit==='Wh'?'kWh':unit==='varh'?'kvarh':unit;
   const previous=fields.get(tag);if(previous&&(previous.sourceUnit!==unit||previous.pollGroup!==m.pollGroup))throw Error(`หน่วยหรือกลุ่มของ ${tag} ไม่ตรงกัน`);
   fields.set(tag,assignStandardFieldRole({tag,displayName:tag,pollGroup:m.pollGroup,sourceUnit:unit,targetUnit,conversion:derivedConversion(unit,targetUnit)}));
  }
 }
 if(!fields.size)throw Error('ไม่พบรายการ data.values');
 return {id:first.device.profileId,version:'1.0.0',sourceProfile:{id:first.device.profileId,version:first.device.profileVersion},schemaVersion:'1.1',displayName:[first.device.manufacturer,first.device.model].filter(Boolean).join(' ')||first.device.profileId,deviceType:first.device.deviceType,pollGroups:[...new Set([...fields.values()].map(f=>f.pollGroup))],fields:[...fields.values()]};
}
