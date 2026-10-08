import assert from "node:assert/strict";
import test from "node:test";
import { buildBillingSourceInput, billingSourceDraft, type BillingSourceState } from "./billing-source-model";

import {sourceState} from "./billing-source.test-fixtures";
test("unbound configuration never preselects a field or infers physical purpose from an import tag",()=>{
 assert.deepEqual(billingSourceDraft(sourceState),{sourceTag:"",measurementPurpose:"",purposeDescription:"",confirmed:false});
 assert.throws(()=>buildBillingSourceInput(sourceState,billingSourceDraft(sourceState)),/source-required/);
 assert.throws(()=>buildBillingSourceInput(sourceState,{sourceTag:"Import_Wh",measurementPurpose:"",purposeDescription:"",confirmed:false}),/purpose-required/);
});
test("explicit source uses persisted device and profile IDs and permits waiting for actual data",()=>{
 assert.deepEqual(buildBillingSourceInput(sourceState,{sourceTag:"Import_Wh",measurementPurpose:"solar-delivered",purposeDescription:"",confirmed:false}),{
 deviceId:"device-main",profileRevisionId:"rev-2",sourceTag:"Import_Wh",canonicalTag:"energy.active.import.total",sourceUnit:"Wh",targetUnit:"kWh",conversion:"wh-to-kwh",measurementPurpose:"solar-delivered"
 });
});
test("other purpose requires description and replacements require billing-impact confirmation",()=>{
 const draft={sourceTag:"Import_Wh",measurementPurpose:"other" as const,purposeDescription:" ",confirmed:false};
 assert.throws(()=>buildBillingSourceInput(sourceState,draft),/description-required/);
 const binding={...buildBillingSourceInput(sourceState,{...draft,purposeDescription:"Solar supply meter"}),id:"binding-1",profileRevisionId:"rev-1",purposeDescription:"Solar supply meter"};
 const changed={...sourceState,binding,status:"profile-changed" as const};
 assert.throws(()=>buildBillingSourceInput(changed,{...draft,purposeDescription:"Grid meter"}),/confirmation-required/);
 assert.equal(buildBillingSourceInput(changed,{...draft,purposeDescription:"Grid meter",confirmed:true}).billingImpactConfirmed,true);
 assert.equal(buildBillingSourceInput(changed,{...draft,purposeDescription:"Grid meter",confirmed:true}).profileRevisionId,"rev-2");
});
test("dirty or activating profiles cannot bind stale loaded revisions",()=>{
 assert.throws(()=>buildBillingSourceInput(sourceState,{sourceTag:"Import_Wh",measurementPurpose:"grid-import",purposeDescription:"",confirmed:true},true),/apply-profile-first/);
});
test("ambiguous, absent, duplicate and unsupported fields cannot become sources",()=>{
 const draft={sourceTag:"Import_Wh",measurementPurpose:"grid-import" as const,purposeDescription:"",confirmed:true};
 for(const status of ["ambiguous-meter","no-main-meter"] as const)assert.throws(()=>buildBillingSourceInput({...sourceState,status},draft),/main-meter-required/);
 assert.throws(()=>buildBillingSourceInput({...sourceState,eligibleFields:[...sourceState.eligibleFields,...sourceState.eligibleFields]},draft),/one-cumulative-field-required/);
 assert.throws(()=>buildBillingSourceInput({...sourceState,eligibleFields:[{...sourceState.eligibleFields[0]!,targetUnit:"W"}]},draft),/invalid-cumulative-field/);
 assert.throws(()=>buildBillingSourceInput({...sourceState,eligibleFields:[{...sourceState.eligibleFields[0]!,sourceUnit:"W",conversion:"identity"}]},draft),/invalid-cumulative-field/);
});


test("supported auto conversions accept MWh while rejecting auto identity like the profile validator",()=>{
 const draft={sourceTag:"Import_Wh",measurementPurpose:"solar-delivered" as const,purposeDescription:"",confirmed:false};
 const source={...sourceState,eligibleFields:[{...sourceState.eligibleFields[0]!,sourceUnit:"MWh",conversion:"auto-v1" as const}]};
 assert.equal(buildBillingSourceInput(source,draft).conversion,"auto-v1");
 assert.equal(buildBillingSourceInput(source,draft).sourceUnit,"MWh");
 assert.throws(()=>buildBillingSourceInput({...source,eligibleFields:[{...source.eligibleFields[0]!,sourceUnit:"kWh"}]},draft),/invalid-cumulative-field/);
});
