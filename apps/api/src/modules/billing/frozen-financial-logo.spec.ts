import test from 'node:test';import assert from 'node:assert/strict';import {frozenFinancialLogo} from './frozen-financial-logo.js';
test('receipt retains invoice embedded logo after company logo changes',()=>{
 assert.equal(frozenFinancialLogo('data:image/png;base64,ORIGINAL','/brand/new.png','data:image/png;base64,FALLBACK'),'data:image/png;base64,ORIGINAL');
 assert.equal(frozenFinancialLogo(undefined,'data:image/png;base64,NEW','fallback'),'data:image/png;base64,NEW');
 assert.equal(frozenFinancialLogo(undefined,'/brand/new.png','fallback'),'fallback');
});
