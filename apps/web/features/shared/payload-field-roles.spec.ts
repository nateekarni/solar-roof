import assert from "node:assert/strict";
import { test } from "node:test";
import { assignStandardFieldRole } from "./payload-field-roles";
import type { PayloadField } from "../sites/payload-contracts";
const field:PayloadField={tag:"energy.active.import.total",displayName:"Energy",pollGroup:"energy",sourceUnit:"Wh",targetUnit:"kWh",conversion:"wh-to-kwh"};
test("standard cumulative energy retains billing eligibility without a role selector",()=>assert.equal(assignStandardFieldRole(field).role,"billing-import"));
test("power role requires canonical watts and never applies to unrelated readings",()=>{
  assert.equal(assignStandardFieldRole({...field,tag:"solar.active_power",targetUnit:"W"}).role,"active-power");
  assert.equal(assignStandardFieldRole({...field,tag:"solar.active_power",targetUnit:"kW"}).role,undefined);
  assert.equal(assignStandardFieldRole({...field,tag:"energy.active.export.total"}).role,undefined);
});
test("editing existing profiles preserves their pinned role metadata",()=>{
  const existing:PayloadField={...field,tag:"custom.power",targetUnit:"W",role:"active-power"};
  assert.equal(assignStandardFieldRole(existing),existing);
});
