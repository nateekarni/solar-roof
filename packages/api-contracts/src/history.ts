export interface ArchiveManifest {
  id:string;generation:number;siteId:string;from:string;to:string;rows:number;
  sha256:string;schemaVersion:number;objectKey:string;verifiedAt:string|null;
}
export interface HistoryRestoreRequest {siteId:string;from:string;to:string}
export interface HistoryRestoreAccepted {jobId:string;status:'queued'}
