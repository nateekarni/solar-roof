import assert from "node:assert/strict";
import test from "node:test";
import {sourceState} from "./billing-source.test-fixtures";
import {submitBillingSource} from "./billing-source-api";
test("explicit binding posts once to the persisted site and reloads authoritative status",async()=>{
 const calls:string[]=[];
 const result=await submitBillingSource("site-real",sourceState,{sourceTag:"Import_Wh",measurementPurpose:"solar-delivered",purposeDescription:"",confirmed:false},false,{
 async post(path,body){calls.push("POST "+path);assert.deepEqual(body,{deviceId:"device-main",profileRevisionId:"rev-2",sourceTag:"Import_Wh",canonicalTag:"energy.active.import.total",sourceUnit:"Wh",targetUnit:"kWh",conversion:"wh-to-kwh",measurementPurpose:"solar-delivered"});},
 async get(path){calls.push("GET "+path);return {...sourceState,status:"waiting-for-reading"};}
 });
 assert.deepEqual(calls,["POST /v1/sites/site-real/billing-source","GET /v1/sites/site-real/billing-source"]);
 assert.equal(result.state?.status,"waiting-for-reading");
});
test("profile pending and missing purpose prevent any binding request",async()=>{
 let requests=0;const client={async post(){requests++;},async get(){requests++;return sourceState;}};
 await assert.rejects(()=>submitBillingSource("site-real",sourceState,{sourceTag:"Import_Wh",measurementPurpose:"grid-import",purposeDescription:"",confirmed:true},true,client),/apply-profile-first/);
 await assert.rejects(()=>submitBillingSource("site-real",sourceState,{sourceTag:"Import_Wh",measurementPurpose:"",purposeDescription:"",confirmed:false},false,client),/purpose-required/);
 assert.equal(requests,0);
});
test("saved binding with failed reload exposes saved state without retrying a financial write",async()=>{
 let posts=0;
 const result=await submitBillingSource("site-real",sourceState,{sourceTag:"Import_Wh",measurementPurpose:"grid-import",purposeDescription:"",confirmed:false},false,{async post(){posts++;},async get(){throw Error("Connection lost");}});
 assert.equal(posts,1);assert.equal(result.state,null);assert.equal(result.reloadError,"Connection lost");
});
test("rejected binding remains rejected and does not reload or retry",async()=>{
 let gets=0,posts=0;
 await assert.rejects(()=>submitBillingSource("site-real",sourceState,{sourceTag:"Import_Wh",measurementPurpose:"grid-import",purposeDescription:"",confirmed:false},false,{async post(){posts++;throw Error("Profile changed; reload configuration");},async get(){gets++;return sourceState;}}),/Profile changed/);
 assert.equal(posts,1);assert.equal(gets,0);
});
