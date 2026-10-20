import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../../database/database.service.js';
import { logicalPayloadDigest, normalizePayloadEnvelope, type PayloadProfile } from './payload-profile.js';
import { decodePayloadMessages, validateReceiveConfig } from './payload-receive.js';
export function payloadTopic(site: string, gateway: string, device = '+') { return `solar/v1/sites/${site}/gateways/${gateway}/devices/${device}/telemetry`; }
export function gatewayPrefix(site: string, gateway: string) { return `solar/v1/sites/${site}/gateways/${gateway}`; }
export interface TelemetryAck {
  schemaVersion: '1.1';
  messageType: 'dataAcept';
  siteId: string;
  gatewayId: string;
  lotNumber: string | number;
  messageId: string;
  status: 'accepted';
  acceptedAt: string;
}
interface RegisteredBinding {deviceId:string;siteId:string;gatewayId:string;externalSiteId:string;externalGatewayId:string;externalDeviceId:string;revisionId:string;config:PayloadProfile;billing:boolean;appliedConfigVersion:number;activeConfigHash:string|null;controlManagedAt:string|null;billingSource?:{id:string;siteId:string;deviceId:string;profileRevisionId:string;sourceTag:string;canonicalTag:string;sourceUnit:string;targetUnit:string;conversion:string}|null}
export class PayloadIngestion {
 constructor(private readonly db: DatabaseService) {}
  async acceptMany(
    topic: string,
    input: unknown,
    brokerId: string | null,
    acknowledged: (ack: TelemetryAck) => void,
    _onConfigPush?: (siteId: string, gatewayId: string, config: Record<string, unknown>) => void
  ) {
   const match=/^solar\/v1\/sites\/([A-Za-z0-9_-]{1,128})\/gateways\/([A-Za-z0-9_-]{1,128})\/devices\/([A-Za-z0-9_-]{1,128})\/telemetry$/.exec(topic);
   if (!match || !match[1] || !match[2] || !match[3]) return;
   const site=match[1], gateway=match[2], topicDevice=match[3];
   const context=(await this.db.query<{siteId:string;gatewayId:string;externalSiteId:string;externalGatewayId:string}>(`SELECT g.id AS "gatewayId",g.site_id AS "siteId",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND s.status<>'archived' AND g.protocol='mqtt' AND g.mqtt_broker_id IS NOT DISTINCT FROM $3::uuid`,[site,gateway,brokerId])).rows[0];
   // Existing single-envelope validation still verifies device, broker and topic scope.
   if(!context) {
    const ack=await this.accept(topic,input,brokerId);
    if(ack)acknowledged(ack);
    return;
   }
  const receiveRevisions=(await this.db.query('SELECT id,version,config FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC',[context.gatewayId])).rows;
  let revision=receiveRevisions[0];
  const configurationVersion=input&&typeof input==='object'&&'configurationVersion' in input?input.configurationVersion:undefined;
  if(configurationVersion!==undefined){
   if(!Number.isSafeInteger(configurationVersion)||Number(configurationVersion)<1){await this.reject(topic,'Invalid configuration version',context);return;}
   const snapshot=(await this.db.query('SELECT config FROM gateway_configuration_revisions WHERE gateway_id=$1 AND version=$2',[context.gatewayId,configurationVersion])).rows[0];
   if(!snapshot){await this.reject(topic,'No registered configuration version',context);return;}
   revision={id:snapshot.config.receiveRevisionId,config:snapshot.config.receiveConfig};
  }else if(receiveRevisions.length>1){
   const interpretations=new Set<string>();
   for(const candidate of receiveRevisions){
    try{const decoded=decodePayloadMessages(input,validateReceiveConfig(candidate.config),{siteId:context.externalSiteId,gatewayId:context.externalGatewayId});interpretations.add(logicalPayloadDigest({messages:decoded.messages.map(m=>m.envelope),errors:decoded.errors}));}
    catch{interpretations.add('invalid');}
   }
   if(interpretations.size>1){await this.reject(topic,'Ambiguous receive configuration; specify registered configurationVersion',context);return;}
  }
  let decoded;
  try { decoded=decodePayloadMessages(input,validateReceiveConfig(revision?.config??{}),{siteId:context.externalSiteId,gatewayId:context.externalGatewayId}); }
  catch(error){await this.reject(topic,error instanceof Error?error.message:'Invalid message collection',context);return;}
  for(const error of decoded.errors)await this.reject(topic,`${error.key}: ${error.reason}`,context);
  for(const message of decoded.messages) {
   let envelope=configurationVersion===undefined?message.envelope:{...message.envelope,configurationVersion};
   // A retry of the identical logical source message retains its original mapping,
   // even when receive aliases or the assigned profile have subsequently changed.
   if(typeof envelope.messageId==='string') {
    const replay=(await this.db.query<{rawPayload:Record<string,unknown>;sourcePayload:unknown}>(`SELECT raw_payload AS "rawPayload",source_payload AS "sourcePayload" FROM payload_messages WHERE gateway_id=$1 AND message_id=$2 LIMIT 33`,[context.gatewayId,envelope.messageId])).rows;
    const original=replay.find(row=>row.sourcePayload && logicalPayloadDigest(row.sourcePayload)===logicalPayloadDigest(message.original));
    if(original)envelope=original.rawPayload;
   }
   const device=envelope.device as {deviceId?:unknown}|undefined;
   if(envelope.siteId!==context.externalSiteId || envelope.gatewayId!==context.externalGatewayId || !device || typeof device.deviceId!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(device.deviceId) || device.deviceId!==topicDevice) {
    await this.reject(topic,`${message.key}: Message identities do not match receiving gateway or registered aliases`,context);continue;
   }
   try {
    const ack=await this.accept(topic,envelope,brokerId,{revisionId:revision?.id??null,original:message.original});
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
 async accept(topic: string, input: unknown, brokerId?: string | null, reception?: {revisionId:string|null;original:unknown}): Promise<TelemetryAck | null> {
  const segments=/^solar\/v1\/sites\/([A-Za-z0-9_-]{1,128})\/gateways\/([A-Za-z0-9_-]{1,128})\/devices\/([A-Za-z0-9_-]{1,128})\/telemetry$/.exec(topic);
  if (!segments) return null;
  const site=segments[1]!, gateway=segments[2]!, device=segments[3]!;
  const found=await this.db.query<RegisteredBinding>(`SELECT d.id AS "deviceId",d.site_id AS "siteId",g.id AS "gatewayId",s.external_site_id AS "externalSiteId",g.external_gateway_id AS "externalGatewayId",d.external_device_id AS "externalDeviceId",p.id AS "revisionId",p.config,g.applied_config_version AS "appliedConfigVersion",g.active_config_hash AS "activeConfigHash",g.control_managed_at AS "controlManagedAt",EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.site_id=d.site_id AND b.active) AS billing,
   (SELECT jsonb_build_object('id',bs.id,'siteId',bs.site_id,'deviceId',bs.device_id,'profileRevisionId',bs.profile_revision_id,'sourceTag',bs.source_tag,'canonicalTag',bs.canonical_tag,'sourceUnit',bs.source_unit,'targetUnit',bs.target_unit,'conversion',bs.conversion) FROM billing_meters b JOIN billing_source_bindings bs ON bs.id=b.billing_source_binding_id AND bs.meter_id=b.id WHERE b.device_id=d.id AND b.site_id=d.site_id AND b.active AND bs.site_id=d.site_id AND bs.device_id=d.id LIMIT 1) AS "billingSource"
   FROM devices d JOIN gateways g ON g.id=d.gateway_id AND g.site_id=d.site_id JOIN sites s ON s.id=d.site_id JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
   WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND d.external_device_id=$3 AND s.status<>'archived'
    AND g.protocol='mqtt' AND g.retired_at IS NULL AND g.lifecycle_state='active' AND NOT g.mqtt_access_suspended
    AND ((g.applied_config_version>0 AND g.active_config_hash IS NOT NULL) OR g.control_managed_at IS NULL)
    AND d.status<>'disabled' AND d.payload_profile_revision_id IS NOT NULL
    AND ($4::boolean OR g.mqtt_broker_id IS NOT DISTINCT FROM $5::uuid)`,[site,gateway,device,brokerId===undefined,brokerId??null]);
  const entity=found.rows.length===1?found.rows[0]:undefined;
  if (!entity) {
   const context=await this.db.query<{siteId:string;gatewayId:string}>(`SELECT g.site_id AS "siteId",g.id AS "gatewayId" FROM gateways g JOIN sites s ON s.id=g.site_id WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND s.status<>'archived' AND g.retired_at IS NULL AND g.protocol='mqtt' AND ($3::boolean OR g.mqtt_broker_id IS NOT DISTINCT FROM $4::uuid)`,[site,gateway,brokerId===undefined,brokerId??null]);
   if (!context.rows[0]) return null;
   await this.reject(topic,'No registered device/profile binding',context.rows[0]);return null;
  }
  // A committed retry is interpreted using its original immutable revision, even after upgrade.
  const messageHint=input && typeof input==='object' && 'messageId' in input ? input.messageId : undefined;
  const previous=typeof messageHint==='string' ? await this.db.query<{config:PayloadProfile}>(`SELECT p.config FROM payload_messages m JOIN payload_profile_revisions p ON p.id=m.profile_revision_id WHERE m.gateway_id=$1 AND m.device_id=$2 AND m.message_id=$3`,[entity.gatewayId,entity.deviceId,messageHint]) : null;
  const activeRevisionId=entity.revisionId;
  if(!previous?.rows[0]) {
   const assigned=(await this.db.query<{revisionId:string;config:PayloadProfile}>(`SELECT p.id AS "revisionId",p.config FROM device_profile_assignments a JOIN payload_profile_revisions p ON p.id=a.profile_revision_id WHERE a.device_id=$1 ORDER BY a.assigned_at DESC`,[entity.deviceId])).rows;
   const hint=input&&typeof input==='object'&&'device' in input?input.device as {profileId?:unknown;profileVersion?:unknown;profileRevisionId?:unknown}:undefined;
   let revisionHint=hint?.profileRevisionId;
   if(input&&typeof input==='object'&&'configurationVersion' in input){
    const version=input.configurationVersion;
    if(!Number.isSafeInteger(version)||Number(version)<1){await this.reject(topic,'Invalid configuration version',entity);return null;}
    if(version!==entity.appliedConfigVersion){await this.reject(topic,'Telemetry configurationVersion is not the active configuration version',entity);return null;}
    const bindings=(await this.db.query<{revisionId:string;config:PayloadProfile}>(`SELECT b.profile_revision_id AS "revisionId",p.config
      FROM gateway_configuration_device_bindings b JOIN payload_profile_revisions p ON p.id=b.profile_revision_id
      WHERE b.gateway_id=$1 AND b.config_version=$2 AND b.external_device_id=$3`,
    [entity.gatewayId,version,entity.externalDeviceId])).rows;
    let registered=bindings.length===1?bindings[0]:undefined;
    let registeredRevisionId=registered?.revisionId;
    if(!registered&&bindings.length===0&&entity.controlManagedAt===null){
     const snapshots=(await this.db.query<{config:unknown}>('SELECT config FROM gateway_configuration_revisions WHERE gateway_id=$1 AND version=$2',[entity.gatewayId,version])).rows;
     const config=snapshots.length===1&&snapshots[0]?.config&&typeof snapshots[0].config==='object'?snapshots[0].config as {devices?:unknown}:undefined;
     const devices=Array.isArray(config?.devices)?config.devices.filter((candidate):candidate is {deviceId:string;profileRevisionId:string}=>Boolean(candidate&&typeof candidate==='object'
      &&(candidate as {deviceId?:unknown}).deviceId===entity.externalDeviceId&&typeof (candidate as {profileRevisionId?:unknown}).profileRevisionId==='string'
      &&(candidate as {profileRevisionId:string}).profileRevisionId.length>0)):[];
     if(devices.length===1)registeredRevisionId=devices[0]!.profileRevisionId;
    }
    if(!registeredRevisionId||revisionHint&&revisionHint!==registeredRevisionId){await this.reject(topic,'No unambiguous registered device in configuration version',entity);return null;}
    revisionHint=registeredRevisionId;
   }
   const candidates=assigned.filter(p=>{const source=p.config.sourceProfile??p.config;return (!revisionHint||revisionHint===p.revisionId)&&(!hint?.profileId||hint.profileId===source.id)&&(!hint?.profileVersion||hint.profileVersion===source.version);});
   if(candidates.length>1){
    const decoder=(p:PayloadProfile)=>JSON.stringify({deviceType:p.deviceType,fields:p.fields.map(({displayName,...field})=>field),pollGroups:p.pollGroups});
    if(new Set(candidates.map(p=>decoder(p.config))).size>1){await this.reject(topic,'Ambiguous unversioned configuration; specify registered profileRevisionId',entity);return null;}
   }
   if(candidates[0]){entity.revisionId=candidates[0].revisionId;entity.config=candidates[0].config;}
   else if(assigned.length){await this.reject(topic,'No registered profile version',entity);return null;}
  }
  let normalized;
  try { normalized=normalizePayloadEnvelope(input,{profile:previous?.rows[0]?.config??entity.config,siteId:entity.externalSiteId,gatewayId:entity.externalGatewayId,deviceId:entity.externalDeviceId},topic);
   if([normalized.polledAt,normalized.measuredAt].some(time=>time&&new Date(time).getTime()>Date.now()))throw Error('Source timestamp is in the future');
  }catch(error){await this.reject(topic,error instanceof Error?error.message:'Invalid payload',entity);return null;}
  const n=normalized, receivedAt=new Date(), messageId=randomUUID();
  const client=await this.db.pool.connect();let acceptedAt: Date|string=receivedAt, conflict=false;
  try {
   await client.query('BEGIN');
   // Match archive/configuration's site -> gateway -> device order before any
   // payload FK insert. Revalidate authoritative scope after normalization.
   const siteRow=(await client.query(`SELECT id FROM sites WHERE id=$1 AND external_site_id=$2
    AND status IN ('online','offline','active') FOR KEY SHARE`,[entity.siteId,entity.externalSiteId])).rows[0];
   if(!siteRow)throw Error('Gateway site changed; retry message');
   const gatewayRow=(await client.query(`SELECT id FROM gateways
    WHERE id=$1 AND site_id=$2 AND external_gateway_id=$3 AND retired_at IS NULL AND protocol='mqtt'
      AND lifecycle_state='active' AND status IN ('online','offline','active') AND NOT mqtt_access_suspended
      AND ((applied_config_version=$6 AND active_config_hash=$7 AND active_config_hash IS NOT NULL) OR
        (active_config_hash IS NULL AND control_managed_at IS NULL))
      AND ($4::boolean OR mqtt_broker_id IS NOT DISTINCT FROM $5::uuid) FOR UPDATE`,
   [entity.gatewayId,entity.siteId,entity.externalGatewayId,brokerId===undefined,brokerId??null,entity.appliedConfigVersion,entity.activeConfigHash])).rows[0];
   if(!gatewayRow)throw Error('Gateway admission changed; retry message');
   // Binding/profile activation locks the same device. Recheck after acquiring the
   // lock so a concurrent edit cannot stamp stale provenance on a new message.
   const pinned=(await client.query(`SELECT payload_profile_revision_id AS "revisionId" FROM devices WHERE id=$1
    AND gateway_id=$2 AND site_id=$3 AND external_device_id=$4 AND status<>'disabled' AND payload_profile_revision_id IS NOT NULL FOR SHARE`,
   [entity.deviceId,entity.gatewayId,entity.siteId,entity.externalDeviceId])).rows[0];
   const active=(await client.query('SELECT billing_source_binding_id AS id FROM billing_meters WHERE site_id=$1 AND device_id=$2 AND active=true',[entity.siteId,entity.deviceId])).rows;
   if(pinned?.revisionId!==activeRevisionId||active.length>1||(active[0]?.id??null)!==(entity.billingSource?.id??null))throw Error('Profile or billing source changed; retry message');
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
    const source=entity.billingSource;
    const field=source&&entity.config.fields.find(f=>(f.sourceTag??f.tag)===source.sourceTag&&f.tag===source.canonicalTag&&f.sourceUnit===source.sourceUnit&&f.targetUnit===source.targetUnit&&f.conversion===source.conversion&&f.role==='billing-import');
    const sample=source&&n.samples.find(s=>(s.sourceTag??s.tag)===source.sourceTag&&s.tag===source.canonicalTag&&s.rawUnit===source.sourceUnit&&s.unit==='kWh');
    const bound=Boolean(entity.billing&&source&&field&&source.siteId===entity.siteId&&source.deviceId===entity.deviceId&&source.profileRevisionId===entity.revisionId);
    const energy=bound&&healthy&&sample&&sample.value>=0?sample.value:null;
    const find=(tag:string)=>n.samples.find(s=>s.tag===tag)?.value??null;
    const quality=!healthy||sample&&sample.value<0?'invalid':'complete'; // Measurement validity is independent of online freshness.
    // Existing energy_raw_dirty trigger participates in this transaction.
    await client.query(`INSERT INTO telemetry_raw (id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,payload_profile_revision_id,voltage_v,current_a,active_power_w,apparent_power_va,reactive_power_var,frequency_hz,power_factor,billing_source_binding_id)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,'kWh',$8,$9,'total_energy',$7,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,[randomUUID(),entity.deviceId,entity.siteId,n.polledAt,receivedAt,JSON.stringify(n.raw),energy,quality,`payload:${messageId}`,entity.revisionId,find('electrical.voltage.l1_n'),find('electrical.current.l1'),n.samples.find(s=>s.role==='active-power'&&s.unit==='W')?.value??null,find('power.apparent.total'),find('power.reactive.total'),find('electrical.frequency'),find('power.factor.total'),bound&&field&&n.pollGroup===field.pollGroup?source!.id:null]);
   }
   if(!conflict)await client.query(`UPDATE gateways SET last_seen_at=GREATEST(last_seen_at,$2::timestamptz),
    status=CASE WHEN $2::timestamptz>=now()-interval '120 seconds' THEN 'online' ELSE status END WHERE id=$1`,[entity.gatewayId,n.polledAt]);
   await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  if(conflict){await this.reject(topic,'Conflicting reuse of messageId',entity);return null;}
  return {schemaVersion:'1.1',messageType:'dataAcept',siteId:n.siteId,gatewayId:n.gatewayId,lotNumber:n.lotNumber,messageId:n.messageId,status:'accepted',acceptedAt:new Date(acceptedAt).toISOString()};
 }
}
