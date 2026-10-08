import test from 'node:test';
import assert from 'node:assert/strict';
import { organizationDocumentStatus } from './organization-document-status';
test('document rows and filters localize every supported billing and payment status',()=>{
 assert.equal(organizationDocumentStatus('approved','th'),'อนุมัติแล้ว');
 assert.equal(organizationDocumentStatus('approved','en'),'Approved');
 for(const status of ['issued','paid','draft','cancelled','pending_verification','rejected','active','expired','unpaid','awaiting_payment','payment_rejected','pending_approval','pending_review','finalized']){
  assert.notEqual(organizationDocumentStatus(status,'th'),status);
  assert.notEqual(organizationDocumentStatus(status,'en'),status);
 }
 assert.equal(organizationDocumentStatus(undefined,'th'),'—');
 assert.equal(organizationDocumentStatus('future_status','en'),'future_status');
});
