import assert from 'node:assert/strict';
import test from 'node:test';
import {verifiedArtifact} from './artifact-policy.js';
test('restore downloads bind scope and verified gzip identity instead of claiming CSV',()=>{
 const id='00000000-0000-0000-0000-000000000001',execution='00000000-0000-0000-0000-000000000002';
 const job={id,kind:'restore',row_count:'2',snapshot_at:new Date('2025-01-01T00:00:00Z'),payload:{siteId:'site',from:'2025-01-01',to:'2025-01-02'},object_key:`restores/${id}/${execution}.jsonl.gz`,manifest:{key:`restores/${id}/${execution}.jsonl.gz`,execution,checksum:'a'.repeat(64),bytes:100,rowCount:2,snapshotAt:'2025-01-01T00:00:00.000Z',etag:'etag',siteId:'site',from:'2025-01-01',to:'2025-01-02'}};
 assert.deepEqual(verifiedArtifact(job),{contentType:'application/gzip',filename:`history-${id}.jsonl.gz`,manifest:job.manifest});
 for(const patch of [{key:'restores/another/object.jsonl.gz'},{siteId:'other'},{checksum:'invalid'},{bytes:-1},{etag:''},{rowCount:3}])assert.throws(()=>verifiedArtifact({...job,manifest:{...job.manifest,...patch}}),/artifact_mismatch/);
 assert.throws(()=>verifiedArtifact({...job,kind:'archive'}),/artifact_mismatch/);
});
