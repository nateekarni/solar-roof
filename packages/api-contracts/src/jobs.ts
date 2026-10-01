export type JobStatus = 'queued'|'running'|'ready'|'failed'|'cancelled';
export interface JobRecord {
 id:string; kind:'report'|'archive'|'restore'; status:JobStatus; progress:number|null;
 rowCount:number|null; snapshotAt:string|null; createdBy:string|null; attempt:number;
 errorCode:string|null; objectKey:string|null;
 report:{type:'energy'|'device_health'|'billing'|'payment'|'audit';format:'csv';dateFrom:string;dateTo:string;dataKind:'raw'|'operational'}|null;
 retryPolicy:{canRetry:boolean;canCancel:boolean;attemptLimit:number;retryDelaySeconds:number|null;availableAt:string|null};
}
