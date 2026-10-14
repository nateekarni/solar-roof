import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {openFixtureBrowser} from './browser-transport.mjs';

const fixture=JSON.parse(await readFile(process.env.PRODUCTION_FINANCE_BROWSER_FIXTURE,'utf8'));
assert.match(fixture.schema,/^task9_[0-9a-f]{32}$/);assert.equal(fixture.apiUrl,'http://127.0.0.1:13069');assert.equal(fixture.webUrl,'http://localhost:13079');
const artifacts=new URL(`../../../../test/artifacts/final-fixes-${fixture.schema}/`,import.meta.url);
const phase=process.argv[2];assert.ok(['issuance','settlement'].includes(phase));
const browser=await openFixtureBrowser(chromium,process.env),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
page.setDefaultTimeout(20000);const errors=[],mutations=[],checks=[],pdfHashes={};
page.on('pageerror',error=>errors.push(error.message));
page.on('response',response=>{const req=response.request();if(['POST','PATCH','PUT'].includes(req.method())&&!req.url().includes('/auth/'))mutations.push({path:new URL(req.url()).pathname,method:req.method(),status:response.status()});});
await context.tracing.start({screenshots:true,snapshots:true,sources:false});
const web=fixture.webUrl,uuid=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const effectiveDueDateText=new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(fixture.effectiveDueDate));
async function readable(scope=page.locator('main').first()){
 const text=await scope.innerText();assert.doesNotMatch(text,uuid);assert.doesNotMatch(text,/pending_issue_approval|pending_verification|awaiting_payment/);assert.doesNotMatch(text,/Application error|Unhandled Runtime Error/);return text;
}
async function screenshot(name){await page.screenshot({path:fileURLToPath(new URL(name+'.png',artifacts)),fullPage:true,animations:'disabled'});}
async function originalPdf(kind,name,position){
 const title=kind==='invoice'?'Billing statement':'Receipt',toggle=page.getByRole('button',{name:new RegExp('^'+title+' ·')}).first();await toggle.waitFor();const previewId=await toggle.getAttribute('aria-controls');assert.ok(previewId);
 if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
 await expect(page.locator('#'+previewId+' canvas').first()).toBeVisible();
 const link=page.locator('li').filter({has:page.locator('#'+previewId)}).getByRole('link',{name:'Download PDF',exact:true});const bytes=Buffer.from(await page.evaluate(async href=>Array.from(new Uint8Array(await(await fetch(href)).arrayBuffer())),await link.getAttribute('href')));assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 pdfHashes[kind]=createHash('sha256').update(bytes).digest('hex');
 const {getDocument,OPS}=await import('pdfjs-dist/legacy/build/pdf.mjs');const task=getDocument({data:new Uint8Array(bytes),useSystemFonts:false});
 try{const pdf=await task.promise,first=await pdf.getPage(1),content=await first.getTextContent(),text=content.items.map(item=>item.str).join(' ');assert.match(text,new RegExp(name.replaceAll(' ','\\s+')));assert.match(text,new RegExp(position.replaceAll(' ','\\s+')));assert.doesNotMatch(text,uuid);assert.doesNotMatch(text,/pending_issue_approval|pending_verification/);const operators=await first.getOperatorList();assert.ok(operators.fnArray.filter(op=>[OPS.paintImageXObject,OPS.paintInlineImageXObject].includes(op)).length>=2,'Saved logo and personal signature must be embedded in the original PDF');}finally{await task.destroy();}
 checks.push(kind+'-real-preview-download-actor-position-signature-pdf');
}
async function login(role){await page.goto(web+'/login');await page.locator('#email').fill(role+'@acceptance.example.test');await page.locator('input[type=password]').fill(fixture.password);await page.getByRole('button',{name:/Sign in|เข้าสู่ระบบ/}).click();await page.waitForURL(url=>!url.pathname.includes('login'));await expect(page.locator('main').first()).toBeVisible();}
async function signedAccount(role){
 await page.goto(web+'/settings/account');const sharp=createRequire(new URL('../../../api/package.json',import.meta.url))('sharp');
 const bytes=await sharp({create:{width:200,height:60,channels:4,background:role==='owner'?'#245578':'#783245'}}).png().toBuffer();
 await page.getByLabel('Upload signature',{exact:true}).setInputFiles({name:role+'-signature.png',mimeType:'image/png',buffer:bytes});
 await page.getByRole('status').filter({hasText:'Signature updated'}).waitFor();await expect(page.getByRole('img',{name:'My signature',exact:true})).toBeVisible();await readable();checks.push(role+'-signature-upload-real-ui');
 const identity=await page.request.get(web+'/v1/me');assert.equal(identity.status(),200);const current=await identity.json();assert.equal(current.hasSignature,true);assert.equal(current.companyPosition,role==='owner'?'Workflow Approval Director':'Receipt Reviewer');assert.equal(current.signatureDataUri,undefined);checks.push(role+'-canonical-session-identity');
}
async function ownerEditor(){await page.getByRole('button',{name:'Employee actions: '+fixture.ownerName,exact:true}).first().click();await page.getByRole('menuitem',{name:'Manage permissions',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Manage employee',exact:true});await dialog.waitFor();return dialog;}
async function savePosition(dialog){const response=page.waitForResponse(r=>new URL(r.url()).pathname===`/v1/team/employees/${fixture.ids.owner}/business`&&r.request().method()==='PATCH');await dialog.getByRole('button',{name:'Save permissions',exact:true}).click();const result=await response;assert.equal(result.status(),200,await result.text());await expect(dialog).toHaveCount(0);}
try{
 if(phase==='issuance'){
  await login('owner');assert.ok((await page.title()).length>0);await expect(page.locator('img[src*="/v1/public/branding/logo"]').first()).toHaveJSProperty('complete',true);assert.ok(await page.locator('img[src*="/v1/public/branding/logo"]').first().evaluate(image=>image.naturalWidth>0));checks.push('real-configured-company-logo');
  await page.goto(web+'/settings/users');let dialog=await ownerEditor();await dialog.getByRole('combobox',{name:'Position',exact:true}).click();await page.getByRole('option',{name:'Finance Director',exact:true}).click();await savePosition(dialog);checks.push('existing-position-selected-and-saved');
  dialog=await ownerEditor();await dialog.getByRole('combobox',{name:'Position',exact:true}).click();await page.getByRole('combobox',{name:'Search or type a position…',exact:true}).fill('Workflow Approval Director');await page.getByRole('option',{name:'Create position “Workflow Approval Director”',exact:true}).click();await savePosition(dialog);checks.push('new-position-created-and-assigned-real-ui');await readable();await screenshot('live-staff-position');
  await signedAccount('owner');await screenshot('live-owner-signature');
  await page.goto(web+'/records/billing/'+fixture.cycles[0]);await page.getByRole('button',{name:'Approve and issue',exact:true}).waitFor();
  const before=await page.request.get(web+'/v1/operations/billing/records/'+fixture.cycles[0]);assert.equal(before.status(),200);const beforeRow=(await before.json()).row;assert.ok(!beforeRow.invoiceNumber&&!beforeRow.receiptNumber);await readable();await screenshot('live-before-approval');checks.push('no-official-number-before-approval');
  await page.getByRole('button',{name:'Approve and issue',exact:true}).click();dialog=page.getByRole('dialog',{name:'Confirm approval and issuance',exact:true});await dialog.waitFor();await expect(dialog).toContainText('Customer Contact · customer_user@acceptance.example.test');await expect(dialog.getByRole('button',{name:'Approve and issue',exact:true})).toBeEnabled();const confirmation=await readable(dialog);assert.match(confirmation,new RegExp(fixture.ownerName));assert.match(confirmation,/Workflow Approval Director/);await screenshot('live-single-confirmation');
  await expect(dialog).toContainText(effectiveDueDateText);
  const singleResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/v1/billing-cycles/${fixture.cycles[0]}/approve-issuance`&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();const single=await singleResponse;assert.equal(single.status(),201);const issued=await single.json();assert.equal(issued.status,'issued');assert.ok(issued.documentNumber);assert.equal(issued.label.site,fixture.siteNames[0]);
  const result=page.getByRole('region',{name:'Issuance approval results',exact:true});await expect(result).toContainText(issued.documentNumber);await readable();await originalPdf('invoice',fixture.ownerName,'Workflow Approval Director');await screenshot('live-single-issued');checks.push('single-real-ui-issued-official-number');
  // Actual calculated invoice -> rate correction -> scoped pending list and
  // mobile selection -> reviewed replacement. The current original survives a
  // rejected stale confirmation, including its saved PDF bytes and number.
  const replacementId=fixture.cycles[3],recordUrl=web+'/records/billing/'+replacementId;
  await page.goto(recordUrl);await page.getByRole('button',{name:'Approve and issue',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Confirm approval and issuance',exact:true});
  await expect(dialog).toContainText('Customer Contact · customer_3@acceptance.example.test');
  const calculatedPreview=await(await page.request.get(web+`/v1/billing-cycles/${replacementId}/issuance-preview`)).json();assert.equal(calculatedPreview.dueDate,fixture.effectiveDueDate);assert.equal(Number(calculatedPreview.amount),4623.47);
  await expect(dialog).toContainText(effectiveDueDateText);
  await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();await page.getByText('1 document issued',{exact:true}).waitFor();
  let original=(await(await page.request.get(web+'/v1/operations/billing/records/'+replacementId)).json()).row;
  const originalBytes=await(await page.request.get(web+`/v1/operations/documents/${original.invoiceId}/pdf`)).body(),originalHash=createHash('sha256').update(originalBytes).digest('hex');
  await page.getByRole('button',{name:'Edit this site’s rate',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Correct bill rate',exact:true});await expect(dialog).toContainText('original remains valid');
  await dialog.getByLabel('New rate (THB/kWh)',{exact:true}).fill('5');await dialog.getByLabel('Reason',{exact:true}).fill('Reviewed replacement acceptance');
  await dialog.getByRole('button',{name:'Prepare replacement for approval',exact:true}).click();await expect(dialog).toHaveCount(0);
  const prepared=(await(await page.request.get(web+'/v1/operations/billing/records/'+replacementId)).json()).row;
  assert.equal(prepared.status,'approved');assert.equal(prepared.invoiceNumber,original.invoiceNumber);assert.equal(Number(prepared.amount),4623.47);assert.equal(Number(prepared.pendingReplacement.amount),5350);assert.equal(prepared.billingStatusView,'pending_issue_approval');
  await page.goto(web+'/billing?collectionStatus=paid&status=paid&billingStatusView=pending_issue_approval');
  await expect(page.getByRole('combobox',{name:'Collection status',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Status',exact:true})).toHaveCount(0);
  const select=page.getByRole('checkbox',{name:/Select .*Replacement approval rooftop/}).first();await select.check();
  await page.getByRole('tab',{name:/^All/}).click();assert.ok(!new URL(page.url()).searchParams.has('collectionStatus'));assert.ok(!new URL(page.url()).searchParams.has('status'));
  await expect(select).not.toBeChecked();await page.goBack();await expect(page.getByRole('tab',{name:/Awaiting issuance approval/})).toHaveAttribute('aria-selected','true');
  await page.reload();await expect(select).toBeVisible();await page.goForward();await expect(page.getByRole('tab',{name:/^All/})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:/Awaiting issuance approval/}).click();await page.setViewportSize({width:390,height:844});
  const mobileSelect=page.getByRole('checkbox',{name:/Select .*Replacement approval rooftop/}).last();await expect(mobileSelect).toBeVisible();await mobileSelect.check();await screenshot('live-replacement-mobile-pending');await page.setViewportSize({width:1440,height:1000});
  await page.goto(recordUrl);await page.getByRole('button',{name:'Approve and issue',exact:true}).click();dialog=page.getByRole('dialog',{name:'Confirm approval and issuance',exact:true});
  await expect(dialog).toContainText('Customer Contact · customer_3@acceptance.example.test');await expect(dialog).toContainText('5,350.00');await expect(dialog).toContainText('5,000.00');await expect(dialog).toContainText('350.00');await expect(dialog).not.toContainText('4,623.47');await screenshot('live-replacement-confirmation');
  const changed=await page.request.put(web+'/v1/me/profile',{headers:{Origin:web},data:{displayName:fixture.ownerName+' Changed'}});assert.equal(changed.status(),200);
  await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();await page.getByText('Review facts changed. Open the review again before approval.',{exact:true}).waitFor();
  const failed=(await(await page.request.get(web+'/v1/operations/billing/records/'+replacementId)).json()).row;assert.equal(failed.invoiceId,original.invoiceId);assert.equal(failed.invoiceNumber,original.invoiceNumber);assert.equal(failed.billingStatusView,'pending_issue_approval');
  assert.equal(createHash('sha256').update(await(await page.request.get(web+`/v1/operations/documents/${original.invoiceId}/pdf`)).body()).digest('hex'),originalHash);
  assert.equal((await page.request.put(web+'/v1/me/profile',{headers:{Origin:web},data:{displayName:fixture.ownerName}})).status(),200);
  await page.getByRole('button',{name:'Approve and issue',exact:true}).click();dialog=page.getByRole('dialog',{name:'Confirm approval and issuance',exact:true});await expect(dialog).toContainText('Customer Contact · customer_3@acceptance.example.test');await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();await page.getByText('1 document issued',{exact:true}).waitFor();
  const replaced=(await(await page.request.get(web+'/v1/operations/billing/records/'+replacementId)).json()).row;assert.notEqual(replaced.invoiceNumber,original.invoiceNumber);assert.equal(replaced.pendingReplacement,null);assert.equal(Number(replaced.amount),5350);assert.equal(replaced.dueDate,fixture.effectiveDueDate);await screenshot('live-replacement-issued');checks.push('calculated-preview-recipients-default-date','legacy-tabs-refresh-back-forward-selection-reset','replacement-mobile-selection','stale-approval-keeps-original-number-pdf','replacement-review-proposed-totals-atomic-supersession');
  await page.goto(web+'/billing');await page.getByRole('tab',{name:/Awaiting issuance approval/}).click();await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).waitFor();await page.getByRole('checkbox',{name:'Select all eligible bills on this page',exact:true}).check();await page.getByRole('button',{name:'Approve and issue',exact:true}).click();dialog=page.getByRole('dialog',{name:'Confirm approval and issuance',exact:true});await dialog.waitFor();await readable(dialog);
  const bulkResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/v1/billing-cycles/approve-issuance'&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Approve and issue',exact:true}).click();const bulk=await bulkResponse;assert.equal(bulk.status(),201);const batch=await bulk.json();assert.equal(batch.results.length,2);assert.deepEqual(batch.results.map(row=>row.status).sort(),['failed','issued']);assert.ok(batch.results.find(row=>row.status==='issued').documentNumber);assert.equal(batch.results.find(row=>row.status==='failed').label.site,fixture.siteNames[2]);assert.doesNotMatch(JSON.stringify(batch),uuid);
  const results=page.getByRole('region',{name:'Issuance approval results',exact:true});await expect(results).toContainText('1 document issued');await expect(results).toContainText('1 still awaiting approval');await expect(results).toContainText('Recalculate');await expect(results).toContainText(fixture.siteNames[1]);await expect(results).toContainText(fixture.siteNames[2]);await readable();await screenshot('live-mixed-batch');checks.push('mixed-real-ui-success-corrective-failure-id-free');
 }else{
  await login('accountant');await signedAccount('accountant');await screenshot('live-reviewer-signature');
  await page.goto(web+'/records/billing/'+fixture.cycles[0]);await page.getByRole('button',{name:'Approve',exact:true}).click();const review=page.getByRole('dialog',{name:'Review transfer evidence',exact:true});await review.waitFor();
  const before=await page.request.get(web+'/v1/operations/billing/records/'+fixture.cycles[0]);assert.equal(before.status(),200);assert.ok(!(await before.json()).row.receiptNumber);checks.push('no-receipt-number-before-transfer-approval');
  await review.locator('#verified-amount').fill('107.00');await review.locator('#verified-time').fill('2026-10-15T10:00');await review.locator('#verified-reference').fill('ACCEPTANCE-TRANSFER');await readable();await screenshot('live-payment-review');
  const paymentResponse=page.waitForResponse(r=>new URL(r.url()).pathname===`/v1/billing-cycles/${fixture.cycles[0]}/verify-payment`&&r.request().method()==='PATCH');await review.getByRole('button',{name:'Approve this transfer',exact:true}).click();const response=await paymentResponse;assert.equal(response.status(),200,await response.text());const value=await response.json();assert.ok(value.receipt.document_number);
  await expect(review).toHaveCount(0);await expect(page.locator('main').first()).toContainText(value.receipt.document_number);await readable();await originalPdf('receipt',fixture.reviewerName,'Receipt Reviewer');await screenshot('live-receipt-issued');checks.push('payment-approved-real-ui-receipt-official-number');
 }
 assert.deepEqual(errors,[]);await writeFile(new URL(`live-browser-${phase}.json`,artifacts),JSON.stringify({phase,web,viewport:{width:1440,height:1000},browser:'Edge via repository Playwright transport',fallback:'Browser plugin not available',checks,mutations,pdfHashes,pageErrors:errors,password:'[REDACTED]'},null,2));console.log('PASS live finance browser '+phase+': '+checks.join(', '));
}catch(error){await screenshot('live-'+phase+'-failure');await writeFile(new URL(`live-browser-${phase}-failure.json`,artifacts),JSON.stringify({message:error.message,visibleText:await page.locator('body').innerText(),mutations,pageErrors:errors,password:'[REDACTED]'},null,2));throw error;
}finally{await context.tracing.stop({path:fileURLToPath(new URL(`live-${phase}-trace.zip`,artifacts))});await context.close();await browser.close();}
