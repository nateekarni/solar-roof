import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayConfigurationService } from './gateway-configuration.service.js';
import { GatewayCredentialService } from './gateway-credential.service.js';
import { GatewayRegistrationService } from './gateway-registration.service.js';
import { GatewayOnboardingController } from './gateway-onboarding.controller.js';
import { MqttIngestionService } from '../telemetry/mqtt-ingestion.service.js';
import { gatewayConfigHash } from './gateway-control-payload.js';

const runtime=createRequire(import.meta.url)('mqtt/mqtt');
const siteId='22222222-2222-4222-8222-222222222222',discoveryId='11111111-1111-4111-8111-111111111111';
const brokerId='44444444-4444-4444-8444-444444444444',otherBrokerId='55555555-5555-4555-8555-555555555555';
const admin={user:{id:'33333333-3333-4333-8333-333333333333',role:'admin'}};
const flush=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function until(predicate:()=>boolean){const deadline=Date.now()+2000;while(!predicate()&&Date.now()<deadline)await flush();assert.ok(predicate(),'Expected asynchronous production operation to finish');}
type State={gateway:any;revisions:Map<number,any>;proposals:Map<string,any>;attempts:Map<string,any>};

// SQL and MQTT are the only doubles: controller, configuration, registration,
// credential generation, commit handling, discovery and publish runtime are real.
function fixture(context:TestContext,scope:string|null=null){
 let state:State={gateway:null,revisions:new Map(),proposals:new Map(),attempts:new Map()},commitGate:(()=>Promise<void>)|undefined;
 let failPublication=false,holdPublication=false,failCompletion=false,commits=0;
 const publicationCallbacks=new Map<number,Function>(),receivers=new Map<number,()=>void>(),retained=new Map<string|null,any>();
 const publications:{scope:string|null;topic:string;payload:any;options:any;commits:number}[]=[],scans:(string|null)[]=[];
 const execute=async(current:State,sql:string,values:any[]=[])=>{
  if(sql.includes('FROM mqtt_brokers'))return {rows:[brokerId,otherBrokerId].map(id=>({id,url:`mqtt://${id}`,username:'',password_cipher:'',topics:[]}))};
  if(sql.includes('published_at IS NULL')){
   scans.push(values[0]);assert.match(sql,/mqtt_broker_id IS NOT DISTINCT FROM \$1::uuid/);
   const gateway=current.gateway,revision=gateway&&current.revisions.get(gateway.desired_config_version);
   return {rows:gateway&&gateway.mqtt_broker_id===values[0]&&(!values[1]||gateway.id>values[1])&&revision&&(!revision.published_at||sql.includes('published_mqtt_broker_id IS DISTINCT FROM')&&revision.published_mqtt_broker_id!==gateway.mqtt_broker_id||current.attempts.size>0)
    ?[{gatewayId:gateway.id,version:gateway.desired_config_version}]:[]};
  }
  if(sql.includes('SELECT endpoint')||sql.includes('SELECT name, polling_interval_seconds'))return {rows:[]};
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
  if(sql.startsWith('INSERT INTO gateway_configuration_publications')){current.attempts.set(values[0],{id:values[0],gateway_id:values[1],version:values[2],config_hash:values[3],mqtt_broker_id:values[4],publication_epoch:values[5]});return {rows:[]};}
  if(sql.startsWith('DELETE FROM gateway_configuration_publications')){if(failCompletion)throw Error('Completion database failure');current.attempts.delete(values[1]);return {rows:[]};}
  if(sql.includes('FROM gateway_configuration_publications'))return {rows:current.attempts.has(values[1])?[current.attempts.get(values[1])]:[]};
  if(sql.includes('FROM discovered_gateways'))return {rows:[{id:discoveryId,discovery_revision:1,status:'unassigned',external_gateway_id:'GW-DELIVERY',client_id:'GW-DELIVERY',mqtt_broker_id:scope}]};
  if(sql.includes('FROM sites'))return {rows:[{id:siteId,external_site_id:'SITE-DELIVERY'}]};
  if(sql.startsWith('INSERT INTO gateways')){
   current.gateway={id:values[0],site_id:siteId,external_site_id:'SITE-DELIVERY',external_gateway_id:'GW-DELIVERY',mqtt_broker_id:scope,
    retired_at:null,protocol:'mqtt',lifecycle_state:'configuring',desired_config_version:0,applied_config_version:0,published_config_version:0,acknowledged_config_version:0,desired_config_hash:null,active_config_hash:null,config_publication_epoch:'0'};
   return {rows:[]};
  }
  if(sql.startsWith('INSERT INTO gateway_configuration_revisions')){current.revisions.set(values[2],{config:JSON.parse(values[3]),config_hash:values[4],published_at:null});return {rows:[]};}
  if(sql.startsWith('UPDATE gateways SET desired_config_version')){Object.assign(current.gateway,{desired_config_version:values[1],desired_config_hash:values[2]});return {rows:[]};}
  if(sql.startsWith('UPDATE gateways SET published_config_version')){current.gateway.published_config_version=Math.max(current.gateway.published_config_version,values[1]);return {rows:[]};}
  if(sql.startsWith('UPDATE gateways SET config_publication_epoch')){current.gateway.config_publication_epoch=String(BigInt(current.gateway.config_publication_epoch)+1n);return {rows:[]};}
  if(sql.startsWith('UPDATE gateway_configuration_revisions SET published_at')){Object.assign(current.revisions.get(values[1]),{published_at:sql.includes('published_at=NULL')?null:'committed',published_mqtt_broker_id:values[2]});return {rows:[]};}
  if(sql.startsWith('INSERT INTO gateway_config_proposals')){
   const id=randomUUID();current.proposals.set(id,{id,gateway_id:values[0],proposal_id:values[1],message_id:values[2],base_config_version:values[3],payload:JSON.parse(values[4]),status:'pending'});return {rows:[{id}]};
  }
  if(sql.startsWith('UPDATE gateway_config_proposals SET status=')){current.proposals.get(values[0]).status='approved';return {rows:[]};}
  if(sql.includes('FROM gateway_config_proposals'))return {rows:current.proposals.has(values[0])?[current.proposals.get(values[0])]:[]};
  if(sql.includes('FROM gateway_configuration_revisions'))return {rows:current.revisions.has(values[1])?[current.revisions.get(values[1])]:[]};
  if(sql.startsWith('SELECT id FROM gateways WHERE site_id')||sql.startsWith('SELECT id FROM gateways WHERE external_gateway_id'))return {rows:current.gateway?[{id:current.gateway.id}]:[]};
  if(sql.includes('FROM gateways'))return {rows:current.gateway?[structuredClone(current.gateway)]:[]};
  if(sql.includes('FROM devices'))return {rows:[]};
  if(sql.startsWith('INSERT INTO audit_events')||sql.startsWith('UPDATE discovered_gateways')||sql.includes('gateway_mqtt_credentials'))return {rows:[]};
  throw Error('Unexpected SQL boundary: '+sql);
 };
 // Serialize SQL transactions like the gateway row lock, while allowing network
 // operations from independent API instances to overlap after COMMIT.
 let transactionTail=Promise.resolve();
 const db={query:(sql:string,values:any[]=[])=>execute(state,sql,values),transaction:DatabaseService.prototype.transaction,
  pool:{connect:async()=>{let current:State,releaseTransaction!:()=>void;return {query:async(sql:string,values:any[]=[])=>{
   if(sql==='BEGIN'){const previous=transactionTail;transactionTail=new Promise(r=>releaseTransaction=r);await previous;current=structuredClone(state);return {rows:[]};}
   if(sql==='COMMIT'){await commitGate?.();state=current;commits++;return {rows:[]};}
   if(sql==='ROLLBACK')return {rows:[]};
   return execute(current!,sql,values);
  },release(){releaseTransaction();}};}}} as unknown as DatabaseService;
 const clients=new Map<string|null,any>();
 context.mock.method(runtime,'connect',(url:string)=>{
  const broker=url===`mqtt://${brokerId}`?brokerId:url===`mqtt://${otherBrokerId}`?otherBrokerId:null;
  const client=Object.assign(new EventEmitter(),{connected:false,end(){this.connected=false;},reconnect(){},unsubscribe(){},
   subscribe(topic:string,_options:unknown,done:Function){done(null,[{topic,qos:1}]);},
   publish(topic:string,body:string,options:unknown,done:Function){const index=publications.length;publications.push({scope:broker,topic,payload:JSON.parse(body),options,commits});
    let received=false;const receive=()=>{if(!received){received=true;retained.set(broker,JSON.parse(body));}};receivers.set(index,receive);
    const complete=(error?:Error)=>{if(!error)receive();done(error);};
    if(holdPublication)publicationCallbacks.set(index,complete);else complete(failPublication?Error('unavailable'):undefined);}});
  clients.set(broker,client);return client;
 });
 const configuration=new GatewayConfigurationService(db,new GatewayCredentialService(db));
 const controller=new GatewayOnboardingController(new GatewayRegistrationService(db),configuration);
 let mqtt=new MqttIngestionService(db,db as any,configuration);
 const start=async()=>{await mqtt.onModuleInit();await flush();};
 const connect=async(broker:string|null=scope)=>{const client=clients.get(broker);assert.ok(client);client.connected=true;client.emit('connect');await flush();};
 const confirm=()=>controller.confirm(discoveryId,{discoveryRevision:1,siteId,devices:[]},admin);
 const propose=async()=>{
  // Model already applied hardware evidence; this orchestration test focuses on
  // desired publication and existing activation tests cover the evidence path.
  state.gateway.lifecycle_state='active';state.gateway.applied_config_version=1;
  await configuration.recordProposal({brokerId:scope,gatewayId:'GW-DELIVERY',payload:{schemaVersion:'1.1',messageType:'configUpdate',messageId:randomUUID(),
   gatewayId:'GW-DELIVERY',siteId:'SITE-DELIVERY',proposalId:randomUUID(),baseConfigVersion:1,sentAt:'2026-10-19T01:00:00Z',devices:[]}});
  return [...state.proposals.keys()].at(-1)!;
 };
 const peers:MqttIngestionService[]=[];
 return {configuration,controller,db,clients,publications,retained,scans,start,connect,confirm,propose,
  get state(){return state;},get mqtt(){return mqtt;},get commits(){return commits;},
  set commitGate(value:(()=>Promise<void>)|undefined){commitGate=value;},set failPublication(value:boolean){failPublication=value;},
  set failCompletion(value:boolean){failCompletion=value;},receivePublication(index:number){const receive=receivers.get(index);assert.ok(receive);receive();},
  set holdPublication(value:boolean){holdPublication=value;},completePublication(index:number,error?:Error){const done=publicationCallbacks.get(index);assert.ok(done);publicationCallbacks.delete(index);done(error);},
  completePublications(){const callbacks=[...publicationCallbacks.values()];publicationCallbacks.clear();callbacks.forEach(done=>done());},
  async peer(){const service=new MqttIngestionService(db,db as any,new GatewayConfigurationService(db,new GatewayCredentialService(db)));peers.push(service);await service.onModuleInit();await flush();return service;},
  async restart(){await mqtt.onModuleDestroy();mqtt=new MqttIngestionService(db,db as any,new GatewayConfigurationService(db,new GatewayCredentialService(db)));await start();},
  close:async()=>{await mqtt.onModuleDestroy();await Promise.all(peers.map(peer=>peer.onModuleDestroy()));}};
}

for(const operation of ['confirm','approve'] as const)test(`admin ${operation} publishes retained desired configuration only after its commit`,async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();
 try{
  let proposal:string|undefined;
  if(operation==='approve'){await f.confirm();await until(()=>f.state.gateway?.published_config_version===1);proposal=await f.propose();f.publications.length=0;}
  let release!:()=>void,committing=false;f.commitGate=async()=>{committing=true;await new Promise<void>(r=>release=r);};
  const result=operation==='confirm'?f.confirm():f.controller.approve(f.state.gateway.id,proposal!,{},admin);
  await until(()=>committing);assert.equal(f.publications.length,0);f.commitGate=undefined;release();await result;
  await until(()=>f.publications.length===1);await until(()=>f.state.gateway.published_config_version===(operation==='confirm'?1:2));
  const sent=f.publications[0]!;assert.equal(sent.scope,brokerId);assert.equal(sent.topic,'solar/v1/gateways/GW-DELIVERY/config');assert.deepEqual(sent.options,{qos:1,retain:true});
  assert.equal(sent.payload.configVersion,operation==='confirm'?1:2);assert.equal(sent.payload.configHash,gatewayConfigHash(sent.payload));
  assert.equal(f.state.gateway.applied_config_version,operation==='confirm'?0:1);assert.equal(f.state.gateway.acknowledged_config_version,0);
 }finally{f.commitGate=undefined;await f.close();}
});

for(const mode of ['offline','failure'] as const)test(`${mode} admin publication is recovered from durable desired state on broker reconnect`,async context=>{
 const f=fixture(context,brokerId);await f.start();if(mode==='failure')await f.connect();f.failPublication=mode==='failure';
 try{await f.confirm();await flush();assert.equal(f.state.gateway.published_config_version,0);assert.equal(f.state.revisions.get(1).published_at,null);
  f.publications.length=0;f.failPublication=false;await f.connect(otherBrokerId);await flush();assert.equal(f.publications.length,0,'other broker must not deliver this pending gateway');
  await f.connect();await until(()=>f.state.gateway.published_config_version===1);assert.equal(f.publications.length,1);assert.equal(f.publications[0]?.scope,brokerId);
 }finally{await f.close();}
});

test('new ingress instance recovers only current desired revision from database without in-memory notification',async context=>{
 const f=fixture(context);await f.start();
 try{await f.confirm();let proposal=await f.propose();await f.controller.approve(f.state.gateway.id,proposal,{},admin);
  proposal=await f.propose();await f.controller.approve(f.state.gateway.id,proposal,{},admin);assert.equal(f.state.gateway.desired_config_version,3);assert.equal(f.publications.length,0);
  await f.restart();await f.connect();await until(()=>f.state.gateway.published_config_version===3);
  assert.deepEqual(f.publications.map(p=>[p.scope,p.payload.configVersion]),[[null,3]]);assert.equal(f.state.revisions.get(1).published_at,null);assert.equal(f.state.revisions.get(2).published_at,null);
 }finally{await f.close();}
});

test('connected ingress periodically recovers a desired revision committed by a different API instance',async context=>{
 context.mock.timers.enable({apis:['setInterval']});const f=fixture(context,brokerId);await f.start();await f.connect();
 try{const webConfiguration=new GatewayConfigurationService(f.db,new GatewayCredentialService(f.db));
  await new GatewayOnboardingController(new GatewayRegistrationService(f.db),webConfiguration).confirm(discoveryId,{discoveryRevision:1,siteId,devices:[]},admin);
  assert.equal(f.publications.length,0);context.mock.timers.tick(5000);await until(()=>f.state.gateway.published_config_version===1);
  assert.equal(f.publications.length,1);context.mock.timers.tick(5000);await flush();assert.equal(f.publications.length,1,'published revision is no longer pending');
 }finally{await f.close();}
});

test('reconnect scan coalesces an already in-flight post-commit publication in this ingress instance',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();f.holdPublication=true;
 const confirming=f.confirm();
 try{await until(()=>f.publications.length>0);const scans=f.scans.length;await f.connect();await until(()=>f.scans.length>scans);
  await flush();assert.equal(f.publications.length,1);
 }finally{f.holdPublication=false;f.completePublications();await confirming;await f.close();}
});

for(const timedOut of [false,true])test(`two instances repair retained v3 after delayed v2 completes last (timed out: ${timedOut})`,async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();
 try{await f.confirm();f.holdPublication=true;
  if(timedOut)context.mock.timers.enable({apis:['setTimeout']});
  const proposal2=await f.propose(),approval2=f.controller.approve(f.state.gateway.id,proposal2,{},admin);
  await until(()=>f.publications.length===2);
  if(timedOut){context.mock.timers.tick(5000);await approval2;assert.equal(f.state.attempts.size,1,'timed out packet remains durable uncertain work');}
  const proposal3=await f.propose();const web=new GatewayConfigurationService(f.db,new GatewayCredentialService(f.db));
  await web.approveProposal(f.state.gateway.id,proposal3,admin.user.id);
  await f.peer();await f.connect();await until(()=>f.publications.length===3);
  f.completePublication(2);await until(()=>f.state.revisions.get(3).published_at!==null);
  assert.equal(f.retained.get(brokerId).configVersion,3);
  f.completePublication(1);await until(()=>f.publications.length===4);
  assert.equal(f.retained.get(brokerId).configVersion,2,'delayed old packet really overwrote retained config');
  assert.equal(f.state.revisions.get(3).published_at,null,'repair must remain durable until the corrective publish succeeds');
  assert.equal(f.publications[3]?.payload.configVersion,3);assert.equal(f.publications[3]?.scope,brokerId);
  f.completePublication(3);await approval2;await until(()=>f.state.revisions.get(3).published_at!==null);
  assert.equal(f.retained.get(brokerId).configVersion,3);assert.equal(f.state.revisions.get(2).published_at,null);
  assert.ok(f.publications.every(p=>p.options.qos===1&&p.options.retain===true));
 }finally{f.holdPublication=false;f.completePublications();await f.close();}
});

test('delayed newer bookkeeping cannot certify retained state invalidated by an older completion',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();
 try{await f.confirm();f.holdPublication=true;
  const proposal2=await f.propose(),approval2=f.controller.approve(f.state.gateway.id,proposal2,{},admin);
  await until(()=>f.publications.length===2);
  const proposal3=await f.propose();await new GatewayConfigurationService(f.db,new GatewayCredentialService(f.db)).approveProposal(f.state.gateway.id,proposal3,admin.user.id);
  await f.peer();await f.connect();await until(()=>f.publications.length===3);
  f.receivePublication(2);assert.equal(f.retained.get(brokerId).configVersion,3);
  f.completePublication(1);await until(()=>f.publications.length===4);assert.equal(f.retained.get(brokerId).configVersion,2);
  f.completePublication(2);await until(()=>f.publications.length===5);
  assert.equal(f.state.revisions.get(3).published_at,null,'old-epoch v3 ACK must not mark a retained v2 as published');
  f.completePublication(3);f.completePublication(4);await approval2;
  await until(()=>f.state.attempts.size===0);assert.equal(f.retained.get(brokerId).configVersion,3);
 }finally{f.holdPublication=false;f.completePublications();await f.close();}
});

test('failed stale completion transaction remains durable recovery work even when latest revision was published',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();
 try{await f.confirm();f.holdPublication=true;
  const proposal2=await f.propose(),approval2=f.controller.approve(f.state.gateway.id,proposal2,{},admin);
  await until(()=>f.publications.length===2);
  const proposal3=await f.propose();await new GatewayConfigurationService(f.db,new GatewayCredentialService(f.db)).approveProposal(f.state.gateway.id,proposal3,admin.user.id);
  await f.peer();await f.connect();await until(()=>f.publications.length===3);
  f.completePublication(2);await until(()=>f.state.revisions.get(3).published_at!==null);
  f.failCompletion=true;f.completePublication(1);await approval2;f.failCompletion=false;
  assert.equal(f.retained.get(brokerId).configVersion,2);assert.equal(f.state.attempts.size,1);
  await f.connect(otherBrokerId);await flush();assert.equal(f.publications.length,3);
  await f.connect();await until(()=>f.publications.length===4);f.completePublication(3);
  await until(()=>f.retained.get(brokerId).configVersion===3);assert.equal(f.publications[3]?.payload.configVersion,3);
 }finally{f.holdPublication=false;f.completePublications();await f.close();}
});

test('broker reassignment during delivery never books the old broker and repairs only the current broker',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();f.holdPublication=true;
 const confirming=f.confirm();
 try{await until(()=>f.publications.length===1);f.state.gateway.mqtt_broker_id=otherBrokerId;
  await f.peer();await f.connect(otherBrokerId);await until(()=>f.publications.length===2);
  f.completePublication(1);await until(()=>f.state.revisions.get(1).published_at!==null);
  f.completePublication(0);await until(()=>f.state.revisions.get(1).published_at===null);
  await confirming;assert.equal(f.publications.length,2,'original instance has no connected current broker');
  await f.connect(otherBrokerId);await until(()=>f.publications.length===3);
  assert.equal(f.publications[2]?.scope,otherBrokerId);f.completePublication(2);
  await until(()=>f.state.revisions.get(1).published_at!==null);
  assert.equal(f.state.revisions.get(1).published_mqtt_broker_id,otherBrokerId);
 }finally{f.holdPublication=false;f.completePublications();await f.close();}
});

test('old broker success without any current-broker delivery stays unpublished across reassignment',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();f.holdPublication=true;const confirming=f.confirm();
 try{await until(()=>f.publications.length===1);f.state.gateway.mqtt_broker_id=otherBrokerId;
  f.completePublication(0);await confirming;assert.equal(f.state.revisions.get(1).published_at,null);assert.equal(f.state.gateway.published_config_version,0);
  await f.connect(otherBrokerId);await until(()=>f.publications.length===2);f.completePublication(1);
  await until(()=>f.state.gateway.published_config_version===1);assert.equal(f.publications[1]?.scope,otherBrokerId);
 }finally{f.holdPublication=false;f.completePublications();await f.close();}
});

test('broker reassignment after successful publication is pending on its new scope without an in-flight callback',async context=>{
 const f=fixture(context,brokerId);await f.start();await f.connect();
 try{await f.confirm();assert.equal(f.state.revisions.get(1).published_mqtt_broker_id,brokerId);
  f.state.gateway.mqtt_broker_id=otherBrokerId;await f.connect(otherBrokerId);
  await until(()=>f.state.revisions.get(1).published_mqtt_broker_id===otherBrokerId);
  assert.deepEqual(f.publications.map(p=>p.scope),[brokerId,otherBrokerId]);
 }finally{await f.close();}
});
