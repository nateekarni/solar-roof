import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const logoHash=(uri:string)=>createHash('sha256').update(Buffer.from(uri.split(',')[1]!, 'base64')).digest('hex');
import { ConflictException } from '@nestjs/common';
import { reviewedActualEnergyDifference } from './local-financial-application.service.js';
test('exact cumulative counter reset requires typed conflict and review',()=>{
 assert.throws(()=>reviewedActualEnergyDifference('10000.0006','10000.0004'),error=>error instanceof ConflictException&&error.getStatus()===409&&/Meter reset requires review/.test(error.message));
 assert.equal(reviewedActualEnergyDifference('10000.0004','10000.0006'),'0.000');
});
import {LocalFinancialApplicationService} from './local-financial-application.service.js';
import {TEST_FINANCIAL_POLICY_HASH} from './local-financial-policy.js';
import type {DatabaseService} from '../../database/database.service.js';
import type {FinancialReadinessService} from './financial-readiness.service.js';
test('TEST payment persistence keeps an exact large string amount',async()=>{
 let inserted=false;
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:unknown[])=>{
 if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[{id:'cycle',status:'approved',policy_hash:TEST_FINANCIAL_POLICY_HASH}]};
 if(sql.includes('SELECT id FROM documents'))return {rows:[{id:'invoice'}]};
 if(sql.includes('SELECT 1 FROM payments'))return {rows:[],rowCount:0};
 if(sql.includes('INSERT INTO payments')){assert.equal(params[2],'90071992547409.91');inserted=true;}
 return {rows:[]};
 }})};
 const service=new LocalFinancialApplicationService(db as unknown as DatabaseService,{} as FinancialReadinessService);
 await service.submitPayment('cycle',{amount:'90071992547409.91',evidenceKey:'exact-large-synthetic'},'actor');assert.ok(inserted);
});
test('future financial originals freeze protocol site identity and persist the renderer template version',async()=>{
 let persisted:any;let insertedVersion:unknown;
 const cycle={id:'cycle',site_id:'site-a',contract_id:'contract-a',quality:'complete',policy_hash:TEST_FINANCIAL_POLICY_HASH,amount:'107.00',subtotal:'100.00',simulated_tax:'7.00',meter_snapshot:[{from:'2026-09-01',to:'2026-10-01',consumedKwh:'25.000',rate:'4.0000',subtotal:'100.00'}]};
 const customer={id:'contract-a',company_name:'ลูกค้าทดสอบ',tax_id:'1111111111111',tax_address:'ที่อยู่ลูกค้า',site_name:'ไซต์ทดสอบ',external_site_id:'PROTOCOL-002',payment_term_days:30,recipient_user_ids:['recipient']};
 const db={transaction:async(run:any)=>run({query:async(sql:string,params:any[]=[])=>{
 if(sql.includes('SELECT * FROM billing_cycles'))return {rows:[cycle]};if(sql.includes('SELECT * FROM documents'))return {rows:[]};
 if(sql.includes('FROM contracts c JOIN sites')){const {external_site_id,...legacy}=customer;return {rows:[sql.includes('s.external_site_id')?customer:legacy]};}
 if(sql.includes('FROM company_profile'))return {rows:[{company_name:'บริษัททดสอบ',tax_id:'0000000000000',address:'ที่อยู่ผู้ขาย'}]};
 if(sql.includes('FROM company_bank_accounts'))return {rows:[{bank_name:'ธนาคารทดสอบ',account_name:'บริษัททดสอบ',account_number:'1234'}]};
 if(sql.includes('FROM users'))return {rows:[{id:'recipient',email:'verified@example.invalid',name:'ผู้รับ'}]};
 if(sql.includes("AS day"))return {rows:[{day:'2026-10-08'}]};if(sql.includes('document_number_series'))return {rows:[{last_value:1}]};
 if(sql.includes('AS starts'))return {rows:[{starts:'2026-09-01',ends:'2026-09-30'}]};
 if(sql.includes('INSERT INTO documents')){persisted=JSON.parse(params[7]);insertedVersion=params[10];return {rows:[{id:params[0],snapshot:persisted}]};}return {rows:[]};}})};
 const service=new LocalFinancialApplicationService(db as unknown as DatabaseService,{assertEnabled:async()=>{}} as unknown as FinancialReadinessService);
 const result=await service.issueInvoice('cycle');assert.equal(result.document.snapshot.customer.external_site_id,'PROTOCOL-002');assert.equal(persisted.templateVersion,'sarabun-a4-v4');assert.equal(insertedVersion,'sarabun-a4-v4');assert.equal(logoHash(persisted.logo),createHash('sha256').update(readFileSync(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url))).digest('hex'));
});
