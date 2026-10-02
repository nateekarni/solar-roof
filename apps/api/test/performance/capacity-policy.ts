export function profileConfig(name: string, historyDays: number) {
  if (!['smoke', 'target'].includes(name) || historyDays !== 90) throw new Error('Requires smoke|target and 90 history days');
  const target = name === 'target';
  return { name, historyDays, schools: target ? 100 : 2, meters: target ? 1000 : 8, users: target ? 50 : 5,
    historyRows: target ? 129_600_000 : 720, steadyPerMinute: target ? 1000 : 24,
    steadySeconds: 60, burst: target ? 1000 : 8, replayPerMinute: target ? 10000 : 240,
    replaySeconds: target ? 600 : 10, exports: 2 };
}
export type Profile = ReturnType<typeof profileConfig>;
export function assertTargetDaemon(value:{endpoint:string;name:string;id:string;approvedHost?:string;approvedDaemonId?:string}) {
  if(value.endpoint!=='unix:///var/run/docker.sock'||!value.approvedHost||value.name!==value.approvedHost||!value.approvedDaemonId||value.id!==value.approvedDaemonId)
    throw new Error('Target requires approved local Unix Docker daemon identity; remote/forwarded/unknown endpoints are forbidden');
}
export class DuplicateAckBarrier {
  private pending:Set<string>;
  constructor(ids:string[]){this.pending=new Set(ids);}
  acknowledge(id:string,duplicate:boolean){if(duplicate)this.pending.delete(id);}
  get complete(){return this.pending.size===0;}
  get missing(){return this.pending.size;}
}
export function assertTargetHost(input: {profile: string; hostname: string; approvedHost?: string; dedicated: boolean; availableDiskBytes: number; ciEvent?: string}) {
  if (input.profile !== 'target') return;
  if (!input.dedicated || !input.approvedHost || input.hostname !== input.approvedHost || /fowir|staging|pilot|shared/i.test(input.hostname)
    || (input.ciEvent && input.ciEvent !== 'workflow_dispatch') || !Number.isFinite(input.availableDiskBytes) || input.availableDiskBytes < 500 * 1024 ** 3)
    throw new Error('Target requires approved dedicated host, manual execution and >=500 GiB measured free disk');
}
export function summary(values: number[]) {
  const ordered = [...values].sort((a,b)=>a-b);
  const percentile = (p: number) => ordered[Math.max(0, Math.ceil(ordered.length*p)-1)] ?? null;
  return {count: values.length, p50:percentile(.5),p95:percentile(.95),p99:percentile(.99),max:ordered.at(-1)??null};
}
export type Evidence = {profile:Profile;historyRows:number;users:number;steadySent:number;steadySeconds:number;burstSent:number;burstSeconds:number;replaySent:number;replaySeconds:number;exportsReady:number;exportPeakOverlap:boolean;ackedButMissing:number;unexpectedDuplicateRows:number;unacked:number;errors:number;pageSamples:number[];coldAndWarm:boolean;queryPlans:boolean;hardwareProof:boolean};
export function evaluateCapacity(e: Evidence) {
  const reasons: string[] = [];
  if([e.historyRows,e.users,e.steadySent,e.steadySeconds,e.burstSent,e.burstSeconds,e.replaySent,e.replaySeconds,e.exportsReady,e.ackedButMissing,e.unexpectedDuplicateRows,e.unacked,e.errors].some(v=>!Number.isFinite(v)||v<0)) reasons.push('Invalid numeric evidence');
  if(e.profile.name !== 'target') reasons.push('Reduced smoke profile is not target capacity proof');
  if(e.historyRows < 129_600_000 || e.users < 50) reasons.push('Target history/users incomplete');
  if(e.steadySent < 1000 || e.burstSent < 1000 || e.replaySent < 100000 || e.replaySeconds < 600 || e.exportsReady !== 2) reasons.push('Mixed workload incomplete');
  if(!e.exportPeakOverlap)reasons.push('Two running exports during burst/replay were not observed');
  if(e.steadySeconds<60||e.steadySeconds>63||e.replaySeconds>630||e.burstSeconds>60) reasons.push('Generator missed defined cadence (maximum 5% pacing drift; burst within one minute)');
  if(e.ackedButMissing !== 0 || e.unexpectedDuplicateRows !== 0 || e.unacked !== 0 || e.errors !== 0) reasons.push('Delivery or workload errors');
  if(e.pageSamples.length < 400 || e.pageSamples.some(v=>!Number.isFinite(v)||v<0||v>2000)) reasons.push('Every one of 50 users × 4 pages × 2 cache states must finish within 2000ms');
  if(!e.coldAndWarm || !e.queryPlans || !e.hardwareProof) reasons.push('Cache/query-plan/hardware evidence incomplete');
  return {releaseGate:reasons.length?'fail':'pass',reasons};
}
