import { ConflictException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { actualEnergyDifference } from './local-financial-policy.js';
export function assertContinuousBillingSource(readings:any[]):void {
 const first=readings[0];if(!first)throw new ConflictException('Actual cumulative readings required');
 const identity=(r:any)=>r.payload_profile_revision_id&&r.billing_source_binding_id&&!r.mapping_version_id?`payload:${r.payload_profile_revision_id}:${r.billing_source_binding_id}`:r.mapping_version_id&&!r.payload_profile_revision_id&&!r.billing_source_binding_id?`register:${r.mapping_version_id}`:null;
 const source=identity(first);if(!source)throw new ConflictException('Verified reading provenance required');
 let previous:unknown;
 for(const row of readings){
  if(identity(row)!==source)throw new ConflictException('Changed billing source requires continuity review');
  if(row.quality!=='complete'||String(row.unit).toLowerCase()!=='kwh'||row.value===null||row.value===undefined||!Number.isFinite(Number(row.value))||Number(row.value)<0)throw new ConflictException('Incomplete or invalid cumulative source data');
  if(previous!==undefined)try{actualEnergyDifference(previous,row.value);}catch(error){throw new ConflictException((error as Error).message);}
  previous=row.value;
 }
}
const evidence=`LEFT JOIN register_mapping_versions m ON m.id=tr.mapping_version_id AND m.device_id=tr.device_id AND m.semantic_field=tr.semantic_field
 LEFT JOIN billing_source_bindings bs ON bs.id=tr.billing_source_binding_id AND bs.meter_id=$6 AND bs.device_id=tr.device_id AND bs.site_id=tr.site_id AND bs.profile_revision_id=tr.payload_profile_revision_id
 LEFT JOIN payload_profile_revisions p ON p.id=bs.profile_revision_id
 WHERE tr.site_id=$5 AND tr.device_id=$1 AND tr.semantic_field=$2
 AND ((tr.payload_profile_revision_id IS NULL AND tr.billing_source_binding_id IS NULL AND m.id IS NOT NULL)
 OR (tr.mapping_version_id IS NULL AND bs.id IS NOT NULL AND bs.target_unit='kWh' AND bs.canonical_tag='energy.active.import.total'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.config->'fields') f WHERE coalesce(f->>'sourceTag',f->>'tag')=bs.source_tag AND f->>'tag'=bs.canonical_tag AND f->>'sourceUnit'=bs.source_unit AND f->>'targetUnit'=bs.target_unit AND f->>'conversion'=bs.conversion AND f->>'role'='billing-import'))) `;
export async function billableBoundary(client:PoolClient,meter:any,boundary:string,timezone:string,siteId:string){
 const rows=(await client.query(`SELECT tr.id,tr.normalized_value AS value,tr.source_time,tr.quality,tr.unit,tr.mapping_version_id,tr.payload_profile_revision_id,tr.billing_source_binding_id,to_jsonb(bs) AS billing_source,($3::date::timestamp AT TIME ZONE $4) AS target_time,abs(extract(epoch FROM(tr.source_time-($3::date::timestamp AT TIME ZONE $4)))) AS distance FROM telemetry_raw tr ${evidence}
 AND lower(tr.unit)='kwh' AND tr.source_time<=now() AND abs(extract(epoch FROM(tr.source_time-($3::date::timestamp AT TIME ZONE $4))))<=300
 AND (tr.normalized_value IS NOT NULL OR tr.billing_source_binding_id IS NOT NULL OR tr.mapping_version_id IS NOT NULL)
 ORDER BY distance,tr.source_time DESC,tr.id LIMIT 2`,[meter.device_id,meter.semantic_field,boundary,timezone,siteId,meter.id])).rows;
 const reading=rows[0];if(!reading)throw new ConflictException(`Missing actual cumulative reading for meter ${meter.id} at ${boundary}`);
 assertContinuousBillingSource([reading]);
 if(rows[1]&&Number(rows[1].distance)===Number(reading.distance)&&(String(rows[1].value)!==String(reading.value)||rows[1].billing_source_binding_id!==reading.billing_source_binding_id||rows[1].mapping_version_id!==reading.mapping_version_id))throw new ConflictException('Ambiguous boundary readings require review');
 return reading;
}
export async function verifyBillingSegment(client:PoolClient,meter:any,siteId:string,opening:any,closing:any){
 assertContinuousBillingSource([opening,closing]);
 // Include invalid/missing selected-field measurements and every profile/binding in
 // the actual source-time interval. A reset followed by recovery must not disappear.
 const rows=(await client.query(`SELECT id,normalized_value AS value,quality,unit,mapping_version_id,payload_profile_revision_id,billing_source_binding_id FROM telemetry_raw tr WHERE site_id=$1 AND device_id=$2 AND semantic_field=$3 AND source_time BETWEEN $4 AND $5 AND (normalized_value IS NOT NULL OR billing_source_binding_id IS NOT NULL OR mapping_version_id IS NOT NULL OR EXISTS(SELECT 1 FROM payload_profile_revisions p,jsonb_array_elements(p.config->'fields') f WHERE p.id=tr.payload_profile_revision_id AND f->>'role'='billing-import' AND f->>'pollGroup'=tr.raw_payload->>'pollGroup')) ORDER BY source_time,id`,[siteId,meter.device_id,meter.semantic_field,opening.source_time,closing.source_time])).rows;
 assertContinuousBillingSource(rows);
}




