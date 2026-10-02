import {randomUUID} from 'node:crypto';
import {Readable,Transform,compose} from 'node:stream';
import {createGunzip,createGzip} from 'node:zlib';
import {StringDecoder} from 'node:string_decoder';
import type {Pool,PoolClient,QueryResult} from 'pg';
import {ArchiveObjectStore,type StoredArchive,type PendingArchive} from './archive-object-store.js';
import {validateRestoreWindow,restoreLimits} from './archive-policy.js';

/** Restores to an export artifact using a temporary deduplication table, never live ingestion. */
export class RestoreHistoryJob {
  constructor(readonly pool:Pool,readonly archive:ArchiveObjectStore,readonly artifacts:ArchiveObjectStore){}
  async restore(siteId:string,from:string,to:string,jobId:string,signal:AbortSignal,checkpoint?:(value:(StoredArchive|PendingArchive&{checksum:null;bytes:null;etag:null})&{rowCount:number;snapshotAt:string;siteId:string;from:string;to:string})=>Promise<void>){
    const limits=restoreLimits();validateRestoreWindow(from,to,limits);
    if(![siteId,jobId].every(value=>/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)))throw Error('invalid_identity');
    const start=`${from}T00:00:00+07:00`,end=`${to}T00:00:00+07:00`;
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='15000ms'");
      const snapshotAt=(await client.query('SELECT transaction_timestamp() AS at')).rows[0].at.toISOString();
      const manifests=(await client.query('SELECT * FROM telemetry_archives WHERE site_id=$1 AND range_from<$3::timestamptz AND range_to>$2::timestamptz ORDER BY snapshot_at,generation,created_at,id LIMIT $4',[siteId,start,end,limits.maxManifests+1])).rows;
      if(manifests.length>limits.maxManifests)throw Error('archive_manifest_limit');
      const compressedBytes=manifests.reduce((sum:number,m:any)=>sum+Number(m.bytes),0);
      if(!Number.isSafeInteger(compressedBytes)||compressedBytes<0||compressedBytes>limits.maxCompressedBytes)throw Error('archive_compressed_limit');
      let covered=Date.parse(start);
      for(const manifest of [...manifests].sort((a,b)=>a.range_from.getTime()-b.range_from.getTime())){if(manifest.range_from.getTime()>covered)break;covered=Math.max(covered,manifest.range_to.getTime());}
      if(covered<Date.parse(end))throw Error('archive_coverage_missing');
      await client.query('CREATE TEMP TABLE history_restore_rows(id uuid,source_time timestamptz,payload jsonb NOT NULL,PRIMARY KEY(id,source_time)) ON COMMIT DROP');
      let inflated=0,seen=0;
      let batch:string[]=[],batchBytes=0;
      const flush=async()=>{if(!batch.length)return;signal.throwIfAborted();await client.query(`WITH docs AS (SELECT value::jsonb AS doc,ordinality AS n FROM unnest($1::text[]) WITH ORDINALITY AS input(value,ordinality)),
        latest AS (SELECT DISTINCT ON ((doc->'reading'->>'id')::uuid,(doc->'reading'->>'source_time')::timestamptz) doc FROM docs ORDER BY (doc->'reading'->>'id')::uuid,(doc->'reading'->>'source_time')::timestamptz,n DESC)
        INSERT INTO history_restore_rows SELECT (doc->'reading'->>'id')::uuid,(doc->'reading'->>'source_time')::timestamptz,doc FROM latest
        WHERE (doc->'reading'->>'source_time')::timestamptz>=$2::timestamptz AND (doc->'reading'->>'source_time')::timestamptz<$3::timestamptz
        ON CONFLICT(id,source_time) DO UPDATE SET payload=EXCLUDED.payload`,[batch,start,end]);batch=[];batchBytes=0;};
      for(const manifest of manifests){
        signal.throwIfAborted();
        const compressed=this.archive.read({key:manifest.object_key,execution:manifest.execution,bytes:Number(manifest.bytes),checksum:manifest.sha256,etag:manifest.etag},signal);
        let lineBytes=0;
        const budget=new Transform({transform(chunk:Buffer,_encoding,callback){
          inflated+=chunk.length;if(inflated>limits.maxUncompressedBytes){callback(Error('archive_uncompressed_limit'));return;}
          let at=0,next:number;while((next=chunk.indexOf(10,at))!==-1){lineBytes+=next-at;if(lineBytes>2*1024*1024){callback(Error('archive_record_too_large'));return;}lineBytes=0;at=next+1;}
          lineBytes+=chunk.length-at;if(lineBytes>2*1024*1024){callback(Error('archive_record_too_large'));return;}callback(null,chunk);
        }});
        const input=compose(Readable.from(compressed),createGunzip(),budget);
        try{
          for await(const line of jsonLines(input)){
            signal.throwIfAborted();if(!line)continue;
            if(Buffer.byteLength(line)>2*1024*1024)throw Error('archive_record_too_large');
            if(++seen>limits.maxRows)throw Error('archive_row_limit');
            const record=JSON.parse(line);if(record.schemaVersion!==1||record.reading?.site_id!==siteId||typeof record.reading.id!=='string'||typeof record.reading.source_time!=='string'||!Array.isArray(record.mappings))throw Error('archive_scope_mismatch');
            // Send original JSON text to PostgreSQL; JS-parsed numbers never become output.
            batch.push(line);batchBytes+=Buffer.byteLength(line);if(batch.length>=250||batchBytes>=2*1024*1024)await flush();
          }
        }finally{input.destroy();}
      }
      await flush();
      const rowCount=Number((await client.query('SELECT count(*) FROM history_restore_rows')).rows[0].count);
      const execution=randomUUID(),key=`restores/${jobId}/${execution}.jsonl.gz`;
      const output=Readable.from(this.rows(client,signal)).compose(createGzip());
      const stored=await this.artifacts.upload(key,output as AsyncIterable<Buffer>,signal,async stored=>checkpoint?.({...stored,rowCount,snapshotAt,siteId,from,to}),async pending=>checkpoint?.({...pending,checksum:null,bytes:null,etag:null,rowCount,snapshotAt,siteId,from,to}),execution);
      await client.query('COMMIT');
      return {...stored,rowCount,snapshotAt,siteId,from,to};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }
  private async *rows(client:PoolClient,signal:AbortSignal){
    let time:string|null=null,id:string|null=null;
    for(;;){
      signal.throwIfAborted();
      const page:QueryResult<{id:string;at:string;payload:string}>=await client.query('SELECT id,source_time::text AS at,payload::text FROM history_restore_rows WHERE ($1::timestamptz IS NULL OR (source_time,id)>($1::timestamptz,$2::uuid)) ORDER BY source_time,id LIMIT 250',[time,id]);
      if(!page.rows.length)return;
      for(const row of page.rows){yield Buffer.from(row.payload+'\n');time=row.at;id=row.id;}
    }
  }
}

async function* jsonLines(input:AsyncIterable<Buffer>){
 const decoder=new StringDecoder('utf8');let pending='';
 for await(const chunk of input){pending+=decoder.write(chunk);let index:number;while((index=pending.indexOf('\n'))!==-1){yield pending.slice(0,index);pending=pending.slice(index+1);}}
 pending+=decoder.end();if(pending)yield pending;
}
