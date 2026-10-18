import type {BillingStatusView,OperationPage,OperationRow} from "@solar/api-contracts";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { operationPageSql, operationPredicate, parseOperationQuery } from "./operation-query.js";
import { customerScope, type ScopePrincipal } from "../../common/auth/resource-scope.js";
import { siteScope,hasPermission } from '../../common/auth/authorization.js';

const siteConnectionStatus=`CASE WHEN si.status IN ('inactive','archived') THEN si.status WHEN EXISTS (SELECT 1 FROM gateways g WHERE g.site_id=si.id AND g.retired_at IS NULL AND g.last_seen_at<=now() AND g.last_seen_at>=now()-make_interval(secs=>greatest(120,g.polling_interval_seconds*2))) THEN 'online' ELSE 'offline' END`;
const approvedAmount="coalesce((SELECT sum(coalesce(verified_amount,amount)) FROM payments WHERE billing_cycle_id=b.id AND status='paid'),0)";
const daysOverdue="greatest(0,(now() AT TIME ZONE 'Asia/Bangkok')::date-b.due_date)";
const collectionStatus=`CASE WHEN b.status IN ('draft','cancelled','superseded') OR NOT EXISTS(SELECT 1 FROM documents invoice WHERE invoice.billing_cycle_id=b.id AND invoice.document_type='invoice' AND invoice.is_current AND invoice.status IN('issued','finalized')) THEN NULL WHEN ${approvedAmount}>=b.amount THEN 'paid' WHEN EXISTS(SELECT 1 FROM payments WHERE billing_cycle_id=b.id AND status='pending_verification') THEN 'pending_review' WHEN ${approvedAmount}>0 THEN 'partially_paid' WHEN ${daysOverdue}>0 THEN 'overdue' ELSE 'awaiting_payment' END`;
// Project once from the collection result so rows, tab filters, and counts cannot drift.
const billingStatusView=`CASE
 WHEN q.status='pending_issue_approval' OR q."pendingReplacement" IS NOT NULL THEN 'pending_issue_approval'
 WHEN q."collectionStatus"='pending_review' THEN 'pending_verification'
 WHEN q."collectionStatus"='partially_paid' THEN 'partially_paid'
 WHEN q."collectionStatus"='overdue' THEN 'overdue'
 WHEN q."collectionStatus"='paid' THEN 'paid'
 WHEN q."collectionStatus"='awaiting_payment' THEN 'awaiting_payment'
 ELSE 'unsuccessful' END`;

@Injectable()
export class OperationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  private source(resource: string, user?: ScopePrincipal) {
    const scope=['users','audit'].includes(resource)&&['owner','admin'].includes(user?.role??'')?null:siteScope(user,resource==='alerts'?'technical':'business');

    const where=scope===null?"TRUE":user?.role==='customer_user'?"si.id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM site_account_assignments access WHERE access.user_id=$2::uuid AND access.site_id=si.id AND access.revoked_at IS NULL)":"si.id=ANY($1::uuid[])";
    const params:unknown[]=scope===null?[]:user?.role==='customer_user'?[scope,user.id]:[scope];
    let sql:string; let columns:string[];
    switch(resource) {
      case "customers":
        sql=`SELECT s.id,to_char(s.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",s.name,s.code,s.region,s.status,(SELECT coalesce(sum(capacity_mwp),0) FROM sites WHERE customer_id=s.id) AS "capacityMwp",
          count(DISTINCT si.id)::int AS "sitesCount",count(DISTINCT g.id)::int AS "gatewaysCount"
          FROM customers s LEFT JOIN sites si ON si.customer_id=s.id LEFT JOIN gateways g ON g.site_id=si.id
          WHERE ${where} GROUP BY s.id ORDER BY s.name`;
        columns=["ชื่อลูกค้า","ภูมิภาค","กำลังติดตั้ง (MWp)","จำนวนไซต์","Gateway","สถานะ"];break;
      case "sites":
        sql=`SELECT si.id,si.external_site_id AS "externalSiteId",to_char(si.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",si.name,s.name AS "customerName",si.capacity_mwp AS "capacityMwp",${siteConnectionStatus} AS status,(SELECT to_char(service_start_date,'YYYY-MM-DD') FROM site_billing_settings WHERE site_id=si.id) AS "serviceStartDate"
          FROM sites si JOIN customers s ON s.id=si.customer_id WHERE ${where} ORDER BY si.name`;
        columns=["ชื่อไซต์","ลูกค้า","กำลังติดตั้ง (MWp)","วันเริ่มบริการ","สถานะ"];break;
      case "billing":
        sql=`SELECT b.id,b.site_id AS "siteId",b.contract_id AS "contractId",to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",to_char(b.period_end,'YYYY-MM-DD') AS "periodEnd",to_char(b.period_end,'YYYY-MM') AS period,s.name AS "customerName",si.external_site_id AS "externalSiteId",si.name AS "siteName",
          b.billing_kind AS "billingKind",to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",to_char(b.due_date,'YYYY-MM-DD') AS "dueDate",b.consumed_kwh AS "consumedKwh",b.rate,b.amount,b.simulated_tax::text AS "simulatedTax",b.status,b.quality,b.opening_energy AS "openingEnergy",b.closing_energy AS "closingEnergy",
          p.id AS "paymentId",p.status AS "paymentStatus",p.slip_url AS "slipUrl",p.slip_url AS "หลักฐานการชำระ",p.paid_at AS "paidAt",
          p.rejection_reason AS "rejectionReason",d.id AS "invoiceId",r.id AS "receiptId",d.document_number AS "invoiceNumber",r.document_number AS "receiptNumber",
          CASE WHEN ${approvedAmount}>=b.amount OR b.status IN('draft','cancelled','superseded') THEN 0 ELSE ${daysOverdue} END AS "daysOverdue",
          (SELECT count(DISTINCT split_part(o.dedupe_key,':',3))::int FROM operational_delivery_outbox o WHERE o.billing_cycle_id=b.id AND o.state='sent' AND starts_with(o.dedupe_key,'reminder:'||b.id::text||':')) AS "successfulReminderCount",
          ${collectionStatus} AS "collectionStatus",
          ${user?.role!=='customer_user'&&hasPermission(user,'business.billing.view')?`(SELECT jsonb_build_object('rate',proposal.snapshot->'cycle'->>'rate','subtotal',proposal.snapshot->'cycle'->>'subtotal','tax',proposal.snapshot->'cycle'->>'simulated_tax','amount',proposal.snapshot->'cycle'->>'amount','dueDate',proposal.snapshot->'cycle'->>'due_date') FROM billing_replacement_drafts proposal WHERE proposal.billing_cycle_id=b.id AND proposal.status='pending_issue_approval')`:'NULL::jsonb'} AS "pendingReplacement"
          FROM billing_cycles b JOIN sites si ON si.id=b.site_id JOIN customers s ON s.id=si.customer_id
          LEFT JOIN LATERAL (SELECT * FROM payments WHERE billing_cycle_id=b.id ORDER BY paid_at DESC NULLS LAST,id DESC LIMIT 1) p ON true
          LEFT JOIN LATERAL (SELECT id,document_number,issue_date FROM documents WHERE billing_cycle_id=b.id AND document_type='invoice' AND is_current ORDER BY revision DESC,id DESC LIMIT 1) d ON true
          LEFT JOIN LATERAL (SELECT id,document_number FROM documents WHERE billing_cycle_id=b.id AND document_type='receipt' AND is_current ORDER BY revision DESC,id DESC LIMIT 1) r ON true
          WHERE ${where} ORDER BY b.period_end DESC,si.name`;
        columns=["รอบบิล","ลูกค้า","ไซต์","พลังงาน (kWh)","อัตรา (฿/kWh)","ยอดเงิน (฿)","หลักฐานการชำระ","สถานะ"];break;
      case "contracts":
        sql=`SELECT c.id,c.site_id AS "siteId",(SELECT d.document_number FROM documents d WHERE d.contract_id=c.id AND d.document_type='contract') AS "contractNumber",(SELECT d.id FROM documents d WHERE d.contract_id=c.id AND d.document_type='contract') AS "documentId",s.name AS "customerName",si.external_site_id AS "externalSiteId",si.name AS "siteName",c.version,
          to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",r.rate,c.signer_name AS signers,c.status,
          c.tax_id AS "taxId",c.company_name AS "companyName",c.branch AS "taxBranch",c.tax_address AS "taxAddress",c.billing_email AS "taxEmail",c.billing_phone AS "taxPhone",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('startDate',rv.effective_from,'endDate',rv.effective_to,'rate',rv.rate) ORDER BY rv.effective_from),'[]'::jsonb) FROM rate_versions rv WHERE rv.contract_id=c.id) AS rates
          FROM contracts c JOIN sites si ON si.id=c.site_id JOIN customers s ON s.id=si.customer_id
          LEFT JOIN LATERAL (SELECT rate FROM rate_versions WHERE contract_id=c.id AND effective_from<=current_date
          AND (effective_to IS NULL OR effective_to>=current_date) ORDER BY effective_from DESC LIMIT 1) r ON true
          WHERE ${where} ORDER BY c.start_date DESC`;
        columns=["เลขที่สัญญา","ลูกค้า","เวอร์ชัน","วันเริ่มต้น","อัตราค่าไฟ (฿)","คู่สัญญา","สถานะ"];break;
      case "documents":case "receipts":
        sql=`SELECT d.id,d.site_id AS "siteId",d.billing_cycle_id AS "billingCycleId",(SELECT to_char(period_end,'YYYY-MM') FROM billing_cycles WHERE id=d.billing_cycle_id) AS period,(SELECT contract_id FROM billing_cycles WHERE id=d.billing_cycle_id) AS "contractId",d.document_number AS "documentNumber",
          d.document_number AS "receiptNumber",CASE WHEN d.document_type='receipt' AND d.snapshot->'policy'->>'scope'='TEST' THEN d.document_number ELSE NULL END AS "taxInvoiceNumber",d.document_type AS type,s.name AS "customerName",si.external_site_id AS "externalSiteId",si.name AS "siteName",
          to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",d.amount,d.amount AS "totalAmount",d.status,to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",
          CASE WHEN d.document_type='receipt' AND d.is_current AND d.status IN('issued','finalized') AND ${collectionStatus}='paid' THEN 'paid' ELSE NULL END AS "collectionStatus"
          FROM documents d JOIN sites si ON si.id=d.site_id JOIN customers s ON s.id=si.customer_id
          LEFT JOIN billing_cycles b ON b.id=d.billing_cycle_id
          WHERE ${where} ${resource==="receipts"?"AND d.document_type='receipt'":""} ORDER BY d.issue_date DESC`;
        columns=resource==="receipts"?["เลขที่ใบเสร็จ","เลขที่ใบกำกับภาษี","ลูกค้า","วันที่ออก","ยอดเงินสุทธิ (฿)","สถานะ"]:["เลขที่เอกสาร","ประเภท","ลูกค้า","วันที่ออก","จำนวนเงิน (฿)","สถานะ"];break;
      case "alerts":
        sql=`SELECT a.id,si.external_site_id AS "externalSiteId",si.name AS "siteName",a.id::text AS "alertId",a.title,a.detail,a.severity,a.occurred_at AS "occurredAt",a.status FROM alerts a
          JOIN sites si ON si.id=a.site_id JOIN customers s ON s.id=si.customer_id WHERE ${where} ORDER BY a.occurred_at DESC`;
        columns=["รหัสแจ้งเตือน","หัวข้อ","รายละเอียด","ระดับความรุนแรง","เวลาที่เกิด","สถานะ"];break;
      case "notifications":
        sql=`SELECT id,title,channel,recipient,created_at AS "sentAt",status,job_id AS "jobId" FROM notification_deliveries WHERE user_id=$1 ORDER BY created_at DESC`;
        params.splice(0,params.length,user?.id);columns=["หัวข้อข้อความ","ช่องทาง","ผู้รับ","เวลาที่ส่ง","สถานะ"];break;
      case "reports":
        sql=`SELECT id,title,report_type AS category,date_from::text||' – '||date_to::text AS scope,upper(format) AS format,status,
          created_at AS "generatedAt",octet_length(content)::text||' bytes' AS "fileSize",'/v1/reports/'||id::text||'/download' AS "downloadUrl"
          FROM generated_reports WHERE created_by=$1 ORDER BY created_at DESC`;
        params.splice(0,params.length,user?.id);columns=["ชื่อรายงาน","หมวดหมู่","ขอบเขตข้อมูล","รูปแบบ","สถานะ"];break;
      case "users":
        if(!["owner","admin"].includes(user?.role??"")) throw new ForbiddenException();
        sql=`SELECT u.id,u.display_name AS "displayName",u.email,u.role,s.name AS "customerName",u.status,to_char(u.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",
          (SELECT max(a.occurred_at) FROM audit_events a WHERE a.actor_id=u.id AND a.action='user.login') AS "lastActive"
          FROM users u LEFT JOIN customers s ON s.id=u.customer_id WHERE ${where} ORDER BY u.display_name`;
        columns=["ชื่อผู้ใช้งาน","อีเมล","บทบาท","สังกัดลูกค้า","การใช้งานล่าสุด","สถานะ"];break;
      case "audit":
        if(!["owner","admin"].includes(user?.role??"")) throw new ForbiddenException();
        sql=`SELECT a.id,a.occurred_at AS time,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",u.display_name AS actor,
          a.correlation_id AS "correlationId",a.reason,
          a.before_json AS "beforeJson",a.after_json AS "afterJson"
          FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN customers s ON s.id=u.customer_id
          WHERE ${where} AND starts_with(a.action,'${user?.role==='owner'?'business':'technical'}.') ORDER BY a.occurred_at DESC LIMIT 500`;
        columns=["เวลา","การดำเนินการ","ประเภทข้อมูล","รหัสอ้างอิง","ผู้ดำเนินการ","เหตุผล"];break;
      default:throw new NotFoundException("Unknown resource");
    }
        // The outer query owns ordering and applies a bound to every resource.
    sql=sql.slice(0,sql.lastIndexOf(' ORDER BY '));
    if(resource==='billing')sql=`SELECT q.*,${billingStatusView} AS "billingStatusView" FROM (${sql}) q`;
    return {sql,params,columns,scope};
  }
  async list(resource:string,user?:ScopePrincipal,raw:Record<string,unknown>={}):Promise<OperationPage<OperationRow>> {
    const query=parseOperationQuery(resource,raw);
    const {sql:source,params,columns,scope}=this.source(resource,user);
    // Keep the scope-only parameters before pagination appends filters/cursor/limit.
    const facetParams=[...params];
    const billingStatusCounts:Record<BillingStatusView,number>|undefined=resource==='billing'?{all:0,pending_issue_approval:0,awaiting_payment:0,pending_verification:0,partially_paid:0,overdue:0,paid:0,unsuccessful:0}:undefined;
    const facets=billingStatusCounts?{facets:{billingStatusCounts}}:{};
    const pageQuery=operationPageSql(resource,source,params,query,user,scope);
    if(scope?.length===0) return {columns,rows:[],idKey:'id',page:{limit:query.limit,nextCursor:null,hasMore:false},...facets};
    const result=await this.db.query<OperationRow>(pageQuery.sql,params);
    const hasMore=result.rows.length>query.limit;
    const rows=result.rows.slice(0,query.limit);
    const nextCursor=hasMore?pageQuery.cursor(rows.at(-1)!):null;
    for(const row of rows) delete row.__operationCursorValue;
    if(billingStatusCounts){
      const {billingStatusView:_selectedStatus,...facetQuery}=query;
      const filter=operationPredicate(resource,facetQuery,facetParams).join(' AND ')||'TRUE';
      const counts=await this.db.query<{status:Exclude<BillingStatusView,'all'>;count:number}>(`SELECT q."billingStatusView" AS status,count(*)::int AS count FROM (${source}) q WHERE ${filter} GROUP BY q."billingStatusView"`,facetParams);
      for(const row of counts.rows){billingStatusCounts[row.status]=Number(row.count);billingStatusCounts.all+=Number(row.count);}
    }
    return {columns,rows,idKey:'id',page:{limit:query.limit,nextCursor,hasMore},...facets};
  }
  async detail(resource:string,id:string,user?:ScopePrincipal) {
    if(resource === 'contracts' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Record not found');
    const {sql,params,columns}=this.source(resource,user);
    params.push(id);
    const result=await this.db.query<OperationRow>(`SELECT q.* FROM (${sql}) q WHERE q.id=$${params.length}::uuid`,params);
    if(!result.rows[0]) throw new NotFoundException('Record not found');
    if(resource==='billing')result.rows[0].payments=(await this.db.query(`SELECT id,amount::text AS amount,verified_amount::text AS "verifiedAmount",verified_transfer_at AS "verifiedTransferAt",declared_amount::text AS "declaredAmount",declared_transfer_at AS "declaredTransferAt",slip_url AS "slipUrl",note,submitted_by AS "submittedBy",(SELECT display_name FROM users WHERE users.id=payments.submitted_by) AS "submittedByName",transfer_reference AS "transferReference",status,paid_at AS "transferDate",submitted_at AS "submittedAt",verified_at AS "verifiedAt",rejection_reason AS "rejectionReason",evidence_key AS "evidenceKey",payer_name AS "payerName",payment_method AS "paymentMethod",origin_bank AS "originBank",origin_account AS "originAccount" FROM payments WHERE billing_cycle_id=$1 ORDER BY submitted_at,id`,[id])).rows;
    return {columns,row:result.rows[0]};
  }
  async document(id:string,user?:ScopePrincipal) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Document not found');
    const scope=siteScope(user,'business');
    const params:unknown[]=[id];
    if(scope!==null)params.push(scope,user?.role==='customer_user'?user.id:null);
    const result=await this.db.query<{id:string;documentNumber:string;[key:string]:unknown}>(`SELECT d.id,d.site_id AS "siteId",d.billing_cycle_id AS "billingCycleId",(SELECT contract_id FROM billing_cycles WHERE id=d.billing_cycle_id) AS "contractId",d.document_number AS "documentNumber",d.document_type AS "documentType",d.status,to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",d.amount,d.file_key AS "fileKey" FROM documents d JOIN sites si ON si.id=d.site_id WHERE d.id=$1 ${scope===null?'':'AND si.id=ANY($2::uuid[]) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM site_account_assignments access WHERE access.user_id=$3::uuid AND access.site_id=si.id AND access.revoked_at IS NULL))'}`,params);
    if(!result.rows[0])throw new NotFoundException('Document not found');
    const artifact=(await this.db.query('SELECT sha256 FROM document_artifacts WHERE document_id=$1',[id])).rows[0];
    if(artifact)return {...result.rows[0],downloadUrl:`/v1/operations/documents/${id}/pdf`,previewUrl:`/v1/operations/documents/${id}/pdf`,contentHash:artifact.sha256};
    return {...result.rows[0],previewUnavailableReason:'เอกสารต้นฉบับที่ตรวจสอบยังไม่พร้อมใช้งาน'};
  }
  async contractRecipientOptions(siteId:string,user?:ScopePrincipal) {
    if(!hasPermission(user,'business.billing.edit'))throw new ForbiddenException('Contract author required');
    if(!/^[0-9a-f-]{36}$/i.test(siteId))throw new NotFoundException('Site not found');
    return (await this.db.query(`SELECT u.id,u.email,u.display_name AS "displayName" FROM users u JOIN site_account_assignments assignment ON assignment.user_id=u.id AND assignment.revoked_at IS NULL JOIN sites s ON s.id=assignment.site_id AND s.customer_id=u.customer_id JOIN customers sc ON sc.id=s.customer_id WHERE s.id=$1 AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[])) AND sc.status='active' AND u.role='customer_user' AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.display_name,u.id`,[siteId,siteScope(user,'business')])).rows;
  }
  async documentPdf(id:string,user?:ScopePrincipal) {
    const document=await this.document(id,user);
    const artifact=(await this.db.query<{pdf_bytes:Buffer;sha256:string}>('SELECT pdf_bytes,sha256 FROM document_artifacts WHERE document_id=$1',[id])).rows[0];
    if(!artifact)throw new NotFoundException('Original issued PDF unavailable');return {...artifact,documentNumber:document.documentNumber};
  }
  async summary(resource:string,user?:ScopePrincipal,raw:Record<string,unknown>={}) {
    const query=parseOperationQuery(resource,raw);
    // Independent aggregate statement; never calls list or transfers history rows.
    const {scope}=this.source(resource,user);
    const params:unknown[]=scope===null?[]:user?.role==='customer_user'?[scope,user.id]:[scope];
    const where=scope===null?'TRUE':user?.role==='customer_user'?"si.id=ANY($1::uuid[]) AND EXISTS(SELECT 1 FROM site_account_assignments access WHERE access.user_id=$2::uuid AND access.site_id=si.id AND access.revoked_at IS NULL)":'si.id=ANY($1::uuid[])';
    const join=' JOIN sites si ON si.id=x.site_id JOIN customers s ON s.id=si.customer_id';
    let source:string;
    switch(resource) {
      case 'billing': source=this.source(resource,user).sql;break;
      case 'receipts':source=this.source(resource,user).sql;break;
      case 'documents': source=`SELECT x.id,x.document_number AS "documentNumber",x.document_type AS type,s.name AS "customerName",si.external_site_id AS "externalSiteId",si.name AS "siteName",x.status,x.amount,to_char(x.issue_date,'YYYY-MM-DD') AS "issueDate" FROM documents x${join} WHERE ${where}`;break;
      case 'sites':source=`SELECT si.id,si.external_site_id AS "externalSiteId",to_char(si.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",si.name,s.name AS "customerName",si.capacity_mwp AS "capacityMwp",${siteConnectionStatus} AS status,(SELECT to_char(service_start_date,'YYYY-MM-DD') FROM site_billing_settings WHERE site_id=si.id) AS "serviceStartDate" FROM sites si JOIN customers s ON s.id=si.customer_id WHERE ${where}`;break;
      case 'customers':source=`SELECT DISTINCT s.id,to_char(s.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",s.name,s.code,s.region,s.status FROM customers s JOIN sites si ON si.customer_id=s.id WHERE ${where}`;break;
      case 'contracts':source=`SELECT x.id,(SELECT d.document_number FROM documents d WHERE d.contract_id=x.id AND d.document_type='contract') AS "contractNumber",s.name AS "customerName",si.external_site_id AS "externalSiteId",si.name AS "siteName",x.signer_name AS signers,x.status,to_char(x.start_date,'YYYY-MM-DD') AS "startDate" FROM contracts x${join} WHERE ${where}`;break;
      case 'alerts':source=`SELECT x.id,x.title,x.detail,x.severity,x.status,x.occurred_at AS "occurredAt" FROM alerts x${join} WHERE ${where}`;break;
      case 'notifications':params.splice(0,params.length,user?.id);source='SELECT id,title,channel,recipient,status,created_at AS "sentAt" FROM notification_deliveries WHERE user_id=$1';break;
      case 'reports':params.splice(0,params.length,user?.id);source='SELECT id,title,report_type AS category,status,upper(format) AS format,created_at AS "generatedAt" FROM generated_reports WHERE created_by=$1';break;
      case 'users':source=`SELECT u.id,to_char(u.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",u.display_name AS "displayName",u.email,u.role,u.status FROM users u LEFT JOIN customers s ON s.id=u.customer_id WHERE ${where}`;break;
      case 'audit':source=`SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",u.display_name AS actor,a.reason,a.correlation_id AS "correlationId",a.occurred_at AS time FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN customers s ON s.id=u.customer_id WHERE ${where} AND starts_with(a.action,'${user?.role==='owner'?'business':'technical'}.')`;break;
      default:throw new NotFoundException('Unknown resource');
    }
    const filter=operationPredicate(resource,query,params).join(' AND ')||'TRUE';
    const totals=resource==='billing'?",count(*) FILTER (WHERE q.\"billingStatusView\"='paid')::int AS paid,coalesce(sum(q.amount),0) AS amount,coalesce(sum(q.amount) FILTER (WHERE q.\"billingStatusView\"='paid'),0) AS paid_amount":resource==='documents'||resource==='receipts'?',coalesce(sum(q.amount),0) AS amount':resource==='sites'?",count(*) FILTER (WHERE q.status NOT IN ('inactive','archived'))::int AS active,coalesce(sum(q.\"capacityMwp\"),0) AS capacity":'';
    const {rows}=await this.db.query(`SELECT count(*)::int AS count${totals} FROM (${source}) q WHERE ${filter}`,params);
    const r=rows[0]!;
    const item=(label:string,value:unknown,unit:string)=>({label,value:Number(value),unit,note:'จากข้อมูลในระบบ'});
    if(resource==='sites')return [item('ไซต์งานทั้งหมด',r.count,'ไซต์'),item('เปิดใช้งาน',r.active,'ไซต์'),item('กำลังติดตั้งรวม',r.capacity,'MWp')];
    if(resource==='billing')return [item('ใบวางบิล',r.count,'ฉบับ'),item('บิลที่จ่ายแล้ว',r.paid,'ฉบับ'),item('ยอดเรียกเก็บรวม',r.amount,'บาท'),item('ชำระแล้ว',r.paid_amount,'บาท')];
    if(resource==='receipts'||resource==='documents')return [item('เอกสารทั้งหมด',r.count,'ฉบับ'),item('ยอดรวม',r.amount,'บาท')];
    return [item('รายการทั้งหมด',r.count,'รายการ')];
  }
}
