import assert from 'node:assert/strict';
import test from 'node:test';
import { buildContractSnapshot, ContractPdfService } from './contract-pdf.service.js';
import type { DatabaseService } from '../../database/database.service.js';
const issuer={company_name:'บริษัท ผู้ขาย',tax_id:'1234567890123',address:'กรุงเทพ',branch:'00000',phone:'02',email:'issuer@example.com'};
const contract={id:'contract-a',site_id:'site-a',site_name:'ไซต์หนึ่ง',school_id:'school-a',start_date:'2026-10-08',end_date:null,created_date:'2026-10-08',company_name:'Customer Ltd',tax_id:'9876543210123',tax_address:'Customer address',branch:'00000',payment_terms:'30 days',payment_term_days:30,signer_name:'Provider Person',signer_title:'Director',customer_signer_name:'Buyer Person',customer_signer_title:'Manager'};
const rates=[{startDate:'2026-10-08',rate:'4.2500'}];
const logo='data:image/png;base64,approved';
test('snapshot freezes exact rates, both signatories and identities from recorded contract',()=>{
 const s=buildContractSnapshot(contract,issuer,rates,logo);
 assert.equal(s.type,'contract'); assert.equal(s.issuer.name,'บริษัท ผู้ขาย');
 assert.equal(s.customer.name,'Customer Ltd');assert.equal(s.rates[0]?.rate,'4.2500');
 assert.deepEqual(s.signatories,{issuer:{name:'Provider Person',title:'Director'},customer:{name:'Buyer Person',title:'Manager'}});
 assert.equal(s.paymentTerms,'30 days');assert.equal(s.logoDataUri,logo);
 issuer.company_name='Changed company';assert.equal(s.issuer.name,'บริษัท ผู้ขาย');issuer.company_name='บริษัท ผู้ขาย';
});
test('legacy missing legal identity is blocked with localized field errors; optional customer signature stays blank',()=>{
 assert.throws(()=>buildContractSnapshot({...contract,tax_id:'',signer_name:''},issuer,rates,logo),error=>{
  const body=(error as any).getResponse();assert.ok(body.fields.taxId.th);assert.ok(body.fields.signerName.en);return true;
 });
 const s=buildContractSnapshot({...contract,customer_signer_name:null,customer_signer_title:null},issuer,rates,logo);
 assert.deepEqual(s.signatories.customer,{name:'',title:''});
 assert.throws(()=>buildContractSnapshot(contract,issuer,[],logo),/rate|อัตรา/i);
});
function fixture(){
 let original:any;let artifacts=0;let companyReads=0;let renders=0;let failRender=false;
 const queries:string[]=[];
 const client={query:async(sql:string,params:any[]=[])=>{
  queries.push(sql);
  if(sql.includes('FROM contracts c JOIN sites'))return {rows:params[1]&& !params[1].includes('school-a')?[]:[contract]};
  if(sql.includes('FROM documents'))return {rows:original?[original]:[]};
  if(sql.includes('FROM company_profile')){companyReads++;return {rows:[issuer]};}
  if(sql.includes('FROM rate_versions'))return {rows:rates};
  if(sql.includes('INSERT INTO documents')){original={documentId:params[0],sha256:params[6]};return {rows:[]};}
  if(sql.includes('INSERT INTO document_artifacts')){artifacts++;return {rows:[]};}
  return {rows:[]};
 }};
 // External DB transaction boundary is doubled here; real locking/rollback are covered by opt-in PostgreSQL tests.
 let pending=Promise.resolve();
 const db={transaction:async(work:any)=>{const previous=pending;let release!:()=>void;pending=new Promise<void>(r=>release=r);await previous;const saved=original,count=artifacts;try{return await work(client);}catch(e){original=saved;artifacts=count;throw e;}finally{release();}}};
 const renderer=async()=>{renders++;if(failRender)throw new Error('render failed');return Buffer.from('%PDF-original bytes');};
 const service=new ContractPdfService(db as unknown as DatabaseService,renderer,async()=>logo);
 return {service,queries,stats:()=>({artifacts,companyReads,renders}),fail:()=>{failRender=true;}};
}
test('concurrent first accesses share one original and later company changes cannot rerender bytes',async()=>{
 const f=fixture();const actor={role:'school_user',schoolId:'school-a'};
 const [a,b]=await Promise.all([f.service.ensureContractOriginal('contract-a',actor),f.service.ensureContractOriginal('contract-a',actor)]);
 assert.deepEqual(a,b);assert.equal(a.sha256.length,64);assert.equal(f.stats().artifacts,1);
 issuer.company_name='Later setting';const c=await f.service.ensureContractOriginal('contract-a',actor);assert.deepEqual(c,a);
 assert.deepEqual(f.stats(),{artifacts:1,companyReads:1,renders:1});issuer.company_name='บริษัท ผู้ขาย';
});
test('unauthorized organization cannot read or create an original',async()=>{
 const f=fixture();await assert.rejects(f.service.ensureContractOriginal('contract-a',{role:'school_user',schoolId:'other'}));
 assert.deepEqual(f.stats(),{artifacts:0,companyReads:0,renders:0});
 assert.equal(f.queries.length,1);
 const noActor=fixture();await assert.rejects(noActor.service.ensureContractOriginal('contract-a',{}));assert.equal(noActor.queries.length,0);
});
test('failed render leaves no document original',async()=>{
 const f=fixture();f.fail();await assert.rejects(f.service.ensureContractOriginal('contract-a',{role:'owner'}),/render failed/);
 assert.equal(f.stats().artifacts,0);
});
