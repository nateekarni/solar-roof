import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Capabilities, FinancialAction, FinancialReadinessContext, FinancialReadinessItem, FinancialReadinessStatus, FinancialScope } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { hasPermission, siteScope } from '../../common/auth/authorization.js';
import { routeAllowed, type ScopePrincipal } from '../../common/auth/route-policy.js';
import { canonicalGlobalFinancialConfiguration, type CompanyProfile, type CompanyBankAccount } from '../settings/settings.service.js';
import { decodeCompanyImage } from '../settings/company-image.js';
import { financialConfigurationHash, financialAuditEvidence } from './financial-configuration.js';
import { localTestReadiness } from '../billing/local-test-readiness.js';
import { TEST_FINANCIAL_POLICY_HASH, validFinancialDate } from '../billing/local-financial-policy.js';
import { billableBoundary, verifyBillingSegment } from '../billing/billing-source-readings.js';
import { originalArtifactHash, frozenRecipients } from '../billing/saved-document-delivery.js';
import { scaledDecimal, assertRateEditable } from '../billing/site-billing-policy.js';

const ACTIONS: readonly FinancialAction[] = ['calculate','issue','approve_payment','adjust','send'];
export type FinancialWorkflowAction = FinancialAction|'issue_contract'|'send_contract'|'submit_payment';
export type FinancialWorkflowContext = FinancialReadinessContext&{documentId?:string;contractId?:string};
type QueryBoundary = Pick<DatabaseService,'query'>;
type Approval = {id:string;config_hash:string;approved_at:string|Date;approved_by:string;snapshot?:ReturnType<typeof canonicalGlobalFinancialConfiguration>;revoked_at?:string|Date};
type Configuration = {company:CompanyProfile;banks:CompanyBankAccount[];snapshot:ReturnType<typeof canonicalGlobalFinancialConfiguration>;hash:string;approval:Approval|undefined;items:FinancialReadinessItem[]};
const text = (value:unknown) => typeof value==='string' && value.trim().length>0;
const email = (value:unknown) => typeof value==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const taxId = (value:unknown) => typeof value==='string' && /^\d{13}$/.test(value);
const image = (value:unknown) => {try{return typeof value==='string'&&!!decodeCompanyImage(value,'Company image');}catch{return false;}};
function smtpReady() {
  const port=Number(process.env.SMTP_PORT);
  const secure=process.env.SMTP_SECURE;
  const password=process.env.SMTP_PASSWORD??process.env.SMTP_PASS;
  return text(process.env.SMTP_HOST)&&Number.isInteger(port)&&port>0&&port<=65535&&email(process.env.SMTP_FROM)
    && (!secure||['true','false'].includes(secure)) && (!!process.env.SMTP_USER===!!password);
}
function item(id:string,ready:boolean,responsibility:FinancialReadinessItem['responsibility'],siteId?:string,siteName?:string|null):FinancialReadinessItem {
  return {id,ready,responsibility,...(siteId?{siteId,siteName:siteName||null,destination:`/sites/${siteId}/settings`}:responsibility==='owner'?{destination:'/settings/company'}:{})};
}
const unavailable = (missing:string[],context:FinancialWorkflowContext={}) => new ServiceUnavailableException({code:'FINANCIAL_NOT_READY',message:'Financial workflows await verified accounting requirements and implementation readiness.',missing,context});

@Injectable()
export class FinancialReadinessService {
  constructor(@Inject(DatabaseService) private readonly db?:DatabaseService) {}

  private async configuration(client:QueryBoundary,lock=false):Promise<Configuration> {
    const company=(await client.query<CompanyProfile>(`SELECT id,company_name AS "companyName",tax_id AS "taxId",branch,address,phone,email,logo_url AS "logoUrl" FROM company_profile ORDER BY updated_at DESC LIMIT 1 ${lock?'FOR UPDATE':''}`)).rows[0]??{companyName:'',taxId:'',branch:'',address:'',phone:'',email:''};
    const banks=(await client.query<CompanyBankAccount>(`SELECT id,bank_name AS "bankName",bank_code AS "bankCode",account_name AS "accountName",account_number AS "accountNumber",branch_name AS "branchName",promptpay_id AS "promptpayId",is_default AS "isDefault",is_configured AS "isConfigured" FROM company_bank_accounts ORDER BY id ${lock?'FOR UPDATE':''}`)).rows;
    const snapshot=canonicalGlobalFinancialConfiguration(company,banks),hash=financialConfigurationHash(snapshot);
    const approval=(await client.query<Approval>(`SELECT id,config_hash,approved_at,approved_by,snapshot FROM financial_readiness_approvals WHERE scope='PRODUCTION' AND revoked_at IS NULL ${lock?'FOR UPDATE':''}`)).rows[0];
    const usable=(bank:CompanyBankAccount)=>bank.isConfigured&&text(bank.bankName)&&text(bank.accountName)&&text(bank.accountNumber);
    const items=[
      item('company.logo',image(company.logoUrl),'owner'),item('company.name',text(company.companyName),'owner'),
      item('company.tax_id',taxId(company.taxId),'owner'),item('company.branch',text(company.branch),'owner'),
      item('company.address',text(company.address),'owner'),item('company.phone',text(company.phone),'owner'),
      item('company.email',email(company.email),'owner'),
      item('company.default_bank',banks.some(usable)&&banks.filter(b=>b.isDefault).length===1&&banks.some(b=>b.isDefault&&usable(b)),'owner'),
      item('approval.confirmation',approval?.config_hash===hash,'owner'),
    ];
    return {company,banks,snapshot,hash,approval,items};
  }

  async confirm(actor:ScopePrincipal):Promise<FinancialReadinessStatus> {
    if(actor.role!=='owner'||!actor.id)throw new ForbiddenException('Active Owner confirmation required');
    const actorId=actor.id;
    if(!this.db)throw unavailable(['approval.confirmation']);
    return this.db.transaction(async client=>{
      // Same lock and acquisition order as company/bank mutations, including empty tables.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('production-financial-configuration'))");
      const live=(await client.query('SELECT id,role,status FROM users WHERE id=$1 FOR UPDATE',[actor.id])).rows[0];
      if(live?.role!=='owner'||live.status!=='active')throw new ForbiddenException('Active Owner confirmation required');
      const config=await this.configuration(client,true);
      const missing=config.items.filter(i=>i.id!=='approval.confirmation'&&!i.ready).map(i=>i.id);
      if(missing.length)throw unavailable(missing);
      if(config.approval?.config_hash!==config.hash) {
        const revoked=(await client.query<Approval>(`UPDATE financial_readiness_approvals SET revoked_at=now(),revoked_by=$1,revoke_reason='financial_configuration_changed' WHERE scope='PRODUCTION' AND revoked_at IS NULL RETURNING id,config_hash,snapshot,approved_by,approved_at,revoked_at`,[actor.id])).rows;
        for(const row of revoked){
          const before={id:row.id,status:'active',configHash:row.config_hash,approvedBy:row.approved_by,approvedAt:row.approved_at,...(row.snapshot?{configuration:financialAuditEvidence(row.snapshot)}:{})};
          await this.audit(client,actorId,'finance.approval.revoked',row.id,before,{...before,status:'revoked',revokedAt:row.revoked_at,revokedBy:actorId,reason:'financial_configuration_changed'});
        }
        const id=randomUUID();
        const inserted=(await client.query<Approval>(`INSERT INTO financial_readiness_approvals(id,scope,config_hash,snapshot,approved_by) VALUES($1,'PRODUCTION',$2,$3,$4) RETURNING approved_at`,[id,config.hash,JSON.stringify(config.snapshot),actor.id])).rows[0];
        await this.audit(client,actorId,'finance.approval.confirmed',id,null,{id,status:'active',scope:'PRODUCTION',configHash:config.hash,approvedBy:actorId,approvedAt:inserted?.approved_at,configuration:financialAuditEvidence(config.snapshot)});
      }
      return this.evaluate(client,actor,{});
    });
  }

  private async audit(client:QueryBoundary,actorId:string,action:string,id:string,before:unknown,after:unknown) {
    await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,before_json,after_json,correlation_id) VALUES($1,$2,$3,'financial_readiness_approval',$4,$5,$6,$7)`,[randomUUID(),actorId,action,id,JSON.stringify(before),JSON.stringify(after),randomUUID()]);
  }

  async status(actor:ScopePrincipal,context:FinancialReadinessContext={},client?:PoolClient):Promise<FinancialReadinessStatus> {
    if(!this.db) {
      const missing=['approval.confirmation',...(process.env.FINANCIAL_WRITES_ENABLED==='true'?[]:['environment.financial_writes'])];
      return {scope:null,fingerprint:financialConfigurationHash(missing),approval:null,items:[item('approval.confirmation',false,'owner')],actions:Object.fromEntries(ACTIONS.map(action=>[action,{enabled:false,missing}])) as FinancialReadinessStatus['actions']};
    }
    return client?this.evaluate(client,actor,context):this.db.transaction(client=>this.evaluate(client,actor,context));
  }

  private async evaluate(client:QueryBoundary,actor:ScopePrincipal,context:FinancialReadinessContext):Promise<FinancialReadinessStatus> {
    const config=await this.configuration(client);
    const local=await localTestReadiness(client as DatabaseService);
    const approved=config.items.every(i=>i.ready);
    const scope:FinancialScope|null=local?'TEST':approved?'PRODUCTION':null;
    const writes=process.env.FINANCIAL_WRITES_ENABLED==='true',smtp=smtpReady();
    const items=[...config.items,item('environment.financial_writes',writes,'environment'),item('environment.smtp',smtp,'environment'),
      item('environment.scheduler',process.env.FINANCIAL_SCHEDULER_ENABLED==='true'&&writes&&smtp&&approved&&!local,'environment')];
    let cycle:any;
    if(context.billingCycleId)cycle=(await client.query(`SELECT *,to_char(period_start,'YYYY-MM-DD') AS starts,to_char(period_end,'YYYY-MM-DD') AS ends FROM billing_cycles WHERE id=$1`,[context.billingCycleId])).rows[0];
    if(cycle&&context.siteId&&cycle.site_id!==context.siteId)throw new BadRequestException('Cycle and site context disagree');
    if(cycle&&(context.periodStart!==undefined&&context.periodStart!==cycle.starts||context.periodEnd!==undefined&&context.periodEnd!==cycle.ends))throw new BadRequestException('Cycle and period context disagree');
    const siteId=context.siteId??cycle?.site_id;
    const start=cycle?cycle.starts:context.periodStart,end=cycle?cycle.ends:context.periodEnd;
    if((start||end)&&(!start||!end||!validFinancialDate(start)||!validFinancialDate(end)||start>end))throw new BadRequestException('Valid ordered period dates required');
    const scopeIds=siteScope(actor,'business');
    if(siteId&&scopeIds!==null&&!scopeIds.includes(siteId))throw new ForbiddenException('Site outside financial scope');
    const sites=(await client.query(`SELECT s.id,s.name,s.status,s.timezone,c.status AS customer_status,c.legal_name,c.tax_id,c.tax_address,c.document_email,cfg.version,to_char(cfg.service_start_date,'YYYY-MM-DD') AS service_start_date,cfg.payment_term_days,cfg.tax_rate,cfg.prices_include_tax,cfg.tax_confirmed,cfg.recipient_user_ids FROM sites s JOIN customers c ON c.id=s.customer_id LEFT JOIN site_billing_settings cfg ON cfg.site_id=s.id WHERE ($1::uuid IS NULL OR s.id=$1) AND ($2::uuid[] IS NULL OR s.id=ANY($2)) AND s.status<>'archived' ORDER BY s.id`,[siteId??null,scopeIds])).rows;
    const perSite:FinancialReadinessItem[][]=[];
    for(const site of sites) {
      const siteItems=await this.siteItems(client,site,start,end);
      items.push(...siteItems);perSite.push(siteItems);
    }
    const globalMissing=config.items.filter(i=>!i.ready).map(i=>i.id);
    const bestSite=perSite.find(list=>list.every(i=>i.ready))??perSite[0];
    const siteMissing=bestSite?bestSite.filter(i=>!i.ready).map(i=>i.id):['context.site'];
    const base=[...globalMissing,...siteMissing,...(!writes?['environment.financial_writes']:[]),...(context.billingCycleId&&!cycle?['context.cycle']:[])];
    const manual=cycle?.billing_kind==='manual';
    const issuanceBase=manual?base.filter(id=>!['site.rate','site.meter','site.binding','site.boundary_readings'].includes(id)):base;
    const cycleMissing:string[]=[];
    if(cycle&&(cycle.quality!=='complete'||!(manual?Array.isArray(cycle.manual_lines)&&cycle.manual_lines.length:Array.isArray(cycle.meter_snapshot)&&cycle.meter_snapshot.length)||cycle.financial_scope!=='PRODUCTION'||cycle.policy_snapshot?.scope!=='PRODUCTION'||financialConfigurationHash(cycle.policy_snapshot)!==cycle.policy_hash||cycle.billing_settings_version!==sites[0]?.version))cycleMissing.push('cycle.snapshot');
    const docs=cycle?(await client.query<any>(`SELECT d.*,a.pdf_bytes,a.sha256 FROM documents d LEFT JOIN document_artifacts a ON a.document_id=d.id WHERE d.billing_cycle_id=$1 AND d.is_current AND d.status IN('issued','finalized') ORDER BY d.created_at,d.id`,[cycle.id])).rows:[];
    const invoice=docs.find(d=>d.document_type==='invoice'&&d.snapshot?.policy);
    const correction:string[]=[];
    if(!invoice)correction.push('cycle.invoice');
    if(cycle)try{assertRateEditable(cycle.status,(await client.query<{status:string}>('SELECT status FROM payments WHERE billing_cycle_id=$1',[cycle.id])).rows);}catch{correction.push('cycle.correction');}
    const delivery:string[]=[];
    if(!docs.length)delivery.push('document.artifact');
    for(const doc of docs) {
      try{originalArtifactHash(doc);}catch{delivery.push('document.artifact');}
      try {
        const frozen=frozenRecipients(doc);
        const live=(await this.recipients(client,cycle.site_id,frozen.map(r=>r.id))).rows;
        if(live.length!==frozen.length||frozen.some(r=>!live.some(l=>l.id===r.id&&l.email===r.email)))delivery.push('document.recipient');
      }catch{delivery.push('document.recipient');}
    }
    const actions=Object.fromEntries(ACTIONS.map(action=>{
      let missing=action==='calculate'?[...base,...(manual?['cycle.calculation']:[])]:[...issuanceBase,...cycleMissing];
      if(action==='adjust')missing=[...missing,...correction];
      if(action==='send')missing=[...missing,...delivery,...(!smtp?['environment.smtp']:[])];
      // The synthetic fixture remains environment-bound; it never marks production checklist items ready.
      if(local)missing=writes&&local.actions.includes(action)?[]:['environment.financial_writes'];
      missing=[...new Set(missing)];return [action,{enabled:missing.length===0,missing}];
    })) as FinancialReadinessStatus['actions'];
    const approval=approved&&config.approval?{id:config.approval.id,approvedAt:new Date(config.approval.approved_at).toISOString(),approvedBy:config.approval.approved_by}:null;
    return {scope,fingerprint:financialConfigurationHash({hash:config.hash,approval:approval?.id??null,items:items.map(i=>({id:i.id,siteId:i.siteId,ready:i.ready}))}),approval,items,actions};
  }

  private recipients(client:QueryBoundary,siteId:string,ids:string[]) {
    return client.query(`SELECT u.id,u.email FROM users u JOIN site_account_assignments sa ON sa.user_id=u.id AND sa.revoked_at IS NULL JOIN sites s ON s.id=sa.site_id JOIN customers c ON c.id=s.customer_id WHERE s.id=$1 AND u.id=ANY($2::uuid[]) AND u.role='customer_user' AND u.status='active' AND c.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.id`,[siteId,ids]);
  }

  private async siteItems(client:QueryBoundary,site:any,start?:string,end?:string):Promise<FinancialReadinessItem[]> {
    const add=(id:string,ready:boolean,responsibility:FinancialReadinessItem['responsibility']='owner')=>item(id,ready,responsibility,site.id,site.name);
    let tax=false;try{tax=site.tax_confirmed===true&&typeof site.prices_include_tax==='boolean'&&scaledDecimal(site.tax_rate,4)<=1000000n;}catch{/* Missing or invalid tax is a checklist blocker. */}
    const recipients=await this.recipients(client,site.id,site.recipient_user_ids??[]);
    const meters=(await client.query(`SELECT b.*,EXISTS(SELECT 1 FROM billing_source_bindings bs JOIN devices d ON d.id=bs.device_id JOIN payload_profile_revisions p ON p.id=bs.profile_revision_id WHERE bs.id=b.billing_source_binding_id AND bs.site_id=b.site_id AND bs.meter_id=b.id AND bs.device_id=b.device_id AND bs.profile_revision_id=d.payload_profile_revision_id AND bs.canonical_tag='energy.active.import.total' AND bs.target_unit='kWh' AND EXISTS(SELECT 1 FROM jsonb_array_elements(p.config->'fields') f WHERE coalesce(f->>'sourceTag',f->>'tag')=bs.source_tag AND f->>'tag'=bs.canonical_tag AND f->>'sourceUnit'=bs.source_unit AND f->>'targetUnit'=bs.target_unit AND f->>'conversion'=bs.conversion AND f->>'role'='billing-import')) AS binding_ready FROM billing_meters b WHERE b.site_id=$1 AND b.active ORDER BY b.id`,[site.id])).rows;
    const rates=(await client.query(`SELECT to_char(effective_from,'YYYY-MM-DD') AS starts,to_char(effective_to+1,'YYYY-MM-DD') AS ends,rate,currency,rate_type FROM rate_versions WHERE site_id=$1 AND retired_at IS NULL AND ($2::date IS NULL OR effective_from<=$3::date AND (effective_to IS NULL OR effective_to>=$2::date)) ORDER BY effective_from,id`,[site.id,start??null,end??null])).rows;
    let rateReady=rates.length>0;
    const segments:Array<{start:string;end:string}>=[];
    let cursor=start;
    const final=end?new Date(Date.parse(end)+86400000).toISOString().slice(0,10):undefined;
    for(const rate of rates) {
      try{scaledDecimal(rate.rate,4);}catch{rateReady=false;}
      if(rate.currency!=='THB'||rate.rate_type!=='fixed_kwh')rateReady=false;
      if(start&&final) {
        const from=rate.starts<start?start:rate.starts,to=rate.ends&&rate.ends<final?rate.ends:final;
        if(from!==cursor||to<=from)rateReady=false;
        segments.push({start:from,end:to});cursor=to;
      }
    }
    if(final&&cursor!==final)rateReady=false;
    const items=[add('site.customer',site.customer_status==='active'&&text(site.legal_name)&&taxId(site.tax_id)&&text(site.tax_address)&&email(site.document_email)),
      add('site.service',validFinancialDate(site.service_start_date??'')&&(!start||site.service_start_date<=start)&&Number.isInteger(site.payment_term_days)&&site.payment_term_days>=0&&site.payment_term_days<=3650),
      add('site.tax',tax),add('site.recipient',recipients.rows.length>0&&recipients.rows.length===new Set(site.recipient_user_ids??[]).size),
      add('site.rate',rateReady),add('site.meter',meters.length>0,'technical'),add('site.binding',meters.length>0&&meters.every(m=>m.binding_ready===true),'technical')];
    if(start&&end) {
      let boundaries=rateReady&&meters.length>0&&meters.every(m=>m.binding_ready===true);
      if(boundaries)try {
        for(const meter of meters)for(const segment of segments){
          const opening=await billableBoundary(client as PoolClient,meter,segment.start,site.timezone,site.id);
          const closing=await billableBoundary(client as PoolClient,meter,segment.end,site.timezone,site.id);
          await verifyBillingSegment(client as PoolClient,meter,site.id,opening,closing);
        }
      }catch(error){if((error as any)?.getStatus?.()!==409)throw error;boundaries=false;}
      items.push(add('site.boundary_readings',boundaries,'technical'));
    }
    return items;
  }

  async assertEnabled(action:FinancialWorkflowAction,context:FinancialWorkflowContext={},transactionClient?:PoolClient):Promise<{scope:FinancialScope;approvalId:string;policyHash:string}> {
    const local=await localTestReadiness(transactionClient??this.db);
    const publicAction=action==='issue_contract'?'issue':action==='send_contract'?'send':action==='submit_payment'?'approve_payment':action;
    if(local&&process.env.FINANCIAL_WRITES_ENABLED==='true'&&local.actions.includes(publicAction))return {scope:'TEST',approvalId:local.accountingApprovalId,policyHash:TEST_FINANCIAL_POLICY_HASH};
    if(!this.db)throw unavailable(['approval.confirmation']);
    const gate=async (client:PoolClient)=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('production-financial-configuration'))");
      if(action==='issue_contract'){
        const missingContext=[...(!context.contractId?['context.contract']:[]),...(!context.siteId?['context.site']:[])];
        if(missingContext.length)throw unavailable(missingContext,context);
        const contract=(await client.query<{id:string;site_id:string;status:string}>('SELECT id,site_id,status FROM contracts WHERE id=$1',[context.contractId])).rows[0];
        if(!contract)throw unavailable(['context.contract'],context);
        if(contract.site_id!==context.siteId)throw new BadRequestException('Contract and site context disagree');
        const status=await this.evaluate(client,{role:'owner'},{siteId:contract.site_id});
        const missing=[...status.actions.issue.missing,...(contract.status==='active'?[]:['site.contract'])];
        if(missing.length||status.scope!=='PRODUCTION'||!status.approval)throw unavailable([...new Set(missing)],context);
        return {scope:'PRODUCTION' as const,approvalId:status.approval.id,policyHash:(await this.configuration(client)).hash};
      }
      if(action==='send_contract'){
        if(!context.documentId)throw unavailable(['context.document']);
        const document=(await client.query(`SELECT d.*,a.pdf_bytes,a.sha256 FROM documents d JOIN contracts c ON c.id=d.contract_id AND c.site_id=d.site_id LEFT JOIN document_artifacts a ON a.document_id=d.id WHERE d.id=$1 AND d.document_type='contract' AND d.status='issued'`,[context.documentId])).rows[0];
        if(!document||document.id!==context.documentId)throw unavailable(['document.artifact']);
        if(context.siteId&&context.siteId!==document.site_id)throw new BadRequestException('Document and site context disagree');
        const status=await this.evaluate(client,{role:'owner'},{siteId:document.site_id});
        const missing=[...status.actions.issue.missing,...(!smtpReady()?['environment.smtp']:[])];
        try{originalArtifactHash(document);}catch{missing.push('document.artifact');}
        try{const frozen=frozenRecipients(document);const live=(await this.recipients(client,document.site_id,frozen.map(r=>r.id))).rows;if(live.length!==frozen.length||frozen.some(r=>!live.some(l=>l.id===r.id&&l.email===r.email)))missing.push('document.recipient');}catch{missing.push('document.recipient');}
        if(missing.length||status.scope!=='PRODUCTION'||!status.approval)throw unavailable([...new Set(missing)],{...context,siteId:document.site_id});
        return {scope:'PRODUCTION' as const,approvalId:status.approval.id,policyHash:(await this.configuration(client)).hash};
      }
      const status=await this.evaluate(client,{role:'owner'},context);
      const missing=[...status.actions[action==='submit_payment'?'issue':action].missing];
      if(!context.siteId&&!context.billingCycleId)missing.push('context.site');
      if(action!=='calculate'&&!context.billingCycleId)missing.push('context.cycle');
      if(action==='calculate'&&!context.billingCycleId&&(!context.periodStart||!context.periodEnd))missing.push('context.period');
      if(action==='submit_payment'&&context.billingCycleId){
        const invoice=(await client.query(`SELECT d.*,a.pdf_bytes,a.sha256 FROM documents d LEFT JOIN document_artifacts a ON a.document_id=d.id WHERE d.billing_cycle_id=$1 AND d.document_type='invoice' AND d.is_current AND d.status='issued'`,[context.billingCycleId])).rows[0];
        try{if(!invoice?.snapshot?.policy)throw Error('invoice');originalArtifactHash(invoice);}catch{missing.push('cycle.invoice');}
      }
      if(missing.length||status.scope!=='PRODUCTION'||!status.approval)throw unavailable([...new Set(missing)],context);
      const config=await this.configuration(client);
      return {scope:'PRODUCTION' as const,approvalId:status.approval.id,policyHash:config.hash};
    };
    return transactionClient?gate(transactionClient):this.db.transaction(gate);
  }

  async isLocalTestReady():Promise<boolean> {return !!await localTestReadiness(this.db);}

  /** Scheduler prerequisites are global; an incomplete site is handled by its own job. */
  async assertSchedulerEnabled():Promise<{scope:'PRODUCTION';approvalId:string}> {
    const missing:string[]=[];
    if(process.env.FINANCIAL_WRITES_ENABLED!=='true')missing.push('environment.financial_writes');
    if(process.env.FINANCIAL_SCHEDULER_ENABLED!=='true')missing.push('environment.scheduler');
    if(!smtpReady())missing.push('environment.smtp');
    if(!this.db)throw unavailable([...missing,'approval.confirmation']);
    return this.db.transaction(async client=>{
      await client.query("SELECT pg_advisory_xact_lock(hashtext('production-financial-configuration'))");
      const config=await this.configuration(client);
      missing.push(...config.items.filter(i=>!i.ready).map(i=>i.id));
      if(await localTestReadiness(client))missing.push('environment.scheduler');
      if(missing.length||!config.approval)throw unavailable([...new Set(missing)]);
      return {scope:'PRODUCTION',approvalId:config.approval.id};
    });
  }
  async capabilities(role:string,hasScope:boolean,actor:ScopePrincipal={role}):Promise<Capabilities> {
    const status=await this.status(actor);
    const allowed:FinancialAction[]=hasScope&&['owner','accountant'].includes(role)?[...ACTIONS]:[];
    const operationsActions=hasScope?[['read_invoice','GET','/v1/operations/documents/fixture'],['read_receipt','GET','/v1/operations/documents/fixture'],['submit_payment','POST','/v1/billing-cycles/fixture/pay'],['record_cash_payment','POST','/v1/billing-cycles/fixture/cash-payment']].filter(([,method,path])=>routeAllowed(role,method!,path!)).map(([action])=>action!):[];
    const invoiceApprovalActions=hasScope&&hasPermission(actor,'business.billing.approve')&&status.actions.issue.enabled?['approve_invoice']:[];
    return {...(status.scope?{financialScope:status.scope}:{}),operationsActions:[...operationsActions,...invoiceApprovalActions],actions:[...(hasScope&&routeAllowed(role,'POST','/v1/contracts')?['create_contract']:[]),...allowed.filter(a=>status.actions[a].enabled),...invoiceApprovalActions],unavailable:Object.fromEntries(allowed.filter(a=>!status.actions[a].enabled).map(a=>[a,'Financial workflows await verified accounting requirements and implementation readiness.']))};
  }
}
