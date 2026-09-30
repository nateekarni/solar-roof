import test from 'node:test';
import assert from 'node:assert/strict';
import { BillingCalculationService } from '../src/modules/billing/billing-calculation.service.js';
test('missing meter baseline is invalid, never a complete zero bill', () => {
 const result = new BillingCalculationService().preview({cycleKey:'2026-01',siteId:'site',opening:[],closing:[],rate:{rateType:'fixed',amountPerKwh:4,effectiveFrom:new Date('2026-01-01')}});
 assert.equal(result.quality, 'invalid');
});
