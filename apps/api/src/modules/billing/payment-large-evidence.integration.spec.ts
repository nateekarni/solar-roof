import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {FinancialApplicationService} from './financial-application.service.js';

test('large image evidence persists, rejects duplicates and settles one receipt',{skip:process.env.PAYMENT_SQL_TEST!=='true'},async()=>{
 const url=process.env.PAYMENT_TEST_DATABASE_URL;assert.ok(url);
 assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).port,'15449');
 const pool=new Pool({connectionString:url});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const logo=await readFile(new URL('../../../../web/public/brand/solar-roof-document-stacked.png',import.meta.url));
  await client.query('UPDATE company_profile SET logo_url=$1',['data:image/png;base64,'+logo.toString('base64')]);
  const cycle=(await client.query(`SELECT b.* FROM billing_cycles b WHERE b.status='approved' AND b.amount>=0.02
   AND EXISTS(SELECT 1 FROM documents d WHERE d.billing_cycle_id=b.id AND d.document_type='invoice' AND d.status='issued')
   AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status IN('pending_verification','paid'))
   ORDER BY b.period_end DESC,b.id LIMIT 1`)).rows[0];assert.ok(cycle,'Need an issued unpaid local synthetic invoice');
  const actor=(await client.query("SELECT id FROM users WHERE role='accountant' AND status='active' LIMIT 1")).rows[0];assert.ok(actor);
  const submitter=(await client.query(`SELECT u.id FROM users u JOIN site_account_assignments a ON a.user_id=u.id
   WHERE u.role='customer_user' AND u.status='active' AND a.site_id=$1 AND a.revoked_at IS NULL LIMIT 1`,[cycle.site_id])).rows[0];assert.ok(submitter);
  const db={transaction:async(fn:any)=>{await client.query('SAVEPOINT evidence_operation');try{const result=await fn(client);await client.query('RELEASE SAVEPOINT evidence_operation');return result;}catch(error){await client.query('ROLLBACK TO SAVEPOINT evidence_operation');throw error;}}};
  const service=new FinancialApplicationService(db as any,{assertEnabled:async()=>{}} as any);
  const image='data:image/png;base64,'+randomBytes(150_000).toString('base64');
  const first=await service.submitPayment(cycle.id,{slipUrl:image},submitter.id);
  const saved=(await client.query('SELECT amount,paid_at,length(slip_url) AS size FROM payments WHERE id=$1',[first.paymentId])).rows[0];
  assert.equal(saved.amount,null);assert.equal(saved.paid_at,null);assert.ok(saved.size>100_000);
  await assert.rejects(()=>service.submitPayment(cycle.id,{slipUrl:image},submitter.id),/already submitted/);
  // The unique index must protect concurrent writes which bypass the precheck.
  await assert.rejects(()=>db.transaction(()=>client.query(`INSERT INTO payments(id,billing_cycle_id,status,slip_url,submitted_by)
   VALUES(gen_random_uuid(),$1,'pending_verification',$2,$3)`,[cycle.id,image,submitter.id])),
   (error:any)=>error.code==='23505'&&error.constraint==='payments_new_active_slip');
  const key=randomBytes(150_000).toString('base64');
  const second=await service.submitPayment(cycle.id,{slipUrl:image+'AA==',evidenceKey:key},submitter.id);
  assert.notEqual(first.paymentId,second.paymentId);
  await assert.rejects(()=>service.submitPayment(cycle.id,{evidenceKey:key},submitter.id),/already submitted/);
  await assert.rejects(()=>db.transaction(()=>client.query(`INSERT INTO payments(id,billing_cycle_id,status,evidence_key,submitted_by)
   VALUES(gen_random_uuid(),$1,'pending_verification',$2,$3)`,[cycle.id,key,submitter.id])),
   (error:any)=>error.code==='23505'&&error.constraint==='payments_new_active_evidence');
  const partial=await service.verifyPayment(cycle.id,'approved',undefined,actor.id,{paymentId:first.paymentId,verifiedAmount:'0.01',verifiedTransferAt:'2026-10-09T01:00:00Z'});
  assert.equal(partial.receipt,null);
  const [whole,fraction='']=String(cycle.amount).split('.');const remaining=BigInt(whole!)*100n+BigInt(fraction.padEnd(2,'0').slice(0,2))-1n;
  const amount=(remaining/100n).toString()+'.'+(remaining%100n).toString().padStart(2,'0');
  const settled=await service.verifyPayment(cycle.id,'approved',undefined,actor.id,{paymentId:second.paymentId,verifiedAmount:amount,verifiedTransferAt:'2026-10-09T02:00:00Z'});
  assert.equal(settled.billingCycleStatus,'paid');assert.ok(settled.receipt);
  const savedReceipt=(await client.query('SELECT snapshot FROM documents WHERE id=$1',[settled.receipt.id])).rows[0];
  const {financialDocumentSnapshot}=await import('../documents/financial-document-pdf.js');
  const printable=financialDocumentSnapshot({document_type:'receipt',document_number:settled.receipt.document_number,snapshot:savedReceipt.snapshot});
  assert.ok(printable.approvedTransfers.every(payment=>!payment.evidence),'Uploaded file bytes and long storage keys stay outside printable payment details');
  assert.equal((await client.query("SELECT count(*)::int AS count FROM documents WHERE billing_cycle_id=$1 AND document_type='receipt'",[cycle.id])).rows[0].count,1);
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
