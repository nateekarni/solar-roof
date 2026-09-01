import assert from "node:assert/strict";
import test from "node:test";
import { calculateCumulativeDiff, evaluateQuality, normalizeValue } from "../src/index.js";
test("quality validates range and staleness",()=>{const now=new Date("2026-01-01T00:01:00Z");assert.equal(evaluateQuality(230, new Date("2026-01-01T00:00:00Z"), now,{min:0,max:240,maxAgeSeconds:120}).status,"complete");assert.equal(evaluateQuality(300,new Date("2026-01-01T00:00:00Z"),now,{max:240}).status,"invalid");});
test("normalization applies scale and canonical unit",()=>assert.deepEqual(normalizeValue(23081,0.01,"V"),{value:230.81,unit:"V"}));
test("cumulative energy rejects reset and calculates diff",()=>{assert.deepEqual(calculateCumulativeDiff(100,125),{consumedKwh:25,status:"complete"});assert.equal(calculateCumulativeDiff(125,10).status,"invalid");});