import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
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
  for (const role of ['owner','operator','accountant']) assert.equal((await request(role,'/v1/sites','POST',{})).status,403);
  const bootstrapLogin=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'http://localhost:13000'},body:JSON.stringify({email:'bootstrap@example.test',password:'Ci-bootstrap-original-123!'})});
  assert.equal(bootstrapLogin.status,200,'Bootstrap rerun must preserve original password');
  const name=`readiness-${suffix}`;
  const created=await request('admin','/v1/sites','POST',{name,schoolName:`School ${suffix}`,gatewayName:name,protocol:'mqtt',endpoint:`energy/${name}/#`,deviceSerial:`meter-${suffix}`,capacityMwp:0.1,pollingIntervalSeconds:10});
  assert.equal(created.status,201,JSON.stringify(created.body));
  const site=created.body;
  assert.equal((await request('admin','/v1/sites','POST',{name:'Duplicate',schoolId:site.schoolId,gatewayName:`duplicate-${suffix}`,deviceSerial:`duplicate-${suffix}`})).status,400);
  const userId=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,'School user','school_user','active',$3,$4)",[userId,`school-${suffix}@example.test`,site.schoolId,auth.hashPassword('Local-test-only-123!')]);
  users.school={id:userId,token:await loginToken(`school-${suffix}@example.test`,'school_user')};
  const other=await request('admin','/v1/sites','POST',{name:`Other ${suffix}`,schoolName:`Other school ${suffix}`,gatewayName:`other-${suffix}`,protocol:'mqtt',deviceSerial:`other-meter-${suffix}`});
  assert.equal(other.status,201,JSON.stringify(other.body));
  assert.equal((await request('school',`/v1/sites/${other.body.id}`)).status,403);
  assert.equal((await request('school','/v1/operations/users')).status,403);
  assert.equal((await request('school',`/v1/dashboard/summary?site_id=${other.body.id}`)).status,403);
  const summary=await request('school','/v1/dashboard/summary');
  assert.equal(summary.status,200,JSON.stringify(summary.body));
  assert.equal(summary.body.sites.length,1);assert.equal(summary.body.stats.currentMw,null);
  assert.deepEqual(summary.body.production,[]);
  assert.equal((await request('school',`/v1/sites/${site.id}/live-telemetry`)).status,403);
  assert.equal((await request('admin',`/v1/sites/${site.id}/live-telemetry`)).body,null);
  for(const role of ['school','owner']) assert.equal((await request(role,'/v1/reports','POST',{type:'energy',format:'csv'})).status,403);
  const scopeId=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,'Scoped admin','admin','active',$3,$4)",[scopeId,`scoped-${suffix}@example.test`,site.schoolId,auth.hashPassword('Local-test-only-123!')]);
  users.scoped={id:scopeId,token:await loginToken(`scoped-${suffix}@example.test`,'admin')};
  assert.equal((await request('scoped',`/v1/sites/${other.body.id}`)).status,200,'Super Admin retains global access even with legacy school metadata');
  // Technical report coverage belongs to a scoped operator, not the school role.
  await db.query('UPDATE users SET school_id=$1 WHERE id=$2',[site.schoolId,users.operator!.id]);
  users.operator!.token=await loginToken(`operator-${suffix}@example.test`,'operator');
  assert.equal((await request('owner','/v1/dashboard/summary?start_date=2026-01-01&end_date=2026-04-01')).status,400);
  assert.equal((await request('owner','/v1/dashboard/summary?period=year')).status,400);
  const report=await request('operator','/v1/reports','POST',{type:'energy',format:'csv',dateFrom:'2026-09-01',dateTo:'2026-09-30'});
  assert.equal(report.status,202,JSON.stringify(report.body));assert.equal(report.body.status,'queued');assert.match(report.body.jobId,/^[a-f0-9-]{36}$/);
  let completed:any;const reportDeadline=Date.now()+45000;
  do{const state=await request('operator',`/v1/jobs/${report.body.jobId}`);assert.equal(state.status,200);completed=state.body;if(completed.status==='ready')break;assert.ok(['queued','running'].includes(completed.status),JSON.stringify(completed));await new Promise(resolve=>setTimeout(resolve,100));}while(Date.now()<reportDeadline);
  assert.equal(completed.status,'ready',JSON.stringify(completed));assert.equal(completed.report.dataKind,'raw');assert.equal(completed.report.format,'csv');assert.equal(completed.rowCount,0,'September fixture contains no telemetry yet');
  const downloadPath=`/v1/jobs/${report.body.jobId}/download`,download=await fetch(base+downloadPath,{headers:{Authorization:`Bearer ${users.operator!.token}`}});
  assert.equal(download.status,200);assert.ok(download.headers.get('content-type')?.includes('text/csv'));
  const bytes=Buffer.from(await download.arrayBuffer()),manifest=(await db.query('SELECT manifest FROM platform_jobs WHERE id=$1',[report.body.jobId])).rows[0].manifest;
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.checksum);
  assert.equal((await fetch(base+downloadPath,{headers:{Authorization:`Bearer ${users.owner!.token}`}})).status,403,'Another actor cannot download a school-owned job');
  const device=(await db.query('SELECT id FROM devices WHERE site_id=$1',[site.id])).rows[0].id;
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
  assert.equal(live.body.metrics.activePower,1200);assert.equal(live.body.metrics.current,null);
  assert.equal(live.body.status,'online');
  const schoolLive=await request('school','/v1/dashboard/summary');
  assert.equal(schoolLive.status,200);assert.equal(schoolLive.body.sites.length,1);assert.equal(schoolLive.body.stats.currentMw,0.0012);
  console.log('PASS: real HTTP authorization, school isolation, cardinality, empty dashboard, periods, persisted report and MQTT durability/replay/ACK checks');
  if(process.env.READINESS_ACCOUNTS_FILE)await writeFile(process.env.READINESS_ACCOUNTS_FILE,JSON.stringify({password:'Local-test-only-123!',accounts:Object.fromEntries(['owner','admin','operator','accountant','school'].map(role=>[role,role+'-'+suffix+'@example.test'])),siteId:site.id,otherSiteId:other.body.id,siteName:name,device,payload,ingestionId:`test-${suffix}`,reportJobId:report.body.jobId,reportChecksum:manifest.checksum}));
  console.log('Browser accounts written for isolated E2E run');
} finally {await broker?.endAsync();await db.end();}
