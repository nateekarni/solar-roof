import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const user=randomUUID(),school=randomUUID(),site=randomUUID(),invoice=randomUUID(),email=`u1-browser-${user}@example.test`,password='U1-browser-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await launchFixtureBrowser();
try {
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1::uuid,'U1 Browser School',$1::text,'fixture')",[school]);
 await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'U1 Browser Site',0.1)",[site,school]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,school_id,created_at) VALUES($1,$2,'U1 Browser','admin','active',$3,$4,'2026-09-30T20:30:00Z')",[user,email,hash,school]);
 await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) SELECT gen_random_uuid(),$1,date '2026-09-01'-n*interval '1 month',date '2026-09-30'-n*interval '1 month',now(),'approved','complete',100,110,10,1,10 FROM generate_series(1,26) n",[site]);
 const oldest=(await db.query('SELECT id FROM billing_cycles WHERE site_id=$1 ORDER BY period_end ASC LIMIT 1',[site])).rows[0].id;
 await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,amount,issue_date,file_key) VALUES($1,$2,$3,'invoice','U1-OLDER-INV','issued',10,'2020-01-01','legacy/metadata-only.pdf')",[invoice,site,oldest]);
 await db.query("INSERT INTO documents(id,site_id,document_type,document_number,status,amount,issue_date) SELECT gen_random_uuid(),$1,'invoice',gen_random_uuid()::text,'draft',10,'2026-09-30' FROM generate_series(1,30)",[site]);
 const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const tokens=await login.json();
 await db.query("UPDATE audit_events SET occurred_at='2026-09-30T20:30:00Z' WHERE actor_id=$1 AND action='user.login'",[user]);
 if(!process.env.U1_TIMEOUT_ONLY&&!process.env.U1_FIX_ONLY)for(const timezoneId of ['UTC','Asia/Bangkok']) {
  const context=await browser.newContext({timezoneId});await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(!process.env.U1_PAYMENT_ONLY)for(const role of ['owner','admin','operator','accountant','school_user']) {
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
   for(const width of [1440,390]) {
    const business=['owner','school_user'].includes(role),mobileMode=business&&width===390;
    await page.setViewportSize({width,height:900});await page.goto(web+'/billing');
    await page.getByRole('searchbox').fill('U1 Browser');
    await page.getByRole('status').filter({hasText:/^25 / }).waitFor();
    if(role==='operator')assert.equal(await page.getByText('ชำระเงินและแนบสลิป',{exact:true}).filter({visible:true}).count(),0,'Operator cannot submit evidence');
    if(mobileMode){const unavailable=page.getByRole('button',{name:/ดูใบแจ้งหนี้.*ยังไม่มีเอกสาร/}).first();assert.equal(await unavailable.isDisabled(),true);}else{await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).first().click();assert.equal(await page.getByRole('menuitem',{name:/ดูใบแจ้งหนี้.*ยังไม่มีเอกสาร/}).isDisabled(),true);await page.keyboard.press('Escape');}
    await page.getByRole('button',{name:'Next operation page',exact:true}).click();await page.getByRole('status').filter({hasText:/^1 / }).waitFor();
    const page2=page.url();await page.setViewportSize({width:width===390?1440:390,height:900});assert.equal(page.url(),page2,'Resize preserves server cursor');
    const menuMode=width===390||!business;
    if(menuMode) await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).click();
    const invoiceAction=menuMode?page.getByRole('menuitem',{name:'ดูใบแจ้งหนี้',exact:true}):page.getByRole('button',{name:'ดูใบแจ้งหนี้',exact:true});
    const response=page.waitForResponse(r=>r.url()===web+'/v1/operations/documents/'+invoice);
    await invoiceAction.click();assert.equal((await response).status(),200);
    const preview=page.getByRole('dialog');await preview.getByRole('alert').waitFor();
    assert.equal(await preview.getByRole('button',{name:/พิมพ์|Print|ดาวน์โหลด|Download/}).count(),0,'Metadata-only original has no print/download buttons');
    assert.equal(await preview.getByRole('link',{name:/พิมพ์|Print|ดาวน์โหลด|Download/}).count(),0,'Metadata-only original has no print/download links');
    assert.equal(await preview.locator('iframe').count(),0,'Metadata-only original has no fabricated PDF frame');
    await page.keyboard.press('Escape');
    if(menuMode)await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).click();
    const visibleForbiddenActions=await page.getByText(/ตรวจสอบสลิป|ตรวจสลิป|Verify Payment Slip|Verify Payment/).filter({visible:true}).count();assert.equal(visibleForbiddenActions,0,role);
    if(menuMode)await page.keyboard.press('Escape');
    await page.goBack();await page.getByRole('status').filter({hasText:/^25 / }).waitFor();await page.goForward();await page.getByRole('status').filter({hasText:/^1 / }).waitFor();assert.equal(page.url(),page2);
   }
  }
  await db.query("UPDATE users SET role='school_user' WHERE id=$1",[user]);
  await page.setViewportSize({width:390,height:900});await page.goto(web+'/billing');
  await page.getByRole('button',{name:'ชำระเงินและแนบสลิป',exact:true}).first().click();
  await page.locator('#slip-upload').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=','base64')});
  await page.locator('img[alt="Slip Preview"]').waitFor();
  let paymentRequests=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/pay'))paymentRequests++;});
  const paid=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/pay'));
  await page.getByRole('dialog').locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  const paymentResponse=await paid;assert.equal(paymentRequests,1,'Synchronous double submit must send one POST');assert.equal(paymentResponse.status(),201,await paymentResponse.text());
  await page.getByText('ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว อยู่ระหว่างการตรวจสอบโดยเจ้าหน้าที่',{exact:true}).waitFor();
  assert.equal(paymentRequests,1,'Two synchronous submit events send exactly one evidence mutation');
  await page.getByRole('dialog').waitFor({state:'hidden'});
  // The database changes scope after the displayed action: server denies the real POST.
  await page.goto(web+'/billing');await page.getByRole('button',{name:'ชำระเงินและแนบสลิป',exact:true}).first().click();
  await page.locator('#slip-upload').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=','base64')});
  await page.locator('img[alt="Slip Preview"]').waitFor();await db.query('UPDATE users SET school_id=NULL WHERE id=$1',[user]);
  const denied=page.waitForResponse(r=>r.url().endsWith('/pay')),capRefresh=page.waitForResponse(r=>r.url().endsWith('/v1/auth/capabilities'));
  await page.getByRole('button',{name:'ยืนยันการชำระเงิน',exact:true}).click();assert.equal((await denied).status(),403);assert.deepEqual((await (await capRefresh).json()).operationsActions,[]);
  const deniedDialog=page.getByRole('dialog');
  await deniedDialog.getByRole('alert').filter({hasText:'เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน'}).waitFor();
  await deniedDialog.locator('button[type="submit"]:disabled').waitFor();
  assert.equal(await deniedDialog.getByRole('button',{name:'ยืนยันการชำระเงิน',exact:true}).isDisabled(),true,'Refreshed empty capabilities disable payment submission');
  await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();await deniedDialog.waitFor({state:'hidden'});
  await page.getByRole('alert').filter({hasText:'สิทธิ์ของคุณเปลี่ยนแล้ว'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'ชำระเงินและแนบสลิป',exact:true}).count(),0);
  await db.query('UPDATE users SET school_id=$1 WHERE id=$2',[school,user]);
  const expectedDeniedErrors=errors.filter(message=>message.includes('403 (Forbidden)'));assert.equal(expectedDeniedErrors.length,1,'One deliberate denied HTTP request is reported by Chromium');
  assert.deepEqual(errors.filter(message=>!message.includes('403 (Forbidden)')),[],timezoneId);errors.length=0;
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});await page.goto(web+'/users');await page.getByText('U1 Browser',{exact:true}).filter({visible:true}).first().waitFor();await page.getByText('1 ตุลาคม 2569 03:30 (Asia/Bangkok)',{exact:true}).filter({visible:true}).first().waitFor();}
  assert.deepEqual(errors,[],`${timezoneId}: console and page errors must be empty`);await context.close();
 }
 if(!process.env.U1_TIMEOUT_ONLY) {
  await db.query("UPDATE users SET role='admin',preferred_language='en' WHERE id=$1",[user]);
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(web+'/billing?search=U1%20Browser');await page.getByRole('status').filter({hasText:/^25 / }).waitFor();
  const row=page.getByRole('row').filter({has:page.getByText('2025-08',{exact:true})});await row.waitFor();
  await row.evaluate(element=>{window.__u1PersistedRow=element;});
  const reordered=page.waitForResponse(response=>response.url().includes('/v1/operations/billing?')&&new URL(response.url()).searchParams.get('direction')==='asc');
  await page.getByRole('button',{name:'Billing Period',exact:true}).click();const sorted=await reordered;assert.equal(sorted.status(),200);
  assert.equal(new URL(sorted.url()).searchParams.get('search'),'U1 Browser','Reorder keeps the owned fixture search');
  assert.equal(new URL(page.url()).searchParams.get('search'),'U1 Browser','Sorting preserves the fixture search in browser history');
  await page.getByRole('row').nth(1).getByText('2024-07',{exact:true}).waitFor();
  assert.equal(await row.evaluate(element=>element===window.__u1PersistedRow),true,'The same persisted billing record retains its DOM row identity after real server reorder');
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});await page.goto(web+'/billing?search=U1%20Browser');await page.getByRole('status').filter({hasText:/^25 / }).waitFor();
   await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).first().click();await page.getByRole('menuitem',{name:'View Billing Details',exact:true}).waitFor();await page.getByRole('menuitem',{name:/View Invoice.*No issued document/}).waitFor();await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);await context.close();console.log('PASS U1 review fix: real server reorder retains persisted DOM row identity; English actions/reasons in desktop/mobile');
 }
 // Delay genuine upstream responses after their real side effects, including an uncertain rotated refresh.
 if(!process.env.U1_FIX_ONLY)for(const stalled of ['refresh','logout']) {
  const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(stalled==='refresh')await context.addCookies([{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
  else await context.addCookies([{name:'refresh_token',value:'invalid',domain:'localhost',path:'/',httpOnly:true}]);
  let refreshCount=0;page.on('request',request=>{if(request.url()===web+'/v1/auth/refresh')refreshCount++;});
  await page.route('**/v1/auth/'+stalled,async route=>{const response=await route.fetch();await new Promise(resolve=>setTimeout(resolve,15000));await route.fulfill({response}).catch(()=>{});});
  await page.goto(web+'/session/refresh?returnTo=%2Fsites');
  await page.getByRole('link',{name:'เข้าสู่ระบบใหม่',exact:true}).waitFor({timeout:12500});assert.equal(refreshCount,1,'Timeout never retries one-use refresh');
  await page.getByRole('link',{name:'เข้าสู่ระบบใหม่',exact:true}).click();await page.waitForURL(web+'/login?sessionExpired=1');assert.equal(refreshCount,1);
  assert.deepEqual(errors,stalled==='logout'?['Failed to load resource: the server responded with a status of 401 (Unauthorized)']:[],stalled+' timeout retains expected invalid-refresh 401 and no unexpected console/page errors');await context.close();
 }
 console.log('PASS U1: actual ID HTTP preview beyond first page, truthful metadata-only reason/no print or download, 5 roles, UTC/Bangkok, resize and history');
} finally {
 // Issued originals and their fixture dependencies remain until owned isolated-stack teardown.
 // The disposable CI database is removed by scripts/ci/isolated-stack.sh; immutability stays enforced.
 await browser.close();await db.end();
}
