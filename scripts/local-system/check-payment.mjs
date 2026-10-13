import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertLocalDockerTarget} from './guard.mjs';
assertLocalDockerTarget('financial');
const require=createRequire(new URL('../../apps/api/package.json',import.meta.url));
const pool=new (require('pg').Pool)({connectionString:process.env.DATABASE_URL});
const {accounts,password}=JSON.parse(await readFile('output/local-system/accounts.json','utf8'));
async function request(path,token,method='GET',body,expected=200){const r=await fetch('http://127.0.0.1:3001'+path,{method,headers:{Origin:'http://localhost:3000','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});const value=await r.json();assert.ok(expected===200?r.ok:r.status===expected,`${path}: ${r.status} ${JSON.stringify(value).slice(0,400)}`);return value;}
try{
 const customer=accounts.find(a=>a.email==='customer01@example.test'),accountant=accounts.find(a=>a.email==='accountant@example.test');
 const customerToken=(await request('/v1/auth/login',null,'POST',{email:customer.email,password})).accessToken;
 const accountantToken=(await request('/v1/auth/login',null,'POST',{email:accountant.email,password})).accessToken;
 const cycle=(await pool.query("SELECT * FROM billing_cycles WHERE site_id=$1 AND period_start='2026-08-01'",[customer.siteId])).rows[0];assert.ok(cycle);
 const replay=cycle.status==='paid';
 if(!replay){
 assert.equal((await pool.query('SELECT count(*)::int n FROM payments WHERE billing_cycle_id=$1',[cycle.id])).rows[0].n,0,'Unexpected existing payment: inspect before replay');
 async function evidence(label){const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><rect width="800" height="400" fill="white"/><text x="35" y="80" font-size="32">SYNTHETIC TEST ONLY</text><text x="35" y="150" font-size="24">Not a real bank transfer</text><text x="35" y="210" font-size="20">${cycle.id}</text><text x="35" y="270" font-size="24">${label}</text></svg>`;return 'data:image/png;base64,'+(await require('sharp')(Buffer.from(svg)).png().toBuffer()).toString('base64');}
 const first=await request(`/v1/billing-cycles/${cycle.id}/pay`,customerToken,'POST',{slipUrl:await evidence('Rejected fixture'),note:'Synthetic rejection test'});
 await request(`/v1/billing-cycles/${cycle.id}/verify-payment`,accountantToken,'PATCH',{status:'rejected',paymentId:first.paymentId,rejectionReason:'Synthetic unreadable evidence scenario'});
 const img=await evidence('Partial transfer fixture');const partial=await request(`/v1/billing-cycles/${cycle.id}/pay`,customerToken,'POST',{slipUrl:img});
 await request(`/v1/billing-cycles/${cycle.id}/pay`,customerToken,'POST',{slipUrl:img},409);
 const part=await request(`/v1/billing-cycles/${cycle.id}/verify-payment`,accountantToken,'PATCH',{status:'approved',paymentId:partial.paymentId,verifiedAmount:'1.00',verifiedTransferAt:new Date().toISOString(),transferReference:`TEST-PART-${cycle.id}`});assert.equal(part.receipt,null);
 const final=await request(`/v1/billing-cycles/${cycle.id}/pay`,customerToken,'POST',{slipUrl:await evidence('Final transfer fixture')});
 const settled=await request(`/v1/billing-cycles/${cycle.id}/verify-payment`,accountantToken,'PATCH',{status:'approved',paymentId:final.paymentId,verifiedAmount:(Number(cycle.amount)-1).toFixed(2),verifiedTransferAt:new Date().toISOString(),transferReference:`TEST-FINAL-${cycle.id}`});assert.equal(settled.billingCycleStatus,'paid');
 }
 const receipts=(await pool.query("SELECT * FROM documents WHERE billing_cycle_id=$1 AND document_type='receipt'",[cycle.id])).rows;assert.equal(receipts.length,1);
 const r=await fetch(`http://127.0.0.1:3001/v1/operations/documents/${receipts[0].id}/pdf`,{headers:{Authorization:'Bearer '+customerToken}});assert.equal(r.status,200);const pdf=Buffer.from(await r.arrayBuffer());assert.equal(createHash('sha256').update(pdf).digest('hex'),receipts[0].content_hash);await writeFile('output/local-system/receipt.pdf',pdf);
 const messages=(await(await fetch('http://127.0.0.1:18049/api/v1/messages?limit=500')).json()).messages;assert.equal(messages.filter(m=>m.Subject.includes(receipts[0].document_number)).length,1);
 const result={mode:replay?'existing-receipt-verification':'fresh-payment-flow',cycleId:cycle.id,...(!replay?{rejectionPassed:true,resubmissionPassed:true,duplicateEvidenceBlocked:true,partialPaymentPassed:true,settlementPassed:true}:{}),receiptNumber:receipts[0].document_number,pdfHash:receipts[0].content_hash};await writeFile('output/local-system/payment-results.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await pool.end();}
