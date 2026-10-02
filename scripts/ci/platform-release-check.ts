import {PlatformReadinessService} from '../../apps/api/src/common/observability/platform-readiness.service.js';
const args=process.argv.slice(2);
const gate=args[3]??'all';
if(args.length===1&&args[0]==='--identity'){
  try{console.log(JSON.stringify(await new PlatformReadinessService().identity(),null,2));}
  catch{console.error('Runtime release identity unavailable');process.exitCode=1;}
}else if(![2,4].includes(args.length)||args[0]!=='--evidence'||args.length===4&&args[2]!=='--gate'||!['monitoring','recovery','retention','financial','all'].includes(gate)){
  console.error('Invalid release check arguments');process.exitCode=1;
}else{
  const result=await new PlatformReadinessService({...process.env,PLATFORM_RELEASE_EVIDENCE_FILE:args[1]}).evaluate();
  console.log(JSON.stringify(result,null,2));
  const passed={monitoring:result.monitoringReady,recovery:result.recoveryVerified,retention:result.retentionReady,financial:result.financialReady,all:result.monitoringReady&&result.recoveryVerified&&result.retentionReady&&result.financialReady}[gate];
  process.exitCode=passed?0:1;
}
