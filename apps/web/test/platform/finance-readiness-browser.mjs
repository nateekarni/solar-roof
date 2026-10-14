import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';

// Real API-backed browser flow: missing refresh, role gates, upload/save,
// checklist transitions or duplicated issuer branding break these assertions.
const fixture=JSON.parse(await readFile(process.env.PRODUCTION_FINANCE_BROWSER_FIXTURE,'utf8'));
assert.match(fixture.schema,/^task9_[0-9a-f]{32}$/);
assert.equal(fixture.apiUrl,'http://127.0.0.1:13059');assert.equal(fixture.webUrl,'http://localhost:13049');
const browser=await openFixtureBrowser(chromium,process.env),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const errors=[];page.on('pageerror',error=>errors.push(error.message));
const phase=process.argv[2]??'setup',web=fixture.webUrl;
async function login(role){
 await context.clearCookies();await page.goto(web+'/login');
 await page.locator('#email').fill(role+'@acceptance.example.test');
 await page.locator('input[type="password"]').fill(fixture.password);
 await page.getByRole('button',{name:/Sign in|เข้าสู่ระบบ/}).click();await page.waitForURL(url=>!url.pathname.includes('login'));
}
try {
 if(phase==='setup'){
  const icon=await page.request.get(web+'/favicon.ico');assert.equal(icon.status(),200,'Browser-requested brand icon must exist');assert.deepEqual(Array.from((await icon.body()).subarray(0,6)),[0,0,1,0,1,0]);
  const fallback=await page.request.get(web+'/v1/public/branding/logo');assert.equal(fallback.status(),200);
  const fallbackHash=createHash('sha256').update(await fallback.body()).digest('hex');
  await login('owner');
  await page.getByRole('button',{name:/^(Notifications|การแจ้งเตือน)/}).click();
  await page.getByRole('link',{name:/Complete finance setup|ตั้งค่าการเงินให้ครบ/}).click();await page.waitForURL('**/settings/company');
  const confirm=page.getByRole('button',{name:/Confirm production readiness|ยืนยันความพร้อมสำหรับการเงินจริง/});await expect(confirm).toBeDisabled();
  const card=page.locator('[aria-label="Production finance readiness"], [aria-label="ความพร้อมสำหรับการเงินจริง"]');
  assert.ok(!/SMTP_HOST|SMTP_PORT|11049|11025|PASSWORD/.test(await card.innerText()));
  await page.getByRole('button',{name:/^(Edit|แก้ไข)$/}).click();
  const fields={companyName:'Siam Solar Operations Co., Ltd.',taxId:'0105558123456',branch:'Head office',address:'88 Wireless Road, Bangkok 10330',phone:'021234567',email:'billing@acceptance.example.test',signatoryName:'Natee Energy',signatoryTitle:'Finance Director'};
  for(const [key,value]of Object.entries(fields))await page.locator('#company-'+key).fill(value);
  // Upload a real branded JPEG with dimensions/bytes distinct from the fallback PNG.
  const {createRequire}=await import('node:module');const sharp=createRequire(new URL('../../../api/package.json',import.meta.url))('sharp');
  const logo=await sharp(await readFile(new URL('../../public/brand/solar-roof-document-stacked.png',import.meta.url))).resize(160,80,{fit:'contain',background:'#ffffff'}).flatten({background:'#ffffff'}).jpeg().toBuffer();
  for(const id of ['company-logoUrl','company-signatureDataUri'])await page.locator('#'+id).setInputFiles({name:id+'.jpg',mimeType:'image/jpeg',buffer:logo});
  await expect(page.locator('img[src^="data:image/jpeg"]')).toHaveCount(2);await expect(confirm).toBeDisabled();
  await page.getByRole('button',{name:/Save Company Profile|บันทึกข้อมูลบริษัท/}).click();await expect(page.locator('#company-logoUrl')).toHaveCount(0);
  await page.getByRole('button',{name:/^(Add Account|เพิ่มบัญชี)$/}).click();
  const dialog=page.getByRole('dialog');await dialog.getByPlaceholder(/045-8-91234-5/).fill('1234567890');await dialog.getByPlaceholder(/Solar Rooftop|บจก. โซลาร์/).fill(fields.companyName);
  await dialog.getByRole('button',{name:/Save|บันทึก/}).click();await expect(dialog).toHaveCount(0);
  await expect(confirm).toBeEnabled();
  const unconfirmed=await page.request.post(web+'/v1/billing-cycles',{headers:{Origin:web},data:{siteId:fixture.siteId,periodStart:'2026-09-01',periodEnd:'2026-09-30'}});assert.equal(unconfirmed.status(),503,'Complete configuration still requires persisted Owner approval');assert.equal((await unconfirmed.json()).code,'FINANCIAL_NOT_READY');
  const beforeApproval=await (await page.request.get(web+'/v1/settings/finance-readiness?'+new URLSearchParams({siteId:fixture.siteId,periodStart:'2026-09-01',periodEnd:'2026-09-30'}))).json();assert.deepEqual(beforeApproval.actions.calculate.missing,['approval.confirmation']);
  await confirm.click();await expect(confirm).toHaveCount(0);
  const uploaded=await page.request.get(web+'/v1/public/branding/logo');assert.equal(uploaded.status(),200);assert.equal(createHash('sha256').update(await uploaded.body()).digest('hex'),createHash('sha256').update(logo).digest('hex'));assert.notEqual(createHash('sha256').update(logo).digest('hex'),fallbackHash);
  const brandImages=page.locator('img[src*="/v1/public/branding/logo"]');assert.ok(await brandImages.count()>0);
  for(const image of await brandImages.all())await expect(image).toHaveJSProperty('naturalWidth',160);
  await expect(page.locator('[data-slot="sidebar-header"] img[src*="/v1/public/branding/logo"]')).toHaveJSProperty('naturalWidth',160);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('header img[src*="/v1/public/branding/logo"]')).toBeVisible();await expect(page.locator('header img[src*="/v1/public/branding/logo"]')).toHaveJSProperty('naturalWidth',160);await page.setViewportSize({width:1440,height:1000});
  const anonymous=await browser.newContext();try{const loginPage=await anonymous.newPage();await loginPage.goto(web+'/login');await expect(loginPage.locator('img[src*="/v1/public/branding/logo"]')).toHaveJSProperty('naturalWidth',160);}finally{await anonymous.close();}
  let release,requested;const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{requested=resolve;});
  await page.route('**/v1/settings/company',async route=>{if(route.request().method()==='GET'){requested();await gate;}await route.continue();});
  try{await page.goto(web+'/settings/company');await started;await expect(page.locator('[role="status"] img[src*="/v1/public/branding/logo"]').first()).toHaveJSProperty('naturalWidth',160);}finally{release();await page.unrouteAll({behavior:'wait'});}
  await expect(page.getByRole('button',{name:/^(Edit|แก้ไข)$/})).toBeEnabled();
  for(const role of ['admin','customer_user']){
   await login(role);const response=await page.request.post(web+'/v1/settings/finance-readiness/confirm',{headers:{Origin:web}});assert.equal(response.status(),403);
   await page.goto(web+'/settings/company');assert.equal(await page.getByRole('button',{name:/Confirm production readiness|ยืนยันความพร้อมสำหรับการเงินจริง/}).count(),0);
  }
 }else{
  assert.equal(phase,'documents');assert.match(process.argv[3],/^[0-9a-f-]{36}$/);await login('owner');await page.goto(web+'/records/billing/'+process.argv[3]);
  const preview=page.locator('#financial-document-invoice');await expect(preview.locator('canvas')).toBeVisible();
  const link=page.locator('li').filter({has:page.locator('#financial-document-invoice')}).getByRole('link',{name:/Download PDF|ดาวน์โหลด PDF/});await expect(link).toBeVisible();
  const bytes=Buffer.from(await page.evaluate(async href=>Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer())),await link.getAttribute('href')));
  const evidence=JSON.parse(await readFile(new URL('../../../../test/artifacts/production-finance.json',import.meta.url),'utf8'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),evidence.invoiceHash);
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});const pdf=await task.promise;
  try{const first=await pdf.getPage(1),text=await first.getTextContent();
   // PDF coordinates have origin at the bottom: the top 70 points contain logo
   // and document identity only. The issuer appears in the body information block.
   assert.ok(!text.items.some(item=>item.transform?.[5]>first.view[3]-70&&item.str.includes('Siam Solar Operations')));
   assert.ok(text.items.some(item=>item.str.includes('Siam Solar Operations')));assert.ok(!text.items.some(item=>/Synthetic|TEST/.test(item.str)));
  }finally{await task.destroy();}
  await page.screenshot({path:fileURLToPath(new URL('../../../../test/artifacts/production-finance-browser.png',import.meta.url)),fullPage:true});
  await page.locator('button[aria-controls="financial-document-receipt"]').first().click();
  const receiptPreview=page.locator('#financial-document-receipt');await expect(receiptPreview.locator('canvas')).toBeVisible();
  const receiptLink=page.locator('li').filter({has:receiptPreview}).getByRole('link',{name:/Download PDF|ดาวน์โหลด PDF/});
  const receiptBytes=Buffer.from(await page.evaluate(async href=>Array.from(new Uint8Array(await (await fetch(href)).arrayBuffer())),await receiptLink.getAttribute('href')));assert.equal(createHash('sha256').update(receiptBytes).digest('hex'),evidence.receiptHash);
  const receiptTask=getDocument({data:new Uint8Array(receiptBytes),useSystemFonts:false});
  try{const receiptPdf=await receiptTask.promise,first=await receiptPdf.getPage(1),text=await first.getTextContent();assert.ok(!text.items.some(item=>item.transform?.[5]>first.view[3]-70&&item.str.includes('Siam Solar Operations')));assert.ok(text.items.some(item=>item.str.includes('4,623.47')));assert.ok(!text.items.some(item=>/Synthetic|TEST/.test(item.str)));}finally{await receiptTask.destroy();}
 }
 assert.deepEqual(errors,[]);await writeFile(new URL(`../../../../test/artifacts/production-finance-browser-${phase}.json`,import.meta.url),JSON.stringify({phase,checks:phase==='setup'?['fallback','owner-notification','disabled-incomplete','upload-preview-save','bank-checklist','calculate-blocked-before-owner-confirmation','confirm','branding-login-sidebar-header','secret-free-blockers','admin-customer-denied']:['invoice-receipt-preview-no-duplicate-issuer','original-download-sha256','receipt-total'],pageErrors:errors},null,2));
 console.log(`PASS production finance browser: ${phase}`);
}finally{await context.close();await browser.close();}
