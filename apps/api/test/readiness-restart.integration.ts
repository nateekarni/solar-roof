import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import mqtt from 'mqtt';
const database=process.env.READINESS_DATABASE_URL;
if(!database)throw new Error('Isolated solar_readiness database required');
const databaseUrl=new URL(database);
if(!['localhost','127.0.0.1'].includes(databaseUrl.hostname)||databaseUrl.port!=='15432'||databaseUrl.pathname!=='/solar_readiness')throw new Error('Requires local solar_readiness test database on port15432');
const fixture=JSON.parse(await readFile(process.env.READINESS_ACCOUNTS_FILE!,'utf8'));
const base=process.env.READINESS_API_URL||'http://127.0.0.1:13001';
const db=new Pool({connectionString:database});
const broker=await mqtt.connectAsync('mqtt://127.0.0.1:18883');
try {
 const response=await fetch(base+'/v1/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:fixture.accounts.school,password:fixture.password})});
 assert.equal(response.status,200);const {accessToken}=await response.json();
 const live=await fetch(base+'/v1/sites/'+fixture.siteId+'/live-telemetry',{headers:{Authorization:`Bearer ${accessToken}`}});
 assert.equal(live.status,200);assert.equal((await live.json()).metrics.activePower,1200);
 await broker.subscribeAsync(`energy/${fixture.siteName}/response`);
 const ack=new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No replay ACK after API restart')),10000);broker.on('message',(_topic,message)=>{const data=JSON.parse(message.toString());if(data.ingestionId!==fixture.ingestionId)return;clearTimeout(timer);try{assert.equal(data.duplicate,true);resolve();}catch(e){reject(e);}});});
 await broker.publishAsync(`energy/${fixture.siteName}/telemetry`,fixture.payload,{qos:1});await ack;
 assert.equal((await db.query('SELECT count(*)::int AS count FROM telemetry_raw WHERE device_id=$1',[fixture.device])).rows[0].count,1);
 const aggregate=await db.query("SELECT value,sample_count FROM telemetry_aggregate WHERE device_id=$1 AND semantic_field='total_energy'",[fixture.device]);
 assert.equal(aggregate.rows.length,1);assert.equal(Number(aggregate.rows[0].value),100);assert.equal(aggregate.rows[0].sample_count,1);
 console.log('PASS: telemetry survives API restart; replay does not duplicate raw rows or inflate aggregates');
}finally{await broker.endAsync();await db.end();}
