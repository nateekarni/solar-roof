import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../database/database.service.js';
import { logicalPayloadDigest, normalizePayloadEnvelope, type PayloadProfile } from './payload-profile.js';
import { decodePayloadMessages, validateReceiveConfig } from './payload-receive.js';
export function payloadTopic(site: string, gateway: string, device = '+') { return `solar/v1/sites/${site}/gateways/${gateway}/devices/${device}/telemetry`; }
export function gatewayPrefix(site: string, gateway: string) { return `solar/v1/sites/${site}/gateways/${gateway}`; }
interface RegisteredBinding {deviceId:string;siteId:string;gatewayId:string;externalSiteId:string;externalGatewayId:string;externalDeviceId:string;revisionId:string;config:PayloadProfile;billing:boolean}
export class PayloadIngestion {
 constructor(private readonly db: DatabaseService) {}
 async acceptMany(topic: string, input: unknown, brokerId: string | null, acknowledged: (ack: NonNullable<Awaited<ReturnType<PayloadIngestion['accept']>>>) => void) {
  const match=/^solar\/v1\/sites\/([A-Za-z0-9_-]{1,128})\/gateways\/([A-Za-z0-9_-]{1,128})\/devices\/([A-Za-z0-9_-]{1,128})\/telemetry$/.exec(topic);
  if (!match) return;
  const context=(await this.db.query<{siteId:string;gatewayId:string;externalSiteId:string;externalGatewayId:string}>(`SELECT g.id AS "gatewayId",g.site_id AS "siteId",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND s.status<>'archived' AND g.protocol='mqtt' AND g.mqtt_broker_id IS NOT DISTINCT FROM $3::uuid`,[match[1],match[2],brokerId])).rows[0];
  // Existing single-envelope validation still verifies device, broker and topic scope.
  if(!context) { const ack=await this.accept(topic,input,brokerId);if(ack)acknowledged(ack);return; }
  const revision=(await this.db.query('SELECT id,config FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1',[context.gatewayId])).rows[0];
  let decoded;
  try { decoded=decodePayloadMessages(input,validateReceiveConfig(revision?.config??{}),{siteId:context.externalSiteId,gatewayId:context.externalGatewayId}); }
  catch(error){await this.reject(topic,error instanceof Error?error.message:'Invalid message collection',context);return;}
  for(const error of decoded.errors)await this.reject(topic,`${error.key}: ${error.reason}`,context);
  for(const message of decoded.messages) {
   let envelope=message.envelope;
   // A retry of the identical logical source message retains its original mapping,
   // even when receive aliases or the assigned profile have subsequently changed.
   if(typeof envelope.messageId==='string') {
    const replay=(await this.db.query<{rawPayload:Record<string,unknown>;sourcePayload:unknown}>(`SELECT raw_payload AS "rawPayload",source_payload AS "sourcePayload" FROM payload_messages WHERE gateway_id=$1 AND message_id=$2 LIMIT 33`,[context.gatewayId,envelope.messageId])).rows;
    const original=replay.find(row=>row.sourcePayload && logicalPayloadDigest(row.sourcePayload)===logicalPayloadDigest(message.original));
    if(original)envelope=original.rawPayload;
   }
   const device=envelope.device as {deviceId?:unknown}|undefined;
   if(envelope.siteId!==context.externalSiteId || envelope.gatewayId!==context.externalGatewayId || !device || typeof device.deviceId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(device.deviceId)) {
    await this.reject(topic,`${message.key}: Message identities do not match receiving gateway or registered aliases`,context);continue;
   }
   const childTopic=decoded.batch?payloadTopic(context.externalSiteId,context.externalGatewayId,device.deviceId):topic;
   try {
    const ack=await this.accept(childTopic,envelope,brokerId,{revisionId:revision?.id??null,original:message.original});
    if(ack)acknowledged(ack);
   }catch(error){await this.reject(topic,`${message.key}: Unable to persist message; retry with the same messageId`,context);}
  }
 }
 async reject(topic: string, reason: string, context?: {siteId: string; gatewayId: string}) {
  if (!context) return;
  await this.db.query(`INSERT INTO payload_rejections (id,site_id,gateway_id,topic,reason) VALUES ($1,$2,$3,$4,$5)`,[randomUUID(),context.siteId,context.gatewayId,topic.slice(0,1024),reason.slice(0,2048)]);
  // Bound diagnostics to the last 100 rejections per registered gateway.
  await this.db.query(`DELETE FROM payload_rejections WHERE gateway_id=$1 AND id NOT IN (SELECT id FROM payload_rejections WHERE gateway_id=$1 ORDER BY received_at DESC,id DESC LIMIT 100)`,[context.gatewayId]);
 }
 async accept(topic: string, input: unknown, brokerId?: string | null, reception?: {revisionId:string|null;original:unknown}) {
  const segments=/^solar\/v1\/sites\/([A-Za-z0-9_-]{1,128})\/gateways\/([A-Za-z0-9_-]{1,128})\/devices\/([A-Za-z0-9_-]{1,128})\/telemetry$/.exec(topic);
  if (!segments) return null;
  const site=segments[1]!, gateway=segments[2]!, device=segments[3]!;
  const found=await this.db.query<RegisteredBinding>(`SELECT d.id AS "deviceId",d.site_id AS "siteId",g.id AS "gatewayId",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId",d.external_device_id AS "externalDeviceId",p.id AS "revisionId",p.config,EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.active) AS billing
   FROM devices d JOIN gateways g ON g.id=d.gateway_id AND g.site_id=d.site_id JOIN sites s ON s.id=d.site_id JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
   WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND d.external_device_id=$3 AND s.status<>'archived' AND g.protocol='mqtt' AND ($4::boolean OR g.mqtt_broker_id IS NOT DISTINCT FROM $5::uuid)`,[site,gateway,device,brokerId===undefined,brokerId??null]);
  const entity=found.rows.length===1?found.rows[0]:undefined;
  if (!entity) {
   const context=await this.db.query<{siteId:string;gatewayId:string}>(`SELECT g.site_id AS "siteId",g.id AS "gatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND s.status<>'archived'`,[site,gateway]);
   await this.reject(topic,'No registered device/profile binding',context.rows[0]);return null;
  }
  // A committed retry is interpreted using its original immutable revision, even after upgrade.
  const messageHint=input && typeof input==='object' && 'messageId' in input ? input.messageId : undefined;
  const previous=typeof messageHint==='string' ? await this.db.query<{config:PayloadProfile}>(`SELECT p.config FROM payload_messages m JOIN payload_profile_revisions p ON p.id=m.profile_revision_id WHERE m.gateway_id=$1 AND m.device_id=$2 AND m.message_id=$3`,[entity.gatewayId,entity.deviceId,messageHint]) : null;
  let normalized;
  try { normalized=normalizePayloadEnvelope(input,{profile:previous?.rows[0]?.config??entity.config,siteId:entity.externalSiteId,gatewayId:entity.externalGatewayId,deviceId:entity.externalDeviceId},topic);
   if(new Date(normalized.polledAt).getTime()>Date.now()+30000)throw Error('Source timestamp is in the future');
  }catch(error){await this.reject(topic,error instanceof Error?error.message:'Invalid payload',entity);return null;}
  const n=normalized, receivedAt=new Date(), messageId=randomUUID();
  const client=await this.db.pool.connect();let acceptedAt: Date|string=receivedAt, conflict=false;
  try {
   await client.query('BEGIN');
   const inserted=await client.query(`INSERT INTO payload_messages (id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped,receive_revision_id,source_payload)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15::jsonb) ON CONFLICT (gateway_id,device_id,message_id) DO NOTHING RETURNING id`,
    [messageId,entity.gatewayId,entity.deviceId,n.messageId,n.digest,receivedAt,entity.revisionId,n.lotNumber,n.sequence,n.polledAt,n.sentAt,JSON.stringify(n.raw),JSON.stringify(n.unmapped),reception?.revisionId??null,JSON.stringify(reception?.original??n.raw)]);
   if(!inserted.rows.length) {
    const original=await client.query(`SELECT digest,accepted_at AS "acceptedAt" FROM payload_messages WHERE gateway_id=$1 AND device_id=$2 AND message_id=$3`,[entity.gatewayId,entity.deviceId,n.messageId]);
    if(!original.rows[0])throw Error('Replay record missing');
    conflict=original.rows[0].digest!==n.digest;acceptedAt=original.rows[0].acceptedAt;
   }else {
    for(const s of n.samples)await client.query(`INSERT INTO payload_samples (id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,measured_at,received_at,quality,communication)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[randomUUID(),messageId,entity.siteId,entity.gatewayId,entity.deviceId,entity.revisionId,s.tag,s.value,s.unit,s.rawValue,s.rawUnit,s.pollGroup,s.polledAt,s.measuredAt??null,receivedAt,n.quality.status,n.quality.communication]);
    const healthy=['good','complete','ok'].includes(n.quality.status.toLowerCase())&&['online','ok','connected','success'].includes(n.quality.communication.toLowerCase());
    const energy=entity.billing&&healthy?n.samples.find(s=>s.role==='billing-import')?.value??null:null;
    const find=(tag:string)=>n.samples.find(s=>s.tag===tag)?.value??null;
    const quality=!healthy?'invalid':Date.now()-new Date(n.polledAt).getTime()<=120000?'complete':'partial';
    // Existing energy_raw_dirty trigger participates in this transaction.
    await client.query(`INSERT INTO telemetry_raw (id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,payload_profile_revision_id,voltage_v,current_a,active_power_w,apparent_power_va,reactive_power_var,frequency_hz,power_factor)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'kWh',$8,$9,'total_energy',$7,$10,$11,$12,$13,$14,$15,$16,$17)`,[randomUUID(),entity.deviceId,entity.siteId,n.polledAt,receivedAt,JSON.stringify(n.raw),energy,quality,`payload:${messageId}`,entity.revisionId,find('electrical.voltage.l1_n'),find('electrical.current.l1'),n.samples.find(s=>s.role==='active-power'&&s.unit==='W')?.value??null,find('power.apparent.total'),find('power.reactive.total'),find('electrical.frequency'),find('power.factor.total')]);
    await client.query(`UPDATE gateways SET last_seen_at=GREATEST(last_seen_at,$2::timestamptz),status=CASE WHEN $2::timestamptz>=now()-interval '120 seconds' THEN 'online' ELSE status END WHERE id=$1`,[entity.gatewayId,n.polledAt]);
   }
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  if(conflict){await this.reject(topic,'Conflicting reuse of messageId',entity);return null;}
  return {schemaVersion:'1.1',messageType:'dataAcept',siteId:n.siteId,gatewayId:n.gatewayId,lotNumber:n.lotNumber,messageId:n.messageId,status:'accepted',acceptedAt:new Date(acceptedAt).toISOString()};
 }
}
