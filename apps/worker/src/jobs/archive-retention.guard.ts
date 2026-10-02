import type {Pool} from 'pg';
import {ArchiveObjectStore} from './archive-object-store.js';
import {retentionDecision,validateRestoreWindow,restoreLimits} from './archive-policy.js';

/** Read-only assessment. No delete path exists until independent financial/row coverage is implemented and approved. */
export class ArchiveRetentionGuard {
 constructor(readonly pool:Pool,readonly objects:ArchiveObjectStore){}
 async assess(from:string,to:string,signal:AbortSignal){
  const limits=restoreLimits();validateRestoreWindow(from,to,limits);
  const start=`${from}T00:00:00+07:00`,end=`${to}T00:00:00+07:00`;
  const rows=(await this.pool.query('SELECT DISTINCT site_id FROM telemetry_raw WHERE source_time>=$1::timestamptz AND source_time<$2::timestamptz LIMIT 1001',[start,end])).rows;
  if(rows.length>1000)throw Error('retention_site_limit');
  const manifests=(await this.pool.query('SELECT * FROM telemetry_archives WHERE range_from<=$1::timestamptz AND range_to>=$2::timestamptz LIMIT $3',[start,end,limits.maxManifests+1])).rows;
  if(manifests.length>limits.maxManifests)throw Error('archive_manifest_limit');
  let verified=true;const sites=new Set<string>();
  for(const manifest of manifests){signal.throwIfAborted();try{await this.objects.verify({key:manifest.object_key,execution:manifest.execution,bytes:Number(manifest.bytes),checksum:manifest.sha256},signal);sites.add(manifest.site_id);}catch{verified=false;}}
  const hold=(await this.pool.query('SELECT EXISTS(SELECT 1 FROM telemetry_retention_holds WHERE released_at IS NULL AND (site_id IS NULL OR site_id=ANY($1::uuid[]))) AS held',[rows.map(row=>row.site_id)])).rows[0].held;
  const proof={enabled:process.env.RAW_RETENTION_ENABLED==='true',olderThan90Days:Date.parse(end)<=Date.now()-90*86400000,allRowsArchived:null,allTenantsCovered:rows.every(row=>sites.has(row.site_id)),checksumsVerified:verified&&manifests.length>0,summaryComplete:null,financialEvidencePreserved:false,mappingsPreserved:null,hold,restoreVerified:false,policyApproved:false};
  return {deletedRows:0,proof,...retentionDecision(proof)};
 }
}
