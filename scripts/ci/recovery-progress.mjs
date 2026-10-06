// Only fixed operation/service names reach progress logs. Never print arguments,
// environment assignments, SQL, stdin or captured command output.
const operations=new Set(['up','stop','restart','exec']);
const services=new Set(['postgres','restore-db','restore-negative','api','worker','mqtt','storage','repository-proxy']);
export function withRecoveryProgress(command,run,log=console.log){
 const operation=command.find(value=>operations.has(value))||'compose';
 const service=command.filter(value=>services.has(value)).join(',')||'stack';
 const label=`command=${operation} service=${service}`,start=performance.now();
 log(`[recovery] ${new Date().toISOString()} start ${label}`);
 let status='error';
 try {const result=run();status=result.status??'error';return result;}
 finally {log(`[recovery] ${new Date().toISOString()} end ${label} elapsed=${((performance.now()-start)/1000).toFixed(3)}s status=${status}`);}
}
