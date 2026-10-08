import 'reflect-metadata';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localFinancialBinding,requireTestTransferAmount} from '../src/modules/billing/local-financial-policy.js';
// Root-owned opt-in runner: real HTTP/SMTP writes only in the exact authorized local TEST fixture.
if(process.env.DOCUMENT_CHANNELS_ACCEPTANCE!=='true'||!localFinancialBinding())throw new Error('Explicit DOCUMENT_CHANNELS_ACCEPTANCE=true and exact local TEST binding required');
const configPath=process.env.DOCUMENT_CHANNELS_INPUT;
if(!configPath)throw new Error('DOCUMENT_CHANNELS_INPUT must name root-reviewed synthetic input JSON');
const input=JSON.parse(await readFile(configPath,'utf8')) as {contractInput:Record<string,unknown>;periodStart:string;periodEnd:string;recipientEmail:string;otherOrganizationEmail:string;outputDirectory:string};
assert.ok(input.contractInput.siteId&&input.periodStart&&input.periodEnd&&input.outputDirectory);
assert.match(input.recipientEmail,/@(?:example\.test|example\.invalid)$/);assert.match(input.otherOrganizationEmail,/@(?:example\.test|example\.invalid)$/);
const api='http://127.0.0.1:13059',mail='http://127.0.0.1:18049';
async function request(token:string,path:string,method='GET',body?:unknown,expected=200){
 const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:'http://localhost:13049'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const value=await response.text();assert.equal(response.status,expected,`${method} ${path}: ${value}`);return value?JSON.parse(value):null;
}
async function login(email:string){const result=await request('', '/v1/auth/login','POST',{email,password:process.env.LOCAL_FINANCIAL_TEST_PASSWORD??'LocalFinancial2026!'});return result.accessToken as string;}
const owner=await login('owner@example.test'),recipient=await login(input.recipientEmail),other=await login(input.otherOrganizationEmail);
const capabilities=await request(owner,'/v1/auth/capabilities');assert.equal(capabilities.financialScope,'TEST');assert.ok(capabilities.actions.includes('send'));
const contract=await request(owner,'/v1/contracts','POST',input.contractInput,201);assert.ok(contract.documentId&&contract.contentHash);
const cycle=await request(owner,'/v1/billing-cycles','POST',{siteId:input.contractInput.siteId,periodStart:input.periodStart,periodEnd:input.periodEnd},201);
assert.equal(cycle.contract_id,contract.id,'New calculation must use the new contract');
const invoice=(await request(owner,`/v1/billing-cycles/${cycle.id}/generate-invoice`,'POST',{},201)).document;
// Full recorded TEST settlement; no receipt fabrication or ad-hoc recipient address.
await request(recipient,`/v1/billing-cycles/${cycle.id}/pay`,'POST',{amount:requireTestTransferAmount(String(cycle.amount).replace(/(\.\d{2})0+$/,'$1')),evidenceKey:`document-channels-synthetic-${randomUUID()}`,note:'Synthetic document channels acceptance'},201);
const receipt=(await request(owner,`/v1/billing-cycles/${cycle.id}/verify-payment`,'PATCH',{status:'approved'})).receipt;
await request(owner,`/v1/contracts/${contract.id}/send-email`,'POST',{},201);
await request(owner,`/v1/billing-cycles/${cycle.id}/send-email`,'POST',{},201);
const output=resolve(input.outputDirectory);await mkdir(output,{recursive:true});
const evidence:any[]=[];
for(const [type,documentId] of [['contract',contract.documentId],['invoice',invoice.id],['receipt',receipt.id]]){
 const metadata=await request(recipient,`/v1/operations/documents/${documentId}`);
 if(type!=='contract')assert.equal(metadata.contractId,contract.id,'Financial original must belong to the new contract');
 const download=await fetch(api+metadata.downloadUrl,{headers:{Authorization:`Bearer ${recipient}`}});assert.equal(download.status,200);
 const bytes=Buffer.from(await download.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const hash=createHash('sha256').update(bytes).digest('hex');assert.equal(hash,metadata.contentHash);
 if(type==='contract')assert.equal(hash,contract.contentHash);
 const list=await (await fetch(mail+'/api/v1/messages?limit=1000')).json();const message=list.messages.find((m:any)=>m.Subject===`TEST ${metadata.documentNumber}`);assert.ok(message,'Actual Mailpit SMTP message required');
 const detail=await (await fetch(`${mail}/api/v1/message/${message.ID}`)).json();assert.equal(detail.Attachments.length,1);
 const captured=Buffer.from(await (await fetch(`${mail}/api/v1/message/${message.ID}/part/${detail.Attachments[0].PartID}`)).arrayBuffer());assert.equal(createHash('sha256').update(captured).digest('hex'),hash);
 assert.deepEqual(captured,bytes);
 const denied=await fetch(api+metadata.downloadUrl,{headers:{Authorization:`Bearer ${other}`}});assert.ok([403,404].includes(denied.status));
 await writeFile(resolve(output,`${type}.pdf`),bytes);await writeFile(resolve(output,`${type}-mailpit.pdf`),captured);
 evidence.push({type,documentId,documentNumber:metadata.documentNumber,contentHash:hash,mailpitMessageId:message.ID,deniedStatus:denied.status});
}
const before=(await (await fetch(mail+'/api/v1/messages?limit=1000')).json()).messages.length;
await request(owner,`/v1/contracts/${contract.id}/send-email`,'POST',{},201);await request(owner,`/v1/billing-cycles/${cycle.id}/send-email`,'POST',{},201);
assert.equal((await (await fetch(mail+'/api/v1/messages?limit=1000')).json()).messages.length,before,'Retries must not resend accepted messages');
await request(owner,`/v1/contracts/${contract.id}/send-email`,'POST',{recipientEmail:'arbitrary@example.invalid'},400);
await request(recipient,`/v1/contracts/${contract.id}/send-email`,'POST',{},403);
const result={contractId:contract.id,billingCycleId:cycle.id,evidence};await writeFile(resolve(output,'evidence.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
