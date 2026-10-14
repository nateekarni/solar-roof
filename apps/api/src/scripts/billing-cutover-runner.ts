import type {DatabaseService} from '../database/database.service.js';
import type {FinancialReadinessService} from '../modules/financial-readiness/financial-readiness.service.js';
import type {FinancialApplicationService} from '../modules/billing/financial-application.service.js';
import {createHash} from 'node:crypto';
import {validFinancialDate} from '../modules/billing/local-financial-policy.js';
export interface CutoverInput {siteId:string;periodStart:string;periodEnd:string;operationKey:string;ownerId:string;apply:boolean}
function validate(input:CutoverInput) {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(input.siteId)||!uuid.test(input.ownerId)||!validFinancialDate(input.periodStart)||!validFinancialDate(input.periodEnd)||input.periodStart>input.periodEnd||!input.operationKey.trim()||input.operationKey.length>200)throw new Error('Explicit valid site, ordered period, operation key and Owner UUID required');
}
export function parseCutoverArguments(args:string[]):CutoverInput {
 const values=new Map<string,string>();let apply=false;
 for(const arg of args) {
  if(arg==='--apply'&&!apply){apply=true;continue;}
  const match=/^--(site|period-start|period-end|operation-key|owner)=(.+)$/.exec(arg);
  if(!match||values.has(match[1]!))throw new Error('Unknown, duplicate or empty cutover argument');
  values.set(match[1]!,match[2]!);
 }
 const input={siteId:values.get('site')??'',periodStart:values.get('period-start')??'',periodEnd:values.get('period-end')??'',operationKey:values.get('operation-key')??'',ownerId:values.get('owner')??'',apply};
 validate(input);return input;
}
export async function runBillingCutover(input:CutoverInput,db:DatabaseService,readiness:FinancialReadinessService,financial:FinancialApplicationService) {
 validate(input);
 const owner=(await db.query('SELECT id FROM users WHERE id=$1 AND role=\'owner\' AND status=\'active\'',[input.ownerId])).rows[0];
 if(!owner)throw new Error('Active Owner UUID required');
 await readiness.assertSchedulerEnabled();
 const context={siteId:input.siteId,periodStart:input.periodStart,periodEnd:input.periodEnd,ownerId:input.ownerId};
 if(!input.apply){await readiness.assertEnabled('calculate',context);return {mode:'dry-run' as const,...context};}
 const digest=createHash('sha256').update(`financial-cutover:${input.operationKey}`).digest('hex');
 const eventId=digest.slice(0,32).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/,'$1-$2-$3-$4-$5');
 const lock=await db.pool.connect();
 try {
  await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[digest]);
  const previous=(await lock.query("SELECT after_json FROM audit_events WHERE id=$1 AND action='finance.cutover_started' ORDER BY occurred_at LIMIT 1",[eventId])).rows[0];
  if(previous&&Object.entries(context).some(([key,value])=>previous.after_json?.[key]!==value))throw new Error('Operation key is already bound to different inputs');
  await readiness.assertEnabled('calculate',context);
  if(!previous)await lock.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,reason,correlation_id) VALUES($1,$2,'finance.cutover_started','site',$3,$4,'Controlled production billing cutover',$5)`,[eventId,input.ownerId,input.siteId,JSON.stringify(context),digest]);
  const {cycles}=await financial.calculate(input.siteId,input.periodStart,input.periodEnd,input.ownerId);
  const cycle=cycles[0];if(!cycle)throw new Error('Billing cycle was not created');
  // This explicit one-off Owner --apply operation includes issuance approval;
  // runtime schedulers and generation buttons only prepare the same draft.
  if(['draft','pending_review','rejected'].includes(cycle.status))await financial.prepareInvoice(cycle.id,input.ownerId);
  const {document}=await financial.issueInvoice(cycle.id,input.ownerId);
  const delivery=await financial.send(cycle.id,input.ownerId);if(!('success' in delivery)||!delivery.success)throw new Error('Delivery is pending; replay the same operation after reconciliation');
  const outboxes=(await db.query('SELECT state FROM financial_delivery_outbox WHERE document_id=$1',[document.id])).rows;
  if(!outboxes.length||outboxes.some(row=>row.state!=='sent'))throw new Error('Delivery is not confirmed; reconcile then replay the same operation');
  return {mode:'applied' as const,...context,cycleId:cycle.id,documentId:document.id,documentNumber:document.document_number,sha256:document.content_hash,delivery:'sent' as const};
 } finally {try{await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[digest]);}finally{lock.release();}}
}
