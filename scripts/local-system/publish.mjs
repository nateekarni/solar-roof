import {createRequire} from 'node:module';import {writeFile,readFile,unlink} from 'node:fs/promises';import {sites,envelope,topic,marker} from './telemetry-fixture.mjs';
const req=createRequire(new URL('../../apps/api/package.json',import.meta.url)),mqtt=req('mqtt');
const url='mqtt://127.0.0.1:18849',lock=new URL('../../.tmp/local-system-publisher.pid',import.meta.url);
try{const previous=Number(await readFile(lock,'utf8'));try{process.kill(previous,0);throw Error(`Publisher already running with PID ${previous}`);}catch(e){if(e.code!=='ESRCH')throw e;}}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(lock,String(process.pid));
const client=mqtt.connect(url,{clientId:`${marker}-${process.pid}`,reconnectPeriod:2000,connectTimeout:5000});const counts={meter:0,logger:0,ack:0},timers=[];let stopped=false,last={meter:0,logger:0};
client.on('error',e=>console.error('MQTT',e.message));
client.on('message',(_topic,payload)=>{try{if(JSON.parse(payload).status==='accepted')counts.ack++;}catch{}});
function send(kind){if(stopped||!client.connected)return;const now=Date.now();if(now<=last[kind])return;last[kind]=now;for(const site of sites.filter(s=>s.index!==9))client.publish(topic(site,kind),JSON.stringify(envelope(site,kind,now)),{qos:1,retain:false},e=>{if(e)console.error('publish failed',kind,e.message);else counts[kind]++;});}
client.once('connect',()=>{client.subscribe('solar/v1/sites/+/gateways/+/dataAcept',{qos:1});console.log(JSON.stringify({started:new Date().toISOString(),pid:process.pid,sites:sites.length,meterSeconds:5,loggerSeconds:15,synthetic:true}));send('meter');send('logger');timers.push(setInterval(()=>send('meter'),5000),setInterval(()=>send('logger'),15000),setInterval(()=>console.log(JSON.stringify({at:new Date().toISOString(),...counts})),60000));});
async function stop(){if(stopped)return;stopped=true;timers.forEach(clearInterval);await new Promise(resolve=>client.end(false,resolve));await unlink(lock).catch(()=>{});console.log(JSON.stringify({stopped:true,...counts}));}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
if(process.argv.includes('--once'))setTimeout(()=>void stop(),20000);
