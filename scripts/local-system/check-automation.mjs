import '../../apps/api/node_modules/reflect-metadata/Reflect.js';
import assert from 'node:assert/strict';
import {writeFile,readFile} from 'node:fs/promises';
import {assertLocalDockerTarget} from './guard.mjs';
import {DatabaseService} from '../../apps/api/src/database/database.service.ts';
import {OperationalAutomationService} from '../../apps/api/src/modules/notifications/operational-automation.service.ts';
import {FinancialReadinessService} from '../../apps/api/src/modules/billing/financial-readiness.service.ts';
import {LocalFinancialApplicationService} from '../../apps/api/src/modules/billing/local-financial-application.service.ts';
assertLocalDockerTarget('financial');
const db=new DatabaseService({statementTimeout:120000,applicationName:'local-automation-test'});
const automation=new OperationalAutomationService(db);
const {accounts,password}=JSON.parse(await readFile('output/local-system/accounts.json','utf8'));
const admin=accounts.find(a=>a.role==='admin'),operator=accounts.find(a=>a.role==='operator');
const results=[];
try{
 const site=(await db.query("SELECT s.id,g.id AS gateway_id,g.last_seen_at FROM sites s JOIN gateways g ON g.site_id=s.id WHERE s.external_site_id='SKA-HDY-010'")).rows[0];
 const login=await fetch('http://127.0.0.1:3001/v1/auth/login',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password})});assert.equal(login.status,200);const token=(await login.json()).accessToken;
 const headers={Origin:'http://localhost:3000','Content-Type':'application/json',Authorization:'Bearer '+token};
 // Exercise exactly the API and schema used by the manual rule editor.
 for(const old of (await db.query('SELECT id FROM operational_alert_rules WHERE enabled AND site_id=$1',[site.id])).rows){const r=await fetch(`http://127.0.0.1:3001/v1/alert-rules/${old.id}`,{method:'DELETE',headers});assert.equal(r.status,200);}
 const response=await fetch('http://127.0.0.1:3001/v1/alert-rules',{method:'POST',headers,body:JSON.stringify({siteId:site.id,kind:'offline',durationSeconds:0,cooldownSeconds:0,recovery:true,recipientUserIds:[admin.id,operator.id],channels:['in_app','email']})});assert.equal(response.status,201,await response.clone().text());const rule=await response.json(),ruleId=rule.id;
 assert.deepEqual(rule.recipient_user_ids.sort(),[admin.id,operator.id].sort());results.push({check:'Create and disable alert rules through authenticated API',passed:true});
 await db.query("UPDATE gateways SET last_seen_at=now()-interval '10 minutes' WHERE id=$1",[site.gateway_id]);
 await automation.evaluateRules(new Date());
 assert.equal((await db.query('SELECT state FROM operational_alert_rules WHERE id=$1',[ruleId])).rows[0].state.active,true);
 const alarmCount=Number((await db.query('SELECT count(DISTINCT alert_id) AS n FROM operational_delivery_outbox WHERE rule_id=$1',[ruleId])).rows[0].n);
 await automation.evaluateRules(new Date());
 assert.equal(Number((await db.query('SELECT count(DISTINCT alert_id) AS n FROM operational_delivery_outbox WHERE rule_id=$1',[ruleId])).rows[0].n),alarmCount,'Repeated offline check must not duplicate alarm');
 await db.query('UPDATE gateways SET last_seen_at=now() WHERE id=$1',[site.gateway_id]);
 await automation.evaluateRules(new Date());
 assert.equal((await db.query('SELECT state FROM operational_alert_rules WHERE id=$1',[ruleId])).rows[0].state.active,false);
 assert.ok((await db.query("SELECT 1 FROM alerts a JOIN operational_delivery_outbox o ON o.alert_id=a.id WHERE o.rule_id=$1 AND a.severity='info' AND a.status='resolved'",[ruleId])).rowCount);
 // Leave one offline site visible for manual testing, while the publisher feeds nine.
 await db.query("UPDATE gateways SET last_seen_at=now()-interval '10 minutes',status='offline' WHERE id=$1",[site.gateway_id]);
 await automation.evaluateRules(new Date());await automation.deliver();
 const delivery=(await db.query('SELECT channel,state,count(*)::int count FROM operational_delivery_outbox WHERE rule_id=$1 GROUP BY channel,state',[ruleId])).rows;
 assert.ok(delivery.some(d=>d.channel==='in_app'&&d.state==='sent'));assert.ok(delivery.some(d=>d.channel==='email'&&d.state==='sent'));
 results.push({check:'Offline alarm, recovery, repeat suppression, in-app and SMTP delivery',passed:true,delivery});
 const adminFeed=await fetch('http://127.0.0.1:3001/v1/me/notification-feed',{headers});assert.equal(adminFeed.status,200);assert.ok((await adminFeed.json()).rows.some(r=>r.kind==='alert'),'Admin must see delivered alert');
 const reminderBills=(await db.query(`SELECT b.id,to_char(b.due_date,'YYYY-MM-DD') AS due,c.reminder_start_days,c.reminder_interval_days,c.recipient_user_ids FROM billing_cycles b JOIN site_billing_settings c ON c.site_id=b.site_id WHERE c.reminders_enabled AND b.due_date IS NOT NULL AND b.status NOT IN('paid','cancelled','draft','superseded') AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.billing_cycle_id=b.id AND p.status='pending_verification')`)).rows;
 const expectedKeys=reminderBills.flatMap(b=>{const days=Math.floor((Date.parse('2026-12-01')-Date.parse(b.due))/86400000)-b.reminder_start_days;if(days<0)return [];const slot=Math.floor(days/b.reminder_interval_days);return b.recipient_user_ids.flatMap(user=>['in_app','email'].map(channel=>`reminder:${b.id}:${slot}:${user}:${channel}`));});
 assert.ok(expectedKeys.length>0,'Need eligible overdue fixtures');
 const pendingBefore=(await db.query('SELECT count(*)::int n FROM operational_delivery_outbox WHERE dedupe_key=ANY($1::text[])',[expectedKeys])).rows[0].n;
 await automation.queueReminders(new Date('2026-12-01T10:00:00+07:00'));
 const reminderCount=Number((await db.query("SELECT count(*) n FROM operational_delivery_outbox WHERE dedupe_key LIKE 'reminder:%'")).rows[0].n);
 assert.ok(reminderCount>0);await automation.queueReminders(new Date('2026-12-01T10:00:00+07:00'));
 assert.equal(Number((await db.query("SELECT count(*) n FROM operational_delivery_outbox WHERE dedupe_key LIKE 'reminder:%'")).rows[0].n),reminderCount);
 await automation.deliver();
 const expectedDeliveries=(await db.query('SELECT dedupe_key,state FROM operational_delivery_outbox WHERE dedupe_key=ANY($1::text[])',[expectedKeys])).rows;
 assert.deepEqual(expectedDeliveries.map(r=>r.dedupe_key).sort(),expectedKeys.sort());assert.ok(expectedDeliveries.every(r=>r.state==='sent'),JSON.stringify(expectedDeliveries.filter(r=>r.state!=='sent')));
 results.push({check:'Due reminders, exact recipients, duplicate suppression and sent states',mode:pendingBefore===expectedKeys.length?'existing-reminder-replay':'fresh-reminders',passed:true,verifiedDeliveries:expectedKeys.length,newDeliveries:expectedKeys.length-pendingBefore});
 const first=(await db.query('SELECT site_id,device_id FROM billing_meters WHERE active ORDER BY site_id LIMIT 1')).rows[0];
 const client=await db.pool.connect();
 try{
 await client.query('BEGIN');
 const deleted=await client.query(`DELETE FROM telemetry_raw WHERE device_id=$1 AND semantic_field='total_energy' AND source_time BETWEEN '2026-07-14T16:55:00Z' AND '2026-07-14T17:05:00Z'`,[first.device_id]);
 assert.ok(deleted.rowCount>0,'Seed must contain the July boundary');
 const transactional={query:client.query.bind(client),transaction:async run=>run(client)};
 const financial=new LocalFinancialApplicationService(transactional,new FinancialReadinessService(db));
 await assert.rejects(financial.calculate(first.site_id,'2026-07-15','2026-07-31'),/Missing actual cumulative reading/);
 }finally{await client.query('ROLLBACK');client.release();}
 const client2=await db.pool.connect();try{await client2.query('BEGIN');const transactional={query:client2.query.bind(client2),transaction:async run=>run(client2)};const financial=new LocalFinancialApplicationService(transactional,new FinancialReadinessService(db));const restored=await financial.calculate(first.site_id,'2026-07-15','2026-07-31');assert.ok(Number(restored.cycles[0].consumed_kwh)>0);}finally{await client2.query('ROLLBACK');client2.release();}
 results.push({check:'Missing meter boundary blocks billing; restored data permits calculation (rolled back)',passed:true});
 await writeFile('output/local-system/automation-results.json',JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results,null,2));
}catch(e){await writeFile('output/local-system/automation-results.json',JSON.stringify({results,failure:e.message},null,2));throw e;}finally{await db.pool.end();}
