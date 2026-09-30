import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {toCsv} from "./operations.controller.js";
test("operations export aligns metadata fields with headers and neutralizes formulas",()=>{
 const csv=toCsv(["ชื่อไซต์","สถานะ"],[{id:"1",name:"=cmd",gatewayId:"g",status:"offline"}]);
 assert.equal(csv,'"name","gatewayId","status"\r\n"\'=cmd","g","offline"');
});
