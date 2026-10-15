import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingIssuanceReview} from './billing-issuance-review';

const bill={period:'2026-09',customerName:'บริษัท ตัวอย่าง',siteName:'สำนักงานใหญ่',amount:'1070',tax:'70',dueDate:'2026-10-15'};
const approver={displayName:'สมชาย ใจดี',position:'กรรมการบริษัท',hasSignature:true};

test('issuance review shows bill finances and actual approver identity without internal IDs',()=>{
 const html=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={approver} locale="th" onApprove={()=>{}} password="secret-password"/>);
 assert.match(html,/2026-09.*บริษัท ตัวอย่าง.*สำนักงานใหญ่/s);
 assert.match(html,/สมชาย ใจดี.*กรรมการบริษัท/s);
 assert.match(html,/1,070.00/);assert.match(html,/70.00/);assert.match(html,/2026/);
 assert.match(html,/มีลายเซ็น/);assert.doesNotMatch(html,/[0-9a-f]{8}-[0-9a-f]{4}/i);
});

test('missing company position blocks approval and links to My Account',()=>{
 const html=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={{...approver,position:null,hasSignature:false}} locale="en" onApprove={()=>{}} password="secret-password"/>);
 assert.match(html,/Position not assigned/);assert.match(html,/href="\/settings\/account"/);assert.match(html,/My Account/);
 assert.match(html,/<button[^>]*disabled=""/);assert.match(html,/No signature/);
});

test('issuance review displays password input, legal disclaimer, and blocks submission when password is empty',()=>{
 const emptyHtml=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={approver} locale="th" onApprove={()=>{}} password=""/>);
 assert.match(emptyHtml,/รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร/);
 assert.match(emptyHtml,/การระบุรหัสผ่านถือเป็นการยืนยันความถูกต้องและยินยอมให้นำชื่อ ตำแหน่ง และลายเซ็นไปประทับลงในเอกสารฉบับจริงเพื่อจัดส่งให้ลูกค้า/);
 assert.match(emptyHtml,/<button[^>]*disabled=""/);

 const filledHtml=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={approver} locale="th" onApprove={()=>{}} password="mypassword"/>);
 assert.doesNotMatch(filledHtml,/<button[^>]*disabled=""/);
});

test('issuance review displays inline password error when provided',()=>{
 const html=renderToStaticMarkup(<BillingIssuanceReview bill={bill} approver={approver} locale="th" onApprove={()=>{}} password="" passwordError="รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง"/>);
 assert.match(html,/role="alert"/);
 assert.match(html,/รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง/);
});
