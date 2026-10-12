import { randomUUID } from 'node:crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { DatabaseService } from '../../database/database.service.js';

export function lifecycleState(v:{desired:number;published:number;acknowledged:number;applied:number}){
 return {desiredVersion:v.desired,publishedVersion:v.published,acknowledgedVersion:v.acknowledged,appliedVersion:v.applied,state:v.desired===0?'unconfigured':v.published<v.desired?'pending-publish':v.acknowledged<v.desired?'awaiting-acknowledgement':v.applied<v.desired?'awaiting-application':'applied'};
}
export async function snapshotGatewayConfiguration(client:PoolClient,gatewayId:string) {
 const gateway=(await client.query(`SELECT id,desired_config_version AS version,endpoint,polling_interval_seconds AS "pollingIntervalSeconds",alert_rules AS "alertRules",external_gateway_id AS "gatewayId" FROM gateways WHERE id=$1 AND retired_at IS NULL FOR UPDATE`,[gatewayId])).rows[0];
 if(!gateway)throw new NotFoundException('Active gateway not found');
 const devices=(await client.query(`SELECT d.id,d.external_device_id AS "deviceId",d.payload_profile_revision_id AS "profileRevisionId",p.config AS "profileConfig",d.expected_interval_seconds AS "expectedIntervalSeconds",d.poll_group_cadence AS "pollGroups",(SELECT coalesce(jsonb_agg(jsonb_build_object('semanticField',r.semantic_field,'registerAddress',r.register_address,'dataType',r.data_type,'registerCount',r.register_count,'wordOrder',r.word_order,'byteOrder',r.byte_order,'scale',r.scale,'unit',r.unit,'pollingIntervalSeconds',r.polling_interval_seconds) ORDER BY r.register_address),'[]'::jsonb) FROM register_mapping_versions r WHERE r.device_id=d.id AND r.effective_to IS NULL) AS registers FROM devices d LEFT JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id WHERE d.gateway_id=$1 ORDER BY d.id FOR SHARE OF d`,[gatewayId])).rows;
 const receive=(await client.query(`SELECT id,version,config FROM gateway_payload_receive_revisions WHERE gateway_id=$1 ORDER BY version DESC LIMIT 1`,[gatewayId])).rows[0];
 const version=Number(gateway.version??0)+1,config={...gateway,version,devices,receiveRevisionId:receive?.id??null,receiveConfig:receive?.config??{}};
 await client.query(`INSERT INTO gateway_configuration_revisions(id,gateway_id,version,config) VALUES($1,$2,$3,$4::jsonb)`,[randomUUID(),gatewayId,version,JSON.stringify(config)]);
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
  const gateway=(await client.query(`SELECT g.id FROM gateways g JOIN sites s ON s.id=g.site_id JOIN gateway_configuration_revisions r ON r.gateway_id=g.id AND r.version=$4 AND r.published_at IS NOT NULL WHERE s.external_site_id=$1 AND g.external_gateway_id=$2 AND g.mqtt_broker_id IS NOT DISTINCT FROM $3::uuid AND g.retired_at IS NULL FOR UPDATE OF g`,[siteCode,gatewayCode,brokerId,version])).rows[0];
  if(!gateway)return false;
  await client.query(`UPDATE gateway_configuration_revisions SET acknowledged_at=coalesce(acknowledged_at,now()),applied_at=CASE WHEN $3 THEN coalesce(applied_at,now()) ELSE applied_at END WHERE gateway_id=$1 AND version=$2`,[gateway.id,version,applied]);
  await client.query(`UPDATE gateways SET acknowledged_config_version=GREATEST(acknowledged_config_version,$2),applied_config_version=CASE WHEN $3 THEN GREATEST(applied_config_version,$2) ELSE applied_config_version END WHERE id=$1`,[gateway.id,version,applied]);
  return true;
 });
}
