import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingApprovalConfirmation,BillingApprovalResults,submitBillingApproval} from './billing-bulk-approval';
import type {IssuanceApprovalResult} from '@solar/api-contracts';
const rows=[{id:'b5ca6e69-688d-4d43-8b8f-99f2b0df26ca',billingStatusView:'pending_issue_approval',period:'2026-09',customerName:'บริษัท ตัวอย่าง',siteName:'สำนักงานใหญ่',amount:'1070',simulatedTax:'70',dueDate:'2026-10-15'}];
const approver={displayName:'สมชาย ใจดี',position:'กรรมการบริษัท',hasSignature:false};
test('bulk confirmation shows readable selected bills and current approver',()=>{
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={rows} approver={approver} locale="th" busy={false} onApprove={()=>{}}/>);
 assert.match(html,/2026-09.*บริษัท ตัวอย่าง.*สำนักงานใหญ่/s);assert.match(html,/สมชาย ใจดี.*กรรมการบริษัท/s);
 assert.doesNotMatch(html,/[0-9a-f]{8}-[0-9a-f]{4}/i);
});
const label={period:'2026-09',customer:'Server customer',site:'Server site'};
const results:IssuanceApprovalResult[]=[{label,status:'issued',documentNumber:'INV-01',message:'ออกใบวางบิลแล้ว'},{label,status:'already_issued',documentNumber:'INV-02',message:'ออกใบวางบิลแล้วก่อนหน้านี้'},{label,status:'failed',message:'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ'}];
test('partial result uses server labels and safe corrective copy in both languages',()=>{
 const th=renderToStaticMarkup(<BillingApprovalResults results={results} locale="th"/>);
 assert.match(th,/ออกเอกสารสำเร็จ 2 รายการ/);assert.match(th,/ยังรออนุมัติ 1 รายการ/);assert.match(th,/INV-01/);assert.match(th,/Server customer/);assert.match(th,/คำนวณใบวางบิลใหม่/);
 const en=renderToStaticMarkup(<BillingApprovalResults results={results} locale="en"/>);
 assert.match(en,/2 documents issued/);assert.match(en,/1 still awaiting approval/);assert.match(en,/Recalculate/);assert.match(en,/Already issued/);
 assert.doesNotMatch(en,/[0-9a-f]{8}-[0-9a-f]{4}/i);
});
test('single issuance result uses singular readable English copy',()=>{
 const html=renderToStaticMarkup(<BillingApprovalResults results={[results[0]!]} locale="en"/>);
 assert.match(html,/1 document issued/);assert.match(html,/0 still awaiting approval/);
});
test('single and bulk submissions use reviewed routes and IDs only in request',async()=>{
 const requests:{path:string;body:unknown}[]=[];
 const post=async(path:string,body:unknown)=>{requests.push({path,body});return path.endsWith('ca/approve-issuance')?results[0]:{results};};
 assert.deepEqual(await submitBillingApproval(rows,'bulk',post),results);
 assert.deepEqual(requests[0],{path:'/v1/billing-cycles/approve-issuance',body:{billingCycleIds:[rows[0]!.id]}});
 assert.deepEqual(await submitBillingApproval(rows,'single',post),[results[0]]);
 assert.deepEqual(requests[1],{path:`/v1/billing-cycles/${rows[0]!.id}/approve-issuance`,body:{}});
});
test('empty, oversized and ineligible requests never submit',async()=>{
 let calls=0;const post=async()=>{calls++;return {results};};
 for(const value of [[],Array.from({length:101},(_,index)=>({...rows[0]!,id:String(index)})),[{...rows[0]!,billingStatusView:'paid'}]])await assert.rejects(submitBillingApproval(value,'bulk',post));
 assert.equal(calls,0);
});
