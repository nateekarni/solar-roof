import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBalance} from './payment-review-summary';
test('approved review balance ignores pending and rejected amounts and retains exact satang',()=>{assert.deepEqual(reviewBalance('100.10',[{status:'paid',verifiedAmount:'40.05'},{status:'pending_verification',verifiedAmount:'99.00'},{status:'rejected',verifiedAmount:'1.00'}]),{approved:'40.05',remaining:'60.05'});});
