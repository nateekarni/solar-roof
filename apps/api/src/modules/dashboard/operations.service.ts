import type {OperationPage,OperationRow} from "@solar/api-contracts";
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { operationPageSql, operationPredicate, parseOperationQuery } from "./operation-query.js";
import { schoolScope, type ScopePrincipal } from "../../common/auth/resource-scope.js";

@Injectable()
export class OperationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  private source(resource: string, user?: ScopePrincipal) {
    const scope=schoolScope(user);

    const where=scope===null?"TRUE":"s.id=ANY($1::uuid[])";
    const params:unknown[]=scope===null?[]:[scope];
    let sql:string; let columns:string[];
    switch(resource) {
      case "schools":
        sql=`SELECT s.id,to_char(s.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",s.name,s.code,s.region,s.status,(SELECT coalesce(sum(capacity_mwp),0) FROM sites WHERE school_id=s.id) AS "capacityMwp",
          count(DISTINCT si.id)::int AS "sitesCount",count(DISTINCT g.id)::int AS "gatewaysCount"
          FROM schools s LEFT JOIN sites si ON si.school_id=s.id LEFT JOIN gateways g ON g.site_id=si.id
          WHERE ${where} GROUP BY s.id ORDER BY s.name`;
        columns=["ชื่อโรงเรียน","ภูมิภาค","กำลังติดตั้ง (MWp)","จำนวนไซต์","Gateway","สถานะ"];break;
      case "sites":
        sql=`SELECT si.id,si.external_site_id AS "externalSiteId",to_char(si.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",si.name,s.name AS "schoolName",si.capacity_mwp AS "capacityMwp",
          g.external_gateway_id AS "externalGatewayId",g.id AS "gatewayId",g.name AS gateway,g.protocol,g.last_seen_at AS "lastSeenAt",g.last_seen_at AS "lastUpdated",
          CASE WHEN si.status IN ('inactive','archived') THEN si.status WHEN g.last_seen_at>=now()-interval '2 minutes' THEN 'online' ELSE 'offline' END AS status,
          energy.kwh AS "productionKwh" FROM sites si JOIN schools s ON s.id=si.school_id LEFT JOIN LATERAL (SELECT * FROM gateways WHERE site_id=si.id ORDER BY id LIMIT 1) g ON true
          LEFT JOIN LATERAL (SELECT sum(r.delta) AS kwh FROM (
            SELECT tr.device_id,greatest(max(tr.normalized_value)-min(tr.normalized_value),0) AS delta
            FROM telemetry_raw tr JOIN billing_meters bm ON bm.device_id=tr.device_id AND bm.active
            WHERE tr.site_id=si.id AND tr.semantic_field='total_energy' AND tr.quality='complete'
            AND tr.source_time>=date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'
            GROUP BY tr.device_id HAVING count(*)>1) r) energy ON true
          WHERE ${where} ORDER BY si.name`;
        columns=["ชื่อไซต์","โรงเรียน","กำลังติดตั้ง (MWp)","Gateway","โพรโทคอล","พลังงานวันนี้ (kWh)","อัปเดตล่าสุด","สถานะ"];break;
      case "billing":
        sql=`SELECT b.id,b.site_id AS "siteId",b.contract_id AS "contractId",to_char(b.period_start,'YYYY-MM-DD') AS "periodStart",to_char(b.period_end,'YYYY-MM-DD') AS "periodEnd",to_char(b.period_end,'YYYY-MM') AS period,s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",
          b.consumed_kwh AS "consumedKwh",b.rate,b.amount,b.status,b.quality,b.opening_energy AS "openingEnergy",b.closing_energy AS "closingEnergy",
          p.id AS "paymentId",p.status AS "paymentStatus",p.slip_url AS "slipUrl",p.slip_url AS "หลักฐานการชำระ",p.paid_at AS "paidAt",
          p.rejection_reason AS "rejectionReason",d.id AS "invoiceId",r.id AS "receiptId",d.document_number AS "invoiceNumber",r.document_number AS "receiptNumber"
          FROM billing_cycles b JOIN sites si ON si.id=b.site_id JOIN schools s ON s.id=si.school_id
          LEFT JOIN LATERAL (SELECT * FROM payments WHERE billing_cycle_id=b.id ORDER BY paid_at DESC NULLS LAST,id DESC LIMIT 1) p ON true
          LEFT JOIN LATERAL (SELECT id,document_number FROM documents WHERE billing_cycle_id=b.id AND document_type='invoice' ORDER BY issue_date DESC,id DESC LIMIT 1) d ON true
          LEFT JOIN LATERAL (SELECT id,document_number FROM documents WHERE billing_cycle_id=b.id AND document_type='receipt' ORDER BY issue_date DESC,id DESC LIMIT 1) r ON true
          WHERE ${where} ORDER BY b.period_end DESC,si.name`;
        columns=["รอบบิล","โรงเรียน","ไซต์","พลังงาน (kWh)","อัตรา (฿/kWh)","ยอดเงิน (฿)","หลักฐานการชำระ","สถานะ"];break;
      case "contracts":
        sql=`SELECT c.id,c.site_id AS "siteId",(SELECT d.document_number FROM documents d WHERE d.contract_id=c.id AND d.document_type='contract') AS "contractNumber",(SELECT d.id FROM documents d WHERE d.contract_id=c.id AND d.document_type='contract') AS "documentId",s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",c.version,
          to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",r.rate,c.signer_name AS signers,c.status,
          c.tax_id AS "taxId",c.company_name AS "companyName",c.branch AS "taxBranch",c.tax_address AS "taxAddress",c.billing_email AS "taxEmail",c.billing_phone AS "taxPhone",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('startDate',rv.effective_from,'endDate',rv.effective_to,'rate',rv.rate) ORDER BY rv.effective_from),'[]'::jsonb) FROM rate_versions rv WHERE rv.contract_id=c.id) AS rates
          FROM contracts c JOIN sites si ON si.id=c.site_id JOIN schools s ON s.id=si.school_id
          LEFT JOIN LATERAL (SELECT rate FROM rate_versions WHERE contract_id=c.id AND effective_from<=current_date
          AND (effective_to IS NULL OR effective_to>=current_date) ORDER BY effective_from DESC LIMIT 1) r ON true
          WHERE ${where} ORDER BY c.start_date DESC`;
        columns=["เลขที่สัญญา","โรงเรียน","เวอร์ชัน","วันเริ่มต้น","อัตราค่าไฟ (฿)","คู่สัญญา","สถานะ"];break;
      case "documents":case "receipts":
        sql=`SELECT d.id,d.site_id AS "siteId",d.billing_cycle_id AS "billingCycleId",(SELECT contract_id FROM billing_cycles WHERE id=d.billing_cycle_id) AS "contractId",d.document_number AS "documentNumber",
          d.document_number AS "receiptNumber",CASE WHEN d.document_type='receipt' AND d.snapshot->'policy'->>'scope'='TEST' THEN d.document_number ELSE NULL END AS "taxInvoiceNumber",d.document_type AS type,s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",
          to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",d.amount,d.amount AS "totalAmount",d.status
          FROM documents d JOIN sites si ON si.id=d.site_id JOIN schools s ON s.id=si.school_id
          WHERE ${where} ${resource==="receipts"?"AND d.document_type='receipt'":""} ORDER BY d.issue_date DESC`;
        columns=resource==="receipts"?["เลขที่ใบเสร็จ","เลขที่ใบกำกับภาษี","โรงเรียน","วันที่ออก","ยอดเงินสุทธิ (฿)","สถานะ"]:["เลขที่เอกสาร","ประเภท","โรงเรียน","วันที่ออก","จำนวนเงิน (฿)","สถานะ"];break;
      case "alerts":
        sql=`SELECT a.id,si.external_site_id AS "externalSiteId",si.name AS "siteName",a.id::text AS "alertId",a.title,a.detail,a.severity,a.occurred_at AS "occurredAt",a.status FROM alerts a
          JOIN sites si ON si.id=a.site_id JOIN schools s ON s.id=si.school_id WHERE ${where} ORDER BY a.occurred_at DESC`;
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
        sql=`SELECT u.id,u.display_name AS "displayName",u.email,u.role,s.name AS "schoolName",u.status,to_char(u.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",
          (SELECT max(a.occurred_at) FROM audit_events a WHERE a.actor_id=u.id AND a.action='user.login') AS "lastActive"
          FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE ${where} ORDER BY u.display_name`;
        columns=["ชื่อผู้ใช้งาน","อีเมล","บทบาท","สังกัดโรงเรียน","การใช้งานล่าสุด","สถานะ"];break;
      case "audit":
        if(!["owner","admin"].includes(user?.role??"")) throw new ForbiddenException();
        sql=`SELECT a.id,a.occurred_at AS time,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",u.display_name AS actor,
          a.correlation_id AS "correlationId",a.reason,a.before_json AS "beforeJson",a.after_json AS "afterJson"
          FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN schools s ON s.id=u.school_id
          WHERE ${where} ORDER BY a.occurred_at DESC LIMIT 500`;
        columns=["เวลา","การดำเนินการ","ประเภทข้อมูล","รหัสอ้างอิง","ผู้ดำเนินการ","เหตุผล"];break;
      default:throw new NotFoundException("Unknown resource");
    }
        // The outer query owns ordering and applies a bound to every resource.
    sql=sql.slice(0,sql.lastIndexOf(' ORDER BY '));
    return {sql,params,columns,scope};
  }
  async list(resource:string,user?:ScopePrincipal,raw:Record<string,unknown>={}):Promise<OperationPage<OperationRow>> {
    const query=parseOperationQuery(resource,raw);
    const {sql:source,params,columns,scope}=this.source(resource,user);
    const pageQuery=operationPageSql(resource,source,params,query,user,scope);
    if(scope?.length===0) return {columns,rows:[],idKey:'id',page:{limit:query.limit,nextCursor:null,hasMore:false}};
    const result=await this.db.query<OperationRow>(pageQuery.sql,params);
    const hasMore=result.rows.length>query.limit;
    const rows=result.rows.slice(0,query.limit);
    const nextCursor=hasMore?pageQuery.cursor(rows.at(-1)!):null;
    for(const row of rows) delete row.__operationCursorValue;
    return {columns,rows,idKey:'id',page:{limit:query.limit,nextCursor,hasMore}};
  }
  async detail(resource:string,id:string,user?:ScopePrincipal) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Record not found');
    const {sql,params,columns}=this.source(resource,user);
    params.push(id);
    const result=await this.db.query<OperationRow>(`SELECT q.* FROM (${sql}) q WHERE q.id=$${params.length}::uuid`,params);
    if(!result.rows[0]) throw new NotFoundException('Record not found');
    if(resource==='billing')result.rows[0].payments=(await this.db.query(`SELECT id,amount::text AS amount,status,paid_at AS "transferDate",submitted_at AS "submittedAt",verified_at AS "verifiedAt",rejection_reason AS "rejectionReason",evidence_key AS "evidenceKey",payer_name AS "payerName",payment_method AS "paymentMethod",origin_bank AS "originBank",origin_account AS "originAccount" FROM payments WHERE billing_cycle_id=$1 ORDER BY submitted_at,id`,[id])).rows;
    return {columns,row:result.rows[0]};
  }
  async document(id:string,user?:ScopePrincipal) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new NotFoundException('Document not found');
    const scope=schoolScope(user);
    const params:unknown[]=[id];
    if(scope!==null)params.push(scope);
    const result=await this.db.query<{id:string;documentNumber:string;[key:string]:unknown}>(`SELECT d.id,d.site_id AS "siteId",d.billing_cycle_id AS "billingCycleId",(SELECT contract_id FROM billing_cycles WHERE id=d.billing_cycle_id) AS "contractId",d.document_number AS "documentNumber",d.document_type AS "documentType",d.status,to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",d.amount,d.file_key AS "fileKey" FROM documents d JOIN sites si ON si.id=d.site_id WHERE d.id=$1 ${scope===null?'':'AND si.school_id=ANY($2::uuid[])'}`,params);
    if(!result.rows[0])throw new NotFoundException('Document not found');
    const artifact=(await this.db.query('SELECT sha256 FROM document_artifacts WHERE document_id=$1',[id])).rows[0];
    if(artifact)return {...result.rows[0],downloadUrl:`/v1/operations/documents/${id}/pdf`,previewUrl:`/v1/operations/documents/${id}/pdf`,contentHash:artifact.sha256};
    return {...result.rows[0],previewUnavailableReason:'เอกสารต้นฉบับที่ตรวจสอบยังไม่พร้อมใช้งาน'};
  }
  async contractRecipientOptions(siteId:string,user?:ScopePrincipal) {
    if(!['owner','admin'].includes(user?.role??''))throw new ForbiddenException('Contract author required');
    if(!/^[0-9a-f-]{36}$/i.test(siteId))throw new NotFoundException('Site not found');
    return (await this.db.query(`SELECT u.id,u.email,u.display_name AS "displayName" FROM users u JOIN sites s ON s.school_id=u.school_id JOIN schools sc ON sc.id=s.school_id WHERE s.id=$1 AND sc.status='active' AND u.role='school_user' AND u.status='active' AND u.email_verified_at IS NOT NULL AND u.verified_email=u.email ORDER BY u.display_name,u.id`,[siteId])).rows;
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
    const params:unknown[]=scope===null?[]:[scope];
    const where=scope===null?'TRUE':'s.id=ANY($1::uuid[])';
    const join=' JOIN sites si ON si.id=x.site_id JOIN schools s ON s.id=si.school_id';
    let source:string;
    switch(resource) {
      case 'billing': source=`SELECT x.id,to_char(x.period_end,'YYYY-MM') AS period,s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",x.status,x.amount FROM billing_cycles x${join} WHERE ${where}`;break;
      case 'documents':case 'receipts': source=`SELECT x.id,x.document_number AS "documentNumber",x.document_type AS type,s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",x.status,x.amount,to_char(x.issue_date,'YYYY-MM-DD') AS "issueDate" FROM documents x${join} WHERE ${where}${resource==='receipts'?" AND x.document_type='receipt'":''}`;break;
      case 'sites':source=`SELECT si.id,si.external_site_id AS "externalSiteId",to_char(si.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",si.name,s.name AS "schoolName",si.capacity_mwp AS "capacityMwp",CASE WHEN si.status IN ('inactive','archived') THEN si.status WHEN g.last_seen_at>=now()-interval '2 minutes' THEN 'online' ELSE 'offline' END AS status FROM sites si JOIN schools s ON s.id=si.school_id LEFT JOIN LATERAL (SELECT last_seen_at FROM gateways WHERE site_id=si.id ORDER BY id LIMIT 1) g ON true WHERE ${where}`;break;
      case 'schools':source=`SELECT s.id,to_char(s.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",s.name,s.code,s.region FROM schools s WHERE ${where}`;break;
      case 'contracts':source=`SELECT x.id,(SELECT d.document_number FROM documents d WHERE d.contract_id=x.id AND d.document_type='contract') AS "contractNumber",s.name AS "schoolName",si.external_site_id AS "externalSiteId",si.name AS "siteName",x.signer_name AS signers,x.status,to_char(x.start_date,'YYYY-MM-DD') AS "startDate" FROM contracts x${join} WHERE ${where}`;break;
      case 'alerts':source=`SELECT x.id,x.title,x.detail,x.severity,x.status,x.occurred_at AS "occurredAt" FROM alerts x${join} WHERE ${where}`;break;
      case 'notifications':params.splice(0,params.length,user?.id);source='SELECT id,title,channel,recipient,status,created_at AS "sentAt" FROM notification_deliveries WHERE user_id=$1';break;
      case 'reports':params.splice(0,params.length,user?.id);source='SELECT id,title,report_type AS category,status,created_at AS "generatedAt" FROM generated_reports WHERE created_by=$1';break;
      case 'users':source=`SELECT u.id,to_char(u.created_at AT TIME ZONE 'Asia/Bangkok','YYYY-MM-DD') AS "createdAt",u.display_name AS "displayName",u.email,u.role,u.status FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE ${where}`;break;
      case 'audit':source=`SELECT a.id,a.action,a.entity_type AS "entityType",a.entity_id AS "entityId",u.display_name AS actor,a.reason,a.correlation_id AS "correlationId",a.occurred_at AS time FROM audit_events a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN schools s ON s.id=u.school_id WHERE ${where}`;break;
      default:throw new NotFoundException('Unknown resource');
    }
    const filter=operationPredicate(resource,query,params).join(' AND ')||'TRUE';
    const totals=resource==='billing'?",count(*) FILTER (WHERE q.status='paid')::int AS paid,coalesce(sum(q.amount),0) AS amount,coalesce(sum(q.amount) FILTER (WHERE q.status='paid'),0) AS paid_amount":resource==='documents'||resource==='receipts'?',coalesce(sum(q.amount),0) AS amount':resource==='sites'?",count(*) FILTER (WHERE q.status='online')::int AS online,coalesce(sum(q.\"capacityMwp\"),0) AS capacity":'';
    const {rows}=await this.db.query(`SELECT count(*)::int AS count${totals} FROM (${source}) q WHERE ${filter}`,params);
    const r=rows[0]!;
    const item=(label:string,value:unknown,unit:string)=>({label,value:Number(value),unit,note:'จากข้อมูลในระบบ'});
    if(resource==='sites')return [item('ไซต์งานทั้งหมด',r.count,'ไซต์'),item('ออนไลน์',r.online,'ไซต์'),item('กำลังติดตั้งรวม',r.capacity,'MWp')];
    if(resource==='billing')return [item('ใบเรียกเก็บเงิน',r.count,'ฉบับ'),item('บิลที่จ่ายแล้ว',r.paid,'ฉบับ'),item('ยอดเรียกเก็บรวม',r.amount,'บาท'),item('ชำระแล้ว',r.paid_amount,'บาท')];
    if(resource==='receipts'||resource==='documents')return [item('เอกสารทั้งหมด',r.count,'ฉบับ'),item('ยอดรวม',r.amount,'บาท')];
    return [item('รายการทั้งหมด',r.count,'รายการ')];
  }
}





