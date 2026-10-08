import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTestTotals, localFinancialBinding } from './local-financial-policy.js';
test('selected synthetic policy rounds charge before simulated tax using decimal half up',()=>{
 assert.deepEqual(calculateTestTotals('1234.567','3.5000'),{consumedKwh:'1234.567',rate:'3.5000',subtotal:'4320.98',tax:'302.47',total:'4623.45'});
 assert.equal(calculateTestTotals('0.001','5.0000').subtotal,'0.01');
});
test('local financial binding rejects production, remote and wrong local database',()=>{
 const env={NODE_ENV:'development',DATABASE_URL:'postgres://local:local@127.0.0.1:15449/solar_financial_flow_review',LOCAL_FINANCIAL_FIXTURE_MARKER:'solar-financial-flow-review-v1',SMTP_HOST:'127.0.0.1',SMTP_PORT:'11049'};
 assert.ok(localFinancialBinding(env));
 for(const change of [{NODE_ENV:'production'},{DATABASE_URL:'postgres://local:local@example.com:15449/solar_financial_flow_review'},{DATABASE_URL:'postgres://local:local@127.0.0.1:15449/production'},{LOCAL_FINANCIAL_FIXTURE_MARKER:'wrong'},{SMTP_HOST:'smtp.example.com'}])assert.equal(localFinancialBinding({...env,...change}),null);
});
import {actualEnergyDifference} from './local-financial-policy.js';
test('round cumulative difference after subtraction rather than each meter boundary',()=>{assert.equal(actualEnergyDifference('13168.72196667','13786.00546667'),'617.284');});
test('consumption rounds exact delta and detects subprecision resets',()=>{assert.equal(actualEnergyDifference('10000.0004','10000.0006'),'0.000');assert.equal(actualEnergyDifference('10000.0000','10000.0005'),'0.001');assert.throws(()=>actualEnergyDifference('10000.000000001','10000.000000000'),/reset/);});
