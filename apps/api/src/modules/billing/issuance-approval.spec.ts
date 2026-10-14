import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import type { IssuanceApprovalBatch, IssuanceApprovalResult } from '@solar/api-contracts';
import { displayResult, validateIssuanceBatch, classifyIssuanceFailure } from './issuance-approval.js';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';

test('batch validation deduplicates internal UUIDs in first-occurrence order', () => {
  assert.deepEqual(validateIssuanceBatch({ billingCycleIds: [secondId, firstId, secondId] }), [secondId, firstId]);
});

test('batch validation treats UUID letter casing as the same internal reference', () => {
  const id = 'abcdefab-abcd-4abc-8abc-abcdefabcdef';
  assert.deepEqual(validateIssuanceBatch({ billingCycleIds: [id.toUpperCase(), secondId, id] }), [id.toUpperCase(), secondId]);
});

test('batch validation accepts the one and 100 item boundaries', () => {
  assert.deepEqual(validateIssuanceBatch({ billingCycleIds: [firstId] }), [firstId]);
  const ids = Array.from({ length: 100 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`);
  assert.deepEqual(validateIssuanceBatch({ billingCycleIds: ids }), ids);
});

test('batch validation rejects empty and oversized requests before deduplication', () => {
  assert.throws(() => validateIssuanceBatch({ billingCycleIds: [] }), /อย่างน้อย 1 รายการ/);
  assert.throws(() => validateIssuanceBatch({ billingCycleIds: Array(101).fill(firstId) }), BadRequestException);
});

test('batch validation rejects malformed request objects and unknown fields', () => {
  for (const input of [undefined, null, 'invalid', [], {}, { billingCycleIds: firstId }, { billingCycleIds: [firstId], label: 'client label' }]) {
    assert.throws(() => validateIssuanceBatch(input), BadRequestException);
  }
});

test('batch validation rejects non-UUID and non-string IDs', () => {
  for (const value of ['', 'not-a-uuid', ` ${firstId}`, '11111111-1111-0111-8111-111111111111', '11111111-1111-4111-7111-111111111111', 1, null, {}]) {
    assert.throws(() => validateIssuanceBatch({ billingCycleIds: [value] }), BadRequestException);
  }
  assert.throws(() => validateIssuanceBatch({ billingCycleIds: Array(1) }), BadRequestException);
});

test('display result projects human-readable labels and document number without internal fields', () => {
  const row = {
    id: firstId,
    billingCycleId: firstId,
    userId: secondId,
    label: { period: '2026-09', customer: 'บริษัท ตัวอย่าง', site: 'หลังคาโรงงาน', siteId: secondId },
    status: 'issued' as const,
    documentNumber: 'INV-2026-0001',
    message: 'ออกใบวางบิลแล้ว',
    document: { id: secondId },
  };
  const result: IssuanceApprovalResult = displayResult(row);
  assert.deepEqual(result, {
    label: { period: '2026-09', customer: 'บริษัท ตัวอย่าง', site: 'หลังคาโรงงาน' },
    status: 'issued', documentNumber: 'INV-2026-0001', message: 'ออกใบวางบิลแล้ว',
  });
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(firstId), false);
  assert.equal(serialized.includes(secondId), false);
});

test('display results retain batch order and statuses without inventing document numbers', () => {
  const rows = [
    { label: { period: '2026-09', customer: 'ลูกค้า ก', site: 'ไซต์ ก' }, status: 'already_issued' as const, documentNumber: 'INV-2026-0002', message: 'ออกเอกสารแล้ว' },
    { label: { period: '2026-08', customer: 'ลูกค้า ข', site: 'ไซต์ ข' }, status: 'failed' as const, message: 'ตรวจสอบข้อมูลก่อนอนุมัติ' },
  ];
  const batch: IssuanceApprovalBatch = { results: rows.map(displayResult) };
  assert.deepEqual(batch, { results: rows });
  assert.equal(Object.hasOwn(batch.results[1]!, 'documentNumber'), false);
});

test('known authorized domain failures map to static corrective messages without exception text',()=>{
 const cases=[
  [new ConflictException({code:'DOCUMENT_APPROVER_POSITION_REQUIRED',message:`private name ${firstId}`}),{code:'approver_position',message:'กรุณากำหนดตำแหน่งผู้อนุมัติในหน้าพนักงานและสิทธิ์'}],
  [new ConflictException('ใบวางบิลรายการนี้ยังไม่พร้อมอนุมัติออกเอกสาร'),{code:'draft_state',message:'กรุณาเตรียมใบวางบิลให้พร้อมตรวจอนุมัติก่อนออกเอกสาร'}],
  [new ConflictException('Site billing configuration changed; recalculate before issuance'),{code:'draft_stale',message:'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ'}],
  [new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',missing:['approval.confirmation'],context:{billingCycleId:firstId}}),{code:'readiness_confirmation',message:'กรุณาให้เจ้าของยืนยันความพร้อมด้านบัญชีก่อนอนุมัติออกเอกสาร'}],
  [new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',missing:['cycle.snapshot']}),{code:'draft_stale',message:'กรุณาคำนวณใบวางบิลใหม่ตามการตั้งค่าปัจจุบันก่อนอนุมัติ'}],
  [new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',missing:['site.tax']}),{code:'configuration_required',message:'กรุณาตรวจสอบการตั้งค่าการออกเอกสารและความพร้อมด้านบัญชี'}],
 ] as const;
 for(const [error,expected] of cases){assert.deepEqual(classifyIssuanceFailure(error),expected);assert.equal(JSON.stringify(classifyIssuanceFailure(error)).includes(firstId),false);}
});

test('unknown errors and near-match domain text remain generic',()=>{
 for(const error of [new Error(`SQL private ${firstId}`),new ConflictException(`Site billing configuration changed; recalculate before issuance ${firstId}`),new ServiceUnavailableException({code:'SQL_FAILURE',missing:['approval.confirmation']}),{code:'DOCUMENT_APPROVER_POSITION_REQUIRED'}]){
  assert.deepEqual(classifyIssuanceFailure(error),{code:'unexpected',message:'ไม่สามารถออกเอกสารได้'});
 }
});
