import type {PayloadRevision,PayloadReceiveConfig} from './payload-contracts';
export type ImportedDevice={name:string;model:string;serialNumber:string;sourceId:string;externalDeviceId:string;sourceProfileId:string;sourceProfileVersion:string;payloadProfileRevisionId:string};
export type PayloadImportPlan={siteId:string;gatewayId:string;topic:string;messagesPath:string;devices:ImportedDevice[];receiveConfig:PayloadReceiveConfig;ignored:number};
const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const identifier=(value:unknown,label:string)=>{if(typeof value!=='string'||!/^[-A-Za-z0-9_]{1,128}$/.test(value))throw Error(`ไม่พบ ${label} ที่ถูกต้องใน JSON`);return value;};
export function readPayloadSample(input:unknown,topic:string,revisions:PayloadRevision[],locked?:{siteId:string;gatewayId:string}):PayloadImportPlan {
 if(JSON.stringify(input).length>1000000)throw Error('JSON ใหญ่เกิน 1 MB');
 const root=record(input),batch=root.payloads;const messages=batch?Array.isArray(batch)?batch:Object.values(record(batch)):[input];
 if(messages.length>32)throw Error('รองรับสูงสุด 32 ข้อความ');
 const scope=topic.trim()?topic.trim().match(/^solar\/v1\/sites\/([-A-Za-z0-9_]+)\/gateways\/([-A-Za-z0-9_]+)\/devices\/([-A-Za-z0-9_]+)\/telemetry$/):null;
 if(topic.trim()&&!scope)throw Error('Topic Publish ต้องระบุอุปกรณ์จริง ไม่มี + หรือ #');
 let sourceSite='',sourceGateway='',ignored=0;const devices:ImportedDevice[]=[];
 const metadata=new Map<string,Record<string,unknown>>();for(const raw of messages){const d=record(record(raw).device);if(typeof d.deviceId==='string'&&typeof d.profileId==='string'&&typeof d.profileVersion==='string')metadata.set(d.deviceId,d);}
 for(const raw of messages){const m=record(raw);if(m.messageType==='dataAcept'){ignored++;continue;}if(m.messageType!=='telemetry')throw Error('JSON ต้องมีข้อความ telemetry หรือชุด payloads');
 const site=identifier(m.siteId,'รหัสไซต์'),gateway=identifier(m.gatewayId,'รหัส Gateway');
 if(sourceSite&&(sourceSite!==site||sourceGateway!==gateway))throw Error('ข้อความในชุดต้องเป็นไซต์และ Gateway เดียวกัน');sourceSite=site;sourceGateway=gateway;
 const original=record(m.device),sourceId=identifier(original.deviceId,'รหัสอุปกรณ์'),d={...metadata.get(sourceId),...original},profileId=identifier(d.profileId,'รหัสโปรไฟล์');
 if(typeof d.profileVersion!=='string'||!d.profileVersion)throw Error('ไม่พบเวอร์ชันโปรไฟล์');
 const existing=devices.find(item=>item.sourceId===sourceId);if(existing){if(existing.sourceProfileId!==profileId||existing.sourceProfileVersion!==d.profileVersion)throw Error('อุปกรณ์เดียวกันมีโปรไฟล์ต่างกันในชุด');continue;}
 const revision=[...revisions].sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true})).find(r=>(r.config.sourceProfile?.id??r.config.id)===profileId&&(r.config.sourceProfile?.version??r.version)===d.profileVersion);
 devices.push({name:revision?.config.displayName??(typeof d.model==='string'?d.model:sourceId),model:typeof d.model==='string'?d.model:revision?.config.displayName??'',serialNumber:typeof d.serialNumber==='string'?d.serialNumber:'',sourceId,externalDeviceId:sourceId,sourceProfileId:profileId,sourceProfileVersion:d.profileVersion,payloadProfileRevisionId:revision?.id??''});
 }
 if(!devices.length)throw Error('ไม่พบข้อมูล telemetry ใน JSON');
 if(!batch&&scope&&!locked)devices[0]!.externalDeviceId=scope[3]!;
 const siteId=locked?.siteId??scope?.[1]??sourceSite,gatewayId=locked?.gatewayId??scope?.[2]??sourceGateway;
 return {siteId,gatewayId,topic:`solar/v1/sites/${siteId}/gateways/${gatewayId}/devices/+/telemetry`,messagesPath:batch?'payloads':'',devices,receiveConfig:{messagesPath:batch?'payloads':'',fieldPaths:{},deviceAliases:[],...(siteId!==sourceSite?{siteAlias:sourceSite}:{}),...(gatewayId!==sourceGateway?{gatewayAlias:sourceGateway}:{})},ignored};
}
export function importedReceiveConfig(plan:PayloadImportPlan,revisions:PayloadRevision[]):PayloadReceiveConfig {
 return {...plan.receiveConfig,deviceAliases:plan.devices.flatMap(d=>{const r=revisions.find(r=>r.id===d.payloadProfileRevisionId);if(!r)throw Error(`เลือก Preset ของ ${d.sourceId}`);const source=r.config.sourceProfile??{id:r.config.id,version:r.version};return d.sourceId!==d.externalDeviceId||source.id!==d.sourceProfileId||source.version!==d.sourceProfileVersion?[{source:d.sourceId,target:d.externalDeviceId,...(source.id!==d.sourceProfileId||source.version!==d.sourceProfileVersion?{profileAlias:{sourceId:d.sourceProfileId,sourceVersion:d.sourceProfileVersion,targetId:source.id,targetVersion:source.version}}:{})}]:[];})};
}
