import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { DatabaseService } from '../../database/database.service.js';
import { BillingController } from '../billing/billing.controller.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { documentDefinition } from './document-layout.js';
import { OperationsService } from '../dashboard/operations.service.js';

// Explicit opt-in only. Creates/drops one isolated schema, never migrates public or edits existing fixtures.
test('PostgreSQL contract original transactions and concurrent issuance',{skip:!process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL},async t=>{
 const schema=`contract_original_test_${randomUUID().replaceAll('-','')}`;
 const admin=new Pool({connectionString:process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL});
 await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:process.env.CONTRACT_ORIGINAL_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:6});
 const db={pool,query:pool.query.bind(pool),transaction:DatabaseService.prototype.transaction} as unknown as DatabaseService;
 const schoolId=randomUUID(),siteId=randomUUID();
 try {
  await pool.query(`
   CREATE TABLE schools(id uuid PRIMARY KEY,name text,code text,legal_name text,tax_id text,tax_branch text,tax_address text,document_email text,phone text);
   CREATE TABLE sites(id uuid PRIMARY KEY,school_id uuid REFERENCES schools(id),name text,external_site_id text,capacity_mwp numeric(12,4) NOT NULL);
   CREATE TABLE company_profile(id uuid PRIMARY KEY,company_name text,tax_id text,address text,branch text,phone text,email text,is_configured boolean DEFAULT true,updated_at timestamptz DEFAULT now());
   CREATE TABLE contracts(id uuid PRIMARY KEY,site_id uuid REFERENCES sites(id),version int,start_date date,end_date date,status text,payment_terms text,signer_name text,tax_id text,company_name text,branch text,tax_address text,billing_email text,billing_phone text,payment_term_days int,recipient_user_ids uuid[],UNIQUE(site_id,version));
   CREATE TABLE rate_versions(id uuid PRIMARY KEY,contract_id uuid REFERENCES contracts(id),effective_from date,effective_to date,rate_type text,rate numeric(20,8),currency text);
   CREATE TABLE billing_cycles(id uuid PRIMARY KEY,contract_id uuid);
   CREATE TABLE documents(id uuid PRIMARY KEY,site_id uuid REFERENCES sites(id),billing_cycle_id uuid,document_type text CONSTRAINT documents_document_type_check CHECK(document_type IN('invoice','receipt','billing_statement')),document_number text UNIQUE,status text,issue_date date,amount numeric,file_key text,snapshot jsonb,content_hash text,created_at timestamptz DEFAULT now());
   CREATE TABLE document_number_series(prefix text PRIMARY KEY,last_value bigint NOT NULL);
   CREATE TABLE document_artifacts(document_id uuid PRIMARY KEY REFERENCES documents(id),pdf_bytes bytea NOT NULL,sha256 text NOT NULL CHECK(length(sha256)=64));
  `);
  // Apply the real additive migration and the existing original immutability triggers.
  await pool.query(await readFile(new URL('../../../../../infra/migrations/036_contract_document_originals.sql',import.meta.url),'utf8'));
  const historicalMigration=await readFile(new URL('../../../../../infra/migrations/029_local_financial_workflow.sql',import.meta.url),'utf8');
  await pool.query(historicalMigration.slice(historicalMigration.indexOf('CREATE FUNCTION preserve_local_issued_document()'),historicalMigration.indexOf('-- Unique issuance')));
  await pool.query(`INSERT INTO schools VALUES($1,'Test customer','TEST-ORG','Customer Legal','9876543210123','00000','Customer address','','')`,[schoolId]);
  await pool.query(`INSERT INTO sites(id,school_id,name,external_site_id,capacity_mwp) VALUES($1,$2,'Test solar site','PROTOCOL-001',0.0251)`,[siteId,schoolId]);
  await pool.query(`INSERT INTO company_profile(id,company_name,tax_id,address,signatory_name,signatory_title) VALUES($1,'Issuer Legal','1234567890123','Issuer address','Default provider','Director')`,[randomUUID()]);
  const originals=new ContractPdfService(db);const operations=new OperationsService(db);
  const controller=new BillingController(db,{isLocalTestReady:async()=>false} as any,{} as any,originals);
  const actor={role:'owner'};const customer={role:'school_user',schoolId};
  const input={siteId,effectiveDate:'2026-10-08',ratePerKwh:4.25,paymentTerms:'30 days',signerName:'Edited provider',signerTitle:'Authorized director',customerSignerName:'Customer signer',customerSignerTitle:'Manager'};
  let created:any;
  await t.test('POST creates one PDF and scoped download serves identical bytes',async()=>{
   created=await controller.createContract(input,{user:actor});
   const saved=(await pool.query('SELECT d.snapshot,a.* FROM documents d JOIN document_artifacts a ON a.document_id=d.id WHERE d.contract_id=$1',[created.id])).rows;
   assert.equal(saved.length,1);assert.match(created.documentNumber,/^PPA\d{9}$/);assert.equal(saved[0].snapshot.documentNumber,created.documentNumber);assert.equal(saved[0].snapshot.contractNumber,created.documentNumber);assert.equal(saved[0].pdf_bytes.subarray(0,5).toString(),'%PDF-');
   assert.equal(saved[0].snapshot.signatories.issuer.name,'Edited provider');assert.equal(saved[0].snapshot.signatories.customer.title,'Manager');
   assert.equal(saved[0].snapshot.rates[0].rate,'4.25000000');
   assert.equal(saved[0].snapshot.siteExternalId,'PROTOCOL-001');
   assert.equal(saved[0].snapshot.siteName,'Test solar site');assert.equal(saved[0].snapshot.capacityKwp,'25.1');
   const downloaded=await operations.documentPdf(created.documentId,customer);
   assert.equal(createHash('sha256').update(downloaded.pdf_bytes).digest('hex'),created.contentHash);
  });
  await t.test('company/default and site metadata edits cannot alter issued snapshot or original hash',async()=>{
   await pool.query("UPDATE company_profile SET company_name='Later company',signatory_name='Later provider',signatory_title='Later title'");
   await pool.query("UPDATE sites SET name='Later solar site',external_site_id='PROTOCOL-CHANGED',capacity_mwp=0.0999 WHERE id=$1",[siteId]);
   const again=await originals.ensureContractOriginal(created.id,customer);assert.equal(again.sha256,created.contentHash);
   const snapshot=(await pool.query('SELECT snapshot FROM documents WHERE id=$1',[again.documentId])).rows[0].snapshot;
   assert.equal(snapshot.issuer.name,'Issuer Legal');assert.equal(snapshot.signatories.issuer.name,'Edited provider');
   assert.equal(snapshot.siteName,'Test solar site');assert.equal(snapshot.siteExternalId,'PROTOCOL-001');assert.equal(snapshot.capacityKwp,'25.1');
   const downloaded=await operations.documentPdf(again.documentId,customer);
   assert.equal(createHash('sha256').update(downloaded.pdf_bytes).digest('hex'),created.contentHash);
   await assert.rejects(pool.query("UPDATE document_artifacts SET pdf_bytes=$2 WHERE document_id=$1",[again.documentId,Buffer.from('replacement')]));
  });
  await t.test('parallel historical first access creates one immutable artifact and absent protocol ID prints name only',async()=>{
   const id=randomUUID();
   await pool.query('UPDATE sites SET external_site_id=NULL WHERE id=$1',[siteId]);
   await pool.query(`INSERT INTO contracts(id,site_id,version,start_date,status,payment_terms,signer_name,tax_id,company_name,tax_address) VALUES($1,$2,2,'2025-01-01','active','30 days','Historical signer','9876543210123','Historical customer','Historical address')`,[id,siteId]);
   await pool.query(`INSERT INTO rate_versions VALUES($1,$2,'2025-01-01',NULL,'fixed_kwh',4.25,'THB')`,[randomUUID(),id]);
   const results=await Promise.all(Array.from({length:5},()=>originals.ensureContractOriginal(id,customer)));
   assert.equal(new Set(results.map(r=>r.documentId)).size,1);assert.equal(new Set(results.map(r=>r.sha256)).size,1);
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM documents WHERE contract_id=$1',[id])).rows[0].count,1);
   const snapshot=(await pool.query('SELECT snapshot FROM documents WHERE contract_id=$1',[id])).rows[0].snapshot;
   assert.equal(snapshot.siteExternalId,undefined);assert.equal(snapshot.siteName,'Later solar site');
   const visible=(value:any):string=>typeof value==='string'?value.replaceAll('\u200b',''):Array.isArray(value)?value.map(visible).join(''):value?.text?visible(value.text):'';
   const siteLine=documentDefinition(snapshot).content.map(visible).find(value=>value.startsWith('ไซต์งาน:'));
   assert.equal(siteLine,'ไซต์งาน: Later solar site');assert.ok(!siteLine.includes(siteId));
  });
  await t.test('cross-organization access cannot retrieve bytes or issue an original',async()=>{
   const other={role:'school_user',schoolId:randomUUID()};
   await assert.rejects(originals.ensureContractOriginal(created.id,other));await assert.rejects(operations.documentPdf(created.documentId,other));
   const count=(await pool.query('SELECT count(*)::int AS count FROM documents')).rows[0].count;assert.equal(count,2);
  });
  await t.test('render failure rolls back all new contract/rate/document/artifact records',async()=>{
   const before=(await pool.query('SELECT (SELECT count(*) FROM contracts) AS contracts,(SELECT count(*) FROM rate_versions) AS rates,(SELECT count(*) FROM documents) AS documents,(SELECT count(*) FROM document_artifacts) AS artifacts')).rows[0];
   const failing=new ContractPdfService(db,async()=>{throw new Error('forced render failure');});
   const c=new BillingController(db,{isLocalTestReady:async()=>false} as any,{} as any,failing);
   await assert.rejects(c.createContract(input,{user:actor}),/forced render failure/);
   const after=(await pool.query('SELECT (SELECT count(*) FROM contracts) AS contracts,(SELECT count(*) FROM rate_versions) AS rates,(SELECT count(*) FROM documents) AS documents,(SELECT count(*) FROM document_artifacts) AS artifacts')).rows[0];
   assert.deepEqual(after,before);
  });
  await t.test('incomplete historical identity is blocked without filling current customer defaults',async()=>{
   const id=randomUUID();await pool.query(`INSERT INTO contracts(id,site_id,version,start_date,status,payment_terms,signer_name) VALUES($1,$2,3,'2024-01-01','active','30 days','Historical signer')`,[id,siteId]);
   await assert.rejects(originals.ensureContractOriginal(id,actor));
   assert.equal((await pool.query('SELECT count(*)::int AS count FROM documents WHERE contract_id=$1',[id])).rows[0].count,0);
  });
 } finally {await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
