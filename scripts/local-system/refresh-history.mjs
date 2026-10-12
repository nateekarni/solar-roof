import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {assertLocalDockerTarget} from './guard.mjs';
import {sites,profiles,id,reading,envelope} from './telemetry-fixture.mjs';
assertLocalDockerTarget('financial');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});const c=await pool.connect();
const from=process.argv.find(a=>a.startsWith('--from='))?.slice(7)??'2026-10-10';
const start=Date.parse(from+'T00:00:00+07:00'),end=Math.floor(Date.now()/300000)*300000;
if(!Number.isFinite(start)||start>end||end-start>7*86400000)throw Error('Select a start within the last seven days');
try{
 await c.query('BEGIN');
 for(const site of sites)for(const kind of ['meter','logger']){
 const rows=[];const until=site.index===9?Math.floor((end+7*3600000)/86400000)*86400000-7*3600000:end;
 for(let at=start;at<=until;at+=300000){const payload=envelope(site,kind,at),r=reading(site,kind,at);rows.push({id:id(`${kind}${site.index}:${at}`),stamp:new Date(at).toISOString(),sequence:at,message:payload.messageId,digest:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),raw:payload,kwh:Number(r.kwh.toFixed(6)),power:Number(r.power.toFixed(3))});}
 const json=JSON.stringify(rows),record="jsonb_to_recordset($1::jsonb) AS x(id uuid,stamp timestamptz,sequence bigint,message text,digest text,raw jsonb,kwh double precision,power double precision)";
 await c.query(`INSERT INTO payload_messages(id,gateway_id,device_id,message_id,digest,accepted_at,profile_revision_id,lot_number,sequence,polled_at,sent_at,raw_payload,unmapped) SELECT x.id,$2,$3,message,digest,stamp,$4,1,sequence,stamp,stamp,raw,'{}' FROM ${record} ON CONFLICT DO NOTHING`,[json,site.gatewayId,id(kind+site.index),id('profile'+kind)]);
 await c.query(`INSERT INTO payload_samples(id,message_id,site_id,gateway_id,device_id,profile_revision_id,tag,value,unit,raw_value,raw_unit,poll_group,polled_at,measured_at,received_at,quality,communication) SELECT md5(x.id::text||v.tag)::uuid,x.id,$2,$3,$4,$5,v.tag,v.value,v.unit,v.raw_value,v.raw_unit,'measurements',stamp,stamp,stamp,'good','online' FROM ${record} CROSS JOIN LATERAL (VALUES($6::text,kwh,'kWh',kwh*1000,'Wh'),($7::text,power,'W',power,'W')) v(tag,value,unit,raw_value,raw_unit) ON CONFLICT DO NOTHING`,[json,site.siteId,site.gatewayId,id(kind+site.index),id('profile'+kind),profiles[kind].fields[0].tag,profiles[kind].fields[1].tag]);
 await c.query(`INSERT INTO telemetry_raw(id,device_id,site_id,source_time,received_time,raw_payload,normalized_value,unit,quality,ingestion_id,semantic_field,total_energy_kwh,active_power_w,payload_profile_revision_id,billing_source_binding_id) SELECT x.id,$2,$3,stamp,stamp,raw,kwh,'kWh','complete',message,$4,${kind==='meter'?'kwh':'NULL'},power,$5,$6 FROM ${record} ON CONFLICT DO NOTHING`,[json,id(kind+site.index),site.siteId,kind==='meter'?'total_energy':'solar_total_yield',id('profile'+kind),kind==='meter'?id('binding'+site.index):null]);
 }
 await c.query('COMMIT');console.log(JSON.stringify({from,through:new Date(end).toISOString(),sites:10,offlineSite:'SKA-HDY-010',synthetic:true}));
}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();await pool.end();}
