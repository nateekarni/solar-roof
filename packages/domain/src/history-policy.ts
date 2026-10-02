export interface RetentionProof {
  enabled:boolean; olderThan90Days:boolean; allRowsArchived:boolean;
  allTenantsCovered:boolean; checksumsVerified:boolean; summaryComplete:boolean;
  financialEvidencePreserved:boolean; mappingsPreserved:boolean; hold:boolean;
  restoreVerified:boolean; policyApproved:boolean;
}

/** Missing evidence is a blocker. This decision alone never executes deletion. */
export function retentionDecision(proof:Partial<Record<keyof RetentionProof,unknown>>):{eligible:boolean;blockers:string[]} {
  const required:Exclude<keyof RetentionProof,'hold'>[]=['enabled','olderThan90Days','allRowsArchived','allTenantsCovered','checksumsVerified','summaryComplete','financialEvidencePreserved','mappingsPreserved','restoreVerified','policyApproved'];
  const blockers:string[]=required.filter(key=>proof[key]!==true);
  if(proof.hold!==false)blockers.push('hold');
  return {eligible:blockers.length===0,blockers};
}

export function validateArchiveWindow(from:unknown,to:unknown):{from:string;to:string} {
  const valid=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!valid(from)||!valid(to)||from>=to)throw Error('invalid_archive_window');
  return {from,to};
}

export interface RestoreLimits {maxDays:number;maxRows:number;maxManifests:number;maxCompressedBytes:number;maxUncompressedBytes:number;timeoutMs:number}
export function restoreLimits(env:Record<string,string|undefined>=process.env):RestoreLimits {
 const integer=(key:string,fallback:number,max:number)=>{const raw=env[key];if(raw===undefined)return fallback;if(!/^[1-9]\d*$/.test(raw)||!Number.isSafeInteger(Number(raw))||Number(raw)>max)throw Error('invalid_restore_limit:'+key);return Number(raw);};
 return {maxDays:integer('HISTORY_RESTORE_MAX_DAYS',31,366),maxRows:integer('HISTORY_RESTORE_MAX_ROWS',1000000,10000000),maxManifests:integer('HISTORY_RESTORE_MAX_MANIFESTS',1000,10000),maxCompressedBytes:integer('HISTORY_RESTORE_MAX_COMPRESSED_BYTES',512*1024*1024,2*1024*1024*1024),maxUncompressedBytes:integer('HISTORY_RESTORE_MAX_UNCOMPRESSED_BYTES',2*1024*1024*1024,8*1024*1024*1024),timeoutMs:integer('HISTORY_RESTORE_TIMEOUT_MS',600000,3600000)};
}
export function validateRestoreWindow(from:unknown,to:unknown,limits:RestoreLimits=restoreLimits()):{from:string;to:string}{
 const range=validateArchiveWindow(from,to);if(Date.parse(range.to)-Date.parse(range.from)>limits.maxDays*86400000)throw Error('restore_window_limit');return range;
}
