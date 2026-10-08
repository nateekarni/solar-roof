import assert from 'node:assert/strict';import test from 'node:test';
import {formatTestMoney} from './local-test-pdf.js';
test('PDF monetary formatting preserves exact large satang and PostgreSQL zero padding',()=>{assert.equal(formatTestMoney('90071992547409.91'),'90,071,992,547,409.91');assert.equal(formatTestMoney('4623.45000000'),'4,623.45');assert.equal(formatTestMoney('2000'),'2,000.00');assert.throws(()=>formatTestMoney('4623.450001'));});
