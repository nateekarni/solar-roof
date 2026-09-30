import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMeterCharge, validateRateSchedule, exclusiveEnd, requirePaymentTerm, requireFullSettlement, requireSeparateApprover, withinReadingTolerance } from '../src/modules/billing/financial-invariants.ts';
test('100 to 125 cumulative kWh at 4 THB costs 100 THB', () => assert.equal(calculateMeterCharge(100,125,4).amount,100));
test('missing baseline, meter reset and nonfinite readings are rejected', () => {
 for (const [a,b] of [[null,125],[100,null],[125,100],[NaN,125]]) assert.throws(() => calculateMeterCharge(a,b,4));
});
test('open-ended final rate is accepted and overlapping rates are rejected', () => {
 assert.doesNotThrow(()=>validateRateSchedule([{startDate:'2026-01-01',endDate:'2026-01-31',rate:4},{startDate:'2026-02-01',rate:5}]));
 assert.throws(()=>validateRateSchedule([{startDate:'2026-01-01',rate:4},{startDate:'2026-02-01',rate:5}]));
 assert.throws(()=>validateRateSchedule([{startDate:'2026-02-30',rate:4}]));
});

test('inclusive Jan31 end becomes Feb1 boundary, adjacent same day rejects',()=>{
 assert.equal(exclusiveEnd('2026-01-31'),'2026-02-01');
 assert.throws(()=>validateRateSchedule([{startDate:'2026-01-01',endDate:'2026-02-01',rate:4},{startDate:'2026-02-01',rate:5}]));
 assert.doesNotThrow(()=>validateRateSchedule([{startDate:'2026-01-31',endDate:'2026-01-31',rate:4}]));
});
test('term zero is valid, absent or fractional terms reject',()=>{
 assert.equal(requirePaymentTerm(0),0);
 for(const value of [null,undefined,-1,1.5,'30',Infinity])assert.throws(()=>requirePaymentTerm(value));
});
test('multiple transfers require exact full settlement',()=>{
 assert.doesNotThrow(()=>requireFullSettlement([6000,4000],10000));
 assert.throws(()=>requireFullSettlement([6000],10000));
 assert.throws(()=>requireFullSettlement([6000,4001],10000));
 assert.throws(()=>requireFullSettlement([10000.001],10000));
});
test('correction cannot be approved by its requester',()=>{
 assert.throws(()=>requireSeparateApprover('owner-a','owner-a'));
 assert.doesNotThrow(()=>requireSeparateApprover('owner-a','accountant-b'));
});
test('actual reading tolerance includes both five-minute endpoints and rejects beyond',()=>{
 const target='2026-02-01T00:00:00Z';
 assert.equal(withinReadingTolerance('2026-01-31T23:55:00Z',target),true);
 assert.equal(withinReadingTolerance('2026-02-01T00:05:00Z',target),true);
 assert.equal(withinReadingTolerance('2026-02-01T00:05:01Z',target),false);
});
