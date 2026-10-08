import test from 'node:test';
import assert from 'node:assert/strict';
import {transferAmount,pendingTransferTotal,formatTransferAmount} from './payment-input';
test('entered transfer amount remains an exact decimal instead of the bill amount',()=>{
 assert.equal(transferAmount('2000'),'2000.00');assert.equal(transferAmount('2623.45'),'2623.45');assert.equal(transferAmount('90071992547409.91'),'90071992547409.91');
 for(const value of ['', '0','-1','0.001','1e3','10000000000000000'])assert.throws(()=>transferAmount(value));
});
test('pending transfer sum excludes rejected history and preserves exact satang',()=>{
 assert.equal(pendingTransferTotal([{amount:'2000.00000000',status:'pending_verification'},{amount:'2623.45000000',status:'pending_verification'},{amount:'4623.45',status:'rejected'}]),'4623.45');assert.equal(formatTransferAmount('90071992547409.91000000'),'90,071,992,547,409.91');
});
import {bangkokTransferWallTime,transferWallTimeToIso} from './payment-input';
import {formatAppDateTime} from '../../lib/date-format';
test('transfer wall time initialization and submission use Bangkok regardless of host timezone',()=>{
 const prior=process.env.TZ;try{for(const timezone of ['UTC','Asia/Bangkok','America/New_York']){process.env.TZ=timezone;assert.equal(bangkokTransferWallTime(new Date('2026-10-08T03:57:00Z')),'2026-10-08T10:57');assert.equal(transferWallTimeToIso('2026-10-08T10:57'),'2026-10-08T03:57:00.000Z');assert.equal(transferWallTimeToIso('2026-10-01T00:15'),'2026-09-30T17:15:00.000Z');assert.match(formatAppDateTime('2026-10-08 10:57:00+07','en'),/10:57/);}}finally{if(prior===undefined)delete process.env.TZ;else process.env.TZ=prior;}
});
test('transfer dates reject invalid calendar values and time rollover',()=>{
 for(const value of ['','2026-02-30T10:00','2026-13-01T10:00','2026-10-08T24:00','2026-10-08T10:60','2026-10-08T10:57Z','2026-10-08'])assert.throws(()=>transferWallTimeToIso(value));assert.equal(transferWallTimeToIso('2028-02-29T10:57'),'2028-02-29T03:57:00.000Z');
});