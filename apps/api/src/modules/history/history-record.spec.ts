import assert from 'node:assert/strict';
import test from 'node:test';
import {JobAccessService} from '../jobs/job-access.service.js';
test('restore status exposes its actual request and retry policy without invented report metadata',()=>{
 const service=new JobAccessService({} as never);
 const record=service.record({id:'job',kind:'restore',status:'failed',payload:{siteId:'site',from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},progress:null,row_count:null,snapshot_at:null,created_by:'actor',attempt:1,error_code:'archive_coverage_missing',object_key:null,available_at:new Date('2025-01-01T00:00:00Z')});
 assert.equal(record.report,null);assert.deepEqual(record.history,{siteId:'site',from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'});
 assert.equal(record.retryPolicy.canRetry,true);
});
