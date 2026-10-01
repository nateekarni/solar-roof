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
  const response=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:'Local-test-only-123!'})});
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
  const bootstrapLogin=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'bootstrap@example.test',password:'Ci-bootstrap-original-123!'})});
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
  assert.equal((await request('school',`/v1/sites/${site.id}/live-telemetry`)).body,null);
  const scopeId=randomUUID();
  await db.query("INSERT INTO users(id,email,display_name,role,status,school_id,password_hash) VALUES($1,$2,'Scoped admin','admin','active',$3,$4)",[scopeId,`scoped-${suffix}@example.test`,site.schoolId,auth.hashPassword('Local-test-only-123!')]);
  users.scoped={id:scopeId,token:await loginToken(`scoped-${suffix}@example.test`,'admin')};
  assert.equal((await request('scoped','/v1/sites/','POST',{name:'Escape',schoolName:'Outside',gatewayName:`escape-${suffix}`,deviceSerial:`escape-${suffix}`})).status,403);
  assert.equal((await request('scoped','/v1/contracts','POST',{siteIds:[other.body.id]})).status,403);
  assert.equal((await request('scoped','/v1/users/invite','POST',{email:'bad@example.test',displayName:'No',role:'owner'})).status,403);
  assert.equal((await request('owner','/v1/dashboard/summary?start_date=2026-01-01&end_date=2026-04-01')).status,400);
  assert.equal((await request('owner','/v1/dashboard/summary?period=year')).status,400);
  const report=await request('school','/v1/reports','POST',{type:'energy',format:'csv',dateFrom:'2026-09-01',dateTo:'2026-09-30'});
  assert.equal(report.status,201,JSON.stringify(report.body));
  const download=await fetch(base+report.body.downloadUrl,{headers:{Authorization:`Bearer ${users.school.token}`}});
  assert.equal(download.status,200);assert.ok(download.headers.get('content-type')?.includes('text/csv'));
  assert.equal((await fetch(base+report.body.downloadUrl,{headers:{Authorization:`Bearer ${users.owner!.token}`}})).status,404);
  const device=(await db.query('SELECT id FROM devices WHERE site_id=$1',[site.id])).rows[0].id;
  broker=await mqtt.connectAsync(process.env.READINESS_MQTT_URL || 'mqtt://127.0.0.1:18883');
  const acknowledgements:Array<{duplicate:boolean}>=[];
  await broker.subscribeAsync(`energy/${name}/response`);
  broker.on('message',(topic,message)=>{const response=JSON.parse(message.toString());if(topic===`energy/${name}/response`&&response.ingestionId===`test-${suffix}`&&response.deviceId===device)acknowledgements.push(response);});
  async function waitForAck(count:number){const end=Date.now()+10000;while(acknowledgements.length<count&&Date.now()<end)await new Promise(resolve=>setTimeout(resolve,25));assert.equal(acknowledgements.length,count,'Expected correlated durable ACK');}
  const timestamp=new Date().toISOString();
  const payload=JSON.stringify({deviceId:device,timestamp,ingestionId:`test-${suffix}`,metrics:{activePower:1200,totalEnergy:100,voltage:230}});
  await broker.publishAsync(`energy/${name}/telemetry`,payload,{qos:1});await waitForAck(1);
  assert.equal(acknowledgements[0]!.duplicate,false);
  await broker.publishAsync(`energy/${name}/telemetry`,payload,{qos:1});await waitForAck(2);
  assert.equal(acknowledgements[1]!.duplicate,true);
  // Malformed data must be rejected without logging its payload or emitting ACKs.
  await broker.publishAsync(`energy/${name}/telemetry`,'{"test-secret":',{qos:1});
  const {execFileSync}=await import('node:child_process');
  let logs='';const rejectedDeadline=Date.now()+5000;
  while(Date.now()<rejectedDeadline) {
    logs=execFileSync('docker',['compose','-f','infra/ci/compose.yml','logs','--no-color','api'],{cwd:new URL('../../../',import.meta.url),encoding:'utf8'});
    if(logs.includes('Telemetry rejected'))break;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  assert.equal(acknowledgements.length,2);
  assert.equal(logs.includes('test-secret'),false);
  assert.ok(logs.includes('Telemetry rejected'));
  const raw=await db.query('SELECT * FROM telemetry_raw WHERE device_id=$1',[device]);
  assert.equal(raw.rows.length,1);assert.equal(Number(raw.rows[0].active_power_w),1200);assert.ok(raw.rows[0].received_time);
  const live=await request('school',`/v1/sites/${site.id}/live-telemetry`);
  assert.equal(live.body.metrics.activePower,1200);assert.equal(live.body.metrics.current,null);
  assert.equal(live.body.status,'online');
  console.log('PASS: real HTTP authorization, school isolation, cardinality, empty dashboard, periods, persisted report and MQTT durability/replay/ACK checks');
  if(process.env.READINESS_ACCOUNTS_FILE)await writeFile(process.env.READINESS_ACCOUNTS_FILE,JSON.stringify({password:'Local-test-only-123!',accounts:Object.fromEntries(['owner','admin','operator','accountant','school'].map(role=>[role,role+'-'+suffix+'@example.test'])),siteId:site.id,otherSiteId:other.body.id,siteName:name,device,payload,ingestionId:`test-${suffix}`}));
  console.log('Browser accounts written for isolated E2E run');
} finally {await broker?.endAsync();await db.end();}
