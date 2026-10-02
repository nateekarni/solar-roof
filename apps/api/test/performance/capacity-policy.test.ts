import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync} from 'node:fs';

test('capacity gates fail closed for unsafe hosts, reduced history, missing ACKs and any slow journey',async()=>{
 const moduleUrl=new URL('./capacity-policy.ts',import.meta.url);
 assert.ok(existsSync(moduleUrl),'B2 needs an explicit profile and capacity evidence gate');
 const {profileConfig,assertTargetHost,evaluateCapacity,summary}=await import('./capacity-policy.ts');
 const target=profileConfig('target',90),smoke=profileConfig('smoke',90);
 assert.equal(target.historyRows,129_600_000);assert.equal(target.users,50);
 assert.equal(target.steadyPerMinute,1000);assert.equal(target.replayPerMinute,10000);assert.equal(target.replaySeconds,600);
 assert.throws(()=>assertTargetHost({profile:'target',hostname:'solar.fowir.com',approvedHost:'solar.fowir.com',dedicated:true,availableDiskBytes:1e15,ciEvent:'workflow_dispatch'}));
 assert.throws(()=>assertTargetHost({profile:'target',hostname:'dedicated',approvedHost:'different',dedicated:true,availableDiskBytes:1e15,ciEvent:'workflow_dispatch'}));
 assert.throws(()=>assertTargetHost({profile:'target',hostname:'dedicated',approvedHost:'dedicated',dedicated:true,availableDiskBytes:1e15,ciEvent:'pull_request'}));
 assert.throws(()=>assertTargetHost({profile:'target',hostname:'dedicated',approvedHost:'dedicated',dedicated:true,availableDiskBytes:1024,ciEvent:'workflow_dispatch'}));
 assert.throws(()=>profileConfig('target',89));assert.throws(()=>profileConfig('unknown',90));
 const complete={profile:target,historyRows:target.historyRows,users:50,steadySent:1000,steadySeconds:60,burstSent:1000,burstSeconds:1,replaySent:100000,replaySeconds:600,exportsReady:2,exportPeakOverlap:true,ackedButMissing:0,unexpectedDuplicateRows:0,unacked:0,errors:0,pageSamples:[...Array(399).fill(100),2000],coldAndWarm:true,queryPlans:true,hardwareProof:true};
 assert.equal(evaluateCapacity(complete).releaseGate,'pass');
 assert.equal(evaluateCapacity({...complete,profile:smoke}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,historyRows:100}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,pageSamples:[...Array(100).fill(10),2001]}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,ackedButMissing:1}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,unexpectedDuplicateRows:1}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,unacked:1}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,pageSamples:[]}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,historyRows:Number.NaN}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,pageSamples:[...Array(399).fill(1),Number.NaN]}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,coldAndWarm:false}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,steadySeconds:120,replaySeconds:1200}).releaseGate,'fail');
 assert.equal(evaluateCapacity({...complete,exportPeakOverlap:false}).releaseGate,'fail');
 assert.equal(summary([10,2001]).max,2001);
});

test('duplicate commit barrier waits for each application duplicate ACK, never PUBACK or original ACK',async()=>{
 const {DuplicateAckBarrier}=await import('./capacity-policy.ts');
 const barrier=new DuplicateAckBarrier(['a','b']);
 assert.equal(barrier.complete,false);
 barrier.acknowledge('a',false);barrier.acknowledge('b',false);
 assert.equal(barrier.complete,false);
 barrier.acknowledge('a',true);assert.equal(barrier.complete,false);
 barrier.acknowledge('b',true);assert.equal(barrier.complete,true);
});

test('target rejects remote or unknown Docker daemon before mutation',async()=>{
 const {assertTargetDaemon}=await import('./capacity-policy.ts');
 const good={endpoint:'unix:///var/run/docker.sock',name:'dedicated',id:'daemon-id',approvedHost:'dedicated',approvedDaemonId:'daemon-id'};
 assert.doesNotThrow(()=>assertTargetDaemon(good));
 for(const bad of [{endpoint:'ssh://company'},{endpoint:'tcp://127.0.0.1:2375'},{name:'company'},{id:'other'},{approvedDaemonId:''}])assert.throws(()=>assertTargetDaemon({...good,...bad}));
});
