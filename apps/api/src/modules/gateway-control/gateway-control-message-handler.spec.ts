import assert from 'node:assert/strict';
import test from 'node:test';
import { metricsSnapshot } from '../../common/observability/metrics.js';

const now='2026-10-19T01:00:00Z';
const messages={
 register:{schemaVersion:'1.1',messageType:'register',messageId:'r1',sentAt:now,gateway:{gatewayId:'GW-1',model:'M',firmwareVersion:'1'},devices:[]},
 configUpdate:{schemaVersion:'1.1',messageType:'configUpdate',messageId:'u1',gatewayId:'GW-1',siteId:'S',proposalId:'p1',baseConfigVersion:1,sentAt:now,devices:[]},
 configStatus:{schemaVersion:'1.1',messageType:'configStatus',messageId:'c1',gatewayId:'GW-1',configVersion:1,configHash:'a'.repeat(64),status:'received',reportedAt:now},
 status:{schemaVersion:'1.1',messageType:'status',messageId:'s1',gatewayId:'GW-1',sessionId:'session',firmwareVersion:'1',status:'online',appliedConfigVersion:null,appliedConfigHash:null},
};
async function fixture(fail=false){
 const module=await import('./gateway-control-message-handler.js').catch(()=>null);
 assert.ok(module?.GatewayControlMessageHandler,'Control handler must exist');
 const calls:{method:string;input:any}[]=[],logs:unknown[]=[];
 const record=(method:string)=>async(input:unknown)=>{if(fail)throw Error('password=secret argon2id mqtt://user:password@private');calls.push({method,input});};
 const handler=new module.GatewayControlMessageHandler({record:record('register')} as any,
  {recordProposal:record('configUpdate'),recordConfigStatus:record('configStatus'),recordConnectionStatus:record('status')} as any);
 Object.assign(handler,{logger:{warn:(value:unknown)=>logs.push(value)}});
 return {handler,calls,logs};
}
// Breaks: wrong handler, missing route identity, trusting payload transport metadata,
// invalid-envelope fallthrough, outbound acceptance, unbounded/sensitive diagnostics.
for(const kind of Object.keys(messages) as (keyof typeof messages)[])test(`${kind} dispatches exactly once with trusted broker scope`,async()=>{
 const f=await fixture();const result=await f.handler.handle({topic:`solar/v1/gateways/GW-1/${kind}`,payload:Buffer.from(JSON.stringify(messages[kind])),brokerId:'broker-trusted',clientMetadata:{clientId:'GW-1',sourceAddress:'192.0.2.1'}});
 assert.equal(result.accepted,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0]?.method,kind);
 assert.equal(f.calls[0]?.input.brokerId,'broker-trusted');assert.deepEqual(f.calls[0]?.input.payload,messages[kind]);
 if(kind==='register'){assert.equal(f.calls[0]?.input.clientId,'GW-1');assert.equal(f.calls[0]?.input.sourceAddress,'192.0.2.1');}
 else assert.equal(f.calls[0]?.input.gatewayId,'GW-1');
});
for(const [name,topic,payload,clientMetadata] of [
 ['identity','solar/v1/gateways/OTHER/status',JSON.stringify(messages.status),undefined],
 ['client identity','solar/v1/gateways/GW-1/register',JSON.stringify(messages.register),{clientId:'OTHER'}],
 ['strict envelope','solar/v1/gateways/GW-1/register',JSON.stringify({...messages.register,brokerId:'spoof',password:'secret'}),undefined],
 ['kind mismatch','solar/v1/gateways/GW-1/status',JSON.stringify(messages.configStatus),undefined],
 ['outbound','solar/v1/gateways/GW-1/config','{}',undefined],
 ['bad topic','solar/v1/gateways/GW-1/status/extra','{}',undefined],
 ['bad JSON','solar/v1/gateways/GW-1/status','password=secret',undefined],
 ['large payload','solar/v1/gateways/GW-1/status',' '.repeat(262145),undefined],
] as const)test(`rejects ${name} without side effects`,async()=>{
 const f=await fixture();assert.equal((await f.handler.handle({topic,payload,brokerId:null,...(clientMetadata?{clientMetadata}:{})})).accepted,false);
 assert.equal(f.calls.length,0);assert.equal(f.logs.length,1);assert.ok(!JSON.stringify(f.logs).includes('secret'));
});
test('service failures are bounded sanitized rejections and later messages still dispatch',async()=>{
 const f=await fixture(true);for(let i=0;i<12;i++)await f.handler.handle({topic:`solar/v1/gateways/GW-1/status`,payload:JSON.stringify(messages.status),brokerId:`private-${i}`});
 const log=JSON.stringify(f.logs);for(const text of ['password','argon2','private','mqtt://'])assert.ok(!log.includes(text));
 const metrics=metricsSnapshot().filter(m=>m.name.startsWith('gateway_control_'));
 assert.ok(metrics.some(m=>m.name==='gateway_control_rejected_handler_failed'));assert.ok(metrics.length<=7);
 const healthy=await fixture();assert.equal((await healthy.handler.handle({topic:'solar/v1/gateways/GW-1/status',payload:JSON.stringify(messages.status),brokerId:null})).accepted,true);
});
