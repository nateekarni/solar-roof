import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";
import { schoolScope, type ScopePrincipal } from "../../common/auth/resource-scope.js";

@Injectable()
export class OperationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async list(resource: string, user?: ScopePrincipal) {
    const scope=schoolScope(user);
    if(scope?.length===0) return {columns:[],rows:[],idKey:"id"};
    const where=scope===null?"TRUE":"s.id=ANY($1::uuid[])";
    const params:unknown[]=scope===null?[]:[scope];
    let sql:string; let columns:string[];
    switch(resource) {
      case "schools":
        sql=`SELECT s.id,s.name,s.code,s.region,s.status,si.capacity_mwp AS "capacityMwp",
          count(DISTINCT si.id)::int AS "sitesCount",count(DISTINCT g.id)::int AS "gatewaysCount"
          FROM schools s LEFT JOIN sites si ON si.school_id=s.id LEFT JOIN gateways g ON g.site_id=si.id
          WHERE ${where} GROUP BY s.id,si.capacity_mwp ORDER BY s.name`;
        columns=["ชื่อโรงเรียน","ภูมิภาค","กำลังติดตั้ง (MWp)","จำนวนไซต์","Gateway","สถานะ"];break;
      case "sites":
        sql=`SELECT si.id,si.name,s.name AS "schoolName",si.capacity_mwp AS "capacityMwp",
          g.id AS "gatewayId",g.name AS gateway,g.protocol,g.last_seen_at AS "lastSeenAt",g.last_seen_at AS "lastUpdated",
          CASE WHEN si.status IN ('inactive','archived') THEN si.status WHEN g.last_seen_at>=now()-interval '2 minutes' THEN 'online' ELSE 'offline' END AS status,
          energy.kwh AS "productionKwh" FROM sites si JOIN schools s ON s.id=si.school_id LEFT JOIN gateways g ON g.site_id=si.id
          LEFT JOIN LATERAL (SELECT sum(r.delta) AS kwh FROM (
            SELECT tr.device_id,greatest(max(tr.normalized_value)-min(tr.normalized_value),0) AS delta
            FROM telemetry_raw tr JOIN billing_meters bm ON bm.device_id=tr.device_id AND bm.active
            WHERE tr.site_id=si.id AND tr.semantic_field='total_energy' AND tr.quality='complete'
            AND tr.source_time>=date_trunc('day',now() AT TIME ZONE 'Asia/Bangkok') AT TIME ZONE 'Asia/Bangkok'
            GROUP BY tr.device_id HAVING count(*)>1) r) energy ON true
          WHERE ${where} ORDER BY si.name`;
        columns=["ชื่อไซต์","โรงเรียน","กำลังติดตั้ง (MWp)","Gateway","โพรโทคอล","พลังงานวันนี้ (kWh)","อัปเดตล่าสุด","สถานะ"];break;
      case "billing":
        sql=`SELECT b.id,b.site_id AS "siteId",to_char(b.period_end,'YYYY-MM') AS period,s.name AS "schoolName",si.name AS "siteName",
          b.consumed_kwh AS "consumedKwh",b.rate,b.amount,b.status,b.quality,b.opening_energy AS "openingEnergy",b.closing_energy AS "closingEnergy",
          p.id AS "paymentId",p.status AS "paymentStatus",p.slip_url AS "slipUrl",p.slip_url AS "หลักฐานการชำระ",p.paid_at AS "paidAt",
          p.rejection_reason AS "rejectionReason",d.document_number AS "invoiceNumber",r.document_number AS "receiptNumber"
          FROM billing_cycles b JOIN sites si ON si.id=b.site_id JOIN schools s ON s.id=si.school_id
          LEFT JOIN LATERAL (SELECT * FROM payments WHERE billing_cycle_id=b.id ORDER BY paid_at DESC NULLS LAST,id DESC LIMIT 1) p ON true
          LEFT JOIN documents d ON d.billing_cycle_id=b.id AND d.document_type='invoice'
          LEFT JOIN documents r ON r.billing_cycle_id=b.id AND r.document_type='receipt'
          WHERE ${where} ORDER BY b.period_end DESC,si.name`;
        columns=["รอบบิล","โรงเรียน","ไซต์","พลังงาน (kWh)","อัตรา (฿/kWh)","ยอดเงิน (฿)","หลักฐานการชำระ","สถานะ"];break;
      case "contracts":
        sql=`SELECT c.id,c.site_id AS "siteId",c.id::text AS "contractNumber",s.name AS "schoolName",si.name AS "siteName",c.version,
          to_char(c.start_date,'YYYY-MM-DD') AS "startDate",to_char(c.end_date,'YYYY-MM-DD') AS "endDate",r.rate,c.signer_name AS signers,c.status,
          c.tax_id AS "taxId",c.company_name AS "companyName",c.branch AS "taxBranch",c.tax_address AS "taxAddress",c.billing_email AS "taxEmail",c.billing_phone AS "taxPhone",
          (SELECT coalesce(jsonb_agg(jsonb_build_object('startDate',rv.effective_from,'endDate',rv.effective_to-1,'rate',rv.rate) ORDER BY rv.effective_from),'[]'::jsonb) FROM rate_versions rv WHERE rv.contract_id=c.id) AS rates
          FROM contracts c JOIN sites si ON si.id=c.site_id JOIN schools s ON s.id=si.school_id
          LEFT JOIN LATERAL (SELECT rate FROM rate_versions WHERE contract_id=c.id AND effective_from<=current_date
          AND (effective_to IS NULL OR effective_to>current_date) ORDER BY effective_from DESC LIMIT 1) r ON true
          WHERE ${where} ORDER BY c.start_date DESC`;
        columns=["เลขที่สัญญา","โรงเรียน","เวอร์ชัน","วันเริ่มต้น","อัตราค่าไฟ (฿)","คู่สัญญา","สถานะ"];break;
      case "documents":case "receipts":
        sql=`SELECT d.id,d.site_id AS "siteId",d.billing_cycle_id AS "billingCycleId",d.document_number AS "documentNumber",
          d.document_number AS "receiptNumber",NULL AS "taxInvoiceNumber",d.document_type AS type,s.name AS "schoolName",si.name AS "siteName",
          to_char(d.issue_date,'YYYY-MM-DD') AS "issueDate",d.amount,d.amount AS "totalAmount",d.status,d.snapshot
          FROM documents d JOIN sites si ON si.id=d.site_id JOIN schools s ON s.id=si.school_id
          WHERE ${where} ${resource==="receipts"?"AND d.document_type='receipt'":""} ORDER BY d.issue_date DESC`;
        columns=resource==="receipts"?["เลขที่ใบเสร็จ","เลขที่ใบกำกับภาษี","โรงเรียน","วันที่ออก","ยอดเงินสุทธิ (฿)","สถานะ"]:["เลขที่เอกสาร","ประเภท","โรงเรียน","วันที่ออก","จำนวนเงิน (฿)","สถานะ"];break;
      case "alerts":
        sql=`SELECT a.id,a.id::text AS "alertId",a.title,a.detail,a.severity,a.occurred_at AS "occurredAt",a.status FROM alerts a
          JOIN sites si ON si.id=a.site_id JOIN schools s ON s.id=si.school_id WHERE ${where} ORDER BY a.occurred_at DESC`;
        columns=["รหัสแจ้งเตือน","หัวข้อ","รายละเอียด","ระดับความรุนแรง","เวลาที่เกิด","สถานะ"];break;
      case "notifications":
        sql=`SELECT id,title,channel,recipient,created_at AS "sentAt",status FROM notification_deliveries WHERE user_id=$1 ORDER BY created_at DESC`;
        params.splice(0,params.length,user?.id);columns=["หัวข้อข้อความ","ช่องทาง","ผู้รับ","เวลาที่ส่ง","สถานะ"];break;
      case "reports":
        sql=`SELECT id,title,report_type AS category,date_from::text||' – '||date_to::text AS scope,upper(format) AS format,status,
          created_at AS "generatedAt",octet_length(content)::text||' bytes' AS "fileSize",'/v1/reports/'||id::text||'/download' AS "downloadUrl"
          FROM generated_reports WHERE created_by=$1 ORDER BY created_at DESC`;
        params.splice(0,params.length,user?.id);columns=["ชื่อรายงาน","หมวดหมู่","ขอบเขตข้อมูล","รูปแบบ","สถานะ"];break;
      case "users":
        if(!["owner","admin"].includes(user?.role??"")) throw new ForbiddenException();
        sql=`SELECT u.id,u.display_name AS "displayName",u.email,u.role,s.name AS "schoolName",u.status,u.created_at AS "createdAt",
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
    const result=await this.db.query(sql,params);
    return {columns,rows:result.rows,idKey:"id"};
  }
  async summary(resource:string,user?:ScopePrincipal) {
    const {rows}=await this.list(resource,user);
    const item=(label:string,value:number,unit:string)=>({label,value,unit,note:"จากข้อมูลในระบบ"});
    const sum=(key:string,selected=rows)=>selected.reduce((total,row)=>total+Number(row[key]??0),0);
    if(resource==="sites")return [item("ไซต์งานทั้งหมด",rows.length,"ไซต์"),item("ออนไลน์",rows.filter(r=>r.status==="online").length,"ไซต์"),item("กำลังติดตั้งรวม",sum("capacityMwp"),"MWp")];
    if(resource==="billing")return [item("ใบเรียกเก็บเงิน",rows.length,"ฉบับ"),item("บิลที่จ่ายแล้ว",rows.filter(r=>r.status==="paid").length,"ฉบับ"),item("ยอดเรียกเก็บรวม",sum("amount"),"บาท"),item("ชำระแล้ว",sum("amount",rows.filter(r=>r.status==="paid")),"บาท")];
    if(resource==="receipts"||resource==="documents")return [item("เอกสารทั้งหมด",rows.length,"ฉบับ"),item("ยอดรวม",sum("amount"),"บาท")];
    return [item("รายการทั้งหมด",rows.length,"รายการ")];
  }
}

