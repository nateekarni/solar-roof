/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPayPayload, normalizePromptPayId } from './promptpay.js';

test('normalizes Thai mobile and national identifiers without retaining formatting',()=>{
 assert.deepEqual(normalizePromptPayId('081-234-5678'),{kind:'mobile',value:'0066812345678'});
 assert.deepEqual(normalizePromptPayId('0 1055 65012 34 5'),{kind:'national_id',value:'0105565012345'});
});

test('builds a known amount-specific PromptPay EMVCo payload with CRC',()=>{
 assert.equal(buildPromptPayPayload('0812345678','123.45'),'00020101021229370016A0000006770101110113006681234567853037645406123.455802TH6304B5E2');
});

test('builds a known reusable national-id PromptPay payload without amount tag',()=>{
 const payload=buildPromptPayPayload('0105565012345');
 assert.equal(payload,'00020101021129370016A0000006770101110213010556501234553037645802TH63045FE3');
 assert.equal(payload.includes('54'),false);
});

test('rejects unsupported identifiers and non-positive or imprecise amounts',()=>{
 for(const id of ['','123456789','123456789012','12345678901234','abcdefghij'])assert.throws(()=>normalizePromptPayId(id),/PromptPay/);
 for(const amount of ['0','-1','NaN','1.001','10000000000000'])assert.throws(()=>buildPromptPayPayload('0812345678',amount),/amount/);
});
