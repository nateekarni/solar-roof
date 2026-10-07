// Refresh synthetic samples in the dedicated local DB; never connects to MQTT.
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import {assertReviewTarget} from './guard.mjs';
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const {Pool}=require('pg');
assertReviewTarget(process.env.DATABASE_URL,'solar_dashboard_review');
if(process.env.MQTT_ENABLED!=='false')throw Error('MQTT must be disabled');
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const id=key=>createHash('sha256').update(`solar-dashboard-review:${key}`).digest('hex').slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
const meterProfile='00000000-0000-4000-8000-000000000001',loggerProfile='00000000-0000-4000-8000-000000000002';
async function refresh(){
 const client=await pool.connect();
 try {
  assertReviewTarget(process.env.DATABASE_URL,(await client.query('SELECT current_database() name')).rows[0].name);
  if(!(await client.query("SELECT 1 FROM audit_events WHERE action='LOCAL_SYNTHETIC_REVIEW_SEED' AND correlation_id='solar-dashboard-review-v1'")).rowCount)throw Error('Review seed ownership marker missing');
  await client.query('BEGIN');
  for(let i=0;i<16;i++) {
   const stamp=new Date(Date.now()-(i===15?3600000:2000)),quality=i===14?'bad':'good';
   const energy=100000+(stamp-new Date('2025-10-01T00:00:00+07:00'))/86400000*(180+i*12);
   const power=i===13?0:21000+i*1900+Math.round(Math.sin(Date.now()/60000)*700);
   for(const [kind,profile,fields] of [
    ['meter',meterProfile,[['energy.active.import.total',energy,'kWh','energy'],['energy.active.export.total',0,'kWh','energy'],['power.active.total',power,'W','realtime'],['electrical.voltage.l1_n',229+i/10,'V','realtime'],['electrical.current.l1',54+i,'A','realtime'],['electrical.frequency',50.02,'Hz','realtime'],['power.factor.total',0.97,'1','realtime']]],
    ['logger',loggerProfile,[['solar.active_power',power+ (i===13?0:1600),'W','plant'],['solar.daily_yield',132+i*12,'kWh','plant'],['environment.irradiance',760,'W/m2','environment'],['environment.ambient_temperature',32.4,'degC','environment']]]]) {
    const message=randomUUID(),device=id(`${kind}-${i}`),tagValues=Object.fromEntries(fields.map(([tag,value])=>[tag,value]));
    await client.query(`INSERT INTO payload_messages(id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped) VALUES($1,$2,$3,$4,$4,now(),$5,1,1,$6,$6,$7,'[]')`,[message,id(`gateway-${i}`),device,`synthetic-${message}`,profile,stamp,JSON.stringify({synthetic:true,data:{values:tagValues}})]);
    for(const [tag,value,unit,group] of fields)await client.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,received_at,quality,communication) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$8,$9,$10,$11,$11,$12,'online')`,[randomUUID(),message,id(`site-${i}`),id(`gateway-${i}`),device,profile,tag,value,unit,group,stamp,quality]);
    if(kind==='meter')await client.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,active_power_w,payload_profile_revision_id) VALUES($1,$2,$3,$4,$4,$5,$6,'kWh',$7,$8,'total_energy',$6,$9,$10)`,[randomUUID(),device,id(`site-${i}`),stamp,JSON.stringify({synthetic:true}),energy,quality==='good'?'complete':'invalid',`review-live-${message}`,power,profile]);
   }
   await client.query('UPDATE gateways SET last_seen_at=$2 WHERE id=$1',[id(`gateway-${i}`),stamp]);
  }
  await client.query('COMMIT');console.log('Synthetic local samples refreshed',new Date().toISOString());
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
try {
 do {await refresh();if(!process.argv.includes('--watch'))break;await new Promise(resolve=>setTimeout(resolve,30000));}while(true);
}finally{await pool.end();}
