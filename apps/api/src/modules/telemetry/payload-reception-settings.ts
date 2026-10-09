import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { DatabaseService } from '../../database/database.service.js';
import { decodePayloadMessages, validateReceiveConfig, type PayloadReceiveConfig } from './payload-receive.js';
import { normalizePayloadEnvelope, validatePayloadProfile, type PayloadEnvelope, type PayloadProfile } from './payload-profile.js';
import { payloadTopic } from './payload-ingestion.js';
import { parseBoundedPayload } from './ingestion-limiter.js';

type Device = { externalDeviceId:string;config:PayloadProfile };
export class PayloadReceptionSettings {
 constructor(private readonly db:DatabaseService) {}
 async context(siteId:string) {
  const gateway=(await this.db.query<{gatewayId:string;externalSiteId:string;externalGatewayId:string;endpoint:string}>(`SELECT g.id AS "gatewayId",g.endpoint,s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.id=$1 AND s.status<>'archived' AND g.protocol='mqtt' AND g.endpoint LIKE 'solar/v1/%'`,[siteId])).rows[0];
  if(!gateway?.externalSiteId || !gateway.externalGatewayId || !gateway.endpoint?.startsWith("solar/v1/"))throw new NotFoundException('Standard MQTT gateway not found');
  const devices=(await this.db.query<Device>(`SELECT d.external_device_id AS "externalDeviceId",p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.gateway_id=$1 AND d.site_id=$2`,[gateway.gatewayId,siteId])).rows;
  return {...gateway,devices};
 }
 async read(gatewayId:string) {
  const revision=(await this.db.query('SELECT id,version,config,created_at AS "createdAt" FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1',[gatewayId])).rows[0];
  return revision??{id:null,version:0,config:validateReceiveConfig({}),createdAt:null};
 }
 validateTargets(config:PayloadReceiveConfig,devices:Device[]) {
  for(const alias of config.deviceAliases) {
   const target=devices.find(device=>device.externalDeviceId===alias.target);
   if(!target)throw new BadRequestException(`Alias target ${alias.target} is not a registered device in this gateway`);
   if(alias.profileAlias && (alias.profileAlias.targetId!==(target.config.sourceProfile?.id??target.config.id) || alias.profileAlias.targetVersion!==(target.config.sourceProfile?.version??target.config.version)))throw new BadRequestException(`Target profile for ${alias.target} must match its assigned revision`);
  }
 }
 async save(siteId:string,input:unknown) {
  const parsed=z.object({baseVersion:z.number().int().min(0),config:z.unknown()}).strict().safeParse(input);
  if(!parsed.success)throw new BadRequestException('Expected configuration and baseVersion');
  let config:PayloadReceiveConfig;
  try {config=validateReceiveConfig(parsed.data.config);}catch(error){throw new BadRequestException(error instanceof Error?error.message:'Invalid receive configuration');}
  const context=await this.context(siteId);
  const client=await this.db.pool.connect();
  try {
   await client.query('BEGIN');
   // Serialize settings saves and attachments, then stabilize assigned profiles.
   await client.query('SELECT id FROM gateways WHERE id=$1 FOR UPDATE',[context.gatewayId]);
   const devices=(await client.query<Device>(`SELECT d.external_device_id AS "externalDeviceId",p.config FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.gateway_id=$1 AND d.site_id=$2 FOR SHARE OF d`,[context.gatewayId,siteId])).rows;
   this.validateTargets(config,devices);
   const previous=(await client.query('SELECT version FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1',[context.gatewayId])).rows[0];
   if((previous?.version??0)!==parsed.data.baseVersion)throw new ConflictException('Receive configuration changed; reload before saving');
   const revision=(await client.query('INSERT INTO gateway_payload_receive_revisions(id,gateway_id,version,config) VALUES($1,$2,$3,$4::jsonb) RETURNING id,version,config,created_at AS "createdAt"',[randomUUID(),context.gatewayId,parsed.data.baseVersion+1,JSON.stringify(config)])).rows[0];
   await client.query('COMMIT');return revision;
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
 }
 async preview(siteId:string,body:{config:unknown;input:unknown;topic:string}) {
  const context=await this.context(siteId);
  return this.previewContext(context,body);
 }
 previewContext(context:{externalSiteId:string;externalGatewayId:string;devices:Device[]},body:{config:unknown;input:unknown;topic:string}) {
  const config=validateReceiveConfig(body.config);this.validateTargets(config,context.devices);
  const prefix=`solar/v1/sites/${context.externalSiteId}/gateways/${context.externalGatewayId}/devices/`;
  if(typeof body.topic!=='string'||!body.topic.startsWith(prefix)||!/^\w[\w-]*\/telemetry$/.test(body.topic.slice(prefix.length)))throw new BadRequestException('Publish topic must specify a device in this gateway, without + or #');
  const decoded=decodePayloadMessages(parseBoundedPayload(JSON.stringify(body.input)),config,{siteId:context.externalSiteId,gatewayId:context.externalGatewayId});
  const messages: {key:string;status:'valid'|'rejected';deviceId?:string;messageId?:string;fields?:number;reason?:string;historical?:boolean}[]=decoded.errors.map(error=>({...error,status:'rejected'}));
  for(const message of decoded.messages) {
   const device=message.envelope.device as {deviceId?:string}|undefined;
   try {
    const binding=context.devices.find((candidate:Device)=>candidate.externalDeviceId===device?.deviceId);
    if(!binding)throw new Error('No registered device/profile binding');
    const normalized=normalizePayloadEnvelope(message.envelope,{profile:validatePayloadProfile(binding.config),siteId:context.externalSiteId,gatewayId:context.externalGatewayId,deviceId:binding.externalDeviceId},decoded.batch?payloadTopic(context.externalSiteId,context.externalGatewayId,binding.externalDeviceId):body.topic);
    if(new Date(normalized.polledAt).getTime()>Date.now()+30000)throw new Error('Source timestamp is in the future');
    messages.push({key:message.key,status:'valid',deviceId:normalized.deviceId,messageId:normalized.messageId,fields:normalized.samples.length,historical:Date.now()-new Date(normalized.polledAt).getTime()>120000});
   }catch(error){messages.push({key:message.key,status:'rejected',...(device?.deviceId?{deviceId:device.deviceId}:{}),reason:error instanceof Error?error.message:'Invalid message'});}
  }
  return {messages,ignored:decoded.ignored,batch:decoded.batch,persisted:false};
 }
 async fixtures(siteId:string) {
  const context=await this.context(siteId),now=new Date().toISOString();let sequence=randomInt(1,4294967295-512);
  const payloads:Record<string,PayloadEnvelope>={};
  for(const device of context.devices as Device[]) {
   const config=validatePayloadProfile(device.config);
   for(const group of config.pollGroups) {
    const fields=config.fields.filter(field=>field.pollGroup===group);if(!fields.length)continue;
    sequence++;
    payloads[`${device.externalDeviceId}.${group}`]={schemaVersion:'1.1',messageType:'telemetry',messageId:randomUUID(),sequence,lotNumber:sequence,siteId:context.externalSiteId,gatewayId:context.externalGatewayId,device:{deviceId:device.externalDeviceId,deviceType:config.deviceType,profileId:config.sourceProfile?.id??config.id,profileVersion:config.sourceProfile?.version??config.version},pollGroup:group,timestamps:{polledAt:now,sentAt:now},data:{values:Object.fromEntries(fields.map(field=>[field.sourceTag??field.tag,1])),units:Object.fromEntries(fields.map(field=>[field.sourceTag??field.tag,field.sourceUnit]))},quality:{status:'good',communication:'online'}};
   }
  }
  return {schemaVersion:'1.1',payloads};
 }
}
