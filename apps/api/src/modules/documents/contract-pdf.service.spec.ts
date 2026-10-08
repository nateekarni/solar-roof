import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const logoHash=(uri:string)=>createHash('sha256').update(Buffer.from(uri.split(',')[1]!, 'base64')).digest('hex');
import { buildContractSnapshot, ContractPdfService } from './contract-pdf.service.js';
import type { DatabaseService } from '../../database/database.service.js';
const issuer={company_name:'บริษัท ผู้ขาย',tax_id:'1234567890123',address:'กรุงเทพ',branch:'00000',phone:'02',email:'issuer@example.com'};
const contract={document_number:'PPA261000001',id:'contract-a',site_id:'site-a',site_name:'ไซต์หนึ่ง',school_id:'school-a',start_date:'2026-10-08',end_date:null,created_date:'2026-10-08',company_name:'Customer Ltd',tax_id:'9876543210123',tax_address:'Customer address',branch:'00000',payment_terms:'30 days',payment_term_days:30,signer_name:'Provider Person',signer_title:'Director',customer_signer_name:'Buyer Person',customer_signer_title:'Manager'};
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
  if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
  if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
  if(sql.includes('FROM contracts c JOIN sites'))return {rows:params[1]&& !params[1].includes('school-a')?[]:[contract]};
  if(sql.includes('FROM documents'))return {rows:original?[original]:[]};
  if(sql.includes('FROM company_profile')){companyReads++;return {rows:[issuer]};}
  if(sql.includes('FROM rate_versions'))return {rows:rates};
  if(sql.includes('INSERT INTO documents')){original={documentId:params[0],documentNumber:params[3],sha256:params[6],deliveryAvailable:false};return {rows:[]};}
  if(sql.includes('INSERT INTO document_artifacts')){artifacts++;return {rows:[]};}
  return {rows:[]};
 }};
 // External DB transaction boundary is doubled here; real locking/rollback are covered by opt-in PostgreSQL tests.
 let pending=Promise.resolve();
 const db={transaction:async(work:any)=>{const previous=pending;let release!:()=>void;pending=new Promise<void>(r=>release=r);await previous;const saved=original,count=artifacts;try{return await work(client);}catch(e){original=saved;artifacts=count;throw e;}finally{release();}}};
 const renderer=async()=>{renders++;if(failRender)throw new Error('render failed');return Buffer.from('%PDF-original bytes');};
 const service=new ContractPdfService(db as unknown as DatabaseService,renderer,async()=>logo);
 return {service,queries,historical:()=>{original={documentId:'historic-document',documentNumber:'historical-contract-uuid',sha256:'a'.repeat(64),deliveryAvailable:false};},stats:()=>({artifacts,companyReads,renders}),fail:()=>{failRender=true;}};
}
test('concurrent first accesses share one original and later company changes cannot rerender bytes',async()=>{
 const f=fixture();const actor={role:'school_user',schoolId:'school-a'};
 const [a,b]=await Promise.all([f.service.ensureContractOriginal('contract-a',actor),f.service.ensureContractOriginal('contract-a',actor)]);
 assert.deepEqual(a,b);assert.equal(a.documentNumber,'PPA261000001');assert.equal(f.queries.filter(q=>q.includes('document_number_series')).length,1);assert.equal(a.sha256.length,64);assert.equal(f.stats().artifacts,1);
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
import * as originals from './contract-pdf.service.js';
test('issuance freezes selected scoped verified accounts including email, while missing mail is optional',async()=>{
 const recipient={id:'recipient-a',email:'verified@example.invalid',name:'Verified'};
 const resolve=(originals as any).contractDeliveryRecipients;
 const client={query:async(sql:string,params:any[])=>{assert.match(sql,/verified_email=u.email/);assert.match(sql,/sc.status='active'/);assert.equal(params[0],'site-a');return {rows:[recipient]};}};
 const frozen=await resolve(client,{...contract,recipient_user_ids:['recipient-a']});
 assert.deepEqual(frozen,[recipient]);recipient.email='changed@example.invalid';assert.equal(frozen[0]!.email,'verified@example.invalid');
 assert.deepEqual(await resolve({query:async()=>{throw new Error('No mail query expected');}},contract),[]);
 assert.deepEqual(await resolve({query:async()=>({rows:[]})},{...contract,billing_email:'unverified@example.invalid'}),[]);
});
test('legacy frozen document email is accepted only by exact scoped verified active account match',async()=>{
 const resolve=(originals as any).contractDeliveryRecipients;
 const recipient={id:'legacy-user',email:'legacy@example.invalid',name:'Legacy'};
 const result=await resolve({query:async(sql:string,params:any[])=>{assert.match(sql,/u.email=\$2/);assert.match(sql,/u.status='active'/);assert.equal(params[1],'legacy@example.invalid');return {rows:[recipient]};}},{...contract,billing_email:'legacy@example.invalid'});
 assert.deepEqual(result,[recipient]);
 assert.deepEqual(await resolve({query:async()=>({rows:[recipient]})},{...contract,recipient_user_ids:['a','b']}),[]);
});


test('future contract issuance freezes protocol Site ID from the site query into original bytes and persisted snapshot',async()=>{
 let frozen:any;let persisted:any;const customer={...contract,external_site_id:'TH-SITE-001',capacity_mwp:'0.025123000',end_date:'2046-10-07'};
 const client={query:async(sql:string,params:any[]=[])=>{
 if(sql.includes('AS day'))return {rows:[{day:'2026-10-08'}]};
  if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
  if(sql.includes('FROM contracts c JOIN sites')) { assert.match(sql,/s.capacity_mwp::text AS capacity_mwp/); const {external_site_id,...legacy}=customer;return {rows:[sql.includes('s.external_site_id')?customer:legacy]}; }
 if(sql.includes('FROM company_profile'))return {rows:[issuer]};if(sql.includes('FROM rate_versions'))return {rows:rates};
 if(sql.includes('INSERT INTO documents'))persisted=JSON.parse(params[5]);return {rows:[]};}};
 const service=new ContractPdfService({transaction:async(work:any)=>work(client)} as unknown as DatabaseService,async(snapshot)=>{frozen=snapshot;return Buffer.from('%PDF-fixture');});
 await service.ensureContractOriginal('contract-a',{role:'owner'});
 assert.equal(logoHash(frozen.logoDataUri),createHash('sha256').update(readFileSync(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url))).digest('hex'));assert.equal(persisted.logoDataUri,frozen.logoDataUri);assert.equal(frozen.siteExternalId,'TH-SITE-001');assert.equal(persisted.siteExternalId,'TH-SITE-001');assert.equal(persisted.startDate,'2026-10-08');assert.equal(persisted.endDate,'2046-10-07');assert.equal(persisted.paymentTermDays,30);assert.equal(persisted.templateVersion,'ppa-th-sarabun-new-v4');assert.equal(persisted.capacityKwp,'25.123');assert.equal(persisted.brandPrimary,'#f29700');
 const legacy=buildContractSnapshot(contract,issuer,rates,logo);assert.equal(legacy.siteExternalId,undefined);
});

test('historical saved contract returns its old actual number before allocation or rendering',async()=>{
 const f=fixture();f.historical();const result=await f.service.ensureContractOriginal('contract-a',{role:'owner'});
 assert.equal(result.documentNumber,'historical-contract-uuid');assert.equal(result.sha256,'a'.repeat(64));
 assert.equal(f.queries.some(q=>q.includes('document_number_series')),false);assert.deepEqual(f.stats(),{artifacts:0,companyReads:0,renders:0});
});
