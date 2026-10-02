import assert from 'node:assert/strict';
import test from 'node:test';
import {retentionDecision,validateArchiveWindow,restoreLimits,validateRestoreWindow} from '../src/jobs/archive-policy.js';

test('retention never deletes with incomplete tenant coverage or unpreserved evidence',()=>{
  const proof={enabled:true,olderThan90Days:true,allRowsArchived:true,allTenantsCovered:true,checksumsVerified:true,summaryComplete:true,financialEvidencePreserved:true,mappingsPreserved:true,hold:false,restoreVerified:true,policyApproved:true};
  assert.equal(retentionDecision(proof).eligible,true);
  for(const key of ['enabled','olderThan90Days','allRowsArchived','allTenantsCovered','checksumsVerified','summaryComplete','financialEvidencePreserved','mappingsPreserved','restoreVerified','policyApproved'] as const){
    assert.equal(retentionDecision({...proof,[key]:false}).eligible,false,key);
    assert.equal(retentionDecision({...proof,[key]:undefined}).eligible,false,`missing ${key}`);
  }
  assert.equal(retentionDecision({...proof,hold:true}).eligible,false);
  assert.equal(retentionDecision({...proof,hold:undefined}).eligible,false);
  assert.equal(retentionDecision({}).eligible,false);
});

test('restore safety limits reject oversized windows and invalid configuration',()=>{
 assert.equal(restoreLimits({}).maxDays,31);
 assert.deepEqual(validateRestoreWindow('2025-01-01','2025-02-01',restoreLimits({})),{from:'2025-01-01',to:'2025-02-01'});
 assert.throws(()=>validateRestoreWindow('2025-01-01','2025-02-02',restoreLimits({})),/restore_window_limit/);
 for(const value of ['0','-1','1.5','Infinity','367',''])assert.throws(()=>restoreLimits({HISTORY_RESTORE_MAX_DAYS:value}),/invalid_restore_limit/);
 assert.equal(restoreLimits({HISTORY_RESTORE_MAX_DAYS:'7'}).maxDays,7);
 assert.ok(restoreLimits({}).maxUncompressedBytes>restoreLimits({}).maxCompressedBytes);
});

test('archive window rejects ambiguous or reversed dates instead of normalizing them',()=>{
  assert.deepEqual(validateArchiveWindow('2026-01-01','2026-01-02'),{from:'2026-01-01',to:'2026-01-02'});
  for(const pair of [['2026-02-30','2026-03-01'],['2026-1-1','2026-01-02'],['2026-03-02','2026-03-01'],['','2026-01-01']]){
    assert.throws(()=>validateArchiveWindow(pair[0],pair[1]));
  }
});
