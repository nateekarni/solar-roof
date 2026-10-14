import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingIssuanceReview} from './billing-issuance-review';

const bill={period:'2026-09',customerName:'บริษัท ตัวอย่าง',siteName:'สำนักงานใหญ่',amount:'1070',tax:'70',dueDate:'2026-10-15'};
const approver={displayName:'สมชาย ใจดี',position:'กรรมการบริษัท',hasSignature:true};
test('issuance review shows bill finances and actual approver identity without internal IDs',()=>{
 const html=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={approver} locale="th" onApprove={()=>{}}/>);
 assert.match(html,/2026-09.*บริษัท ตัวอย่าง.*สำนักงานใหญ่/s);
 assert.match(html,/สมชาย ใจดี.*กรรมการบริษัท/s);
 assert.match(html,/1,070.00/);assert.match(html,/70.00/);assert.match(html,/2026/);
 assert.match(html,/มีลายเซ็น/);assert.doesNotMatch(html,/[0-9a-f]{8}-[0-9a-f]{4}/i);
});
test('missing company position blocks approval and links to My Account',()=>{
 const html=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={{...approver,position:null,hasSignature:false}} locale="en" onApprove={()=>{}}/>);
 assert.match(html,/Position not assigned/);assert.match(html,/href="\/settings\/account"/);assert.match(html,/My Account/);
 assert.match(html,/<button[^>]*disabled=""/);assert.match(html,/No signature/);
});
