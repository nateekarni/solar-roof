import assert from 'node:assert/strict';
import test from 'node:test';
import { BillingController } from '../billing/billing.controller.js';
import { ContractPdfService } from './contract-pdf.service.js';
function fixture(failRender=false){
 const contracts=new Map<string,any>();const rates=new Map<string,any[]>();const artifacts=new Map<string,Buffer>();const documents=new Map<string,any>();let backup:any;let queries=0;
 const company={company_name:'Issuer Ltd',tax_id:'1234567890123',address:'Issuer address',signatory_name:'Default signer',signatory_title:'Director'};
 const query=async(sql:string,p:any[]=[])=>{queries++;
  if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
  if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
  if(sql==='BEGIN'){backup=[new Map(contracts),new Map(rates),new Map(artifacts),new Map(documents)];return {rows:[]};}
  if(sql==='ROLLBACK'){for(const [map,old] of [[contracts,backup[0]],[rates,backup[1]],[artifacts,backup[2]],[documents,backup[3]]]){map.clear();for(const [k,v] of old)map.set(k,v);}return {rows:[]};}
  if(sql.includes('FROM sites s JOIN schools'))return {rows:[{id:'school-a',schoolId:'school-a',name:'Customer',code:'ORG',legalName:'Customer Ltd',taxId:'9876543210123',taxAddress:'Customer address',taxBranch:'00000',phone:'',documentEmail:''}]};
  if(sql.includes('FROM company_profile'))return {rows:[company]};
  if(sql.includes('count(*)'))return {rows:[{count:contracts.size}]};
  if(sql.includes('INSERT INTO contracts')){const c={id:p[0],site_id:p[1],version:p[2],start_date:p[3],payment_terms:p[4],signer_name:p[5],tax_id:p[6],company_name:p[7],branch:p[8],tax_address:p[9],billing_email:p[10],billing_phone:p[11],signer_title:p[12],customer_signer_name:p[13],customer_signer_title:p[14],site_name:'Site A',school_id:'school-a'};contracts.set(c.id,c);return {rows:[{id:c.id}]};}
  if(sql.includes('INSERT INTO rate_versions')){rates.set(p[1],[...(rates.get(p[1])??[]),{startDate:p[2],rate:String(p[4]??p[3])}]);return {rows:[]};}
  if(sql.includes('FROM contracts c JOIN sites'))return {rows:contracts.has(p[0])?[contracts.get(p[0])]:[]};
  if(sql.includes('FROM rate_versions'))return {rows:rates.get(p[0])??[]};
  if(sql.includes('FROM documents'))return {rows:documents.has(p[0])?[documents.get(p[0])]:[]};
  if(sql.includes('INSERT INTO documents')){documents.set(p[2],{documentId:p[0],documentNumber:p[3],sha256:p[6],snapshot:JSON.parse(p[5])});return {rows:[]};}
  if(sql.includes('INSERT INTO document_artifacts')){artifacts.set(p[0],p[1]);return {rows:[]};}
  return {rows:[]};
 };
 const client={query,release(){}};const db:any={query,pool:{connect:async()=>client},transaction:async(work:any)=>{await query('BEGIN');try{const value=await work(client);await query('COMMIT');return value;}catch(e){await query('ROLLBACK');throw e;}}};
 const originals=new ContractPdfService(db,async()=>{if(failRender)throw new Error('render failed');return Buffer.from('%PDF-original created');},async()=>'data:image/png;base64,approved');
 const controller=new BillingController(db,{isLocalTestReady:async()=>false} as any,{} as any,originals);
 return {controller,contracts,rates,artifacts,documents,queries:()=>queries};
}
const input={siteId:'site-a',effectiveDate:'2026-10-08',paymentTerms:'30 days',ratePerKwh:4.25,signerName:'Edited provider',signerTitle:'Edited title',customerSignerName:'Buyer',customerSignerTitle:'Manager'};
const request={user:{role:'owner'}};
test('actual contract POST atomically creates a single saved PDF with editable signatory snapshots',async()=>{
 const f=fixture();const c=await f.controller.createContract(input,request);
 assert.equal(f.contracts.size,1);assert.equal(f.artifacts.size,1);assert.ok(c.documentId);assert.equal(c.contentHash.length,64);
 const s=f.documents.get(c.id).snapshot;assert.equal(s.signatories.issuer.name,'Edited provider');assert.equal(s.signatories.issuer.title,'Edited title');assert.equal(s.signatories.customer.name,'Buyer');
});
test('actual contract POST rolls back contract and rates when the renderer fails',async()=>{
 const f=fixture(true);await assert.rejects(f.controller.createContract(input,request),/render failed/);
 assert.equal(f.contracts.size,0);assert.equal(f.rates.size,0);assert.equal(f.documents.size,0);assert.equal(f.artifacts.size,0);
});
test('actual contract POST requires an authorized actor before accessing data',async()=>{
 const f=fixture();await assert.rejects(f.controller.createContract(input,{user:{role:'school_user',schoolId:'school-a'}}));assert.equal(f.queries(),0);
 await assert.rejects(f.controller.createContract(input,{}));assert.equal(f.queries(),0);
});

test('omitted provider fields use configured defaults while customer signature can remain blank',async()=>{
 const f=fixture();const c=await f.controller.createContract({siteId:'site-a',effectiveDate:'2026-10-08',paymentTerms:'30 days',ratePerKwh:4.25},request);
 const snapshot=f.documents.get(c.id).snapshot;assert.deepEqual(snapshot.signatories,{issuer:{name:'Default signer',title:'Director'},customer:{name:'',title:''}});
});
