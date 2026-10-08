import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {BillingSourcePanel} from "./billing-source-panel";
import {sourceState} from "./billing-source.test-fixtures";
import {billingSourceDraft,type BillingSourceState} from "./billing-source-model";
const render=(state:BillingSourceState,locale:"en"|"th"="en",profilePending=false)=>renderToStaticMarkup(<BillingSourcePanel state={state} draft={{...billingSourceDraft(state),sourceTag:"Import_Wh"}} onChange={()=>{}} onSave={()=>{}} onReload={()=>{}} locale={locale} profilePending={profilePending}/>);
test("panel identifies the real cumulative source and explicit purpose without claiming billing is verified",()=>{
 const html=render(sourceState);
 for(const detail of ["Main meter","METER-001","Import_Wh","energy.active.import.total","energy","Wh","kWh","wh-to-kwh","Physical measurement purpose","contract rate"])assert.ok(html.includes(detail),detail);
 assert.match(html,/Not bound/);assert.match(html,/No verified reading/);assert.doesNotMatch(html,/value="solar-delivered" selected/);
 assert.match(html,/name="billing-source-purpose"/);
});
test("valid historical readings show complete quality and stale freshness separately",()=>{
 const state={...sourceState,status:"verified" as const,latestVerifiedReading:{id:"read-1",quality:"complete",unit:"kWh",valueKwh:"1234.567",sourceTime:"2026-09-01T00:00:00Z",receivedTime:"2026-10-08T00:00:00Z",profileRevisionId:"rev-2",bindingId:"b-1",fresh:false}};
 const html=render(state);
 assert.match(html,/1,234.567 kWh/);assert.match(html,/complete/);assert.match(html,/Historical reading/);assert.doesNotMatch(html,/Device online/);
});
test("profile changes and invalid data expose actionable blocked states",()=>{
 assert.match(render({...sourceState,status:"profile-changed"}),/Profile changed/);
 assert.match(render({...sourceState,status:"profile-changed"}),/Confirm a replacement/);
 assert.match(render({...sourceState,status:"invalid-data"}),/Invalid source data/);
 assert.match(render({...sourceState,status:"waiting-for-reading"}),/Waiting for actual reading/);
 assert.match(render(sourceState,"en",true),/Apply the main meter profile before binding/);
 assert.match(render({...sourceState,status:"waiting-for-reading"},"th"),/รอข้อมูลจริง/);
});


test("unbound panel previews the only configured cumulative candidate while still requiring explicit selection",()=>{
 const html=renderToStaticMarkup(<BillingSourcePanel state={sourceState} draft={billingSourceDraft(sourceState)} onChange={()=>{}} onSave={()=>{}} onReload={()=>{}} locale="en"/>);
 assert.match(html,/Import_Wh/);assert.match(html,/energy.active.import.total/);assert.match(html,/data.values/);
 assert.match(html,/Choose a main meter field/);
 assert.match(html,/<button[^>]*disabled=""[^>]*>Save billing source/);
});
