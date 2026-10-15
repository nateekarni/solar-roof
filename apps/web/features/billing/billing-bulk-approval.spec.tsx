import * as React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {BillingApprovalConfirmation,BillingApprovalResults,BillingBulkApproval,exportSelectedRowsAsCsv,submitBillingApproval} from './billing-bulk-approval';
import type {IssuanceApprovalResult} from '@solar/api-contracts';

const rows=[{id:'b5ca6e69-688d-4d43-8b8f-99f2b0df26ca',reviewToken:'a'.repeat(64),billingStatusView:'pending_issue_approval',period:'2026-09',customerName:'บริษัท ตัวอย่าง',siteName:'สำนักงานใหญ่',amount:'1070',simulatedTax:'70',dueDate:'2026-10-15'}];
const approver={displayName:'สมชาย ใจดี',position:'กรรมการบริษัท',hasSignature:false};
const testPassword='correct-password-123';

test('bulk confirmation shows readable selected bills, approver, and password field',()=>{
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={rows} approver={approver} locale="th" busy={false} password={testPassword} onApprove={()=>{}}/>);
 assert.match(html,/2026-09.*บริษัท ตัวอย่าง.*สำนักงานใหญ่/s);
 assert.match(html,/สมชาย ใจดี.*กรรมการบริษัท/s);
 assert.match(html,/รหัสผ่านเพื่อยืนยันการลงนามและออกเอกสาร/);
 assert.match(html,/การระบุรหัสผ่านถือเป็นการยืนยันความถูกต้องและยินยอมให้นำชื่อ ตำแหน่ง และลายเซ็นไปประทับลงในเอกสารฉบับจริงเพื่อจัดส่งให้ลูกค้า/);
 assert.doesNotMatch(html,/[0-9a-f]{8}-[0-9a-f]{4}/i);
 assert.doesNotMatch(html,/<button[^>]*disabled=""/);
});

test('bulk confirmation disables approve button when password is missing',()=>{
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={rows} approver={approver} locale="th" busy={false} password="" onApprove={()=>{}}/>);
 assert.match(html,/<button[^>]*disabled=""/);
});

test('bulk confirmation displays inline password error without closing',()=>{
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={rows} approver={approver} locale="th" busy={false} password="" passwordError="รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง" onApprove={()=>{}}/>);
 assert.match(html,/role="alert"/);
 assert.match(html,/รหัสผ่านไม่ถูกต้อง กรุณาระบุรหัสผ่านใหม่อีกครั้ง/);
});

test('replacement confirmation reviews proposed financial facts and actual recipient destinations',()=>{
 const proposed={rate:'5',subtotal:'5000',tax:'500',amount:'5500',dueDate:'2026-11-15'};
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={[{...rows[0]!,pendingReplacement:proposed,recipients:[{name:'Review Recipient',email:'recipient@example.test'}]}]} approver={approver} locale="en" busy={false} password={testPassword} onApprove={()=>{}}/>);
 assert.match(html,/5,500.00/);assert.match(html,/5,000.00/);assert.match(html,/500.00/);assert.doesNotMatch(html,/1,070.00/);
 assert.match(html,/Review Recipient/);assert.match(html,/recipient@example.test/);assert.match(html,/original remains valid/i);
});

test('review token and password travel with the single or per-item bulk approval',async()=>{
 const calls:unknown[]=[];const post=async(path:string,body:unknown)=>{calls.push(body);return path.includes('/'+rows[0]!.id+'/')?results[0]:{results};};
 const reviewed=[{...rows[0]!,reviewToken:'a'.repeat(64)}];
 await submitBillingApproval(reviewed,'single',testPassword,post);
 await submitBillingApproval(reviewed,'bulk',testPassword,post);
 assert.deepEqual(calls,[
  {reviewToken:'a'.repeat(64),password:testPassword},
  {billingCycleIds:[rows[0]!.id],reviewTokens:{[rows[0]!.id]:'a'.repeat(64)},password:testPassword}
 ]);
});

test('submission rejects when password is empty',async()=>{
 const post=async()=>({results});
 await assert.rejects(submitBillingApproval(rows,'single','',post),/Password required/);
 await assert.rejects(submitBillingApproval(rows,'bulk','  ',post),/Password required/);
});

test('approval review preserves the four-decimal proposed energy rate',()=>{
 const html=renderToStaticMarkup(<BillingApprovalConfirmation rows={[{...rows[0]!,rate:'4.3217'}]} approver={approver} locale="en" busy={false} password={testPassword} onApprove={()=>{}}/>);
 assert.match(html,/4\.3217/);
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
 assert.deepEqual(await submitBillingApproval(rows,'bulk',testPassword,post),results);
 assert.deepEqual(requests[0],{path:'/v1/billing-cycles/approve-issuance',body:{billingCycleIds:[rows[0]!.id],reviewTokens:{[rows[0]!.id]:'a'.repeat(64)},password:testPassword}});
 assert.deepEqual(await submitBillingApproval(rows,'single',testPassword,post),[results[0]]);
 assert.deepEqual(requests[1],{path:`/v1/billing-cycles/${rows[0]!.id}/approve-issuance`,body:{reviewToken:'a'.repeat(64),password:testPassword}});
});

test('empty, oversized and ineligible requests never submit',async()=>{
 let calls=0;const post=async()=>{calls++;return {results};};
 for(const value of [[],Array.from({length:101},(_,index)=>({...rows[0]!,id:String(index)})),[{...rows[0]!,billingStatusView:'paid'}]])await assert.rejects(submitBillingApproval(value,'bulk',testPassword,post));
 assert.equal(calls,0);
});

test('floating selection bar renders capsule container with context-aware actions for pending rows',()=>{
 const html=renderToStaticMarkup(<BillingBulkApproval rows={rows} approver={approver} locale="th" canApprove={true} onCompleted={()=>{}} onClearSelection={()=>{}}/>);
 assert.match(html,/fixed bottom-6 left-1\/2 -translate-x-1\/2 z-50/);
 assert.match(html,/เลือกแล้ว 1 รายการ/);
 assert.match(html,/รออนุมัติ 1 รายการ/);
 assert.match(html,/อนุมัติและออกเอกสาร \(1 รายการ\)/);
 assert.match(html,/นำออกข้อมูลที่เลือก \(1\)/);
 assert.match(html,/ล้างการเลือก/);
});

test('floating selection bar adapts when only non-pending rows are selected',()=>{
 const paidRows=[{...rows[0]!,billingStatusView:'paid'}];
 const html=renderToStaticMarkup(<BillingBulkApproval rows={paidRows} approver={approver} locale="th" canApprove={true} onCompleted={()=>{}} onClearSelection={()=>{}}/>);
 assert.match(html,/fixed bottom-6 left-1\/2 -translate-x-1\/2 z-50/);
 assert.match(html,/เลือกแล้ว 1 รายการ/);
 assert.match(html,/ไม่มีรายการรออนุมัติ/);
 assert.doesNotMatch(html,/อนุมัติและออกเอกสาร/);
 assert.match(html,/นำออกข้อมูลที่เลือก \(1\)/);
 assert.match(html,/ล้างการเลือก/);
});

test('floating selection bar adapts to English locale',()=>{
 const html=renderToStaticMarkup(<BillingBulkApproval rows={rows} approver={approver} locale="en" canApprove={true} onCompleted={()=>{}} onClearSelection={()=>{}}/>);
 assert.match(html,/1 selected/);
 assert.match(html,/1 pending approval/);
 assert.match(html,/Approve and issue \(1\)/);
 assert.match(html,/Export selected \(1\)/);
 assert.match(html,/Clear selection/);
});

