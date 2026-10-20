import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const user=randomUUID(),customer=randomUUID(),site=randomUUID(),invoice=randomUUID(),email=`u1-browser-${user}@example.test`,password='U1-browser-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await launchFixtureBrowser();
try {
 await db.query("INSERT INTO customers(id,name,code,region) VALUES($1::uuid,'U1 Browser Customer',$1::text,'fixture')",[customer]);
 await db.query("INSERT INTO sites(id,customer_id,name,capacity_mwp) VALUES($1,$2,'U1 Browser Site',0.1)",[site,customer]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash,customer_id,created_at) VALUES($1,$2,'U1 Browser','owner','active',$3,$4,'2026-09-30T20:30:00Z')",[user,email,hash,customer]);
 await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) SELECT gen_random_uuid(),$1,date '2026-09-01'-n*interval '1 month',date '2026-09-30'-n*interval '1 month',now(),'approved','complete',100,110,10,1,10 FROM generate_series(1,26) n",[site]);
 const oldest=(await db.query('SELECT id FROM billing_cycles WHERE site_id=$1 ORDER BY period_end ASC LIMIT 1',[site])).rows[0].id;
 await db.query("INSERT INTO documents(id,site_id,billing_cycle_id,document_type,document_number,status,amount,issue_date,file_key) VALUES($1,$2,$3,'invoice','U1-OLDER-INV','issued',10,'2020-01-01','legacy/metadata-only.pdf')",[invoice,site,oldest]);
 await db.query("INSERT INTO documents(id,site_id,document_type,document_number,status,amount,issue_date) SELECT gen_random_uuid(),$1,'invoice',gen_random_uuid()::text,'draft',10,'2026-09-30' FROM generate_series(1,30)",[site]);
 await db.query(`INSERT INTO employee_domain_grants(user_id,domain,overrides,scope_mode,site_ids) VALUES($1,'business','{"business.billing.view":true,"business.billing.edit":true,"business.documents.view":true}','selected',$2)`,[user,[site]]);
 await db.query('INSERT INTO site_account_assignments(id,user_id,site_id) VALUES($1,$2,$3)',[randomUUID(),user,site]);
 const login=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const tokens=await login.json();
 await db.query("UPDATE audit_events SET occurred_at='2026-09-30T20:30:00Z' WHERE actor_id=$1 AND action='user.login'",[user]);
 if(!process.env.U1_TIMEOUT_ONLY&&!process.env.U1_FIX_ONLY)for(const timezoneId of ['UTC','Asia/Bangkok']) {
  const context=await browser.newContext({timezoneId});await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  if(!process.env.U1_PAYMENT_ONLY)for(const role of ['owner','accountant']) {
   await db.query('UPDATE users SET role=$1 WHERE id=$2',[role,user]);
   for(const width of [1440,390]) {
    const business=['owner','customer_user'].includes(role),mobileMode=business&&width===390;
    await page.setViewportSize({width,height:900});await page.goto(web+'/billing?search=U1%20Browser');
    await page.getByRole('searchbox').fill('U1 Browser');
    await page.getByRole('status').filter({hasText:/^25 / }).waitFor();
    await page.waitForLoadState('networkidle');
    if(role==='operator')assert.equal(await page.getByText('ชำระเงินและแนบสลิป',{exact:true}).filter({visible:true}).count(),0,'Operator cannot submit evidence');
    const unavailablePeriod=page.getByText('2026-08',{exact:true});
    if(mobileMode){
      const unavailableCard=unavailablePeriod.locator('xpath=ancestor::*[@data-slot="card"]');
      assert.equal(await unavailableCard.getByRole('button',{name:/^(ดูใบวางบิล|View Invoice)/}).isDisabled(),true);
    }else{
      const unavailableRow=page.getByRole('row').filter({has:unavailablePeriod});
      await unavailableRow.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).click();
      assert.equal(await page.getByRole('menuitem',{name:/^(ดูใบวางบิล|View Invoice)/}).getAttribute('aria-disabled'),'true');
      await page.keyboard.press('Escape');
      await page.getByRole('menu').waitFor({state:'hidden'});
    }
    const nextPage=page.getByRole('button',{name:'Next operation page',exact:true});
    assert.equal(await nextPage.isDisabled(),false,'The 26-row fixture exposes a second page');
    const nextResponse=page.waitForResponse(response=>response.url().startsWith(web+'/v1/operations/billing?')&&new URL(response.url()).searchParams.has('cursor'));
    await nextPage.click();assert.equal((await nextResponse).status(),200);await page.getByRole('status').filter({hasText:/^1 / }).waitFor();
    const page2=page.url();await page.setViewportSize({width:width===390?1440:390,height:900});assert.equal(page.url(),page2,'Resize preserves server cursor');
    const menuMode=width===390||!business;
    if(menuMode) await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).click();
    const invoiceAction=menuMode?page.getByRole('menuitem',{name:/^(ดูใบวางบิล|View Invoice)$/}):page.getByRole('button',{name:/^(ดูใบวางบิล|View Invoice)$/});
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
  await db.query("UPDATE users SET role='customer_user' WHERE id=$1",[user]);
  for(const width of [390,1440]) {
   await page.setViewportSize({width,height:900});await page.goto(web+'/billing');
   await page.waitForLoadState('networkidle');
   await page.getByRole('searchbox').fill('U1-OLDER-INV');
   await page.getByRole('searchbox').press('Enter');
   await page.getByText('U1-OLDER-INV').filter({visible:true}).first().waitFor();
   const actionMenu=page.getByRole('button',{name:/การจัดการเอกสาร: U1-OLDER-INV|Document actions: U1-OLDER-INV|เมนูการดำเนินการ|Open actions menu/}).filter({visible:true});
   if(await actionMenu.count()>0){
    await actionMenu.first().click();
    await page.getByRole('menuitem',{name:/ต้นฉบับ PDF|Original PDF|ดูใบวางบิล|View Invoice/}).first().click();
   }else{
    const olderRow=page.getByText('U1-OLDER-INV').filter({visible:true}).first().locator('xpath=ancestor::*[@data-slot="card" or self::tr]');
    await olderRow.getByRole('button',{name:/^(ดูใบวางบิล|View Invoice)/}).filter({visible:true}).first().click();
   }
   await page.getByRole('dialog').getByRole('alert').waitFor();
   assert.equal(await page.getByRole('dialog').locator('iframe').count(),0,'Assigned customer sees truthful metadata-only evidence');
   await page.keyboard.press('Escape');
  }
  await db.query("UPDATE users SET role='accountant' WHERE id=$1",[user]);
  await page.setViewportSize({width:390,height:900});await page.goto(web+'/billing?search=U1%20Browser&status=approved');
  await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).first().click();await page.getByRole('menuitem',{name:'ชำระเงินและแนบสลิป',exact:true}).click();
  await page.locator('#slip-upload').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=','base64'),Buffer.from(randomUUID())])});
  await page.getByRole('img',{name:'ตัวอย่างหลักฐาน',exact:true}).waitFor();
  let paymentRequests=0;page.on('request',request=>{if(request.method()==='POST'&&request.url().endsWith('/pay'))paymentRequests++;});
  const paid=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().endsWith('/pay'));
  await page.getByRole('dialog').locator('form').evaluate(form=>{form.requestSubmit();form.requestSubmit();});
  const paymentResponse=await paid;assert.equal(paymentRequests,1,'Synchronous double submit must send one POST');assert.equal(paymentResponse.status(),409,await paymentResponse.text());
  await page.getByRole('dialog').getByRole('alert').filter({hasText:/เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน|ข้อมูลถูกเปลี่ยนแล้ว/}).waitFor();
  assert.equal(paymentRequests,1,'Two synchronous submit events send exactly one attempted evidence mutation');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM payments WHERE billing_cycle_id IN (SELECT id FROM billing_cycles WHERE site_id=$1)',[site])).rows[0].count,0,'Legacy cycles without a frozen financial policy reject payment without writing a row');
  await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  // The database changes scope after the displayed action: server denies the real POST.
  await page.goto(web+'/billing?search=U1%20Browser&status=approved');await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).first().click();await page.getByRole('menuitem',{name:'ชำระเงินและแนบสลิป',exact:true}).click();
  await page.locator('#slip-upload').setInputFiles({name:'evidence.png',mimeType:'image/png',buffer:Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jxioAAAAASUVORK5CYII=','base64'),Buffer.from(randomUUID())])});
  await page.getByRole('img',{name:'ตัวอย่างหลักฐาน',exact:true}).waitFor();await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);
  const denied=page.waitForResponse(r=>r.url().endsWith('/pay')),capRefresh=page.waitForResponse(r=>r.url().endsWith('/v1/auth/capabilities'));
  await page.getByRole('button',{name:'ยืนยันการชำระเงิน',exact:true}).click();assert.equal((await denied).status(),403);assert.equal((await (await capRefresh).json()).operationsActions.includes('submit_payment'),false);
  const deniedDialog=page.getByRole('dialog');
  await deniedDialog.getByRole('alert').filter({hasText:/เกิดข้อผิดพลาดในการส่งหลักฐานการชำระเงิน|สิทธิ์ของคุณเปลี่ยนแล้ว/}).waitFor();
  await deniedDialog.locator('button[type="submit"]:disabled').waitFor();
  assert.equal(await deniedDialog.getByRole('button',{name:'ยืนยันการชำระเงิน',exact:true}).isDisabled(),true,'Refreshed empty capabilities disable payment submission');
  await page.getByRole('button',{name:'ยกเลิก',exact:true}).click();await deniedDialog.waitFor({state:'hidden'});

  assert.equal(await page.getByRole('button',{name:'ชำระเงินและแนบสลิป',exact:true}).count(),0);
  await db.query("UPDATE users SET role='accountant' WHERE id=$1",[user]);
  const expectedDeniedErrors=errors.filter(message=>message.includes('403 (Forbidden)'));assert.ok(expectedDeniedErrors.length>=1,'The deliberate denied HTTP request is reported by Chromium');
  assert.deepEqual(errors.filter(message=>!message.includes('403 (Forbidden)')&&!message.includes('409 (Conflict)')),[],timezoneId);errors.length=0;
  await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);

  assert.deepEqual(errors,[],`${timezoneId}: console and page errors must be empty`);await context.close();
 }
 if(!process.env.U1_TIMEOUT_ONLY) {
  await db.query("UPDATE users SET role='accountant',preferred_language='en' WHERE id=$1",[user]);
  const context=await browser.newContext({viewport:{width:1440,height:900}});await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'locale',value:'en',domain:'localhost',path:'/'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(web+'/billing?search=U1%20Browser');await page.getByRole('status').filter({hasText:/^25 / }).waitFor();
  // The table is server-rendered before its sort handlers hydrate. Waiting for
  // the initial network to settle prevents a pre-hydration click from vanishing.
  await page.waitForLoadState('networkidle');
  const row=page.getByRole('row').filter({has:page.getByText('2025-08',{exact:true})});await row.waitFor();
  await row.evaluate(element=>{window.__u1PersistedRow=element;});
  await page.getByRole('button',{name:'Billing period',exact:true}).click();
  await page.waitForURL(url=>url.searchParams.get('sort')==='period'&&url.searchParams.get('direction')==='asc');
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
 console.log('PASS U1: actual ID HTTP preview beyond first page, truthful metadata-only reason/no print or download, business manager and granted staff, UTC/Bangkok, resize and history');
} finally {
 // Issued originals and their fixture dependencies remain until owned isolated-stack teardown.
 // The disposable CI database is removed by scripts/ci/isolated-stack.sh; immutability stays enforced.
 await browser.close();await db.end();
}
