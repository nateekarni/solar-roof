// Repair only our synthetic historical curve after the timezone-baseline correction.
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {assertReviewTarget} from './guard.mjs';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Client}=require('pg');
assertReviewTarget(process.env.DATABASE_URL,'solar_dashboard_review');
assert.equal(process.env.MQTT_ENABLED,'false');
const client=new Client({connectionString:process.env.DATABASE_URL});await client.connect();
const id=key=>createHash('sha256').update(`solar-dashboard-review:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
try {
 assertReviewTarget(process.env.DATABASE_URL,(await client.query('SELECT current_database() name')).rows[0].name);
 assert.equal((await client.query("SELECT 1 FROM audit_events WHERE action='LOCAL_SYNTHETIC_REVIEW_SEED' AND correlation_id='solar-dashboard-review-v1'")).rowCount,1);
 await client.query('BEGIN');let updated=0;
 for(let i=0;i<16;i++){
  const r=await client.query(`UPDATE telemetry_raw SET total_energy_kwh=100000+extract(epoch from(source_time-'2025-10-01T00:00:00+07:00'::timestamptz))/86400*(180+$2::int*12),normalized_value=100000+extract(epoch from(source_time-'2025-10-01T00:00:00+07:00'::timestamptz))/86400*(180+$2::int*12) WHERE site_id=$1 AND ingestion_id LIKE 'review-history-%' AND raw_payload->>'synthetic'='true'`,[id(`site-${i}`),i]);updated+=r.rowCount;
  const check=await client.query(`SELECT max(abs(total_energy_kwh-(100000+extract(epoch from(source_time-'2025-10-01T00:00:00+07:00'::timestamptz))/86400*(180+$2::int*12))))::float8 AS max_error FROM telemetry_raw WHERE site_id=$1 AND ingestion_id LIKE 'review-%'`,[id(`site-${i}`),i]);
  assert(check.rows[0].max_error<0.001,`Curve mismatch site ${i}: ${check.rows[0].max_error}`);
 }
 await client.query('COMMIT');console.log(JSON.stringify({updated,sitesVerified:16,maxAllowedKwhError:0.001}));
}catch(e){await client.query('ROLLBACK');throw e;}finally{await client.end();}
