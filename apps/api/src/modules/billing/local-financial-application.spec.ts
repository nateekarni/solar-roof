import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
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