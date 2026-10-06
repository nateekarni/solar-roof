// Regression: accepting a report must never announce ready before the real worker publishes it.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
assert.match(process.env.COMPOSE_PROJECT_NAME??'',/^solar-ci-[a-f0-9-]{36}$/);
const compose=(...args)=>execFileSync('docker',['compose','-f','infra/ci/compose.yml',...args],{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const user=randomUUID(),school=randomUUID(),other=randomUUID(),email=`u2-${user}@example.test`,password='U2-fixture-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await launchFixtureBrowser();
async function completeReportForm(page) {
 await page.locator('#r-type').click();await page.getByRole('option',{name:'Energy Production',exact:true}).click();
 for(const id of ['date-from','date-to']) {await page.locator('#'+id).click();await page.locator('[data-slot=calendar] .rdp-today button').filter({visible:true}).last().click();}
 await page.locator('#r-format').click();await page.getByRole('option',{name:'CSV (.csv)',exact:true}).click();
}
try {
 compose('stop','worker');
 await db.query("INSERT INTO schools(id,name,code,region) SELECT id,'U2 School',id::text,'fixture' FROM unnest($1::uuid[]) id",[[school,other]]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id,preferred_language) VALUES($1,$2,'U2 Actor','operator','active',$3,$4,'en')",[user,email,hash,school]);
 const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);
 const tokens=await login.json(),headers={Authorization:`Bearer ${tokens.accessToken}`,Origin:web,'Content-Type':'application/json'};
 const context=await browser.newContext();await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
 const page=await context.newPage();await page.goto(web+'/reports');
 await page.getByRole('button',{name:/Generate Report|สร้างรายงาน/}).first().click();
 await completeReportForm(page);
 const posted=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/v1/reports'));
 let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/reports'))posts++;});
 await page.getByRole('dialog').locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
 const response=await posted;assert.equal(response.status(),202);const {jobId}=await response.json();
 assert.equal(posts,1,'Duplicate synchronous submits create one HTTP request');
 const successBeforeReady=await page.getByText('Report generated successfully',{exact:true}).count()>0;
 assert.equal(successBeforeReady,false);
 await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Queued —/}).waitFor();
 await page.reload();await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Queued —/}).waitFor();
 const queuedCard=page.locator(`[data-job-id="${jobId}"]`);await queuedCard.getByRole('link').focus();
 await queuedCard.getByRole('status').evaluate(element=>{window.__statusChanges=0;new MutationObserver(()=>window.__statusChanges++).observe(element,{childList:true,characterData:true,subtree:true});});
 await page.waitForResponse(r=>r.url().endsWith('/v1/jobs/'+jobId));
 assert.equal(await queuedCard.getByRole('link').evaluate(element=>element===document.activeElement),true,'Polling preserves focused controls');
 assert.equal(await page.evaluate(()=>window.__statusChanges),0,'Unchanged polls do not announce the status again');
 const record=await (await fetch(api+`/v1/jobs/${jobId}`,{headers})).json();
 assert.equal(record.report.dataKind,'raw');assert.equal(record.report.format,'csv');assert.match(record.report.dateFrom,/^\d{4}-\d{2}-\d{2}$/);assert.equal(record.retryPolicy.canCancel,true);
 await db.query('UPDATE users SET school_id=$1 WHERE id=$2',[other,user]);assert.equal((await fetch(api+`/v1/jobs/${jobId}`,{headers})).status,403);assert.equal((await (await fetch(api+'/v1/jobs',{headers})).json()).items.length,0);
 await db.query('UPDATE users SET school_id=$1 WHERE id=$2',[school,user]);
 // Delay real HTTP responses only; status is produced by the real worker and storage.
 await page.route('**/v1/jobs/*',async route=>{const upstream=await route.fetch();await new Promise(r=>setTimeout(r,500));await route.fulfill({response:upstream});});
 await db.query("UPDATE platform_jobs SET status='running',worker_id='u2-observation',lease_until=now()+interval '30 seconds' WHERE id=$1",[jobId]);
 await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Running —/}).waitFor();
 await context.setOffline(true);await page.getByRole('alert').filter({hasText:/offline|network|fetch/i}).first().waitFor();await context.setOffline(false);
 await db.query("UPDATE platform_jobs SET status='queued',worker_id=NULL,lease_until=NULL WHERE id=$1",[jobId]);compose('start','worker');
 await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Ready —/}).waitFor({timeout:45000});
 const downloaded=page.waitForEvent('download');await page.locator(`[data-job-id="${jobId}"]`).getByRole('button',{name:'Download'}).click();await downloaded;
 compose('stop','worker');const failed=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash,status,error_code) VALUES($1,'report',$2,$3,$4,'u2-fixture','failed','storage_unavailable')",[failed,{type:'energy',format:'csv',dateFrom:'2026-01-01',dateTo:'2026-01-31'},[school],user]);
 await page.reload();const card=page.locator(`[data-job-id="${failed}"]`);await card.getByRole('button',{name:'Retry job'}).click();await card.getByRole('status').filter({hasText:/^Queued —/}).waitFor();
 const retried=await (await fetch(api+`/v1/jobs/${failed}`,{headers})).json();assert.equal(retried.attempt,2);assert.equal(retried.retryPolicy.canRetry,false);assert.ok(Date.parse(retried.retryPolicy.availableAt)>Date.now());
 await card.getByRole('button',{name:'Cancel job'}).click();await card.getByRole('status').filter({hasText:/^Cancelled$/}).waitFor();
 await page.unroute('**/v1/jobs/*');
 // A real accepted request loses its response. Repeating the unchanged form must recover that exact job.
 let lostJob,keys=[];await page.route('**/v1/reports',async route=>{keys.push(route.request().headers()['idempotency-key']);const upstream=await route.fetch();lostJob=(await upstream.json()).jobId;await route.abort('failed');});
 await page.getByRole('button',{name:'Generate Report',exact:true}).click();
 await completeReportForm(page);
 const originalDates=await page.locator('#date-from').innerText();
 await page.getByRole('dialog').locator('form').evaluate(form=>form.requestSubmit());await page.getByRole('dialog').getByRole('alert').waitFor();
 assert.equal(await page.locator('#date-from').innerText(),originalDates,'Network errors preserve the selected date');
 await page.unroute('**/v1/reports');const recovered=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/v1/reports'));
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/reports'))keys.push(r.headers()['idempotency-key']);});
 await page.getByRole('dialog').locator('form').evaluate(form=>form.requestSubmit());assert.equal((await (await recovered).json()).jobId,lostJob);assert.equal(keys[0],keys[1]);
 await page.locator(`[data-job-id="${lostJob}"]`).getByRole('button',{name:'Cancel job'}).click();await page.locator(`[data-job-id="${lostJob}"]`).getByRole('status').filter({hasText:/^Cancelled$/}).waitFor();
 await db.query("UPDATE platform_jobs SET status='failed',attempt=4,payload=$2 WHERE id=$1",[failed,{type:'billing',format:'csv',dateFrom:'2026-01-01',dateTo:'2026-01-31',secret:'never-project'}]);
 const exhausted=await (await fetch(api+`/v1/jobs/${failed}`,{headers})).json();assert.equal(exhausted.retryPolicy.canRetry,false);assert.equal(exhausted.report.dataKind,'operational');assert.equal(JSON.stringify(exhausted).includes('never-project'),false);assert.equal((await fetch(api+`/v1/jobs/${failed}/retry`,{method:'POST',headers})).status,409);
 await db.query("UPDATE platform_jobs SET payload='{}',status='cancelled' WHERE id=$1",[failed]);assert.equal((await (await fetch(api+`/v1/jobs/${failed}`,{headers})).json()).report,null,'Malformed stored metadata is unknown');
 for(const role of ['owner','admin','operator','accountant','school_user']){
  await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto(web+`/reports?job=${jobId}`);if(['owner','school_user'].includes(role)){await page.getByRole('heading',{name:'404',exact:true}).waitFor();assert.equal((await fetch(api+'/v1/jobs',{headers})).status,403);}else{await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Ready —/}).waitFor();}assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'Role destination fits viewport');}
 }
 await db.query("UPDATE users SET role='operator' WHERE id=$1",[user]);
 const notifications=await (await fetch(api+'/v1/operations/notifications',{headers})).json();const notification=notifications.rows.find(row=>row.jobId===jobId);assert.ok(notification,'Real worker notification projects its job');
 await page.goto(web+'/records/notifications/'+notification.id);await page.getByRole('link',{name:'Open job',exact:true}).click();await page.waitForURL(web+`/reports?job=${jobId}`);
 assert.equal(new URL(page.url()).searchParams.get('job'),jobId);await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^Ready —/}).waitFor();
 const {S3Client,DeleteObjectCommand}=createRequire(new URL('../../../api/package.json',import.meta.url))('@aws-sdk/client-s3');
 const storagePort=process.env.PLATFORM_CI_STORAGE_PORT??'19000';assert.ok(['19000','19001'].includes(storagePort));
 const storage=new S3Client({endpoint:`http://127.0.0.1:${storagePort}`,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}});
 const ready=(await db.query('SELECT object_key FROM platform_jobs WHERE id=$1',[jobId])).rows[0];await storage.send(new DeleteObjectCommand({Bucket:'solar-readiness',Key:ready.object_key}));storage.destroy();
 await page.locator(`[data-job-id="${jobId}"]`).getByRole('button',{name:'Download',exact:true}).click();await page.locator(`[data-job-id="${jobId}"]`).getByRole('alert').filter({hasText:'The download is unavailable or expired. Refresh permissions and request a new report.'}).waitFor();
 const legacy=randomUUID();await db.query("INSERT INTO generated_reports(id,created_by,title,report_type,date_from,date_to,format,status,content,content_type) VALUES($1,$2,'U2 legacy scope','energy','2026-01-01','2026-01-02','csv','ready',$3,'text/csv')",[legacy,user,Buffer.from('real legacy bytes')]);
 await page.goto(web+'/reports');await page.getByRole('row').filter({has:page.getByText('U2 legacy scope',{exact:true})}).click();await page.waitForURL('**/records/reports/*');const legacyDenied=page.waitForResponse(response=>response.url().endsWith(`/v1/reports/${legacy}/download`));await page.getByRole('button',{name:'Download report',exact:true}).click();const legacyResponse=await legacyDenied;assert.equal(legacyResponse.status(),403);assert.equal((await legacyResponse.json()).code,'legacy_scope_unknown');await page.getByRole('alert').filter({hasText:/Create a new report to verify current school scope/}).waitFor();
 await page.goto(web+`/reports?job=${jobId}`);
 await db.query("UPDATE users SET preferred_language='th' WHERE id=$1",[user]);await context.addCookies([{name:'locale',value:'th',domain:'localhost',path:'/'}]);await page.reload();await page.locator(`[data-job-id="${jobId}"]`).getByRole('status').filter({hasText:/^พร้อมใช้งาน —/}).waitFor();
 await page.goto(web+'/reports?job=invalid');await page.locator('[data-job-id="invalid"]').getByRole('alert').waitFor();
 await context.close();console.log('PASS U2: durable queued/reload/running/offline/ready/download, server scope, retry and cancellation');
} finally {await browser.close();await db.end();}
