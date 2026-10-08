import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { billableBoundary } from './billing-source-readings.js';

const reference={id:'a',normalized_value:'200',site_id:'s',device_id:'d',semantic_field:'total_energy',source_time:'2020-02-29T17:00:00Z',quality:'complete',unit:'kWh',mapping_version_id:null,payload_profile_revision_id:'r',billing_source_binding_id:'b'};
// CTE relations shadow real tables for this SELECT only. No fixture DDL/DML or
// simulated query engine: the production boundary SQL runs in PostgreSQL.
const relations=`WITH telemetry_raw AS (
 SELECT * FROM jsonb_to_recordset($7::jsonb) AS tr(id text,normalized_value numeric,site_id text,device_id text,semantic_field text,source_time timestamptz,quality text,unit text,mapping_version_id text,payload_profile_revision_id text,billing_source_binding_id text)
), register_mapping_versions AS (
 SELECT 'm'::text id,'d'::text device_id,'total_energy'::text semantic_field
), billing_source_bindings AS (
 SELECT id,'meter'::text meter_id,'d'::text device_id,'s'::text site_id,revision AS profile_revision_id,'energy.active.import.total'::text source_tag,'energy.active.import.total'::text canonical_tag,'Wh'::text source_unit,'kWh'::text target_unit,'wh-to-kwh'::text conversion FROM (VALUES ('b','r'),('b2','r'),('b3','r2')) v(id,revision)
), payload_profile_revisions AS (
 SELECT id,'{"fields":[{"tag":"energy.active.import.total","role":"billing-import","sourceUnit":"Wh","targetUnit":"kWh","conversion":"wh-to-kwh"}]}'::jsonb config FROM (VALUES ('r'),('r2')) v(id)
)`;

test('actual PostgreSQL boundary aggregation checks every nearest value and provenance', {skip:process.env.BILLING_SOURCE_SQL_TEST!=='true'}, async t=>{
 const connection=process.env.DATABASE_URL;assert.ok(connection);assert.ok(['127.0.0.1','localhost'].includes(new URL(connection).hostname));
 const pool=new Pool({connectionString:connection,options:'-c default_transaction_read_only=on'});
 async function select(rows:Array<Record<string,unknown>>){
  const client={query:async(sql:string,params:unknown[])=>pool.query(relations+(/^WITH\s/i.test(sql.trim())?', '+sql.trim().replace(/^WITH\s+/i,''):' '+sql),[...params,JSON.stringify(rows)])};
  return billableBoundary(client as unknown as PoolClient,{id:'meter',device_id:'d',semantic_field:'total_energy'},'2020-03-01','Asia/Bangkok','s');
 }
 try{
  await t.test('third contradictory counter is rejected after two matching nearest counters',async()=>{
   await assert.rejects(select([reference,{...reference,id:'b'},{...reference,id:'c',normalized_value:'300'}]),/Ambiguous boundary/);
  });
  await t.test('three numerically equal same-source duplicates retain deterministic actual evidence',async()=>{
   const selected=await select([reference,{...reference,id:'b',normalized_value:'200.000'},{...reference,id:'c',normalized_value:'200.0'}]);assert.equal(selected.id,'a');assert.equal(Number(selected.value),200);assert.equal(selected.payload_profile_revision_id,'r');assert.equal(selected.billing_source_binding_id,'b');
  });
  await t.test('third conflicting binding, profile, or invalid quality rejects even at equal value',async()=>{
   for(const change of [{billing_source_binding_id:'b2'},{billing_source_binding_id:'b3',payload_profile_revision_id:'r2'},{quality:'invalid'},{normalized_value:null},{unit:'Wh'},{unit:null}])await assert.rejects(select([reference,{...reference,id:'b'},{...reference,id:'c',...change}]),/Ambiguous boundary/);
  });
  await t.test('farther conflicting candidates do not override unanimous nearest evidence',async()=>{
   const selected=await select([reference,{...reference,id:'b'},{...reference,id:'c',normalized_value:'300',source_time:'2020-02-29T17:01:00Z'}]);assert.equal(selected.id,'a');
  });
 }finally{await pool.end();}
});

