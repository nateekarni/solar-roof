import assert from "node:assert/strict";
import test from "node:test";
import {createSitePayloadLoader} from "./site-payload-loader";
import type {PayloadConfig} from "./payload-contracts";
function config(siteId:string,revision:string):PayloadConfig{return {
 siteId,externalSiteId:siteId,gatewayId:"gateway-"+siteId,externalGatewayId:"GW-"+siteId,subscriptionTopic:"solar/v1/"+siteId,ackTopic:null,
 devices:[{id:"device-"+siteId,name:"Main "+siteId,externalDeviceId:"meter-"+siteId,profileRevisionId:revision,profileId:"meter",profileVersion:"1.0.0",telemetryTopic:"solar/"+siteId,fixture:{},billingMeter:true}],
 receiveRevision:{id:null,version:0,config:{messagesPath:"payloads",fieldPaths:{},deviceAliases:[]},createdAt:null},bundleFixture:null,rejections:[],unmappedMessages:[]
};}
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return {promise,resolve};}
test("late site A payload cannot replace site B devices or their billing source context",async()=>{
 let scope={open:true,siteId:"A" as string|null},shown:PayloadConfig|null=null;
 const a=deferred<PayloadConfig|null>(),b=deferred<PayloadConfig|null>();
 const loader=createSitePayloadLoader(id=>id==="A"?a.promise:b.promise,()=>scope,value=>{shown=value;});
 loader.activate("A");const old=loader.refresh();
 scope={open:true,siteId:"B"};loader.activate("B");const current=loader.refresh();
 b.resolve(config("B","profile-B"));await current;
 a.resolve(config("A","profile-A"));await old;
 assert.equal(shown?.siteId,"B");assert.equal(shown?.devices[0]?.profileRevisionId,"profile-B");
});
test("closing and unmounting invalidate reads and prevent subsequent refresh requests",async()=>{
 let scope={open:true,siteId:"A" as string|null},shown:PayloadConfig|null=null,requests=0;
 const pending=deferred<PayloadConfig|null>();
 const loader=createSitePayloadLoader(async()=>{requests++;return pending.promise;},()=>scope,value=>{shown=value;});
 loader.activate("A");const read=loader.refresh();
 scope={open:false,siteId:"A"};loader.invalidate();
 pending.resolve(config("A","old"));await read;await loader.refresh();
 assert.equal(shown,null);assert.equal(requests,1);
});
test("older same-site payload responses cannot overwrite the activated profile refresh",async()=>{
 const scope={open:true,siteId:"A"},old=deferred<PayloadConfig|null>(),current=deferred<PayloadConfig|null>();
 let requests=0,shown:PayloadConfig|null=null;
 const loader=createSitePayloadLoader(()=>++requests===1?old.promise:current.promise,()=>scope,value=>{shown=value;});
 loader.activate("A");const first=loader.refresh(),second=loader.refresh();
 current.resolve(config("A","new-profile"));await second;
 old.resolve(config("A","old-profile"));await first;
 assert.equal(shown?.devices[0]?.profileRevisionId,"new-profile");
});
test("a response completing before scope-effect cleanup still cannot publish into another site's render",async()=>{
 let scope={open:true,siteId:"A" as string|null},shown:PayloadConfig|null=null;
 const pending=deferred<PayloadConfig|null>();
 const loader=createSitePayloadLoader(()=>pending.promise,()=>scope,value=>{shown=value;});
 loader.activate("A");const read=loader.refresh();
 scope={open:true,siteId:"B"};
 pending.resolve(config("A","old"));await read;
 assert.equal(shown,null);
});
test("closing then reopening the same site rejects the previous session's response",async()=>{
 const scope={open:true,siteId:"A"},old=deferred<PayloadConfig|null>(),current=deferred<PayloadConfig|null>();
 let requests=0,shown:PayloadConfig|null=null;
 const loader=createSitePayloadLoader(()=>++requests===1?old.promise:current.promise,()=>scope,value=>{shown=value;});
 loader.activate("A");const first=loader.refresh();loader.invalidate();loader.activate("A");const second=loader.refresh();
 current.resolve(config("A","reopened-profile"));await second;
 old.resolve(config("A","previous-session"));await first;
 assert.equal(shown?.devices[0]?.profileRevisionId,"reopened-profile");
});

test("legacy codes do not activate standard payload editor",async()=>{let shown:PayloadConfig|null=null;const legacy={...config("A","r"),subscriptionTopic:"energy/GW/#"};const loader=createSitePayloadLoader(async()=>legacy,()=>({open:true,siteId:"A"}),value=>{shown=value;});loader.activate("A");await loader.refresh();assert.equal(shown,null);});
