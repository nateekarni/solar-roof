import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PayloadIngestion } from './payload-ingestion.js';
import { DEFAULT_PAYLOAD_PROFILES, type PayloadProfile } from './payload-profile.js';
const examples = JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json', import.meta.url), 'utf8')).payloads;
const topic = 'solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry';
function fixture(options: { fail?: boolean; commit?: () => Promise<void>; profile?:()=>PayloadProfile } = {}) {
 const events: string[] = [], samples: unknown[][] = [], raws: unknown[][] = [], rejects: unknown[][] = []; const messages = new Map<string, any>();
 const query = async (sql: string, values: any[] = []) => {
  if (sql.includes('FROM devices d')) return {rows:[{deviceId:'d',siteId:'s',gatewayId:'g',externalSiteId:'SITE-001',externalGatewayId:'GW-001',externalDeviceId:'METER-001',revisionId:'r',config:options.profile?.()??DEFAULT_PAYLOAD_PROFILES[0],billing:true}]};
  if (sql.includes('FROM gateways g')) return {rows:[{siteId:'s',gatewayId:'g'}]};
  if (sql === 'COMMIT') {await options.commit?.();events.push('commit');return {rows:[]};}
  if (sql === 'ROLLBACK') {events.push('rollback');return {rows:[]};}
  if (sql.includes('INSERT INTO payload_messages')) {if(messages.has(values[3]))return {rows:[]};const row={id:values[0],digest:values[4],acceptedAt:values[5],config:structuredClone(options.profile?.()??DEFAULT_PAYLOAD_PROFILES[0])};messages.set(values[3],row);return {rows:[row]};}
  if(sql.includes('FROM payload_messages'))return {rows:messages.has(values[2])?[messages.get(values[2])]:[]};
  if(sql.includes('INSERT INTO payload_samples')) {if(options.fail)throw Error('write failed');samples.push(values);}
  if(sql.includes('INSERT INTO telemetry_raw'))raws.push(values);
  if(sql.includes('INSERT INTO payload_rejections'))rejects.push(values);
  return {rows:[]};
 };
 const db = {query,pool:{connect:async()=>({query,release(){}})}};
 const ingest = new PayloadIngestion(db as any);
 return {ingest,events,samples,raws,rejects,messages};
}
test('canonical acceptance waits for commit and duplicate returns original acceptedAt without samples',async()=>{
 let unblock!:()=>void;let committing=false;const f=fixture({commit:async()=>{if(!committing){committing=true;await new Promise<void>(r=>unblock=r);}}});
 const state:{ack:any}={ack:undefined};const pending=f.ingest.accept(topic,examples.pm2230Energy).then(a=>{state.ack=a;return a;});
 for(let i=0;!committing && i<100;i++)await new Promise(r=>setImmediate(r));assert.equal(committing,true);assert.equal(state.ack,undefined);unblock();const ack=await pending;assert.ok(ack);assert.equal(ack.messageType,'dataAcept');assert.equal(f.raws[0]?.[6],152430.275);
 const count=f.samples.length;const dup=await f.ingest.accept(topic,{...examples.pm2230Energy,timestamps:{...examples.pm2230Energy.timestamps,sentAt:'2026-10-05T09:00:00+07:00'}});assert.ok(dup);assert.equal(dup.acceptedAt,ack.acceptedAt);assert.equal(f.samples.length,count);
});
test('persistence rollback returns no success ACK',async()=>{const f=fixture({fail:true});await assert.rejects(f.ingest.accept(topic,examples.pm2230Energy),/write failed/);assert.ok(f.events.includes('rollback'));});
test('conflicting reuse persists a rejection and never accepts',async()=>{const f=fixture();await f.ingest.accept(topic,examples.pm2230Energy);const changed=structuredClone(examples.pm2230Energy);changed.data.values['energy.active.import.total']++;assert.equal(await f.ingest.accept(topic,changed),null);assert.equal(f.rejects.length,1);});
test('wrong envelope identities reject in topic registered site context',async()=>{const f=fixture();assert.equal(await f.ingest.accept(topic,{...examples.pm2230Energy,siteId:'OTHER'}),null);assert.equal(f.samples.length,0);assert.equal(f.rejects[0]?.[1],'s');});
test('poor quality preserves samples and excludes billing cumulative energy',async()=>{const f=fixture();await f.ingest.accept(topic,{...examples.pm2230Energy,quality:{status:'bad',communication:'offline'}});assert.ok(f.samples.length);assert.equal(f.raws[0]?.[6],null);assert.equal(f.raws[0]?.[7],"invalid");});
test('independent groups and late readings all persist with original polledAt',async()=>{const f=fixture();await f.ingest.accept(topic,examples.pm2230Energy);await f.ingest.accept(topic,examples.pm2230Realtime);const late=structuredClone(examples.pm2230Energy);late.messageId='late';late.timestamps.polledAt='2020-01-01T00:00:00Z';await f.ingest.accept(topic,late);assert.equal(f.raws.length,3);assert.ok(f.samples.some(v=>v.includes('2020-01-01T00:00:00Z')));});



test('durable replay still accepts original revision after explicit device upgrade',async()=>{let profile=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);const f=fixture({profile:()=>profile});const original=await f.ingest.accept(topic,examples.pm2230Energy);profile={...profile,version:'2.0.0'};const duplicate=await f.ingest.accept(topic,examples.pm2230Energy);assert.ok(duplicate);assert.equal(duplicate.acceptedAt,original?.acceptedAt);assert.equal(f.raws.length,1);});
