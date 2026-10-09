export function emptySiteValues(): { name: string; schoolName: string; capacityMwp?: number; latitude?: number; longitude?: number; gatewayName: string; protocol: string; endpoint: string; meterPresetId: string; deviceModel: string; deviceSerial: string } {
  return { name: '', schoolName: '', gatewayName: '', protocol: '', endpoint: '', meterPresetId: '', deviceModel: '', deviceSerial: '' };
}
export function optionalNumber(value: string | number | null | undefined) { return value == null || (typeof value === 'string' && value.trim() === '') ? undefined : Number(value); }

import type {PayloadProfile,PayloadRevision,PayloadDevice} from './payload-contracts';
import {derivedConversion} from '@solar/api-contracts/unit-conversion';
export interface DeviceDraft {key:string;name:string;model:string;serialNumber:string;externalDeviceId:string;payloadProfileRevisionId:string;sourcePresetRevisionId?:string|undefined;config:PayloadProfile;dirty:boolean;profileDirty:boolean}
export function newDeviceDraft():DeviceDraft {return {key:crypto.randomUUID(),name:'',model:'',serialNumber:'',externalDeviceId:'',payloadProfileRevisionId:'',config:{id:'manual',version:'1.0.0',schemaVersion:'1.1',displayName:'Manual device',deviceType:'energy-meter',pollGroups:['energy'],fields:[]},dirty:false,profileDirty:true};}
export function selectDevicePreset(draft:DeviceDraft,preset:PayloadRevision|undefined,confirmed=false):DeviceDraft|null {
 if(draft.dirty&&!confirmed)return null;
 if(!preset)return {...draft,payloadProfileRevisionId:'',sourcePresetRevisionId:undefined,dirty:false,profileDirty:true};
 return {...draft,name:preset.config.displayName,model:preset.config.displayName,payloadProfileRevisionId:preset.id,sourcePresetRevisionId:preset.id,config:structuredClone(preset.config),dirty:false,profileDirty:false};
}
export function draftFromDevice(device:PayloadDevice):DeviceDraft {return {...newDeviceDraft(),key:device.id,name:device.name,model:device.model??'',serialNumber:device.serialNumber??'',externalDeviceId:device.externalDeviceId,payloadProfileRevisionId:device.profileRevisionId,sourcePresetRevisionId:device.sourcePresetRevisionId??(device.profileOwnerDeviceId?undefined:device.profileRevisionId),profileDirty:false,config:structuredClone(device.profileConfig??{id:device.profileId,version:device.profileVersion,schemaVersion:'1.1',displayName:device.model??device.name,deviceType:device.profileDeviceType??'energy-meter',pollGroups:[...new Set(device.fields?.map(f=>f.pollGroup)??[])],fields:device.fields??[],sourceProfile:{id:device.sourceProfileId??device.profileId,version:device.sourceProfileVersion??device.profileVersion}})};}
export function deviceProfilePayload(draft:DeviceDraft):{payloadProfileRevisionId?:string;localOverrideConfig?:PayloadProfile;sourcePresetRevisionId?:string} {return !draft.profileDirty&&draft.payloadProfileRevisionId?{payloadProfileRevisionId:draft.payloadProfileRevisionId}:{localOverrideConfig:structuredClone(draft.config),...(draft.sourcePresetRevisionId?{sourcePresetRevisionId:draft.sourcePresetRevisionId}:{})};}
export function validateDeviceProfile(config:PayloadProfile,billing:boolean,locale:string):string|null {
 const fail=(en:string,th:string)=>locale==='th'?th:en;
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(config.deviceType)||!config.fields.length||config.fields.length>256)return fail('Add 1–256 valid fields and a device type.','เพิ่มฟิลด์ 1–256 รายการและระบุประเภทอุปกรณ์');
 if(!config.pollGroups.length||config.pollGroups.length>16||config.pollGroups.some(g=>!/^[-A-Za-z0-9_]{1,128}$/.test(g)))return fail('Enter valid poll groups.','ระบุกลุ่มข้อมูลให้ถูกต้อง');
 if(new Set(config.pollGroups).size!==config.pollGroups.length||new Set(config.fields.map(f=>f.tag)).size!==config.fields.length||new Set(config.fields.map(f=>f.sourceTag??f.tag)).size!==config.fields.length)return fail('Duplicate field, source tag or poll group.','ฟิลด์ แท็กต้นทาง หรือกลุ่มข้อมูลซ้ำกัน');
 for(const f of config.fields){
  if(!/^[A-Za-z0-9_.-]{1,128}$/.test(f.tag)||!/^[-A-Za-z0-9_.]{1,128}$/.test(f.sourceTag??f.tag)||!f.displayName.trim()||f.displayName.length>128||!config.pollGroups.includes(f.pollGroup))return fail('Enter a valid tag, name and poll group for every field.','ระบุแท็ก ชื่อ และกลุ่มข้อมูลของทุกฟิลด์ให้ถูกต้อง');
  try{const conversion=derivedConversion(f.sourceUnit,f.targetUnit);if(conversion!==f.conversion && !(f.conversion==='auto-v1'&&conversion!=='identity'))throw Error();}catch{return fail('Select compatible source and target units.','เลือกหน่วยต้นทางและปลายทางที่แปลงกันได้');}
  if(f.role==='billing-import'&&(f.tag!=='energy.active.import.total'||f.targetUnit!=='kWh'))return fail('Billing field requires cumulative energy in kWh.','ฟิลด์พลังงานสะสมสำหรับบิลต้องมีหน่วย kWh');
  if(f.role==='active-power'&&f.targetUnit!=='W')return fail('Active power requires W.','กำลังไฟฟ้าต้องมีหน่วย W');
 }
 if(config.fields.filter(f=>f.role==='billing-import').length>1||config.fields.filter(f=>f.role==='active-power').length>1)return fail('Only one billing and active power field is allowed.','กำหนดฟิลด์พลังงานสะสมและกำลังไฟฟ้าอย่างละหนึ่งฟิลด์');
 if(billing&&(config.deviceType==='solar-logger'||config.fields.filter(f=>f.role==='billing-import').length!==1))return fail('Main meter requires one cumulative billing field in kWh.','มิเตอร์หลักต้องมีฟิลด์พลังงานสะสมสำหรับบิลหนึ่งฟิลด์ หน่วย kWh');
 return null;
}
export function validateDeviceDraft(draft:DeviceDraft,billing:boolean,locale:string,allowBlankCode=false):string|null {
 if(!draft.name.trim()||!draft.model.trim()||!draft.serialNumber.trim()||!(allowBlankCode&&!draft.externalDeviceId.trim())&&!/^[-A-Za-z0-9_]{1,128}$/.test(draft.externalDeviceId))return locale==='th'?'กรอกชื่อ รุ่น ซีเรียลจริง และ Device ID (A–Z, a–z, 0–9, _ หรือ -)':'Enter name, model, actual serial and Device ID (letters, digits, _ or -).';
 return validateDeviceProfile(draft.config,billing,locale);
}
