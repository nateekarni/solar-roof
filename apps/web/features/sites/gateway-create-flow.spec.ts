import assert from 'node:assert/strict';
import test from 'node:test';
import {runGatewaySetupCreation,type GatewaySetupProgress} from './gateway-create-flow';

test('gateway setup retry resumes after the last successful device without recreating prior resources',async()=>{
 const calls:string[]=[];
 let fail=true;
 const post=async(path:string)=>{
  calls.push(path);
  if(path.endsWith('/devices')&&calls.filter(value=>value.endsWith('/devices')).length===2&&fail){fail=false;throw new Error('temporary');}
  return {};
 };
 let progress:GatewaySetupProgress={gatewayCreated:false,nextDeviceIndex:0};
 await assert.rejects(()=>runGatewaySetupCreation({siteId:'site-1',gateway:{},devices:[{},{}]},post,next=>{progress=next;},progress),/temporary/);
 assert.deepEqual(progress,{gatewayCreated:true,nextDeviceIndex:1});
 await runGatewaySetupCreation({siteId:'site-1',gateway:{},devices:[{},{}]},post,next=>{progress=next;},progress);
 assert.deepEqual(progress,{gatewayCreated:true,nextDeviceIndex:2});
 assert.deepEqual(calls,['/v1/sites/site-1/gateway','/v1/sites/site-1/devices','/v1/sites/site-1/devices','/v1/sites/site-1/devices']);
});
