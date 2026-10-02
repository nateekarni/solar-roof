import {execFileSync} from 'node:child_process';
import {assertTargetDaemon} from './capacity-policy';

export function verifyDockerExecution(profile:string) {
  const run=(...args:string[])=>execFileSync('docker',args,{encoding:'utf8'}).trim();
  const context=process.env.DOCKER_CONTEXT||run('context','show');
  const inspected=JSON.parse(run('context','inspect',context));
  const endpoint=process.env.DOCKER_CONTEXT?inspected[0]?.Endpoints?.docker?.Host:(process.env.DOCKER_HOST||inspected[0]?.Endpoints?.docker?.Host);
  const info=JSON.parse(run('info','--format','{{json .}}'));
  const result={context,endpoint,name:info.Name,id:info.ID,cpus:info.NCPU,memoryBytes:info.MemTotal,operatingSystem:info.OperatingSystem};
  if(profile==='target')assertTargetDaemon({...result,approvedHost:process.env.CAPACITY_APPROVED_HOST,approvedDaemonId:process.env.CAPACITY_APPROVED_DAEMON_ID});
  return result;
}
