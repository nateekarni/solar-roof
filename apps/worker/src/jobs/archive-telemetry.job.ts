import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import {createGzip} from 'node:zlib';
import type {Pool,PoolClient} from 'pg';
import {ArchiveObjectStore,type StoredArchive,type PendingArchive} from './archive-object-store.js';
import {validateArchiveWindow,validateRestoreWindow,restoreLimits} from './archive-policy.js';

/** Copies evidence into an immutable generation. It never removes source rows. */
export class ArchiveTelemetryJob {
  constructor(readonly pool:Pool,readonly storage:ArchiveObjectStore){}
  async archive(siteId:string,from:string,to:string,options:{signal?:AbortSignal;checkpoint?:(value:ArchiveCheckpoint|ArchiveUploadCheckpoint)=>Promise<void>}={}){
    const limits=restoreLimits();validateRestoreWindow(from,to,limits);
    if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(siteId))throw Error('invalid_site');
    const signal=options.signal??AbortSignal.timeout(600000),id=randomUUID(),key=`archives/${siteId}/${id}.jsonl.gz`;
    const client=await this.pool.connect();let rowCount=0;
    try{
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      await client.query("SET LOCAL statement_timeout='15000ms'");
      const snapshot=(await client.query('SELECT transaction_timestamp() AS at')).rows[0].at;
      const rows=this.rows(client,siteId,from,to,signal,()=>{if(++rowCount>limits.maxRows)throw Error('archive_row_limit');});
      const compressed=Readable.from(rows).compose(createGzip());
      const stored=await this.storage.upload(key,compressed as AsyncIterable<Buffer>,signal,async stored=>{await options.checkpoint?.({...stored,id,siteId,from,to,rowCount,snapshotAt:snapshot.toISOString(),schemaVersion:1});},async pending=>{await options.checkpoint?.({...pending,id,siteId,from,to,rowCount:null,snapshotAt:snapshot.toISOString(),schemaVersion:1,checksum:null,bytes:null,etag:null});});
      await client.query('COMMIT');
      signal.throwIfAborted();
      return await this.publish({...stored,id,siteId,from,to,rowCount,snapshotAt:snapshot.toISOString(),schemaVersion:1},signal,client);
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  async publish(checkpoint:ArchiveCheckpoint,signal:AbortSignal,borrowed?:PoolClient){
    const {id,siteId,from,to,key,execution,checksum,bytes,rowCount,snapshotAt}=checkpoint;
    validateArchiveWindow(from,to);if(!Number.isSafeInteger(rowCount)||rowCount<0||checkpoint.schemaVersion!==1||key!==`archives/${siteId}/${id}.jsonl.gz`)throw Error('archive_mismatch');
    const etag=await this.storage.verify(checkpoint,signal);signal.throwIfAborted();
    const client=borrowed??await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='15000ms'");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${siteId}:${from}:${to}`]);
      await client.query(`INSERT INTO telemetry_archives(id,site_id,range_from,range_to,generation,object_key,execution,sha256,bytes,row_count,schema_version,etag,snapshot_at,verified_at)
        SELECT $1,$2,$3::timestamptz,$4::timestamptz,COALESCE(max(generation),0)+1,$5,$6,$7,$8,$9,1,$10,$11,now()
        FROM telemetry_archives WHERE site_id=$2 AND range_from=$3::timestamptz AND range_to=$4::timestamptz ON CONFLICT(id) DO NOTHING`,
        [id,siteId,`${from}T00:00:00+07:00`,`${to}T00:00:00+07:00`,key,execution,checksum,bytes,rowCount,etag,snapshotAt]);
      const row=(await client.query('SELECT * FROM telemetry_archives WHERE id=$1',[id])).rows[0];
      if(row.execution!==execution||row.sha256!==checksum||row.object_key!==key)throw Error('archive_mismatch');
      await client.query('COMMIT');
      return {id:row.id,siteId,generation:row.generation,from:row.range_from.toISOString(),to:row.range_to.toISOString(),rows:rowCount,sha256:checksum,schemaVersion:1,objectKey:key,verifiedAt:row.verified_at.toISOString()};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{if(!borrowed)client.release();}
  }
  private async *rows(client:PoolClient,site:string,from:string,to:string,signal:AbortSignal,count:()=>void){
    let cursorTime:string|null=null,cursorId:string|null=null,bytes=0;const limits=restoreLimits();
    for(;;){
      signal.throwIfAborted();
      const page:import('pg').QueryResult<{id:string;cursor_time:string;reading:string;mappings:string}>=await client.query(`SELECT t.id,t.source_time::text AS cursor_time,row_to_json(t)::text AS reading,
        COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM register_mapping_versions m WHERE m.id=t.mapping_version_id OR m.id=ANY(t.mapping_version_ids)),'[]'::jsonb)::text AS mappings
        FROM telemetry_raw t WHERE t.site_id=$1 AND t.source_time>=$2::timestamptz AND t.source_time<$3::timestamptz
        AND ($4::timestamptz IS NULL OR (t.source_time,t.id)>($4::timestamptz,$5::uuid)) ORDER BY t.source_time,t.id LIMIT 250`,
        [site,`${from}T00:00:00+07:00`,`${to}T00:00:00+07:00`,cursorTime,cursorId]);
      if(!page.rows.length)return;
      for(const row of page.rows){signal.throwIfAborted();count();const line=Buffer.from(`{"schemaVersion":1,"reading":${row.reading},"mappings":${row.mappings}}\n`);if(line.length>2*1024*1024)throw Error('archive_record_too_large');bytes+=line.length;if(bytes>limits.maxUncompressedBytes)throw Error('archive_uncompressed_limit');yield line;cursorTime=row.cursor_time;cursorId=row.id;}
    }
  }
}
export interface ArchiveCheckpoint extends StoredArchive {id:string;siteId:string;from:string;to:string;rowCount:number;snapshotAt:string;schemaVersion:1}
export interface ArchiveUploadCheckpoint extends PendingArchive {id:string;siteId:string;from:string;to:string;rowCount:null;snapshotAt:string;schemaVersion:1;checksum:null;bytes:null;etag:null}
