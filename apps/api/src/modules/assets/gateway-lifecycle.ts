import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../database/database.service.js';
import { gatewayConfigHash } from '../gateway-control/gateway-control-payload.js';

export function lifecycleState(v:{desired:number;published:number;acknowledged:number;applied:number}){
 return {desiredVersion:v.desired,publishedVersion:v.published,acknowledgedVersion:v.acknowledged,appliedVersion:v.applied,state:v.desired===0?'unconfigured':v.published<v.desired?'pending-publish':v.acknowledged<v.desired?'awaiting-acknowledgement':v.applied<v.desired?'awaiting-application':'applied'};
}
/** All runtime writers of an external MQTT identity must reserve the same key.
 * Identity history is permanent: retired rows still reserve authentication IDs.
 * exceptGatewayId is only for updating that same row, never for a replacement.
 * The caller owns the transaction; the lock also protects the absent-row case. */
export async function reserveGatewayIdentity(client:Pick<PoolClient,'query'>,externalId:string|null|undefined,exceptGatewayId:string|null=null) {
 if(!externalId)return;
 await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',['gateway-identity:'+externalId]);
 const duplicate=(await client.query(`SELECT id FROM gateways WHERE external_gateway_id=$1
   AND ($2::uuid IS NULL OR id<>$2::uuid) LIMIT 1`,[externalId,exceptGatewayId])).rows[0];
 if(duplicate)throw new ConflictException('Gateway identity is already registered');
}
async function lockGatewayInSiteOrder(client:Pick<PoolClient,'query'>,gatewayId:string,mode:'UPDATE'|'KEY SHARE',expectedSiteId?:string) {
 const candidate=(await client.query('SELECT site_id FROM gateways WHERE id=$1 AND retired_at IS NULL',[gatewayId])).rows[0];
 if(!candidate||expectedSiteId!==undefined&&candidate.site_id!==expectedSiteId)throw new NotFoundException('Active gateway not found');
 const site=(await client.query("SELECT id FROM sites WHERE id=$1 AND status<>'archived' FOR KEY SHARE",[candidate.site_id])).rows[0];
 if(!site)throw new NotFoundException('Active gateway site not found');
 const gateway=(await client.query(`SELECT * FROM gateways WHERE id=$1 AND site_id=$2 AND retired_at IS NULL FOR ${mode}`,[gatewayId,candidate.site_id])).rows[0];
 if(!gateway)throw new NotFoundException('Gateway changed; reload configuration');
 return gateway;
}
/** Reference-only flows must lock parent rows before device/FK references too. */
export async function lockGatewayReference(client:Pick<PoolClient,'query'>,gatewayId:string,expectedSiteId?:string) {
 return lockGatewayInSiteOrder(client,gatewayId,'KEY SHARE',expectedSiteId);
}
/** Non-configuration business mutations may still need an exclusive gateway lock. */
export async function lockGatewayForMutation(client:Pick<PoolClient,'query'>,gatewayId:string,expectedSiteId?:string) {
 return lockGatewayInSiteOrder(client,gatewayId,'UPDATE',expectedSiteId);
}
/** Call before any legacy technical write or device lock, in the caller's transaction. */
export async function guardLegacyGatewayConfiguration(client:Pick<PoolClient,'query'>,gatewayId:string,expectedSiteId?:string) {
 const gateway=await lockGatewayForMutation(client,gatewayId,expectedSiteId);
 // Fresh statement after acquiring the gateway lock: a concurrent approval may
 // have created the first managed revision while this transaction was waiting.
 const managed=(await client.query(`SELECT EXISTS(SELECT 1 FROM gateway_configuration_revisions
   WHERE gateway_id=$1 AND config->>'messageType'='config') AS "controlManaged"`,[gatewayId])).rows[0];
 if(managed?.controlManaged)throw new ConflictException('Use gateway configuration proposal approval for this gateway');
 return gateway;
}
export async function snapshotGatewayConfiguration(client:PoolClient,gatewayId:string) {
 await guardLegacyGatewayConfiguration(client,gatewayId);
 const row=(await client.query(`SELECT id,desired_config_version AS version,endpoint,polling_interval_seconds AS "pollingIntervalSeconds",alert_rules AS "alertRules",external_gateway_id AS "gatewayId",
   EXISTS(SELECT 1 FROM gateway_configuration_revisions managed WHERE managed.gateway_id=gateways.id AND managed.config->>'messageType'='config') AS "controlManaged"
   FROM gateways WHERE id=$1 AND retired_at IS NULL FOR UPDATE`,[gatewayId])).rows[0];
 if(!row)throw new NotFoundException('Active gateway not found');
 // Defense in depth for callers: normal mutation paths guard before any writes.
 if(row.controlManaged)throw new ConflictException('Use gateway configuration proposal approval for this gateway');
 const {controlManaged:_managed,...gateway}=row;
 const devices=(await client.query(`SELECT d.id,d.external_device_id AS "deviceId",d.payload_profile_revision_id AS "profileRevisionId",p.config AS "profileConfig",d.expected_interval_seconds AS "expectedIntervalSeconds",d.poll_group_cadence AS "pollGroups",(SELECT coalesce(jsonb_agg(jsonb_build_object('semanticField',r.semantic_field,'registerAddress',r.register_address,'dataType',r.data_type,'registerCount',r.register_count,'wordOrder',r.word_order,'byteOrder',r.byte_order,'scale',r.scale,'unit',r.unit,'pollingIntervalSeconds',r.polling_interval_seconds) ORDER BY r.register_address),'[]'::jsonb) FROM register_mapping_versions r WHERE r.device_id=d.id AND r.effective_to IS NULL) AS registers FROM devices d LEFT JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.gateway_id=$1 ORDER BY d.id FOR SHARE OF d`,[gatewayId])).rows;
 const receive=(await client.query(`SELECT id,version,config FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1`,[gatewayId])).rows[0];
 const version=Number(gateway.version??0)+1,config={...gateway,version,devices,receiveRevisionId:receive?.id??null,receiveConfig:receive?.config??{}};
 await client.query(`INSERT INTO gateway_configuration_revisions(id,gateway_id,version,config,config_hash) VALUES($1,$2,$3,$4::jsonb,$5)`,[randomUUID(),gatewayId,version,JSON.stringify(config),gatewayConfigHash(config)]);
 await client.query('UPDATE gateways SET desired_config_version=$2 WHERE id=$1',[gatewayId,version]);
 return {version,config};
}
export async function recordGatewayPublished(db:DatabaseService,id:string,version:number) {
 await db.transaction(async client=>{
  await client.query(`UPDATE gateway_configuration_revisions SET published_at=coalesce(published_at,now()) WHERE gateway_id=$1 AND version=$2`,[id,version]);
  await client.query(`UPDATE gateways SET published_config_version=GREATEST(published_config_version,$2) WHERE id=$1`,[id,version]);
 });
}
/** Only invoked for a broker-scoped hardware ACK, never by a successful publish. */
export async function acknowledgeGatewayConfiguration(db:DatabaseService,siteCode:string,gatewayCode:string,brokerId:string|null,version:number,applied:boolean) {
 if(!Number.isSafeInteger(version)||version<1)return false;
 return db.transaction(async client=>{
  const gateway=(await client.query(`SELECT g.id FROM gateways g JOIN sites s ON s.id=g.site_id JOIN gateway_configuration_revisions r ON r.gateway_id=g.id AND r.version=$4 AND r.published_at IS NOT NULL WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND g.mqtt_broker_id IS NOT DISTINCT FROM $3::uuid AND g.retired_at IS NULL
    AND (r.config->>'messageType') IS DISTINCT FROM 'config'
    AND NOT EXISTS(SELECT 1 FROM gateway_configuration_revisions managed WHERE managed.gateway_id=g.id AND managed.config->>'messageType'='config') FOR UPDATE OF g`,[siteCode,gatewayCode,brokerId,version])).rows[0];
  if(!gateway)return false;
  await client.query(`UPDATE gateway_configuration_revisions SET acknowledged_at=coalesce(acknowledged_at,now()),applied_at=CASE WHEN $3 THEN coalesce(applied_at,now()) ELSE applied_at END WHERE gateway_id=$1 AND version=$2`,[gateway.id,version,applied]);
  await client.query(`UPDATE gateways SET acknowledged_config_version=GREATEST(acknowledged_config_version,$2),applied_config_version=CASE WHEN $3 THEN GREATEST(applied_config_version,$2) ELSE applied_config_version END WHERE id=$1`,[gateway.id,version,applied]);
  return true;
 });
}
