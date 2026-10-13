import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import {FinancialApplicationService} from './financial-application.service.js';

test('manual issuance rejects missing request identity before creating or delivering any financial row',async()=>{
 let writes=0;const service=new FinancialApplicationService({transaction:async()=>{writes++;throw Error('Must validate identity before persistence');}} as any,{} as any);
 await assert.rejects(service.manualInvoice({siteId:'site',lines:[{description:'Work',quantity:'1',unitPrice:'100'}]},'owner'),/idempotency key/i);assert.equal(writes,0);
});
