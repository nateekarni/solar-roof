import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';

export interface ReleaseIdentity {revision:string;configurationFingerprint:string;images:Record<string,string>}
export interface PlatformReadiness {monitoringReady:boolean;financialReady:boolean;retentionReady:boolean;recoveryVerified:boolean;blockers:string[]}
const imageNames=['api','web','worker','postgres','mqtt','certbot'];
const isRecord=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const numberIn=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
const timestamp=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)?Date.parse(value):NaN;

/** Deployment identity is calculated from the current configuration, not a caller-supplied hash. */
export function configurationFingerprint(env:NodeJS.ProcessEnv):string {
  const keys=['WEB_URL','API_PORT','DATABASE_URL','MQTT_URL','MQTT_USERNAME','MQTT_PASSWORD','STORAGE_ENDPOINT','STORAGE_BUCKET','STORAGE_REGION','STORAGE_ACCESS_KEY','STORAGE_SECRET_KEY','JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','TRUSTED_PROXY_CIDRS','FINANCIAL_WRITES_ENABLED','ENERGY_READ_MODEL_ENABLED','ENERGY_SUMMARY_WORKER_ENABLED','REPORT_WORKER_ENABLED','ARCHIVE_WORKER_ENABLED','HISTORY_RESTORE_ENABLED','RAW_RETENTION_ENABLED','ARCHIVE_STORAGE_ENDPOINT','ARCHIVE_STORAGE_BUCKET','ARCHIVE_STORAGE_REGION','ARCHIVE_STORAGE_ACCESS_KEY','ARCHIVE_STORAGE_SECRET_KEY','API_READ_POOL_MAX','INGEST_POOL_MAX'];
  // Include deployment policy families so new restore/backup limits cannot silently reuse old evidence.
  const policyKeys=Object.keys(env).filter(key=>/^(PGBACKREST_|BACKUP_|HISTORY_|TELEMETRY_ARCHIVE_|MQTT_|INGEST_|API_(?:EDGE_|READ_)|PLATFORM_(?:WAL_|BACKUP_|DISK_|MONITORING_|DEPENDENCY_))/.test(key));
  return createHash('sha256').update(JSON.stringify([...new Set([...keys,...policyKeys])].sort().map(key=>[key,env[key]??null]))).digest('hex');
}

export function evaluateReleaseEvidence(value:unknown,expected:ReleaseIdentity,now=Date.now()):PlatformReadiness {
  const blocked=(reason:string):PlatformReadiness=>({monitoringReady:false,financialReady:false,retentionReady:false,recoveryVerified:false,blockers:[reason,'financial_workflow_unverified']});
  if(!isRecord(value)||value.version!==1)return blocked('evidence_missing_or_invalid');
  if(!/^[a-f0-9]{40}$/.test(expected.revision)||!/^[a-f0-9]{64}$/.test(expected.configurationFingerprint)||value.revision!==expected.revision||value.configurationFingerprint!==expected.configurationFingerprint)return blocked('release_identity_mismatch');
  if(!isRecord(value.images)||!imageNames.every(key=>/^sha256:[a-f0-9]{64}$/.test(expected.images[key]??'')&&value.images[key]===expected.images[key]))return blocked('image_identity_mismatch');
  const verified=timestamp(value.verifiedAt),expires=timestamp(value.expiresAt);
  if(!Number.isFinite(verified)||!Number.isFinite(expires)||verified>now||expires<=now||expires<=verified||expires-verified>86400000)return blocked('evidence_expired_or_invalid');
  if(!isRecord(value.checks)||!isRecord(value.measurements))return blocked('evidence_missing_or_invalid');
  const checks=value.checks,measure=value.measurements,blockers:string[]=[];
  const has=(key:string)=>checks[key]===true;
  const monitoringReady=['security','ingestion','proxy','gatewayReplay'].every(has);
  if(!monitoringReady)blockers.push('monitoring_checks_incomplete');
  const recoveryVerified=value.profile==='target'&&['recovery','documents','configuration','roles','rawIntegrity'].every(has)&&numberIn(measure.rtoSeconds,0,14400)&&numberIn(measure.rpoSeconds,0,900);
  if(!recoveryVerified)blockers.push('target_recovery_unverified');
  const envelope=value.restoreEnvelope;
  const envelopeVerified=isRecord(envelope)&&Number.isSafeInteger(envelope.maxSites)&&envelope.maxSites>0&&Number.isSafeInteger(envelope.maxDays)&&envelope.maxDays>0&&Number.isSafeInteger(envelope.maxRows)&&envelope.maxRows>0&&Number.isSafeInteger(envelope.verifiedRows)&&envelope.verifiedRows>=envelope.maxRows;
  const retentionEvidenceComplete=recoveryVerified&&['archive','archiveCoverage','summaryCoverage','financialEvidence','retentionApproval'].every(has)&&envelopeVerified&&numberIn(measure.restoreSeconds,0,3600);
  if(!retentionEvidenceComplete)blockers.push('retention_evidence_incomplete');
  // D1 verifies object generations, not that every late/corrected raw identity is preserved.
  const retentionReady=false;
  blockers.push('raw_identity_preservation_unverified');
  // F1 remains the authority. An evidence document or environment flag cannot authorize F2.
  blockers.push('financial_workflow_unverified');
  return {monitoringReady,financialReady:false,retentionReady,recoveryVerified,blockers};
}

export async function readEvidenceFile(path:string|undefined):Promise<unknown>{
  if(!path)return null;
  try{if((await stat(path)).size>65536)return null;const text=await readFile(path,'utf8');if(Buffer.byteLength(text)>65536)return null;return JSON.parse(text);}catch{return null;}
}
export function deploymentFingerprint(env:NodeJS.ProcessEnv,postgres:string,worker:string):string{
  return createHash('sha256').update(JSON.stringify({api:configurationFingerprint(env),postgres,worker})).digest('hex');
}
export class PlatformReadinessService {
  constructor(private readonly env:NodeJS.ProcessEnv=process.env){}
  async identity():Promise<ReleaseIdentity>{
    let images:Record<string,string>={};try{const parsed=JSON.parse(this.env.PLATFORM_IMAGE_DIGESTS_JSON??'{}');if(isRecord(parsed))images=parsed;}catch{/* fail closed */}
      if(!/^[a-f0-9]{40}$/.test(this.env.PLATFORM_RELEASE_REVISION??'')||!imageNames.every(key=>/^sha256:[a-f0-9]{64}$/.test(images[key]??'')))throw Error('release_identity_unavailable');
      const backup=await readEvidenceFile(this.env.PLATFORM_BACKUP_STATUS_FILE??'/var/lib/solar-backup/status.json');
      if(!isRecord(backup)||backup.configurationFingerprintVersion!==1||!numberIn(Date.now()/1000-backup.observedAt,0,180)||!/^[a-f0-9]{64}$/.test(backup.configurationFingerprint??''))throw Error('backup_identity_unavailable');
      const identityUrl=this.env.PLATFORM_WORKER_IDENTITY_URL??'http://worker:3002/health/release-identity';
      const target=new URL(identityUrl);
      const localFixture=this.env.READINESS_DATABASE_URL==='postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness'&&target.hostname==='127.0.0.1';
      if(target.protocol!=='http:'||target.username||target.password||target.search||target.hash||target.pathname!=='/health/release-identity'||!(identityUrl==='http://worker:3002/health/release-identity'||localFixture))throw Error('invalid_worker_identity_endpoint');
      const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(2000)});
      if(!response.ok)throw Error('worker_identity_unavailable');
      const worker=await response.json();
      if(!isRecord(worker)||worker.version!==1||!/^[a-f0-9]{64}$/.test(worker.configurationFingerprint??''))throw Error('worker_identity_unavailable');
      return {revision:this.env.PLATFORM_RELEASE_REVISION!,configurationFingerprint:deploymentFingerprint(this.env,backup.configurationFingerprint,worker.configurationFingerprint),images};
  }
  async evaluate():Promise<PlatformReadiness>{
    try{return evaluateReleaseEvidence(await readEvidenceFile(this.env.PLATFORM_RELEASE_EVIDENCE_FILE),await this.identity());}
    catch{return {monitoringReady:false,financialReady:false,retentionReady:false,recoveryVerified:false,blockers:['dependency_configuration_unverified','financial_workflow_unverified','raw_identity_preservation_unverified']};}
  }
}

export interface MonitoringObservation {diskPercent:number|null;exhaustedJobs:number;summaryStale:boolean;ingestionBacklog:boolean}
export interface MonitoringThresholds {walLagSeconds:number;backupAgeSeconds:number;diskPercent:number;statusAgeSeconds:number}
export const defaultMonitoringThresholds:MonitoringThresholds={walLagSeconds:600,backupAgeSeconds:26*3600,diskPercent:80,statusAgeSeconds:180};
export function monitoringConditions(status:unknown,observation:MonitoringObservation,now=Date.now(),thresholds=defaultMonitoringThresholds):string[]{
  const conditions:string[]=[];
  const age=(value:unknown)=>typeof value==='number'?now/1000-value:(now-timestamp(value))/1000;
  if(!isRecord(status)||!numberIn(age(status.observedAt),0,thresholds.statusAgeSeconds)||!numberIn(age(status.schedulerHeartbeatAt),0,thresholds.statusAgeSeconds))conditions.push('backup_status_unknown');
  else{
    if(!numberIn(age(status.lastSuccessfulBackupAt),0,thresholds.backupAgeSeconds-0.001))conditions.push('backup_overdue');
    if(status.archiveError||(typeof status.lastFailedAt==='number'&&status.lastFailedAt>(status.lastArchivedAt??0)))conditions.push('archive_failed');
    if(!Number.isSafeInteger(status.pendingWalCount)||status.pendingWalCount<0)conditions.push('wal_status_unknown');
    else if(status.pendingWalCount>0){const lag=age(status.oldestPendingWalAt);if(!Number.isFinite(lag)||lag<0)conditions.push('wal_status_unknown');else if(lag>=thresholds.walLagSeconds)conditions.push('wal_lag');}
  }
  if(observation.diskPercent===null)conditions.push('disk_status_unknown');
  else if(observation.diskPercent>=thresholds.diskPercent)conditions.push('disk_high');
  if(observation.exhaustedJobs>0)conditions.push('jobs_exhausted');
  if(observation.summaryStale)conditions.push('summary_stale');
  if(observation.ingestionBacklog)conditions.push('ingestion_backlog');
  return conditions;
}
