import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PayloadIngestion } from './payload-ingestion.js';
import { DEFAULT_PAYLOAD_PROFILES, type PayloadProfile } from './payload-profile.js';
const examples = JSON.parse(readFileSync(new URL('./fixtures/payload-examples-v1.1.json', import.meta.url), 'utf8')).payloads;
const topic = 'solar/v1/sites/SITE-001/gateways/GW-001/devices/METER-001/telemetry';
function fixture(options: {siteUnavailable?:boolean;gatewayUnavailable?:boolean;mqttSuspended?:boolean;configurationProfileRevision?:string;legacyConfigurationProfileRevision?:string;configurationBindingCount?:number;assignedProfiles?:{revisionId:string;config:PayloadProfile}[];changedDuringCommit?:boolean; unbound?:boolean; mismatch?:boolean; fail?: boolean; commit?: () => Promise<void>; profile?:()=>PayloadProfile; lifecycleState?:string; appliedConfigVersion?:number; activeConfigHash?:string|null; desiredConfigVersion?:number; deviceStatus?:string;controlManaged?:boolean } = {}) {
 const events: string[] = [], samples: unknown[][] = [], raws: unknown[][] = [], rejects: unknown[][] = []; const messages = new Map<string, any>();
 const calls:{sql:string;values:unknown[]}[]=[];let pendingPresence=false,presence=0;
 const query = async (sql: string, values: any[] = []) => {
  calls.push({sql,values});
  if(sql.includes('FROM sites WHERE'))return {rows:options.siteUnavailable?[]:[{id:'s'}]};
  if(sql.startsWith('SELECT id FROM gateways'))return {rows:options.gatewayUnavailable||options.mqttSuspended&&sql.includes('NOT mqtt_access_suspended')?[]:[{id:'g'}]};
  if(sql.startsWith('UPDATE gateways')){pendingPresence=true;return {rows:options.gatewayUnavailable?[]:[{id:'g'}]};}
  if(sql.includes('FROM device_profile_assignments'))return {rows:options.assignedProfiles??[]};
  if(sql.includes('FROM gateway_configuration_device_bindings'))return {rows:options.configurationProfileRevision?Array.from({length:options.configurationBindingCount??1},()=>({revisionId:options.configurationProfileRevision,config:structuredClone(DEFAULT_PAYLOAD_PROFILES[0])})):[]};
  if(sql.startsWith('SELECT config FROM gateway_configuration_revisions'))return {rows:[{config:{schemaVersion:'1.1',messageType:'config',gatewayId:'GW-001',siteId:'SITE-001',configVersion:1,devices:[{deviceId:'METER-001',enabled:true,profileRevisionId:options.legacyConfigurationProfileRevision,mappings:[]}]}}]};
  if(sql.includes('FROM devices WHERE'))return {rows:[{revisionId:options.changedDuringCommit?'changed':'r'}]};
  if(sql.includes('SELECT billing_source_binding_id'))return {rows:[{id:options.unbound?null:'binding'}]};
  if (sql.includes('FROM devices d')) {
   const lifecycle=options.lifecycleState??'active',applied=options.appliedConfigVersion??1,hash=options.activeConfigHash===undefined?'a'.repeat(64):options.activeConfigHash,status=options.deviceStatus??'online';
   const managed=options.controlManaged??true;
   const managedGate=!sql.includes('control_managed_at IS NULL')||!managed||hash!==null&&applied>0;
   const gated=(!sql.includes("g.lifecycle_state='active'")||lifecycle==='active')&&(!sql.includes("d.status<>'disabled'")||status!=='disabled')&&(!sql.includes('NOT g.mqtt_access_suspended')||!options.mqttSuspended)&&managedGate;
   return {rows:gated?[{deviceId:'d',siteId:'s',gatewayId:'g',externalSiteId:'SITE-001',externalGatewayId:'GW-001',externalDeviceId:'METER-001',revisionId:'r',config:options.profile?.()??DEFAULT_PAYLOAD_PROFILES[0],billing:true,appliedConfigVersion:applied,activeConfigHash:hash,controlManagedAt:managed?'2026-10-20T00:00:00Z':null,desiredConfigVersion:options.desiredConfigVersion??applied,billingSource:options.unbound?null:{id:"binding",siteId:"s",deviceId:"d",profileRevisionId:options.mismatch?"other":"r",sourceTag:"energy.active.import.total",canonicalTag:"energy.active.import.total",sourceUnit:"Wh",targetUnit:"kWh",conversion:"wh-to-kwh"}}]:[]};
  }
  if (sql.includes('FROM gateways g')) return {rows:[{siteId:'s',gatewayId:'g'}]};
  if (sql === 'COMMIT') {await options.commit?.();if(pendingPresence)presence++;pendingPresence=false;events.push('commit');return {rows:[]};}
  if (sql === 'ROLLBACK') {pendingPresence=false;events.push('rollback');return {rows:[]};}
  if (sql.includes('INSERT INTO payload_messages')) {if(messages.has(values[3]))return {rows:[]};const row={id:values[0],digest:values[4],acceptedAt:values[5],config:structuredClone(options.profile?.()??DEFAULT_PAYLOAD_PROFILES[0])};messages.set(values[3],row);return {rows:[row]};}
  if(sql.includes('FROM payload_messages'))return {rows:messages.has(values[2])?[messages.get(values[2])]:[]};
  if(sql.includes('INSERT INTO payload_samples')) {if(options.fail)throw Error('write failed');samples.push(values);}
  if(sql.includes('INSERT INTO telemetry_raw'))raws.push(values);
  if(sql.includes('INSERT INTO payload_rejections'))rejects.push(values);
  return {rows:[]};
 };
 const db = {query,pool:{connect:async()=>({query,release(){}})}};
 const ingest = new PayloadIngestion(db as any);
 return {ingest,events,samples,raws,rejects,messages,calls,get presence(){return presence;}};
}
test('canonical acceptance waits for commit and duplicate returns original acceptedAt without samples',async()=>{
 let unblock!:()=>void;let committing=false;const f=fixture({commit:async()=>{if(!committing){committing=true;await new Promise<void>(r=>unblock=r);}}});
 const state:{ack:any}={ack:undefined};const pending=f.ingest.accept(topic,examples.pm2230Energy).then((a: any)=>{state.ack=a;return a;});
 for(let i=0;!committing && i<100;i++)await new Promise(r=>setImmediate(r));assert.equal(committing,true);assert.equal(state.ack,undefined);unblock();const ack=await pending;assert.ok(ack);assert.equal(ack.messageType,'dataAcept');assert.equal(f.raws[0]?.[6],152430.275);
 const count=f.samples.length;const dup=await f.ingest.accept(topic,{...examples.pm2230Energy,timestamps:{...examples.pm2230Energy.timestamps,sentAt:'2026-10-05T09:00:00+07:00'}});assert.ok(dup);assert.equal(dup.acceptedAt,ack.acceptedAt);assert.equal(f.samples.length,count);
});
test('persistence rollback returns no success ACK',async()=>{const f=fixture({fail:true});await assert.rejects(f.ingest.accept(topic,examples.pm2230Energy),/write failed/);assert.ok(f.events.includes('rollback'));});
test('conflicting reuse persists a rejection and never accepts',async()=>{const f=fixture();await f.ingest.accept(topic,examples.pm2230Energy);const changed=structuredClone(examples.pm2230Energy);changed.data.values['energy.active.import.total']++;assert.equal(await f.ingest.accept(topic,changed),null);assert.equal(f.rejects.length,1);});

test('conflicting messageId reuse cannot commit a gateway presence update',async()=>{
 const f=fixture();assert.ok(await f.ingest.accept(topic,examples.pm2230Energy));assert.equal(f.presence,1);
 const changed=structuredClone(examples.pm2230Energy);changed.data.values['energy.active.import.total']++;
 assert.equal(await f.ingest.accept(topic,changed),null);assert.equal(f.presence,1);assert.equal(f.rejects.length,1);
});
test('wrong envelope identities reject in topic registered site context',async()=>{const f=fixture();assert.equal(await f.ingest.accept(topic,{...examples.pm2230Energy,siteId:'OTHER'}),null);assert.equal(f.samples.length,0);assert.equal(f.rejects[0]?.[1],'s');});
for(const pending of [{lifecycleState:'configuring',appliedConfigVersion:0,activeConfigHash:null},{lifecycleState:'active',appliedConfigVersion:0,activeConfigHash:null}])test('pending initial configuration rejects telemetry until a positive version and hash are active',async()=>{
 const f=fixture({...pending,controlManaged:true});assert.equal(await f.ingest.accept(topic,examples.pm2230Energy),null);assert.equal(f.samples.length,0);assert.equal(f.raws.length,0);assert.equal(f.presence,0);
});
test('existing unmanaged canonical gateway remains compatible until explicit admin adoption',async()=>{
 const f=fixture({appliedConfigVersion:0,activeConfigHash:null,controlManaged:false});
 assert.ok(await f.ingest.accept(topic,examples.pm2230Energy),JSON.stringify(f.rejects));assert.equal(f.raws.length,1);
 const admission=f.calls.find(call=>call.sql.includes('FROM devices d'))!;
 assert.match(admission.sql,/control_managed_at IS NULL/);
});
test('suspended gateway is rejected at telemetry admission',async()=>{
 const f=fixture({mqttSuspended:true});
 assert.equal(await f.ingest.accept(topic,examples.pm2230Energy),null);
 assert.equal(f.samples.length,0);assert.equal(f.raws.length,0);
 assert.match(f.calls.find(call=>call.sql.includes('FROM devices d'))!.sql,/NOT g\.mqtt_access_suspended/);
});
test('disabled devices are rejected even when their old profile row still exists',async()=>{const f=fixture({deviceStatus:'disabled'});assert.equal(await f.ingest.accept(topic,examples.pm2230Energy),null);assert.equal(f.raws.length,0);});
test('a later desired revision does not interrupt telemetry on the applied active revision',async()=>{
 const f=fixture({appliedConfigVersion:1,desiredConfigVersion:2,activeConfigHash:'a'.repeat(64),configurationProfileRevision:'r'});
 assert.ok(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:1}));assert.equal(f.raws.length,1);
 const admission=f.calls.find(call=>call.sql.includes('FROM devices d'))!;assert.doesNotMatch(admission.sql,/desired_config_version\s*=\s*g\.applied_config_version/i);
});
test('telemetry cannot claim a desired configuration version that is not active yet',async()=>{
 const f=fixture({appliedConfigVersion:1,desiredConfigVersion:2,activeConfigHash:'a'.repeat(64),configurationProfileRevision:'r'});
 assert.equal(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:2}),null);assert.equal(f.raws.length,0);assert.match(String(f.rejects[0]?.[4]),/active configuration version/i);
});
test('poor quality preserves samples and excludes billing cumulative energy',async()=>{const f=fixture();await f.ingest.accept(topic,{...examples.pm2230Energy,quality:{status:'bad',communication:'offline'}});assert.ok(f.samples.length);assert.equal(f.raws[0]?.[6],null);assert.equal(f.raws[0]?.[7],"invalid");});
test('independent groups and late readings all persist with original polledAt',async()=>{const f=fixture();await f.ingest.accept(topic,examples.pm2230Energy);await f.ingest.accept(topic,examples.pm2230Realtime);const late=structuredClone(examples.pm2230Energy);late.messageId='late';late.timestamps.polledAt='2020-01-01T00:00:00Z';await f.ingest.accept(topic,late);assert.equal(f.raws.length,3);assert.ok(f.samples.some(v=>v.includes('2020-01-01T00:00:00Z')));});



test('durable replay still accepts original revision after explicit device upgrade',async()=>{let profile=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);const f=fixture({profile:()=>profile});const original=await f.ingest.accept(topic,examples.pm2230Energy);profile={...profile,version:'2.0.0'};const duplicate=await f.ingest.accept(topic,examples.pm2230Energy);assert.ok(duplicate);assert.equal(duplicate.acceptedAt,original?.acceptedAt);assert.equal(f.raws.length,1);});

test('validated delayed counters stay complete for historical billing',async()=>{const f=fixture();const p=structuredClone(examples.pm2230Energy);p.timestamps.polledAt='2020-01-01T00:00:00Z';await f.ingest.accept(topic,p);assert.equal(f.raws[0]?.[7],'complete');});
test('billing role alone cannot populate an unbound billing counter',async()=>{const f=fixture({unbound:true});await f.ingest.accept(topic,examples.pm2230Energy);assert.equal(f.raws[0]?.[6],null);});
test('changed profile cannot populate the old bound counter',async()=>{const f=fixture({mismatch:true});await f.ingest.accept(topic,examples.pm2230Energy);assert.equal(f.raws[0]?.[6],null);});


test('future source and negative selected counters never become billable',async()=>{const f=fixture();const future=structuredClone(examples.pm2230Energy);future.timestamps.polledAt=new Date(Date.now()+86400000).toISOString();assert.equal(await f.ingest.accept(topic,future),null);const negative=structuredClone(examples.pm2230Energy);negative.messageId='negative';negative.data.values['energy.active.import.total']=-1;await f.ingest.accept(topic,negative);assert.equal(f.raws[0]?.[6],null);assert.equal(f.raws[0]?.[7],'invalid');});
test('missing selected energy field preserves binding for incomplete-data review',async()=>{const f=fixture();const p=structuredClone(examples.pm2230Energy);delete p.data.values['energy.active.import.total'];delete p.data.units['energy.active.import.total'];await f.ingest.accept(topic,p);assert.equal(f.raws[0]?.[6],null);assert.equal(f.raws[0]?.[17],'binding');});

test('mapping changes between validation and commit abort before persistence',async()=>{const f=fixture({changedDuringCommit:true});await assert.rejects(f.ingest.accept(topic,examples.pm2230Energy),/changed.*retry/i);assert.equal(f.raws.length,0);assert.equal(f.samples.length,0);});

test('new late messages from registered old sender versions retain their immutable decoder',async()=>{
 const old=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);const current={...structuredClone(old),version:'2.0.0'};
 const f=fixture({profile:()=>current,assignedProfiles:[{revisionId:'old',config:old},{revisionId:'r',config:current}]});
 const ack=await f.ingest.accept(topic,examples.pm2230Energy);
 assert.ok(ack);assert.equal(f.samples[0]?.[5],'old');assert.equal(f.raws[0]?.[9],'old');assert.equal(f.raws[0]?.[6],null);
});
test('ambiguous sender identity after local profile edits is quarantined instead of guessed',async()=>{
 const old=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!);const current=structuredClone(old);current.fields[0]!.tag='electrical.voltage.changed';
 const f=fixture({profile:()=>current,assignedProfiles:[{revisionId:'old',config:old},{revisionId:'r',config:current}]});
 assert.equal(await f.ingest.accept(topic,examples.pm2230Energy),null);assert.equal(f.samples.length,0);assert.match(String(f.rejects[0]?.[4]),/ambiguous/i);
});
test('explicit registered gateway configuration version resolves otherwise ambiguous decoder',async()=>{
 const old=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!),current=structuredClone(old);current.fields[0]!.tag='electrical.voltage.changed';
 const f=fixture({configurationProfileRevision:'old',profile:()=>current,assignedProfiles:[{revisionId:'old',config:old},{revisionId:'r',config:current}]});
 assert.ok(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:1}));assert.equal(f.samples[0]?.[5],'old');
});

test('strict config payload version resolves through its immutable device binding without a profileRevisionId field',async()=>{
 const old=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!),current=structuredClone(old);current.fields[0]!.tag='electrical.voltage.changed';
 const f=fixture({configurationProfileRevision:'old',profile:()=>current,assignedProfiles:[{revisionId:'old',config:old},{revisionId:'r',config:current}]});
 const payload={...examples.pm2230Energy,configurationVersion:1};
 assert.ok(await f.ingest.accept(topic,payload));
 assert.equal(f.samples[0]?.[5],'old');
 const lookup=f.calls.find(call=>call.sql.includes('FROM gateway_configuration_device_bindings'))!;
 assert.deepEqual(lookup.values,['g',1,'METER-001']);
 assert.doesNotMatch(lookup.sql,/config\s*->\s*'devices'|profileRevisionId/);
});

test('unmanaged legacy versioned telemetry uses only its explicit immutable snapshot profile revision',async()=>{
 const old=structuredClone(DEFAULT_PAYLOAD_PROFILES[0]!),current=structuredClone(old);current.fields[0]!.tag='electrical.voltage.changed';
 const f=fixture({controlManaged:false,appliedConfigVersion:1,activeConfigHash:null,legacyConfigurationProfileRevision:'old',profile:()=>current,
  assignedProfiles:[{revisionId:'old',config:old},{revisionId:'r',config:current}]});
 assert.ok(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:1}));
 assert.equal(f.samples[0]?.[5],'old');
});

test('unmanaged legacy versioned telemetry never guesses when snapshot has no explicit profile revision',async()=>{
 const f=fixture({controlManaged:false,appliedConfigVersion:1,activeConfigHash:null,assignedProfiles:[{revisionId:'r',config:DEFAULT_PAYLOAD_PROFILES[0]!}]});
 assert.equal(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:1}),null);
 assert.match(String(f.rejects[0]?.[4]),/unambiguous|registered device/i);
});

test('configuration version binding ambiguity is rejected instead of guessing a decoder',async()=>{
 const f=fixture({configurationProfileRevision:'old',configurationBindingCount:2,assignedProfiles:[{revisionId:'old',config:DEFAULT_PAYLOAD_PROFILES[0]!}]});
 assert.equal(await f.ingest.accept(topic,{...examples.pm2230Energy,configurationVersion:1}),null);
 assert.match(String(f.rejects[0]?.[4]),/ambiguous|registered device/i);
});

test('registered acceptance locks site and gateway before device locks and every payload FK write',async()=>{
 const f=fixture();assert.ok(await f.ingest.accept(topic,examples.pm2230Energy,'broker'));
 const admission=f.calls.find(c=>c.sql.includes('FROM devices d'))!;
 const siteLock=f.calls.findIndex(c=>c.sql.includes('FROM sites WHERE')&&c.sql.includes('FOR KEY SHARE'));
 const gatewayLock=f.calls.findIndex(c=>c.sql.startsWith('SELECT id FROM gateways')&&c.sql.includes('FOR UPDATE'));
 const deviceLock=f.calls.findIndex(c=>c.sql.includes('FROM devices WHERE')&&c.sql.includes('FOR SHARE'));
 assert.ok(siteLock>=0&&gatewayLock>siteLock&&deviceLock>gatewayLock);
 for(const [index,call]of f.calls.entries())if(/INSERT INTO (payload_messages|payload_samples|telemetry_raw)/.test(call.sql))assert.ok(index>deviceLock);
 assert.match(admission.sql,/g\.lifecycle_state='active'/);assert.match(admission.sql,/g\.applied_config_version>0/);assert.match(admission.sql,/g\.active_config_hash IS NOT NULL/);assert.match(admission.sql,/NOT g\.mqtt_access_suspended/);
 assert.match(admission.sql,/d\.status<>'disabled'/);assert.match(admission.sql,/d\.payload_profile_revision_id IS NOT NULL/);assert.deepEqual(admission.values,['SITE-001','GW-001','METER-001',false,'broker']);
 const query=f.calls[gatewayLock]!;
 assert.match(query.sql,/retired_at IS NULL/);assert.match(query.sql,/lifecycle_state='active'/);assert.match(query.sql,/applied_config_version=\$6/);assert.match(query.sql,/active_config_hash=\$7/);assert.match(query.sql,/mqtt_broker_id IS NOT DISTINCT FROM/);assert.match(query.sql,/NOT mqtt_access_suspended/);
 assert.ok(query.values.includes('broker'));assert.ok(query.values.includes('GW-001'));assert.ok(query.values.includes('s'));
 assert.match(f.calls[deviceLock]!.sql,/status<>'disabled'/);assert.match(f.calls[deviceLock]!.sql,/payload_profile_revision_id IS NOT NULL/);
 assert.equal(f.calls.filter(c=>c.sql.startsWith('UPDATE gateways')).length,1);assert.equal(f.presence,1);
});

for(const failure of ['profile','persistence'] as const)test(`presence stays unchanged on ${failure} failure`,async()=>{
 const f=fixture(failure==='profile'?{changedDuringCommit:true}:{fail:true});
 await assert.rejects(f.ingest.accept(topic,examples.pm2230Energy));
 assert.ok(f.calls.findIndex(c=>c.sql.startsWith('SELECT id FROM gateways'))>=0);
 assert.equal(f.presence,0);assert.equal(f.events.at(-1),'rollback');
});

for(const changed of ['site','gateway'] as const)test(`registered ${changed} admission is revalidated inside transaction before device locks`,async()=>{
 const f=fixture(changed==='site'?{siteUnavailable:true}:{gatewayUnavailable:true});
 await assert.rejects(f.ingest.accept(topic,examples.pm2230Energy));
 assert.equal(f.samples.length,0);assert.equal(f.raws.length,0);assert.equal(f.presence,0);
 assert.ok(!f.calls.some(c=>c.sql.includes('FROM devices WHERE')&&c.sql.includes('FOR SHARE')));
});

test('concurrent registered-message burst and replay retain one durable acceptance per message',async()=>{
 const f=fixture(),messages=Array.from({length:64},(_,index)=>({...structuredClone(examples.pm2230Energy),messageId:'burst-'+index,
  sequence:index+1,lotNumber:index+1}));
 const first=await Promise.all(messages.map(message=>f.ingest.accept(topic,message)));
 assert.ok(first.every(ack=>ack?.status==='accepted'));assert.equal(f.messages.size,64);assert.equal(f.raws.length,64);
 const sampleCount=f.samples.length;
 const replay=await Promise.all(messages.map(message=>f.ingest.accept(topic,message)));
 assert.deepEqual(replay.map(ack=>ack?.acceptedAt),first.map(ack=>ack?.acceptedAt));
 assert.equal(f.messages.size,64);assert.equal(f.raws.length,64);assert.equal(f.samples.length,sampleCount);
 assert.equal(f.events.filter(event=>event==='commit').length,128);
});
