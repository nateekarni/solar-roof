import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn,execFileSync,type ChildProcess} from 'node:child_process';
import {openSync,closeSync} from 'node:fs';
import {writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

// Test-only process ownership and cleanup; never added to production providers.
export async function startAcceptanceApps(databaseUrl:string,password:string,schema:string,siteId:string,retain=false) {
 const root=fileURLToPath(new URL('../../../',import.meta.url));
 for(const port of [13049,13059]){
  const probe=createServer();await new Promise<void>((resolve,reject)=>probe.once('error',reject).listen(port,'127.0.0.1',resolve));await new Promise<void>(resolve=>probe.close(()=>resolve()));
 }
 await mkdir(new URL('../../../test/artifacts/',import.meta.url),{recursive:true});
 const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema},public`);
 const env={...process.env,DATABASE_URL:scoped.toString(),NODE_ENV:'production',API_HOST:'127.0.0.1',API_PORT:'13059',WEB_URL:'http://localhost:13049',API_INTERNAL_URL:'http://127.0.0.1:13059',JWT_ACCESS_SECRET:'acceptance-access-secret-local-only-2026',JWT_REFRESH_SECRET:'acceptance-refresh-secret-local-only-2026',MQTT_ENABLED:'false',MQTT_DEFAULT_BROKER_ENABLED:'false',REPORT_WORKER_ENABLED:'false',HISTORY_API_ENABLED:'false',FINANCIAL_SCHEDULER_ENABLED:'false',TSX_TSCONFIG_PATH:fileURLToPath(new URL('../tsconfig.json',import.meta.url))};
 delete env.LOCAL_FINANCIAL_FIXTURE_MARKER;
 const children:ChildProcess[]=[];
 const launch=(name:string,args:string[],cwd:string)=>{
  const fd=openSync(`${root}/test/artifacts/production-${name}.log`,'w');
  const child=spawn(process.execPath,args,{cwd,env,windowsHide:true,detached:retain,stdio:['ignore',fd,fd]});closeSync(fd);children.push(child);child.unref();return child;
 };
 const stop=async()=>{await Promise.all(children.map(child=>new Promise<void>(resolve=>{
  if(child.exitCode!==null){resolve();return;}child.once('exit',()=>{clearTimeout(timer);resolve();});
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);child.kill();
 })));};
 try {
  launch('api',['--import',new URL('../../../node_modules/tsx/dist/loader.mjs',import.meta.url).href,fileURLToPath(new URL('../src/main.ts',import.meta.url))],fileURLToPath(new URL('../',import.meta.url)));
  const {createRequire}=await import('node:module');const require=createRequire(new URL('../../web/package.json',import.meta.url));
  launch('web',[require.resolve('next/dist/bin/next'),'start','-H','127.0.0.1','-p','13049'],fileURLToPath(new URL('../../web/',import.meta.url)));
  for(const url of ['http://127.0.0.1:13059/health','http://127.0.0.1:13049/login']){
   let ready=false;for(let attempt=0;attempt<90;attempt++){assert.ok(children.every(child=>child.exitCode===null),'Acceptance app exited; inspect owned logs');try{if((await fetch(url)).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}assert.ok(ready,`Acceptance app unavailable: ${url}`);
  }
  const fixture=fileURLToPath(new URL('../../../test/artifacts/production-browser-fixture.json',import.meta.url));
  await writeFile(fixture,JSON.stringify({schema,password,siteId,apiUrl:'http://127.0.0.1:13059',webUrl:'http://localhost:13049'},null,2),{mode:0o600});
  const browser=(phase:string,cycleId='')=>execFileSync(process.execPath,['test/platform/finance-readiness-browser.mjs',phase,cycleId],{cwd:fileURLToPath(new URL('../../web/',import.meta.url)),env:{...env,PRODUCTION_FINANCE_BROWSER_FIXTURE:fixture},stdio:'inherit',timeout:180000});
  return {browser,stop,pids:children.map(child=>child.pid)};
 }catch(error){await stop();throw error;}
}
