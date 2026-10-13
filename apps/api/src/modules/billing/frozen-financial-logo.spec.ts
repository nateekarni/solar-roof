import test from 'node:test';import assert from 'node:assert/strict';import {frozenFinancialLogo} from './frozen-financial-logo.js';
const png='data:image/png;base64,iVBORw0KGgo=';
test('receipt retains invoice embedded logo after company logo changes',()=>{
 assert.equal(frozenFinancialLogo('data:image/png;base64,ORIGINAL','/brand/new.png','data:image/png;base64,FALLBACK'),'data:image/png;base64,ORIGINAL');
 assert.equal(frozenFinancialLogo(undefined,png,'fallback'),png);
 assert.equal(frozenFinancialLogo(undefined,'/brand/new.png','fallback'),'fallback');
});
test('new financial logos reject non-PNG/JPEG and invalid decoded bytes before freezing',()=>{
 for(const invalid of ['data:image/svg+xml;base64,PHN2Zy8+','data:image/png;base64,bm90LXBuZw==','data:image/jpeg;base64,iVBORw0KGgo='])assert.throws(()=>frozenFinancialLogo(undefined,invalid,'fallback'),/PNG\/JPEG/);
});
test('new absent and legacy-path logos use fallback while historical logos bypass current validation',()=>{
 for(const current of [undefined,'','/brand/old.png'])assert.equal(frozenFinancialLogo(undefined,current,'fallback'),'fallback');
 assert.equal(frozenFinancialLogo('saved historical logo','data:image/svg+xml;base64,PHN2Zy8+','fallback'),'saved historical logo');
 assert.equal(frozenFinancialLogo(undefined,'data:image/jpeg;base64,/9j/','fallback'),'data:image/jpeg;base64,/9j/');
});
