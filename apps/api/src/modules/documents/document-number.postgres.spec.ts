import assert from 'node:assert/strict';import test from 'node:test';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {allocateDocumentNumber} from './document-number.js';import {DatabaseService} from '../../database/database.service.js';
// Root-only explicit opt-in. Each run owns an isolated schema; no public migration or live document changes.
test('PostgreSQL atomic typed number allocation, rollback, exhaustion and historical preservation',{skip:!process.env.DOCUMENT_NUMBER_TEST_DATABASE_URL},async t=>{
 const schema=`document_number_test_${randomUUID().replaceAll('-','')}`;const admin=new Pool({connectionString:process.env.DOCUMENT_NUMBER_TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
 const pool=new Pool({connectionString:process.env.DOCUMENT_NUMBER_TEST_DATABASE_URL,options:`-c search_path=${schema}`,max:8});const db={pool,transaction:DatabaseService.prototype.transaction} as DatabaseService;
 try{
 await pool.query('CREATE TABLE document_number_series(prefix text PRIMARY KEY,last_value bigint NOT NULL);INSERT INTO document_number_series VALUES(\'INV202610\',17),(\'RCT202610\',9)');
 await t.test('parallel transactions return unique consecutive INV numbers and independent RCP/PPA counters',async()=>{
 const issued=await Promise.all(Array.from({length:16},()=>db.transaction(c=>allocateDocumentNumber(c,'invoice'))));assert.equal(new Set(issued.map(v=>v.number)).size,16);assert.deepEqual(issued.map(v=>Number(v.number.slice(-5))).sort((a,b)=>a-b),Array.from({length:16},(_,i)=>i+1));
 for(const type of ['receipt','contract'] as const){const n=await db.transaction(c=>allocateDocumentNumber(c,type));assert.equal(n.number.slice(-5),'00001');}
 });
 await t.test('failure before issuance rolls allocation back',async()=>{
 let unissued='';await assert.rejects(db.transaction(async c=>{unissued=(await allocateDocumentNumber(c,'invoice')).number;throw Error('render failed');}),/render failed/);
 const retry=await db.transaction(c=>allocateDocumentNumber(c,'invoice'));assert.equal(retry.number,unissued);
 });
 await t.test('last five-digit number can issue, then overflow fails without growing or incrementing',async()=>{
 const day=(await pool.query("SELECT to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMM') AS month")).rows[0].month;await pool.query('UPDATE document_number_series SET last_value=99998 WHERE prefix=$1',[`PPA${day}`]);
 const final=await db.transaction(c=>allocateDocumentNumber(c,'contract'));assert.equal(final.number,`PPA${day}99999`);await assert.rejects(db.transaction(c=>allocateDocumentNumber(c,'contract')),/exhausted/);
 assert.equal((await pool.query('SELECT last_value FROM document_number_series WHERE prefix=$1',[`PPA${day}`])).rows[0].last_value,'99999');
 });
 assert.deepEqual((await pool.query("SELECT * FROM document_number_series WHERE prefix IN('INV202610','RCT202610') ORDER BY prefix")).rows,[{prefix:'INV202610',last_value:'17'},{prefix:'RCT202610',last_value:'9'}]);
 }finally{await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
