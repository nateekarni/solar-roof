import {createHash} from 'node:crypto';

/** Private worker endpoint: emit a digest only, never configuration values. */
export function workerReleaseIdentity(env:NodeJS.ProcessEnv=process.env){
  const keys=Object.keys(env).filter(key=>/^(DATABASE_URL$|REDIS_URL$|STORAGE_|REPORT_|HISTORY_|TELEMETRY_ARCHIVE_|RAW_RETENTION_|ENERGY_)/.test(key)).sort();
  return {version:1,configurationFingerprint:createHash('sha256').update(JSON.stringify(keys.map(key=>[key,env[key]??null]))).digest('hex')};
}
