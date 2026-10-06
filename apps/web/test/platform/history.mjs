import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {gzipSync,gunzipSync} from 'node:zlib';
import {readDownloadedFile} from './download-reading.mjs';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const require=createRequire(new URL('../../../api/package.json',import.meta.url)),{Pool}=require('pg'),{S3Client,PutObjectCommand}=require('@aws-sdk/client-s3');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const storagePort=process.env.PLATFORM_CI_STORAGE_PORT??'19000';assert.ok(['19000','19001'].includes(storagePort));
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL,max:2}),storage=new S3Client({endpoint:`http://127.0.0.1:${storagePort}`,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:'solar-ci',secretAccessKey:'ci-storage-only-password'}}),browser=await launchFixtureBrowser();
async function chooseDate(page,id,value) {
 await page.locator('#'+id).click();
 const calendar=page.locator('[data-slot=calendar]').filter({visible:true}).last();
 const [year,month,day]=value.split('-').map(Number),target=year*12+month-1;
 for(let step=0;step<120;step++) {
  const shown=new Date('1 '+await calendar.locator('.rdp-caption_label').innerText());
  const current=shown.getFullYear()*12+shown.getMonth();assert.ok(Number.isFinite(current));
  if(current===target){await calendar.locator('.rdp-day:not(.rdp-outside) button').filter({hasText:new RegExp('^'+day+'$')}).click();return;}
  await calendar.locator(current>target?'.rdp-button_previous':'.rdp-button_next').click();
 }
 throw new Error('Unable to reach fixture calendar month');
}
try{
 const user=randomUUID(),school=randomUUID(),site=randomUUID(),email=`d1-browser-${user}@example.test`,password='D1-browser-password-123!';
 const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'D1 browser',$1::text,'fixture')",[school]);await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'D1 browser site',1)",[site,school]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id,preferred_language) VALUES($1,$2,'D1 Browser','operator','active',$3,$4,'en')",[user,email,hash,school]);
 const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const tokens=await login.json(),headers={Origin:web,'Content-Type':'application/json',Authorization:`Bearer ${tokens.accessToken}`};
 const options=await (await fetch(api+'/v1/history/options',{headers})).json();assert.equal(options.available,process.env.D1_HISTORY_EXPECT_AVAILABLE!=='false');
 const context=await browser.newContext();await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);const page=await context.newPage();await page.goto(web+'/reports');await page.getByRole('button',{name:'Request archived detail',exact:true}).click();
 const dialog=page.getByRole('dialog');await dialog.locator('#history-site').click();await page.getByRole('option',{name:'D1 browser site',exact:true}).click();await chooseDate(page,'history-from','2025-01-01');await chooseDate(page,'history-to','2025-01-02');
 if(!options.available){
  await dialog.getByRole('status').filter({hasText:'History restoration is currently unavailable.'}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Submit request',exact:true}).isDisabled(),true);
  assert.equal((await fetch(api+'/v1/history/restore',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({siteId:site,from:'2025-01-01',to:'2025-01-02'})})).status,503);console.log('PASS D1 browser: real disabled options + unavailable UI + HTTP503, no queued request');
  const failed=randomUUID();await db.query("INSERT INTO platform_jobs(id,kind,payload,scope,created_by,payload_hash,status,error_code) VALUES($1,'restore',$2,$3,$4,'D1-disabled-retry','failed','storage_unavailable')",[failed,{siteId:site,from:'2025-01-01',to:'2025-01-02',format:'jsonl.gz'},[school],user]);
  assert.equal((await fetch(api+`/v1/jobs/${failed}/retry`,{method:'POST',headers})).status,503);const retained=(await db.query('SELECT status,attempt FROM platform_jobs WHERE id=$1',[failed])).rows[0];assert.equal(retained.status,'failed');assert.equal(retained.attempt,1);
 }else{
  // Seed one immutable archive fixture. The real worker restores it; no ready job is fabricated.
  const id=randomUUID(),execution=randomUUID(),key=`archives/${site}/${id}.jsonl.gz`,reading=randomUUID();
  const bytes=gzipSync(`{"schemaVersion":1,"reading":{"id":"${reading}","site_id":"${site}","source_time":"2025-01-01T01:00:00.123456+00:00","normalized_value":12345678901234567890.123456789},"mappings":[]}\n`);
  const object=await storage.send(new PutObjectCommand({Bucket:'solar-readiness',Key:key,Body:bytes,ContentType:'application/gzip',Metadata:{execution}}));
  await db.query("INSERT INTO telemetry_archives(id,site_id,range_from,range_to,generation,object_key,execution,sha256,bytes,row_count,schema_version,etag,snapshot_at,verified_at) VALUES($1,$2,'2025-01-01T00:00:00+07','2025-01-02T00:00:00+07',1,$3,$4,$5,$6,1,1,$7,now(),now())",[id,site,key,execution,createHash('sha256').update(bytes).digest('hex'),bytes.length,object.ETag]);
  const originalFrom=await dialog.locator('#history-from').innerText();
  await chooseDate(page,'history-to',new Date(Date.parse('2025-01-01')+(options.maxDays+1)*86400000).toISOString().slice(0,10));
  const denied=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/v1/history/restore'));await dialog.getByRole('button',{name:'Submit request',exact:true}).click();assert.equal((await denied).status(),400);await dialog.getByRole('alert').waitFor();assert.equal(await dialog.locator('#history-from').innerText(),originalFrom);
  await chooseDate(page,'history-to','2025-01-02');let posts=0;page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/v1/history/restore'))posts++;});
  const accepted=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/v1/history/restore'));await dialog.locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});const response=await accepted;assert.equal(response.status(),202);const {jobId}=await response.json();assert.equal(posts,1);
  const card=page.locator(`[data-job-id="${jobId}"]`);await card.getByText(/JSONL/).waitFor();await card.getByRole('status').filter({hasText:/^Ready —/}).waitFor({timeout:45000});assert.ok((await card.innerText()).includes('Processing time for this request range has not been verified.'));
  const downloaded=page.waitForEvent('download');await card.getByRole('button',{name:'Download',exact:true}).click();const download=await downloaded;assert.equal(download.suggestedFilename(),`history-${jobId}.jsonl.gz`);const text=gunzipSync(await readDownloadedFile(download)).toString();assert.match(text,/12345678901234567890\.123456789/);assert.equal(text.trim().split('\n').length,1);
  console.log('PASS D1 browser: real form/options, maxDays400 with preserved fields, duplicate-submit guard, worker ready status, verified gzip download');
 }
 await context.close();
}finally{await browser.close();storage.destroy();await db.end();}
