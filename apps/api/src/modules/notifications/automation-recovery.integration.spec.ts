import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {OperationalAutomationService} from './operational-automation.service.js';
import type {DatabaseService} from '../../database/database.service.js';
test('real outbox leases reclaim only safe abandoned claims and invalidate old ownership',{skip:process.env.NOTIFICATION_SQL_TEST!=='true'},async()=>{
 const url=process.env.NOTIFICATION_TEST_DATABASE_URL;assert.ok(url);assert.equal(new URL(url).hostname,'127.0.0.1');
 const pool=new Pool({connectionString:url});const client=await pool.connect();
 try{
  await client.query('BEGIN');
  const schema='automation_recovery_'+randomUUID().replaceAll('-','');
  await client.query(`CREATE SCHEMA ${schema}; SET LOCAL search_path=${schema},public;
   CREATE TABLE operational_delivery_outbox (LIKE public.operational_delivery_outbox INCLUDING ALL);
   CREATE TABLE payment_decision_outbox (LIKE public.payment_decision_outbox INCLUDING ALL);
   CREATE TABLE operational_delivery_attempts (LIKE public.operational_delivery_attempts INCLUDING ALL);
   CREATE TABLE notification_deliveries (LIKE public.notification_deliveries INCLUDING ALL);`);
  const siteId=randomUUID(),userId=randomUUID(),never=randomUUID(),inapp=randomUUID(),email=randomUUID(),decision=randomUUID(),notice=randomUUID(),oldToken=randomUUID();
  for(const [id,channel] of [[never,'email'],[inapp,'in_app'],[email,'email']])await client.query(`INSERT INTO operational_delivery_outbox(id,dedupe_key,site_id,user_id,channel,recipient,subject,body,destination,state,attempts,claimed_at,claim_token) VALUES($1::uuid,$1::uuid::text,$2,$3,$4,'local@example.invalid','Test','Test','/records/billing/test','sending',1,now()-interval '3 minutes',$5)`,[id,siteId,userId,channel,oldToken]);
  await client.query(`INSERT INTO notification_deliveries(id,user_id,title,channel,recipient,status) VALUES($1,$2,'Test','email','local@example.invalid','queued')`,[notice,userId]);
  await client.query(`INSERT INTO payment_decision_outbox(id,payment_id,user_id,notification_id,site_id,recipient,subject,body,state,attempts,claimed_at,claim_token) VALUES($1,$2,$3,$4,$5,'local@example.invalid','Test','Test','sending',1,now()-interval '3 minutes',$6)`,[decision,randomUUID(),userId,notice,siteId,oldToken]);
  for(const [id,source] of [[inapp,'operational_delivery_outbox'],[email,'operational_delivery_outbox'],[decision,'payment_decision_outbox']])await client.query(`INSERT INTO operational_delivery_attempts(outbox_id,source,attempt,status) VALUES($1,$2,1,'sending')`,[id,source]);
  const db={query:client.query.bind(client),transaction:async(work:any)=>work(client)} as unknown as DatabaseService;
  const service=new OperationalAutomationService(db);await service.reconcileClaims();
  const recovered=(await client.query(`SELECT id,state,attempts,claim_token FROM operational_delivery_outbox`)).rows;
  assert.equal(recovered.find(r=>r.id===never).state,'pending');assert.equal(recovered.find(r=>r.id===never).attempts,0);
  assert.equal(recovered.find(r=>r.id===inapp).state,'pending');assert.equal(recovered.find(r=>r.id===email).state,'uncertain');
  assert.equal((await client.query('SELECT state FROM payment_decision_outbox')).rows[0].state,'uncertain');
  assert.equal((await client.query('SELECT status FROM notification_deliveries')).rows[0].status,'failed');
  const claimed=await service.claimDeliveries('operational_delivery_outbox');assert.equal(claimed.length,2);
  const claimedMail=claimed.find(r=>r.id===never)!;assert.equal(claimedMail.attempts,1);assert.notEqual(claimedMail.claim_token,oldToken);assert.ok(claimedMail.claimed_at);
  assert.equal(await service.prepareAttempt('operational_delivery_outbox',{id:never,claim_token:oldToken,attempts:1}),false);
  assert.equal(await service.prepareAttempt('operational_delivery_outbox',claimedMail),true);
  assert.equal((await client.query(`SELECT count(*)::integer AS count FROM operational_delivery_attempts WHERE outbox_id=$1 AND status='sending'`,[never])).rows[0].count,1);
  assert.equal((await service.claimDeliveries('payment_decision_outbox')).length,0);
 }finally{await client.query('ROLLBACK');client.release();await pool.end();}
});
