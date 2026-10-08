import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync} from 'node:crypto';
import {createRequire} from 'node:module';
import {launchFixtureBrowser} from './fixture-browser.mjs';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const api=process.env.READINESS_API_URL,web=process.env.READINESS_WEB_URL;
assert.equal(api,'http://127.0.0.1:13001');assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const user=randomUUID(),email=`financial-browser-${user}@example.test`,password='Financial-browser-password-123!';
const school=randomUUID(),site=randomUUID(),cycle=randomUUID(),payment=randomUUID();
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await launchFixtureBrowser();
try {
 await db.query("INSERT INTO schools(id,name,code,region) VALUES($1,'Financial Browser School',$2,'fixture')",[school,school]);
 await db.query("INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Financial Browser Site',0.1)",[site,school]);
 await db.query("INSERT INTO billing_cycles(id,site_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES($1,$2,'2026-09-01','2026-09-30','2026-09-30T16:59:59Z','pending_verification','complete',100,110,10,12.345,123.45)",[cycle,site]);
 await db.query("INSERT INTO payments(id,billing_cycle_id,amount,status,slip_url,paid_at) VALUES($1,$2,123.45,'pending_verification','/fixture-slip.png','2026-10-01T00:00:00Z')",[payment,cycle]);
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'Financial Browser','owner','active',$3)",[user,email,hash]);
 const response=await fetch(api+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(response.status,200);const tokens=await response.json();
 const context=await browser.newContext({timezoneId:'UTC'});await context.addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]) {
  await page.setViewportSize(viewport);await page.goto(web+'/billing?action=new');
  await page.getByRole('status').filter({hasText: 'ยังไม่สามารถคำนวณยอดเรียกเก็บได้ในขณะนี้'}).first().waitFor();
  assert.equal(await page.getByRole('dialog').count(),0,'Disabled URL action cannot open calculation form');
  assert.equal(await page.getByRole('button',{name:/คำนวณ|Calculate/}).count(),0,'Unavailable calculation is not offered');
  await page.getByText('Financial Browser Site',{exact:true}).filter({visible:true}).first().waitFor();
  if(viewport.width>1000){await page.getByRole('button',{name:/เมนูการดำเนินการ|Open actions menu/}).click();assert.equal(await page.getByRole('menuitem',{name:/ตรวจสอบสลิป|Verify Payment/}).count(),0);await page.getByRole('menuitem',{name:/ดูรายละเอียดรอบบิล|View Billing Details/}).click();}
  else {assert.equal(await page.getByRole('button',{name:/ตรวจสลิป|Verify/}).count(),0);await page.getByRole('button',{name:/รายละเอียดรอบบิล|Billing Details/}).click();}
  await page.waitForURL('**/records/billing/*');await page.getByRole('heading',{level:1}).waitFor();await page.getByText('Financial Browser School',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:/ส่งอีเมลใบแจ้งหนี้|Email Invoice|อนุมัติ|Approve/}).count(),0,'Unavailable send and approval never offered in readable detail');
 }
 await page.goto(web+'/contracts?action=new');await page.getByRole('dialog').waitFor();assert.equal(await page.locator('#terms').inputValue(),'','Contract terms start unspecified');assert.equal(await page.locator('#branch').inputValue(),'','Branch not assumed');assert.equal(await page.locator('#signer').inputValue(),'','Signed authority not inferred from logged-in account');assert.equal(await page.getByRole('spinbutton',{name:/อัตราค่าไฟที่ตกลง|Agreed tariff/}).inputValue(),'','Actual tariff required');
 await db.query("UPDATE users SET role='admin' WHERE id=$1",[user]);await page.goto(web+'/contracts?action=new');await page.getByRole('dialog').waitFor();assert.equal(await page.locator('#terms').inputValue(),'','Admin can author contracts with supplied data');
 await db.query("UPDATE users SET role='operator' WHERE id=$1",[user]);await page.goto(web+'/billing');await page.getByText('Financial Browser Site',{exact:true}).filter({visible:true}).first().waitFor();
 assert.equal(await page.getByRole('button',{name:/ตรวจสลิป|Verify|คำนวณ|Calculate/}).count(),0,'Unauthorized financial actions hidden');
 for(const role of ['operator','accountant','school_user']) {await db.query('UPDATE users SET role=$1,school_id=$2 WHERE id=$3',[role,school,user]);await page.goto(web+'/contracts?action=new');await page.getByRole('heading',{level:1}).waitFor();assert.equal(await page.getByRole('dialog').count(),0,`${role} cannot open contract author form`);assert.equal(await page.getByRole('button',{name:/สร้างสัญญา|Create Contract/}).count(),0); }
 assert.deepEqual(errors,[]);console.log('PASS: financial capabilities disable desktop/mobile and URL calculation action; unauthorized actions hidden');
} finally {await browser.close();await db.query('DELETE FROM audit_events WHERE actor_id=$1',[user]);await db.query('DELETE FROM users WHERE id=$1',[user]);await db.query('DELETE FROM payments WHERE id=$1',[payment]);await db.query('DELETE FROM billing_cycles WHERE id=$1',[cycle]);await db.query('DELETE FROM sites WHERE id=$1',[site]);await db.query('DELETE FROM schools WHERE id=$1',[school]);await db.end();}
