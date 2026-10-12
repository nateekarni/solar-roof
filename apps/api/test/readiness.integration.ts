import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import mqtt from 'mqtt';
import {AuthService} from '../src/modules/identity/auth.service.js';

const database=process.env.READINESS_DATABASE_URL;
if(!database)throw new Error('Requires isolated solar_readiness test database');
const databaseUrl=new URL(database);
if(!['localhost','127.0.0.1'].includes(databaseUrl.hostname)||databaseUrl.port!=='15432'||databaseUrl.pathname!=='/solar_readiness')throw new Error('Requires local solar_readiness test database on port15432');
const base=process.env.READINESS_API_URL || 'http://127.0.0.1:13001';
const db=new Pool({connectionString:database});
const auth=new AuthService('readiness-test-access-secret-000000000000','readiness-test-refresh-secret-000000000000');
const suffix=randomUUID().slice(0,8);
const users:Record<string,{id:string;token:string}>={};
let broker:mqtt.MqttClient|undefined;
async function loginToken(email:string,role:string) {
  const response=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13000'},body:JSON.stringify({email,password:'Local-test-only-123!'})});
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.user.role,role);return data.accessToken as string;
}
async function request(role:string,path:string,method='GET',body?:unknown) {
  const res=await fetch(base+path,{method,headers:{Authorization:`Bearer ${users[role]!.token}`,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await res.text();return {status:res.status,body:text?JSON.parse(text):null};
}
try {
  for(const role of ['owner','admin','operator','accountant']) {
    const id=randomUUID(),email=`${role}-${suffix}@example.test`;
    await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,$3,$4,'active',$5)",[id,email,role,role,auth.hashPassword('Local-test-only-123!')]);
    users[role]={id,token:await loginToken(email,role)};
  }
  const unauthenticated=await fetch(base+'/v1/sites');
  assert.equal(unauthenticated.status,401);
  for (const role of ['admin','operator','accountant']) assert.equal((await request(role,'/v1/sites','POST',{})).status,403);
  const bootstrapLogin=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13000'},body:JSON.stringify({email:'bootstrap@example.test',password:'Ci-bootstrap-original-123!'})});
  assert.equal(bootstrapLogin.status,200,'Bootstrap rerun must preserve original password');
  const name=`readiness-${suffix}`;
  const created=await request('owner','/v1/sites','POST',{name,customerName:`Customer ${suffix}`,capacityMwp:0.1});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const site=created.body;
  const duplicate=await request('owner','/v1/sites','POST',{name:'Duplicate customer attachment',customerId:site.customerId});
  assert.equal(duplicate.status,409,JSON.stringify(duplicate.body));
  assert.equal((await db.query('SELECT count(*)::int AS count FROM sites WHERE customer_id=$1',[site.customerId])).rows[0].count,1,'Rejected attachment must not create another site');
  const gateway=await request('admin',`/v1/sites/${site.id}/gateway`,'POST',{name,topicContract:'legacy-energy',subscriptionTopic:`energy/${name}/#`,pollingIntervalSeconds:10});
  assert.equal(gateway.status,201,JSON.stringify(gateway.body));
  // Legacy ingestion fixture intentionally has a billing meter, with no PV profile.
  const device=randomUUID();
  await db.query("INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1,$2,$3,'Readiness meter','meter','fixture',$4)",[device,gateway.body.id,site.id,`meter-${suffix}`]);
  for(const [role,domain,rules] of [
    ['operator','technical',{'technical.dashboard.view':true,'technical.gateways.view':true,'technical.telemetry.view':true}],
    ['accountant','business',{'business.dashboard.view':true,'business.billing.view':true,'business.documents.view':true}],
  ] as const)await db.query("INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode,site_ids) VALUES($1,$2,$3::jsonb,'selected',$4::uuid[])",[users[role]!.id,domain,JSON.stringify(rules),[site.id]]);
  const userId=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash) VALUES($1,$2,'Customer user','customer_user','active',$3,$4)",[userId,`customer-${suffix}@example.test`,site.customerId,auth.hashPassword('Local-test-only-123!')]);
  await db.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[randomUUID(),userId,site.id]);
  users.customer={id:userId,token:await loginToken(`customer-${suffix}@example.test`,'customer_user')};
  const other=await request('owner','/v1/sites','POST',{name:`Other ${suffix}`,customerName:`Other customer ${suffix}`});
  assert.equal(other.status,201,JSON.stringify(other.body));
  assert.equal((await request('customer',`/v1/sites/${other.body.id}`)).status,403);
  assert.equal((await request('customer','/v1/operations/users')).status,403);
  assert.equal((await request('customer',`/v1/dashboard/summary?site_id=${other.body.id}`)).status,403);
  // A fixed historical range avoids dependence on the CI runner's current month.
  const summary=await request('customer','/v1/dashboard/summary?start_date=2026-01-01&end_date=2026-01-03');
  assert.equal(summary.status,200,JSON.stringify(summary.body));
  assert.deepEqual(summary.body.range,{start:'2026-01-01',end:'2026-01-03'});
  assert.deepEqual(summary.body.sites.map((row:{id:string})=>row.id),[site.id]);
  assert.deepEqual(summary.body.availableSites.map((row:{id:string})=>row.id),[site.id]);
  assert.equal(summary.body.stats.currentMw,null);assert.equal(summary.body.stats.periodKwh,null);
  assert.equal(summary.body.sites[0].productionKwh,null);assert.deepEqual(summary.body.rankings,[]);
  // This fixture has a billing meter and no Solar Logger: preserve unknown PV, never zero.
  assert.deepEqual(summary.body.production,['2026-01-01','2026-01-02','2026-01-03'].map(date=>({
    date,value:null,quality:'missing',watermark:null,
    reason:'solar_logger_unavailable_or_ambiguous',reasons:['solar_logger_unavailable_or_ambiguous'],
  })));
  assert.equal((await request('customer',`/v1/sites/${site.id}/live-telemetry`)).status,403);
  const initialLive=await request('admin',`/v1/sites/${site.id}/live-telemetry`);
  assert.equal(initialLive.status,200);assert.equal(initialLive.body,null);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM telemetry_raw WHERE device_id=$1',[device])).rows[0].count,0);
  for(const role of ['customer','owner']) assert.equal((await request(role,'/v1/reports','POST',{type:'energy',format:'csv'})).status,403);
  const scopeId=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status,customer_id,password_hash) VALUES($1,$2,'Scoped admin','admin','active',$3,$4)",[scopeId,`scoped-${suffix}@example.test`,site.customerId,auth.hashPassword('Local-test-only-123!')]);
  users.scoped={id:scopeId,token:await loginToken(`scoped-${suffix}@example.test`,'admin')};
  assert.equal((await request('scoped',`/v1/sites/${other.body.id}`)).status,403,'Technical manager cannot read business site detail');
  assert.equal((await request('scoped','/v1/gateways')).status,200,'Technical manager retains gateway access with legacy customer metadata');
  // Legacy customer metadata must not replace the operator's explicit site grant.
  await db.query('UPDATE users SET customer_id=$1 WHERE id=$2',[site.customerId,users.operator!.id]);
  users.operator!.token=await loginToken(`operator-${suffix}@example.test`,'operator');
  assert.equal((await request('owner','/v1/dashboard/summary?start_date=2026-01-01&end_date=2026-04-01')).status,400);
  assert.equal((await request('owner','/v1/dashboard/summary?period=year')).status,400);
    for(const role of ['owner','admin','operator','accountant','customer']) {
    assert.equal((await request(role,'/v1/reports','POST',{type:'energy',format:'csv'})).status,403,`${role} legacy report creation stays disabled`);
    assert.equal((await request(role,`/v1/jobs/${randomUUID()}`)).status,403,`${role} legacy jobs stay disabled`);
    assert.equal((await request(role,'/v1/history/options')).status,403,`${role} legacy history stays disabled`);
  }
broker=await mqtt.connectAsync(process.env.READINESS_MQTT_URL || 'mqtt://127.0.0.1:18883');
  const acknowledgements:Array<{duplicate:boolean}>=[],responses:unknown[]=[];
  await broker.subscribeAsync(`energy/${name}/response`);
  broker.on('message',(topic,message)=>{const response=JSON.parse(message.toString());if(topic===`energy/${name}/response`){responses.push(response);if(response.ingestionId===`test-${suffix}`&&response.deviceId===device)acknowledgements.push(response);}});
  async function waitForAck(count:number){const end=Date.now()+10000;while(acknowledgements.length<count&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(acknowledgements.length,count,'Expected correlated durable ACK');}
  const timestamp=new Date().toISOString();
  const payload=JSON.stringify({deviceId:device,timestamp,ingestionId:`test-${suffix}`,metrics:{activePower:1200,totalEnergy:100,voltage:230}});
  await broker.publishAsync(`energy/${name}/telemetry`,payload,{qos:1});await waitForAck(1);
  assert.equal(acknowledgements[0]!.duplicate,false);
  await broker.publishAsync(`energy/${name}/telemetry`,payload,{qos:1});await waitForAck(2);
  assert.equal(acknowledgements[1]!.duplicate,true);
  // Malformed data must be rejected without logging its payload or emitting ACKs.
  const {execFileSync}=await import('node:child_process');
  const apiLogs=()=>execFileSync('docker',['compose','-f','infra/ci/compose.yml','logs','--no-color','api'],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
  const rejectedCount=(text:string)=>Math.max(0,...text.split('\n').flatMap(line=>{
    const start=line.indexOf('{');if(start<0)return [];
    try{const event=JSON.parse(line.slice(start));return event.event==='metrics'&&Array.isArray(event.samples)?event.samples.filter((sample:any)=>sample.name==='ingress_rejected').map((sample:any)=>Number(sample.value)):[];}catch{return [];}
  }));
  const beforeRejection=rejectedCount(apiLogs()),beforeResponses=responses.length;
  await broker.publishAsync(`energy/${name}/telemetry`,'{"test-secret":',{qos:1});
  // Q2 suppresses exception/payload logs. Failed parse is a bounded metrics sample;
  // the existing metrics writer flushes every 30s, so allow one full flush interval.
  let logs='';const rejectedDeadline=Date.now()+35000;
  while(Date.now()<rejectedDeadline) {
    logs=apiLogs();
    if(rejectedCount(logs)>beforeRejection)break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(acknowledgements.length,2);
  assert.equal(responses.length,beforeResponses,'Malformed JSON emits no application response or ACK');
  assert.equal(logs.includes('test-secret'),false);
  assert.ok(rejectedCount(logs)>beforeRejection,'Structured metrics event records a new ingress_rejected sample after malformed JSON');
  const raw=await db.query('SELECT * FROM telemetry_raw WHERE device_id=$1',[device]);
  assert.equal(raw.rows.length,1);assert.equal(Number(raw.rows[0].active_power_w),1200);assert.ok(raw.rows[0].received_time);
  const live=await request('admin',`/v1/sites/${site.id}/live-telemetry`);
  assert.equal(live.status,200);assert.equal(live.body.metrics.activePower,1200);assert.equal(live.body.metrics.current,null);
  assert.equal(live.body.status,'online');
  const scopedLive=await request('operator',`/v1/sites/${site.id}/live-telemetry`);
  assert.equal(scopedLive.status,200);assert.equal(scopedLive.body.metrics.activePower,1200);
  assert.equal((await request('operator',`/v1/sites/${other.body.id}/live-telemetry`)).status,403,'Technical telemetry grant stays within its site scope');
  const customerLive=await request('customer','/v1/dashboard/summary');
  assert.equal(customerLive.status,200);assert.equal(customerLive.body.sites.length,1);assert.equal(customerLive.body.stats.currentMw,null);
  console.log('PASS: real HTTP authorization, customer isolation, cardinality, truthful missing generation, periods, denied legacy routes and MQTT durability/replay/ACK checks');
  if(process.env.READINESS_ACCOUNTS_FILE)await writeFile(process.env.READINESS_ACCOUNTS_FILE,JSON.stringify({password:'Local-test-only-123!',accounts:Object.fromEntries(['owner','admin','operator','accountant','customer'].map(role=>[role,role+'-'+suffix+'@example.test'])),siteId:site.id,otherSiteId:other.body.id,siteName:name,device,payload,ingestionId:`test-${suffix}`}));
  console.log('Browser accounts written for isolated E2E run');
} finally {await broker?.endAsync();await db.end();}
