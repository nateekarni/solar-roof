import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
export async function waitForHttp(url,{attempts=60,interval=2000,expectedStatus=200}={}) {
 for(let i=0;i<attempts;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(5000),redirect:'error'});if(r.status===expectedStatus)return;}catch{} if(i+1<attempts)await sleep(interval);}
 throw new Error('Endpoint not ready within deadline');
}
export async function deploy({base,token,uuid,sha,images,attempts=120,interval=5000,allowLocal=false}) {
 const url=new URL(base); if(url.protocol!=='https:'&&!(allowLocal&&url.hostname==='127.0.0.1'))throw new Error('Coolify requires HTTPS');
 if(url.username||url.password||url.search||url.hash)throw new Error('Invalid Coolify URL');
 if(!token||!uuid||!/^[a-f0-9]{40}$/.test(sha))throw new Error('Missing token, application UUID or commit SHA');
 for(const name of ['api','worker','web','mqtt','certbot'])if(!new RegExp(`^ghcr\\.io/nateekarni/solar-roof/${name}@sha256:[a-f0-9]{64}$`).test(images[name]||''))throw new Error(`Invalid immutable image digest: ${name}`);
 async function api(path,method='GET',body){const r=await fetch(`${base.replace(/\/$/,'')}/api/v1${path}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Coolify ${method} ${path}: HTTP ${r.status}`);try{return await r.json();}catch{throw new Error('Invalid Coolify JSON response');}}
 const path=`/applications/${encodeURIComponent(uuid)}`;
 const application=await api(path);
 if(application.id===undefined)throw new Error('Coolify application identity unavailable');
 const repo=String(application.git_repository||'').replace(/^https:\/\/github.com\//,'').replace(/^git@github.com:/,'').replace(/\.git$/,'').replace(/\/$/,'');
 if(application.uuid!==uuid||repo!=='nateekarni/solar-roof'||application.git_branch!=='main'||application.build_pack!=='dockercompose'||String(application.docker_compose_location).replace(/^\//,'')!=='infra/docker/docker-compose.staging.yml')throw new Error('Coolify target must be the solar-roof main staging compose application');
 const running=await api('/deployments');
 if(!Array.isArray(running))throw new Error('Invalid active deployment response');
 if(running.some(d=>String(d.application_id)===String(application.id)))throw new Error('An active deployment exists; wait for it before changing configuration');
 await api(path,'PATCH',{git_commit_sha:sha,is_auto_deploy_enabled:false,is_preview_deployments_enabled:false});
 await api(path+'/envs/bulk','PATCH',{data:['api','worker','web','mqtt','certbot'].map(name=>({key:`${name.toUpperCase()}_IMAGE`,value:images[name],is_runtime:true,is_buildtime:false,is_preview:false,is_literal:true}))});
 const result=await api('/deploy','POST',{uuid});
 const deployment=result.deployments?.find(d=>d.resource_uuid===uuid)?.deployment_uuid;
 if(!deployment)throw new Error('Coolify did not return a matching deployment UUID');
 for(let i=0;i<attempts;i++){const state=await api(`/deployments/${encodeURIComponent(deployment)}`);if(state.status==='finished'){if(state.commit!==sha)throw new Error('Deployed commit does not match tested commit');return deployment;}if(['failed','cancelled','canceled'].includes(state.status))throw new Error(`Deployment ${state.status}`);if(i+1<attempts)await sleep(interval);}
 throw new Error('Deployment timeout; inspect Coolify before retrying. Deployment was not cancelled.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv[2]==='wait')await waitForHttp(process.argv[3],{expectedStatus:Number(process.argv[4]||200)});else {const e=process.env;const id=await deploy({base:e.COOLIFY_URL,token:e.COOLIFY_API_TOKEN,uuid:e.COOLIFY_APPLICATION_UUID,sha:e.GITHUB_SHA,images:{api:e.API_IMAGE,worker:e.WORKER_IMAGE,web:e.WEB_IMAGE,mqtt:e.MQTT_IMAGE,certbot:e.CERTBOT_IMAGE}});console.log(`Deployment ${id} finished for ${e.GITHUB_SHA}`);}}catch(error){console.error(error.message);process.exitCode=1;}
}
