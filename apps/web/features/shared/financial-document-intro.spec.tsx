import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {FinancialDocumentIntro} from './financial-document-intro';
test('school financial summary explains own documents and evidence without management instructions',()=>{
 const html=renderToStaticMarkup(<FinancialDocumentIntro resource="billing" role="school_user" locale="en"/>);
 assert.match(html,/your school/);assert.match(html,/payment evidence/);assert.doesNotMatch(html,/Create|approve|version|Site/);
});
test('owner documents explain company financial work in plain language',()=>{
 const html=renderToStaticMarkup(<FinancialDocumentIntro resource="contracts" role="owner" locale="en"/>);
 assert.match(html,/contracts and electricity rates/);assert.doesNotMatch(html,/effective date|version|Site/);
 assert.equal(renderToStaticMarkup(<FinancialDocumentIntro resource="sites" role="owner" locale="en"/>),'');
});
