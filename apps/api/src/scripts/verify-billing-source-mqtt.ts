/** Additive real MQTT integration. Run only against the explicitly enabled local TEST fixture. */
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mqtt from 'mqtt';
import { DatabaseService } from '../database/database.service.js';
import { IngestionDatabaseService } from '../modules/telemetry/ingestion-database.service.js';
import { MqttIngestionService } from '../modules/telemetry/mqtt-ingestion.service.js';
import { BillingSourceBindingService } from '../modules/billing/billing-source-binding.service.js';
import { LocalFinancialApplicationService } from '../modules/billing/local-financial-application.service.js';
import { FinancialReadinessService } from '../modules/billing/financial-readiness.service.js';
import { localFinancialBinding } from '../modules/billing/local-financial-policy.js';
import { validatePayloadProfile } from '../modules/telemetry/payload-profile.js';
if(process.env.BILLING_SOURCE_TEST_ISOLATED!=='true'||!localFinancialBinding())throw Error('Explicit isolated local financial TEST environment required');
const broker=process.env.LOCAL_BILLING_MQTT_URL;
if(!broker||!['localhost','127.0.0.1','[::1]'].includes(new URL(broker).hostname))throw Error('Explicit loopback LOCAL_BILLING_MQTT_URL required');
const db=new DatabaseService({statementTimeout:1500});
const readiness=new FinancialReadinessService(db),sources=new BillingSourceBindingService(db),financial=new LocalFinancialApplicationService(db,readiness);
await readiness.assertEnabled('calculate'); // Never bypass the normal policy gate.
const run=randomUUID().replaceAll('-',''),siteId=randomUUID(),schoolId=randomUUID(),gatewayId=randomUUID(),deviceId=randomUUID(),extraDeviceId=randomUUID(),revisionId=randomUUID(),meterId=randomUUID(),contractId=randomUUID(),recipientId=randomUUID();
const externalSite=`BILL-${run}`,externalGateway=`GW-${run}`,externalDevice='MAIN';
const topic=`solar/v1/sites/${externalSite}/gateways/${externalGateway}/devices/${externalDevice}/telemetry`,ackTopic=`solar/v1/sites/${externalSite}/gateways/${externalGateway}/dataAcept`;
const profile=validatePayloadProfile({id:`bill-${run}`,version:'1.0.0',schemaVersion:'1.1',displayName:'Synthetic delivery meter',deviceType:'energy-meter',pollGroups:['energy'],fields:[{tag:'energy.active.import.total',sourceTag:'meter.wh',displayName:'Delivery counter',pollGroup:'energy',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',role:'billing-import'}]});
const source={deviceId,profileRevisionId:revisionId,sourceTag:'meter.wh',canonicalTag:'energy.active.import.total',sourceUnit:'Wh',targetUnit:'kWh',conversion:'wh-to-kwh',measurementPurpose:'solar-delivered'};
const options={reconnectPeriod:0,connectTimeout:5000,...(process.env.MQTT_USERNAME?{username:process.env.MQTT_USERNAME}:{}),...(process.env.MQTT_PASSWORD?{password:process.env.MQTT_PASSWORD}:{})};
const receiver=mqtt.connect(broker,{...options,clientId:`billing-rx-${run}`}),sender=mqtt.connect(broker,{...options,clientId:`billing-tx-${run}`});
const connected=(client:mqtt.MqttClient)=>new Promise<void>((resolve,reject)=>{client.once('connect',()=>resolve());client.once('error',reject);});
const ready=Promise.all([connected(receiver),connected(sender)]);
const acks=new Map<string,any>();let receiveError:unknown;let handled=0;
const ingress=new IngestionDatabaseService();
const service=new MqttIngestionService(db,ingress);
receiver.on('message',(incoming,bytes)=>{void service.handleIncomingMessage(incoming,bytes,receiver,null).then(()=>{handled++;}).catch(error=>{receiveError=error;});});
sender.on('message',(_incoming,bytes)=>{const ack=JSON.parse(bytes.toString());acks.set(ack.messageId,ack);});
async function poll<T>(read:()=>Promise<T>,check:(v:T)=>boolean){for(let n=0;n<100;n++){if(receiveError)throw receiveError;const result=await read();if(check(result))return result;await new Promise(r=>setTimeout(r,50));}throw Error('MQTT persistence timed out');}
let sequence=0;
function payload(name:string,time:string,value:number){return {schemaVersion:'1.1',messageType:'telemetry',messageId:`${run}-${name}`,sequence:++sequence,lotNumber:sequence,siteId:externalSite,gatewayId:externalGateway,device:{deviceId:externalDevice,deviceType:profile.deviceType,profileId:profile.id,profileVersion:profile.version},pollGroup:'energy',timestamps:{polledAt:time,sentAt:new Date().toISOString()},data:{values:{'meter.wh':value} as Record<string,number>,units:{'meter.wh':'Wh'} as Record<string,string>},quality:{status:'good',communication:'online'}};}
async function publish(p:unknown){const before=handled;await sender.publishAsync(topic,JSON.stringify(p),{qos:1});await poll(async()=>handled,n=>n>before);}
async function raw(id:string){return (await db.query(`SELECT * FROM telemetry_raw WHERE site_id=$1 AND raw_payload->>'messageId'=$2`,[siteId,id])).rows;}
async function accepted(p:ReturnType<typeof payload>){await publish(p);await poll(async()=>acks.get(p.messageId),Boolean);const rows=await raw(p.messageId);assert.equal(rows.length,1);return rows[0]!;}
const checks:string[]=[];
try{
 await ready;
 const actor=(await db.query("SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1")).rows[0];assert.ok(actor,'Existing synthetic admin required');
 // Add new identities only. Preserve every existing fixture row and document original.
 await db.transaction(async client=>{
  await client.query("INSERT INTO schools(id,name,code,region) VALUES($1,$2,$3,'TEST')",[schoolId,`Billing MQTT ${run}`,`BILL-${run}`]);
  await client.query("INSERT INTO users(id,email,display_name,role,school_id,email_verified_at,verified_email) VALUES($1,$2,'Synthetic MQTT customer','school_user',$3,now(),$2)",[recipientId,`billing-${run}@solar-platform.invalid`,schoolId]);
  await client.query('INSERT INTO sites(id,school_id,name,capacity_mwp,external_site_id) VALUES($1,$2,$3,1,$4)',[siteId,schoolId,`Billing MQTT ${run}`,externalSite]);
  await client.query("INSERT INTO gateways(id,site_id,name,protocol,endpoint,external_gateway_id,status) VALUES($1,$2,$3,'mqtt',$4,$3,'offline')",[gatewayId,siteId,externalGateway,topic.replace('/MAIN/','/+/')]);
  await client.query('INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES($1,$2,$3,$4)',[revisionId,profile.id,profile.version,JSON.stringify(profile)]);
  for(const [id,external] of [[deviceId,'MAIN'],[extraDeviceId,'EXTRA']])await client.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number,external_device_id,payload_profile_revision_id) VALUES($1,$2,$3,$4,'meter','Synthetic',$1::uuid::text,$4,$5)",[id,gatewayId,siteId,external,revisionId]);
  await client.query('INSERT INTO billing_meters(id,site_id,device_id) VALUES($1,$2,$3)',[meterId,siteId,deviceId]);
  await client.query("INSERT INTO contracts(id,site_id,version,start_date,end_date,payment_terms,signer_name,payment_term_days,company_name,tax_id,tax_address,recipient_user_ids) VALUES($1,$2,1,'2020-01-01','2021-12-31','Synthetic test','TEST',30,'Synthetic customer','0000000000000','Synthetic address',ARRAY[$3::uuid])",[contractId,siteId,recipientId]);
  await client.query("INSERT INTO rate_versions(id,contract_id,effective_from,rate) VALUES($1,$2,'2020-01-01',3.5)",[randomUUID(),contractId]);
 });
 await assert.rejects(sources.bind(siteId,{...source,deviceId:extraDeviceId},actor.id),/main billing meter/);
 await assert.rejects(sources.bind(siteId,{...source,deviceId:randomUUID()},actor.id),/main billing meter/);
 for(const patch of [{sourceTag:'other'},{sourceUnit:'kWh'},{conversion:'identity'},{profileRevisionId:randomUUID()},{measurementPurpose:'other'}])await assert.rejects(sources.bind(siteId,{...source,...patch},actor.id));
 const binding=await sources.bind(siteId,source,actor.id);assert.ok(binding);checks.push('Explicit main source, scope, field, unit, conversion and purpose validated');
 await ready;await Promise.all([receiver.subscribeAsync(topic.replace('/MAIN/','/+/'),{qos:1}),sender.subscribeAsync(ackTopic,{qos:1})]);
 const opening=payload('opening','2020-01-31T17:00:00Z',10000000),closing=payload('closing','2020-02-29T17:00:00Z',11234567);
 const first=await accepted(opening),last=await accepted(closing);
 for(const row of [first,last]){assert.equal(row.mapping_version_id,null);assert.equal(row.payload_profile_revision_id,revisionId);assert.equal(row.billing_source_binding_id,binding.id);assert.equal(row.quality,'complete');}
 assert.equal((await db.query('SELECT status FROM gateways WHERE id=$1',[gatewayId])).rows[0]?.status,'offline');
 assert.equal((await sources.get(siteId)).latestVerifiedReading?.fresh,false);checks.push('Valid historical backfill is complete while gateway remains offline');
 const cycle=(await financial.calculate(siteId,'2020-02-01','2020-02-29')).cycles[0]!;
 assert.equal(cycle.meter_snapshot[0].consumedKwh,'1234.567');assert.equal(Number(cycle.consumed_kwh),1234.567);assert.equal(Number(cycle.amount),4623.45);
 assert.equal(cycle.meter_snapshot[0].opening.id,first.id);assert.equal(cycle.meter_snapshot[0].closing.id,last.id);assert.equal(cycle.meter_snapshot[0].opening.payload_profile_revision_id,revisionId);
 assert.equal(cycle.meter_snapshot[0].opening.billing_source_binding_id,binding.id);checks.push('Real MQTT boundaries yield 1234.567 kWh × 3.5 plus TEST tax = 4623.45');
 await publish({...opening,timestamps:{...opening.timestamps,sentAt:new Date().toISOString()}});assert.equal((await raw(opening.messageId)).length,1);
 await publish({...opening,data:{...opening.data,values:{'meter.wh':10000001}}});assert.equal((await raw(opening.messageId))[0]?.normalized_value,first.normalized_value);checks.push('Duplicate/replayed messages never rewrite original readings');
 const future=payload('future',new Date(Date.now()+86400000).toISOString(),12000000);await publish(future);assert.equal((await raw(future.messageId)).length,0);
 const wrongUnit=payload('unit','2020-03-01T17:00:00Z',12000000);wrongUnit.data.units['meter.wh']='kWh';await publish(wrongUnit);assert.equal((await raw(wrongUnit.messageId)).length,0);
 const wrongSite=payload('site','2020-03-01T17:00:00Z',12000000);wrongSite.siteId='WRONG';await publish(wrongSite);assert.equal((await raw(wrongSite.messageId)).length,0);
 const wrongField=payload('field','2020-03-31T17:00:00Z',12000000);wrongField.data={values:{'other':12000000},units:{'other':'Wh'}};const missing=await accepted(wrongField);assert.equal(missing.normalized_value,null);await assert.rejects(financial.calculate(siteId,'2020-03-01','2020-03-31'),/Incomplete|Missing/);
 const invalid=payload('invalid','2020-04-30T17:00:00Z',13000000);invalid.quality.status='bad';assert.equal((await accepted(invalid)).normalized_value,null);
 await assert.rejects(financial.calculate(siteId,'2020-04-01','2020-04-30'));
 await accepted(payload('reset-open','2020-05-31T17:00:00Z',20000000));await accepted(payload('reset-mid','2020-06-15T17:00:00Z',100000));await accepted(payload('reset-close','2020-06-30T17:00:00Z',21000000));
 await assert.rejects(financial.calculate(siteId,'2020-06-01','2020-06-30'),/reset/);checks.push('Wrong scope/unit/field, future, invalid, missing and intermediate reset data blocked');
 // Additional devices retain telemetry but do not gain a billing source from the role.
 const extra=payload('extra','2020-08-31T17:00:00Z',50000000);extra.device.deviceId='EXTRA';await sender.publishAsync(topic.replace('/MAIN/','/EXTRA/'),JSON.stringify(extra),{qos:1});const extraRow=await poll(()=>raw(extra.messageId),r=>r.length===1);assert.equal(extraRow[0]?.normalized_value,null);
 const replacement=await sources.bind(siteId,{...source,measurementPurpose:'grid-import',billingImpactConfirmed:true},actor.id);assert.notEqual(replacement?.id,binding.id);
 await accepted(payload('changed-source','2020-07-31T17:00:00Z',22000000));await assert.rejects(financial.calculate(siteId,'2020-07-01','2020-07-31'),/Changed billing source/);
 assert.equal((await raw(opening.messageId))[0]?.billing_source_binding_id,binding.id);checks.push('Prospective binding change preserves old evidence and blocks mixed-source arithmetic');
 const nextRevision=randomUUID(),nextProfile=validatePayloadProfile({...profile,version:'1.0.1',sourceProfile:{id:profile.id,version:profile.version}});
 await db.query('INSERT INTO payload_profile_revisions(id,profile_id,version,config) VALUES($1,$2,$3,$4)',[nextRevision,nextProfile.id,nextProfile.version,JSON.stringify(nextProfile)]);
 await db.query('UPDATE devices SET payload_profile_revision_id=$2 WHERE id=$1',[deviceId,nextRevision]);
 const changed=await accepted(payload('profile-change','2020-09-30T17:00:00Z',23000000));assert.equal(changed.normalized_value,null);assert.equal(changed.billing_source_binding_id,null);assert.equal((await sources.get(siteId)).status,'profile-changed');
 assert.equal((await raw(opening.messageId))[0]?.payload_profile_revision_id,revisionId);
 await sources.bind(siteId,{...source,profileRevisionId:nextRevision,billingImpactConfirmed:true},actor.id);
 await publish({...opening,timestamps:{...opening.timestamps,sentAt:new Date().toISOString()}});assert.equal((await raw(opening.messageId)).length,1);assert.equal((await raw(opening.messageId))[0]?.payload_profile_revision_id,revisionId);checks.push('Profile changes require explicit rebind; old data and durable replay retain original decoding');
 console.log(JSON.stringify({run,siteId,schoolId,deviceId,contractId,cycleId:cycle.id,openingId:first.id,closingId:last.id,profileRevisionId:revisionId,bindingId:binding.id,consumedKwh:cycle.consumed_kwh,amount:cycle.amount,checks},null,2));
}finally{await Promise.all([receiver.endAsync(true),sender.endAsync(true)]);await ingress.beforeApplicationShutdown();await db.onModuleDestroy();}
