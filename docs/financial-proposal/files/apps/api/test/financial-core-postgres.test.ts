import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {createMeasuredCycle,issueCycleDocument,requestEvidenceCorrections} from '../src/modules/billing/financial-persistence.js';
import {BillingController} from '../src/modules/billing/billing.controller.js';
import type {DatabaseService} from '../src/database/database.service.js';

const url=process.env.FINANCIAL_TEST_DATABASE_URL;
test('PostgreSQL: partial-month contracts split, evidence tolerance, correction separation and full-sum payments', {skip:!url},async()=>{
 if(!url?.includes('solar_financial_v2'))throw new Error('Use explicitly isolated solar_financial_v2 database');
 const pool=new Pool({connectionString:url});
 const db={pool,query:(sql:string,args:unknown[])=>pool.query(sql,args)} as unknown as DatabaseService;
 const school=randomUUID(),site=randomUUID(),gateway=randomUUID(),device=randomUUID(),meter=randomUUID(),admin=randomUUID(),owner=randomUUID(),other=randomUUID();
 try{
 await pool.query(`INSERT INTO schools(id,name,code,region) VALUES($1,'Test school',$2,'Test')`,[school,school]);
 await pool.query(`INSERT INTO sites(id,school_id,name,capacity_mwp) VALUES($1,$2,'Test site',1)`,[site,school]);
 await pool.query(`INSERT INTO gateways(id,site_id,name,protocol,endpoint) VALUES($1,$2,$3,'mqtt',$4)`,[gateway,site,gateway,`energy/${gateway}/#`]);
 await pool.query(`INSERT INTO devices(id,gateway_id,site_id,name,device_type,model,serial_number) VALUES($1,$2,$3,'Test meter','meter','Test',$4)`,[device,gateway,site,device]);
 await pool.query(`INSERT INTO billing_meters(id,site_id,device_id) VALUES($1,$2,$3)`,[meter,site,device]);
 for(const [id,role] of [[admin,'admin'],[owner,'owner'],[other,'accountant']])await pool.query(`INSERT INTO users(id,email,display_name,role) VALUES($1,$2,'Test',$3)`,[id,`${id}@example.test`,role]);
 const contract1=randomUUID(),contract2=randomUUID();
 for(const [id,start,end,version] of [[contract1,'2026-01-10','2026-01-15',1],[contract2,'2026-01-20',null,2]]){
 await pool.query(`INSERT INTO contracts(id,site_id,version,start_date,end_date,payment_terms,payment_term_days,signer_name) VALUES($1,$2,$3,$4,$5,'0 days',0,'Test')`,[id,site,version,start,end]);
 await pool.query(`INSERT INTO rate_versions(id,contract_id,effective_from,rate_type,rate,currency) VALUES($1,$2,$3,'fixed_kwh',4,'THB')`,[randomUUID(),id,start]);
 }
 for(const [time,value] of [['2026-01-09T17:00:00Z',100],['2026-01-15T17:05:00Z',125],['2026-01-19T16:55:00Z',125],['2026-01-31T17:00:00Z',150]])await pool.query(`INSERT INTO evidence_readings(id,billing_meter_id,source_time,value,evidence,reason,entered_by,approved_by) VALUES($1,$2,$3,$4,'photo','verified meter',$5,$5)`,[randomUUID(),meter,time,value,admin]);
 const result=await createMeasuredCycle(db,site,'2026-01-01','2026-01-31',owner);
 assert.equal(result.cycles.length,2);assert.deepEqual(result.cycles.map(c=>Number(c.amount)),[100,100]);
 assert.deepEqual(result.cycles.map(c=>c.contract_id),[contract1,contract2]);
 await assert.rejects(createMeasuredCycle(db,site,'2026-01-01','2026-01-31'),/overlaps/);
 await assert.rejects(createMeasuredCycle(db,site,'2026-02-01','2026-02-28'),/Missing actual/);
 const client=await pool.connect();
 try{await assert.rejects(issueCycleDocument(client,result.cycles[0],'invoice'),/ACCOUNTING_NOT_CONFIRMED/);}finally{client.release();}
 const cycle=result.cycles[0];
 await pool.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,status,snapshot,amount) VALUES($1,$2,$3,'invoice','issued',$4,100)`,[randomUUID(),site,cycle.id,JSON.stringify({original:true})]);
 await pool.query(`UPDATE billing_cycles SET status='approved' WHERE id=$1`,[cycle.id]);
 const controller=new BillingController(db);
 const correction=await controller.evidenceReading(meter,{sourceTime:'2026-01-15T17:00:00Z',value:130,evidence:'corrected photo',reason:'corrected boundary'}, {user:{id:admin}} as never);
 assert.equal(correction.corrections.length,1);assert.equal(Number(correction.corrections[0].impact_amount),20);
 assert.equal(correction.corrections[0].status,'pending_financial_request');
 await assert.rejects(controller.approveCorrection(correction.corrections[0].id,{user:{id:owner}} as never),/endorsement/);
 await controller.endorseCorrection(correction.corrections[0].id,{user:{id:owner}} as never);
 await assert.rejects(controller.approveCorrection(correction.corrections[0].id,{user:{id:owner}} as never),/different/);
 const approved=await controller.approveCorrection(correction.corrections[0].id,{user:{id:other}} as never);assert.equal(approved.status,'accounting_blocked');
 assert.equal(Number((await pool.query('SELECT amount FROM billing_cycles WHERE id=$1',[cycle.id])).rows[0].amount),100);
 const evidence='data:image/png;base64,YQ==';
 await controller.payBillingCycle(cycle.id,{transfers:[{amount:60,paidAt:'2026-01-20T00:00:00Z',slipUrl:evidence}]},{user:{id:owner,role:'owner'}} as never);
 await assert.rejects(controller.verifyPayment(cycle.id,{status:'approved'},{user:{id:owner}} as never),/full invoice/);
 await controller.payBillingCycle(cycle.id,{transfers:[{amount:40,paidAt:'2026-01-21T00:00:00Z',slipUrl:evidence}]},{user:{id:owner,role:'owner'}} as never);
 // Receipt gate correctly rolls back approval until accounting is implemented.
 await assert.rejects(controller.verifyPayment(cycle.id,{status:'approved'},{user:{id:owner}} as never),/ACCOUNTING_NOT_CONFIRMED/);
 assert.equal((await pool.query(`SELECT count(*)::int AS n FROM payments WHERE billing_cycle_id=$1 AND status='pending_verification'`,[cycle.id])).rows[0].n,2);
 // Future termination enables a replacement contract without rewriting an issued period.
 await assert.rejects(controller.endContract(contract2,{endDate:'2026-01-01',reason:'invalid retroactive end'},{user:{id:owner}} as never),/today or later/);
 await controller.endContract(contract2,{endDate:'2099-01-31',reason:'planned replacement'},{user:{id:owner}} as never);
 await assert.rejects(controller.endContract(contract2,{endDate:'2099-02-01',reason:'extension'},{user:{id:owner}} as never),/cannot extend/);
 const recipient=randomUUID();
 await pool.query(`INSERT INTO users(id,email,display_name,role,school_id,email_verified_at,verified_email) VALUES($1,$2,'School recipient','school_user',$3,now(),$2)`,[recipient,`${recipient}@example.test`,school]);
 const replacement:any=await controller.createContract({siteId:site,effectiveDate:'2099-02-01',endDate:'2099-03-31',paymentTermDays:0,recipientUserIds:[recipient],signerName:'Test',rates:[{startDate:'2099-02-01',endDate:'2099-03-31',rate:4}]},{user:{id:owner}} as never);
 assert.equal(replacement.paymentTermDays,0);
 assert.equal((await pool.query("SELECT to_char(effective_to,'YYYY-MM-DD') AS ends FROM rate_versions WHERE contract_id=$1",[replacement.id])).rows[0].ends,'2099-04-01');
 const futureCycle=randomUUID();
 await pool.query(`INSERT INTO billing_cycles(id,site_id,contract_id,period_start,period_end,cutoff_time,status,quality,opening_energy,closing_energy,consumed_kwh,rate,amount) VALUES($1,$2,$3,'2099-03-01','2099-03-31','2099-04-01','finalized','complete',0,25,25,4,100)`,[futureCycle,site,replacement.id]);
 await pool.query(`INSERT INTO documents(id,site_id,billing_cycle_id,document_type,status,snapshot,amount) VALUES($1,$2,$3,'invoice','issued',$4,100)`,[randomUUID(),site,futureCycle,JSON.stringify({original:true})]);
 await assert.rejects(controller.endContract(replacement.id,{endDate:'2099-03-20',reason:'would change issued period'},{user:{id:owner}} as never),/originally issued/);

 }finally{await pool.end();}
});
