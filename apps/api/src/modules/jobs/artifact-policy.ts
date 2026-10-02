export function verifiedArtifact(job:any){
 const manifest=job.manifest,restore=job.kind==='restore';
 const key=restore?`restores/${job.id}/${manifest?.execution}.jsonl.gz`:`reports/${job.id}/${manifest?.execution}.csv`;
 if(!['report','restore'].includes(job.kind)||!manifest||typeof manifest.execution!=='string'||!(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(manifest.execution))||manifest.key!==job.object_key||manifest.key!==key
  ||!/^[a-f0-9]{64}$/.test(manifest.checksum??'')||typeof manifest.etag!=='string'||!manifest.etag||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<0||!Number.isSafeInteger(manifest.rowCount)||manifest.rowCount<0
  ||Number(job.row_count)!==manifest.rowCount||job.snapshot_at?.toISOString()!==manifest.snapshotAt
  ||restore&&(manifest.siteId!==job.payload.siteId||manifest.from!==job.payload.from||manifest.to!==job.payload.to))throw Error('artifact_mismatch');
 return {contentType:restore?'application/gzip':'text/csv; charset=utf-8',filename:restore?`history-${job.id}.jsonl.gz`:`report-${job.id}.csv`,manifest};
}
