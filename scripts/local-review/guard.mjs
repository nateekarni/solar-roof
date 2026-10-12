import {execFileSync} from 'node:child_process';
export function assertReviewTarget(connectionString, databaseName) {
 const url=new URL(connectionString);
 if(url.search||url.hash||!['postgresql:','postgres:'].includes(url.protocol)||url.hostname!=='127.0.0.1'||url.port!=='15439'||url.pathname!=='/solar_dashboard_review'||databaseName!=='solar_dashboard_review')throw new Error('Refusing to write outside the dedicated local review database');
}

const targets={review:{project:'solar-dashboard-review',database:'solar_dashboard_review',port:'15439'},financial:{project:'solar-financial-flow-review',database:'solar_financial_flow_review',port:'15449'}};
export const fixtureDisplayName=value=>value.replace(/\[(?:test|demo)(?:[^\]]*)\]\s*/gi,'').trim();
export function roleDisplayName(role){const names={admin:'ผู้ดูแลระบบ Solar Roof',owner:'ผู้บริหาร Solar Roof',operator:'เจ้าหน้าที่ระบบ Solar Roof',accountant:'เจ้าหน้าที่บัญชี Solar Roof',customer_user:'ผู้ประสานงานลูกค้า Solar Roof',school_user:'ผู้ประสานงานสถานศึกษา Solar Roof'};if(!names[role])throw Error('Unknown fixture role');return names[role];}
const localEndpoint=value=>typeof value==='string'&&(/^(npipe:\/\/\/\/\.\/pipe\/|unix:\/\/\/)/.test(value));
export function assertLocalDockerEvidence({endpoint,container},scope,env=process.env){
 const target=targets[scope];
 if(!target||!['development','test'].includes(env.NODE_ENV)||!localEndpoint(endpoint)||(env.DOCKER_HOST&&!localEndpoint(env.DOCKER_HOST)))throw Error('Seed requires a local Docker daemon and development/test environment');
 const labels=container?.Config?.Labels,ports=container?.NetworkSettings?.Ports?.['5432/tcp'];
 if(!container?.State?.Running||labels?.['com.docker.compose.project']!==target.project||labels?.['com.docker.compose.service']!=='postgres'||!container.Config.Env?.includes(`POSTGRES_DB=${target.database}`)||!ports?.length||ports.some(p=>p.HostIp!=='127.0.0.1'||p.HostPort!==target.port))throw Error('Seed requires the owned running loopback Docker PostgreSQL container');
}
export function assertLocalDockerTarget(scope,env=process.env){
 const target=targets[scope];if(!target)throw Error('Unknown local seed scope');
 const run=args=>execFileSync('docker',args,{encoding:'utf8',timeout:10000,windowsHide:true}).trim();
 const context=JSON.parse(run(['context','inspect']))[0];
 const endpoint=env.DOCKER_CONTEXT?context?.Endpoints?.docker?.Host:(env.DOCKER_HOST||context?.Endpoints?.docker?.Host);
 // Validate the daemon before issuing any container operation.
 if(!['development','test'].includes(env.NODE_ENV)||!localEndpoint(endpoint))throw Error('Seed requires a local Docker daemon and development/test environment');
 const ids=run(['ps','--filter',`label=com.docker.compose.project=${target.project}`,'--filter','label=com.docker.compose.service=postgres','--format','{{.ID}}']).split(/\r?\n/).filter(Boolean);
 if(ids.length!==1)throw Error('Exactly one owned local Docker PostgreSQL container required');
 assertLocalDockerEvidence({endpoint,container:JSON.parse(run(['inspect',ids[0]]))[0]},scope,env);
}
export function assertLocalSeedTarget(connectionString,env=process.env){
 const url=new URL(connectionString);
 const scope=Object.keys(targets).find(key=>url.pathname===`/${targets[key].database}`&&url.port===targets[key].port);
 if(!scope||url.hostname!=='127.0.0.1'||!['postgres:','postgresql:'].includes(url.protocol)||url.search||url.hash||!['development','test'].includes(env.NODE_ENV))throw Error('Seed requires the dedicated local Docker review database');
 assertLocalDockerTarget(scope,env);
}
export function assertLocalDockerDaemon(env=process.env){
 if(!['development','test'].includes(env.NODE_ENV))throw Error('Seed requires development/test environment');
 const [context]=JSON.parse(execFileSync('docker',['context','inspect'],{encoding:'utf8',timeout:10000,windowsHide:true}));
 const endpoint=env.DOCKER_CONTEXT?context?.Endpoints?.docker?.Host:(env.DOCKER_HOST||context?.Endpoints?.docker?.Host);
 if(!localEndpoint(endpoint)||(env.DOCKER_HOST&&!localEndpoint(env.DOCKER_HOST)))throw Error('Seed requires a local Docker daemon');
}
