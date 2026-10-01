export type JobStatus = 'queued'|'running'|'ready'|'failed'|'cancelled';
export interface JobRecord {
 id:string; kind:'report'|'archive'|'restore'; status:JobStatus; progress:number|null;
 rowCount:number|null; snapshotAt:string|null; createdBy:string|null; attempt:number;
 errorCode:string|null; objectKey:string|null;
}
