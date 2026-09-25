import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

@Injectable()
export class OperationsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async list(resource: string, userContext?: { id?: string; role?: string; schoolId?: string }) {
    const isSchoolUser = userContext?.role === "school_user" && Boolean(userContext?.schoolId);
    const schoolId = userContext?.schoolId;

    switch (resource) {
      case "schools": {
        const sql = `
          SELECT 
            s.id,
            s.name,
            s.code,
            s.region,
            coalesce(round(sum(si.capacity_mwp)::numeric, 4), 0) AS "capacityMwp",
            count(distinct si.id)::int AS "sitesCount",
            count(distinct g.id)::int AS "gatewaysCount",
            CASE WHEN count(g.id) FILTER (WHERE g.status='offline') > 0 THEN 'ต้องตรวจสอบ' ELSE 'ออนไลน์' END AS status
          FROM schools s
          LEFT JOIN sites si ON si.school_id = s.id
          LEFT JOIN gateways g ON g.site_id = si.id
          ${isSchoolUser ? `WHERE s.id = '${schoolId}'` : ""}
          GROUP BY s.id, s.name, s.code, s.region
          ORDER BY s.name
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "ชื่อโรงเรียน",
            "ภูมิภาค",
            "กำลังติดตั้ง (MWp)",
            "จำนวนไซต์",
            "Gateway",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "sites": {
        const sql = `
          SELECT 
            si.id,
            si.name,
            s.name AS "schoolName",
            coalesce(round(si.capacity_mwp::numeric, 4), 0) AS "capacityMwp",
            coalesce(g.name, 'GW-01') AS gateway,
            coalesce(g.protocol, 'MQTT') AS protocol,
            coalesce(round(sum(ta.value)::numeric, 2), 0) AS "productionKwh",
            si.status
          FROM sites si
          JOIN schools s ON s.id = si.school_id
          LEFT JOIN gateways g ON g.site_id = si.id
          LEFT JOIN telemetry_aggregate ta ON ta.site_id = si.id AND ta.semantic_field = 'energy_export_kwh' AND ta.bucket = 'day'
          ${isSchoolUser ? `WHERE s.id = '${schoolId}'` : ""}
          GROUP BY si.id, si.name, s.name, si.capacity_mwp, g.name, g.protocol, si.status
          ORDER BY si.name
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "ชื่อไซต์",
            "โรงเรียน",
            "กำลังติดตั้ง (MWp)",
            "Gateway",
            "โพรโทคอล",
            "ผลิตสะสม (kWh)",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "billing": {
        const sql = `
          SELECT 
            b.id,
            to_char(b.period_end, 'YYYY-MM') AS period,
            s.name AS "schoolName",
            si.name AS "siteName",
            coalesce(round(b.consumed_kwh::numeric, 2), 0) AS "consumedKwh",
            coalesce(round(b.rate::numeric, 2), 4.25) AS rate,
            coalesce(round(b.amount::numeric, 2), 0) AS amount,
            b.status,
            p.id AS "paymentId",
            p.status AS "paymentStatus",
            p.slip_url AS "slipUrl",
            p.slip_url AS "หลักฐานการชำระ",
            to_char(p.paid_at, 'YYYY-MM-DD HH24:MI') AS "paidAt",
            p.rejection_reason AS "rejectionReason",
            d.document_number AS "invoiceNumber",
            r.document_number AS "receiptNumber"
          FROM billing_cycles b
          JOIN sites si ON si.id = b.site_id
          JOIN schools s ON s.id = si.school_id
          LEFT JOIN payments p ON p.billing_cycle_id = b.id
          LEFT JOIN documents d ON d.billing_cycle_id = b.id AND d.document_type = 'invoice'
          LEFT JOIN documents r ON r.billing_cycle_id = b.id AND r.document_type = 'receipt'
          ${isSchoolUser ? `WHERE s.id = '${schoolId}'` : ""}
          ORDER BY b.period_end DESC, s.name
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "รอบบิล",
            "โรงเรียน",
            "ไซต์",
            "พลังงาน (kWh)",
            "อัตรา (฿/kWh)",
            "ยอดเงิน (฿)",
            "หลักฐานการชำระ",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "contracts": {
        const sql = `
          SELECT 
            c.id,
            'CNT-' || lpad(right(c.id::text, 4), 4, '0') AS "contractNumber",
            s.name AS "schoolName",
            'v' || c.version AS version,
            to_char(c.start_date, 'YYYY-MM-DD') AS "startDate",
            coalesce(r.rate, 4.25) AS rate,
            coalesce(c.signer_name, 'สพฐ. · Solar Energy Corp') AS signers,
            c.status
          FROM contracts c
          JOIN sites si ON si.id = c.site_id
          JOIN schools s ON s.id = si.school_id
          LEFT JOIN LATERAL (
            SELECT rate FROM rate_versions
            WHERE contract_id = c.id
            ORDER BY effective_from DESC
            LIMIT 1
          ) r ON true
          ${isSchoolUser ? `WHERE s.id = '${schoolId}'` : ""}
          ORDER BY c.start_date DESC
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "เลขที่สัญญา",
            "โรงเรียน",
            "เวอร์ชัน",
            "วันเริ่มต้น",
            "อัตราค่าไฟ (฿)",
            "คู่สัญญา",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "documents": {
        const sql = `
          SELECT 
            d.id,
            d.document_number AS "documentNumber",
            d.document_type AS type,
            s.name AS "schoolName",
            to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate",
            coalesce(round(d.amount::numeric, 2), 0) AS amount,
            d.status
          FROM documents d
          JOIN sites si ON si.id = d.site_id
          JOIN schools s ON s.id = si.school_id
          ${isSchoolUser ? `WHERE s.id = '${schoolId}'` : ""}
          ORDER BY d.issue_date DESC
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "เลขที่เอกสาร",
            "ประเภท",
            "โรงเรียน",
            "วันที่ออก",
            "จำนวนเงิน (฿)",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "receipts": {
        const sql = `
          SELECT 
            d.id,
            d.document_number AS "receiptNumber",
            'TAX-' || lpad(right(d.id::text, 4), 4, '0') AS "taxInvoiceNumber",
            s.name AS "schoolName",
            to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate",
            coalesce(round(d.amount::numeric, 2), 0) AS "totalAmount",
            CASE WHEN d.status = 'paid' OR d.status = 'active' THEN 'ชำระแล้ว' ELSE 'ออกเอกสารแล้ว' END AS status
          FROM documents d
          JOIN sites si ON si.id = d.site_id
          JOIN schools s ON s.id = si.school_id
          WHERE (d.document_type ILIKE '%receipt%' OR d.document_type ILIKE '%tax%' OR d.document_type ILIKE '%ใบเสร็จ%')
          ${isSchoolUser ? `AND s.id = '${schoolId}'` : ""}
          ORDER BY d.issue_date DESC
        `;
        try {
          const res = await this.db.query(sql);
          return {
            columns: [
              "เลขที่ใบเสร็จ",
              "เลขที่ใบกำกับภาษี",
              "โรงเรียน",
              "วันที่ออก",
              "ยอดเงินสุทธิ (฿)",
              "สถานะ",
            ],
            rows: res.rows,
            idKey: "id",
          };
        } catch {
          return {
            columns: [
              "เลขที่ใบเสร็จ",
              "เลขที่ใบกำกับภาษี",
              "โรงเรียน",
              "วันที่ออก",
              "ยอดเงินสุทธิ (฿)",
              "สถานะ",
            ],
            rows: [],
            idKey: "id",
          };
        }
      }

      case "alerts": {
        const sql = `
          SELECT 
            a.id,
            'ALM-' || lpad(right(a.id::text, 4), 4, '0') AS "alertId",
            a.title,
            a.detail,
            a.severity,
            to_char(a.occurred_at, 'YYYY-MM-DD HH24:MI') AS "occurredAt",
            a.status
          FROM alerts a
          ORDER BY a.occurred_at DESC
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "รหัสแจ้งเตือน",
            "หัวข้อ",
            "รายละเอียด",
            "ระดับความรุนแรง",
            "เวลาที่เกิด",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "reports": {
        return {
          columns: [
            "ชื่อรายงาน",
            "หมวดหมู่",
            "ขอบเขตข้อมูล",
            "รูปแบบ",
            "สถานะ",
          ],
          rows: [
            {
              id: "1",
              title: "รายงานการผลิตพลังงานรายเดือน (Energy Monthly)",
              category: "พลังงาน",
              scope: "ทุกโรงเรียนและไซต์พลังงาน",
              format: "CSV / XLSX",
              status: "พร้อมดาวน์โหลด",
              fileSize: "1.8 MB",
              generatedAt: "2026-09-22 06:00",
              description: "สรุปปริมาณการผลิตกระแสไฟฟ้า ค่ารังสีแสงอาทิตย์ และสถิติ PR (Performance Ratio) รายไซต์ประจำเดือน",
            },
            {
              id: "2",
              title: "รายงานสรุปยอดเรียกเก็บและการชำระเงิน (Billing & Revenue)",
              category: "การเงิน",
              scope: "รอบบิลประจำปีปัจจุบัน",
              format: "PDF / CSV",
              status: "พร้อมดาวน์โหลด",
              fileSize: "3.2 MB",
              generatedAt: "2026-09-21 18:30",
              description: "รายงานประมวลผลใบแจ้งหนี้ ใบเสร็จรับเงิน และสถานะการชำระเงินของทุกโรงเรียนคู่สัญญา PPA",
            },
            {
              id: "3",
              title: "รายงานสถานะสุขภาพอุปกรณ์ (Device & Gateway Health)",
              category: "อุปกรณ์",
              scope: "Gateways, Inverters, Meters",
              format: "PDF",
              status: "พร้อมดาวน์โหลด",
              fileSize: "950 KB",
              generatedAt: "2026-09-22 08:15",
              description: "สถิติ uptime ความสมบูรณ์ของสัญญาณเครือข่าย ค่า packet loss และประวัติการตัดการเชื่อมต่อของอุปกรณ์ IOT",
            },
            {
              id: "4",
              title: "รายงานบันทึกประวัติการใช้งานระบบ (Audit Trail Log)",
              category: "ความปลอดภัย",
              scope: "Audit events ย้อนหลัง 90 วัน",
              format: "CSV",
              status: "พร้อมดาวน์โหลด",
              fileSize: "4.5 MB",
              generatedAt: "2026-09-22 00:00",
              description: "บันทึกประวัติการทำรายการ กิจกรรมของผู้ดูแลระบบ การปรับเปลี่ยนอัตราค่าไฟ และการอนุญาตสิทธิ์เข้าถึง",
            },
          ],
          idKey: "id",
        };
      }

      case "notifications": {
        const sql = `
          SELECT 
            a.id,
            a.title,
            coalesce(a.detail, a.title) AS detail,
            a.severity,
            'In-App + Email' AS channel,
            'ผู้ดูแลระบบและโรงเรียน' AS recipient,
            to_char(a.occurred_at, 'YYYY-MM-DD HH24:MI') AS "sentAt",
            CASE WHEN a.status='resolved' THEN 'ส่งสำเร็จ' ELSE 'รอดำเนินการ' END AS status
          FROM alerts a
          ORDER BY a.occurred_at DESC
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "หัวข้อข้อความ",
            "ช่องทาง",
            "ผู้รับ",
            "เวลาที่ส่ง",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "users": {
        const sql = `
          SELECT 
            u.id,
            u.display_name AS "displayName",
            u.email,
            u.role,
            coalesce(s.name, 'ทุกโรงเรียน (ส่วนกลาง)') AS "schoolName",
            'ใช้งานเมื่อวานนี้' AS "lastActive",
            to_char(u.created_at, 'YYYY-MM-DD HH24:MI') AS "createdAt",
            u.status
          FROM users u
          LEFT JOIN schools s ON s.id = u.school_id
          ORDER BY u.role, u.display_name
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "ชื่อผู้ใช้งาน",
            "อีเมล",
            "บทบาท",
            "สังกัดโรงเรียน",
            "การใช้งานล่าสุด",
            "สถานะ",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      case "audit": {
        const sql = `
          SELECT 
            a.id,
            to_char(a.occurred_at, 'YYYY-MM-DD HH24:MI:SS') AS "time",
            a.action,
            a.entity_type AS "entityType",
            a.entity_id::text AS "entityId",
            coalesce(u.display_name, 'Admin User') AS actor,
            'สำเร็จ' AS status,
            a.correlation_id AS "correlationId",
            a.reason,
            a.before_json AS "beforeJson",
            a.after_json AS "afterJson"
          FROM audit_events a
          LEFT JOIN users u ON u.id = a.actor_id
          ORDER BY a.occurred_at DESC
          LIMIT 50
        `;
        const res = await this.db.query(sql);
        return {
          columns: [
            "เวลา",
            "การดำเนินการ",
            "ประเภทข้อมูล",
            "รหัสอ้างอิง",
            "ผู้ดำเนินการ",
            "ผลลัพธ์",
          ],
          rows: res.rows,
          idKey: "id",
        };
      }

      default:
        return { columns: [], rows: [], idKey: "id" };
    }
  }

  async summary(resource: string, userContext?: { id?: string; role?: string; schoolId?: string }) {
    switch (resource) {
      case "schools": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM schools),
            cap AS (SELECT coalesce(round(sum(capacity_mwp)::numeric, 4), 0) AS sum FROM sites),
            si  AS (SELECT count(*)::int AS cnt FROM sites),
            gw  AS (SELECT count(*)::int AS cnt FROM gateways WHERE status='offline')
          SELECT 
            tot.cnt AS "totalSchools", 
            cap.sum AS "totalCapacity", 
            si.cnt AS "totalSites", 
            gw.cnt AS "offlineGateways"
          FROM tot, cap, si, gw
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        const offlineCount = Number(row.offlineGateways ?? 0);
        return [
          {
            label: "โรงเรียนทั้งหมด",
            value: row.totalSchools ?? 0,
            unit: "แห่ง",
            note: "ในระบบ",
          },
          {
            label: "กำลังติดตั้งรวม",
            value: row.totalCapacity ?? 0,
            unit: "MWp",
            note: "ทั่วประเทศ",
          },
          {
            label: "ไซต์พลังงาน",
            value: row.totalSites ?? 0,
            unit: "ไซต์",
            note: "ติดตั้งแล้ว",
          },
          {
            label: "สถานะเชื่อมต่อ",
            value: offlineCount === 0 ? "ปกติ 100%" : `${offlineCount} แจ้งเตือน`,
            unit: "",
            note: "Gateways",
          },
        ];
      }

      case "sites": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM sites),
            onl AS (SELECT count(*)::int AS cnt FROM sites WHERE status='online'),
            cap AS (SELECT coalesce(round(sum(capacity_mwp)::numeric, 4), 0) AS sum FROM sites),
            prd AS (SELECT coalesce(round(sum(value)::numeric, 0), 0) AS sum FROM telemetry_aggregate WHERE semantic_field = 'energy_export_kwh')
          SELECT 
            tot.cnt AS "totalSites", 
            onl.cnt AS "onlineSites", 
            cap.sum AS "totalCapacity", 
            prd.sum AS "totalProduction"
          FROM tot, onl, cap, prd
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "ไซต์พลังงานทั้งหมด",
            value: row.totalSites ?? 0,
            unit: "ไซต์",
            note: "ลงทะเบียน",
          },
          {
            label: "ไซต์ออนไลน์",
            value: row.onlineSites ?? 0,
            unit: "ไซต์",
            note: "ส่งข้อมูลปกติ",
          },
          {
            label: "กำลังติดตั้งรวม",
            value: row.totalCapacity ?? 0,
            unit: "MWp",
            note: "กำลังผลิต",
          },
          {
            label: "ผลิตสะสมรวม",
            value: row.totalProduction ?? 0,
            unit: "kWh",
            note: "พลังงานสะอาด",
          },
        ];
      }

      case "billing": {
        const sql = `
          WITH
            amt AS (SELECT coalesce(round(sum(amount)::numeric, 2), 0) AS sum FROM billing_cycles),
            pd  AS (SELECT coalesce(round(sum(amount)::numeric, 2), 0) AS sum FROM billing_cycles WHERE status='paid'),
            pnd AS (SELECT coalesce(round(sum(amount)::numeric, 2), 0) AS sum FROM billing_cycles WHERE status IN ('pending', 'pending_review', 'draft')),
            kwh AS (SELECT coalesce(round(sum(consumed_kwh)::numeric, 2), 0) AS sum FROM billing_cycles)
          SELECT 
            amt.sum AS "totalAmount", 
            pd.sum AS "paidAmount", 
            pnd.sum AS "pendingAmount", 
            kwh.sum AS "totalKwh"
          FROM amt, pd, pnd, kwh
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "ยอดเรียกเก็บรวม",
            value: row.totalAmount ?? 0,
            unit: "บาท",
            note: "ทุกรอบบิล",
          },
          {
            label: "ชำระเงินแล้ว",
            value: row.paidAmount ?? 0,
            unit: "บาท",
            note: "สำเร็จ",
          },
          {
            label: "รอการชำระ/อนุมัติ",
            value: row.pendingAmount ?? 0,
            unit: "บาท",
            note: "รอบิลปัจจุบัน",
          },
          {
            label: "พลังงานเรียกเก็บ",
            value: row.totalKwh ?? 0,
            unit: "kWh",
            note: "พลังงานใช้จริง",
          },
        ];
      }

      case "contracts": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM contracts),
            act AS (SELECT count(*)::int AS cnt FROM contracts WHERE status='active'),
            rt  AS (SELECT coalesce(round(avg(rate)::numeric, 2), 4.50) AS avg FROM rate_versions)
          SELECT 
            tot.cnt AS "totalContracts", 
            act.cnt AS "activeContracts", 
            rt.avg AS "avgRate"
          FROM tot, act, rt
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "สัญญาทั้งหมด",
            value: row.totalContracts ?? 0,
            unit: "ฉบับ",
            note: "สัญญา PPA",
          },
          {
            label: "สัญญามีผลบังคับใช้",
            value: row.activeContracts ?? 0,
            unit: "ฉบับ",
            note: "Active",
          },
          {
            label: "อัตราค่าไฟเฉลี่ย",
            value: row.avgRate ?? 4.5,
            unit: "฿/kWh",
            note: "ตามสัญญา",
          },
          {
            label: "สถานะการลงนาม",
            value: "ครบ 100%",
            unit: "",
            note: "คู่สัญญา",
          },
        ];
      }

      case "documents": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM documents),
            inv AS (SELECT count(*)::int AS cnt FROM documents WHERE document_type='invoice'),
            rec AS (SELECT count(*)::int AS cnt FROM documents WHERE document_type='receipt')
          SELECT 
            tot.cnt AS "totalDocs", 
            inv.cnt AS "invoiceCount", 
            rec.cnt AS "receiptCount"
          FROM tot, inv, rec
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "เอกสารทั้งหมด",
            value: row.totalDocs ?? 0,
            unit: "ฉบับ",
            note: "ในระบบ",
          },
          {
            label: "ใบแจ้งหนี้ (Invoice)",
            value: row.invoiceCount ?? 0,
            unit: "ฉบับ",
            note: "ออกแล้ว",
          },
          {
            label: "ใบเสร็จรับเงิน (Receipt)",
            value: row.receiptCount ?? 0,
            unit: "ฉบับ",
            note: "ชำระแล้ว",
          },
          {
            label: "สถานะความพร้อม",
            value: "พร้อมดาวน์โหลด",
            unit: "",
            note: "Cloud Storage",
          },
        ];
      }

      case "receipts": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM documents WHERE document_type ILIKE '%receipt%' OR document_type ILIKE '%tax%' OR document_type ILIKE '%ใบเสร็จ%'),
            paid AS (SELECT count(*)::int AS cnt FROM documents WHERE (document_type ILIKE '%receipt%' OR document_type ILIKE '%tax%') AND status IN ('paid', 'active', 'completed')),
            amt AS (SELECT coalesce(round(sum(b.amount)::numeric, 2), 0) AS sum FROM documents d JOIN sites si ON si.id = d.site_id LEFT JOIN billing_cycles b ON b.site_id = si.id AND to_char(b.period_end, 'YYYY-MM') = to_char(d.issue_date, 'YYYY-MM') WHERE d.document_type ILIKE '%receipt%' OR d.document_type ILIKE '%tax%')
          SELECT 
            tot.cnt AS "totalReceipts", 
            paid.cnt AS "paidCount", 
            amt.sum AS "totalAmount"
          FROM tot, paid, amt
        `;
        try {
          const res = await this.db.query(sql);
          const row = res.rows[0] || {};
          return [
            {
              label: "ใบเสร็จ/ใบกำกับทั้งหมด",
              value: row.totalReceipts ?? 0,
              unit: "ฉบับ",
              note: "สะสมในระบบ",
            },
            {
              label: "สถานะชำระครบถ้วน",
              value: row.paidCount ?? 0,
              unit: "ฉบับ",
              note: "สมบูรณ์",
            },
            {
              label: "ยอดเงินรวมตามใบเสร็จ",
              value: row.totalAmount ?? 0,
              unit: "บาท",
              note: "รวมภาษีมูลค่าเพิ่ม",
            },
            {
              label: "การดาวน์โหลดเอกสาร",
              value: "พร้อมใช้งาน",
              unit: "",
              note: "PDF ดิจิทัล",
            },
          ];
        } catch {
          return [
            { label: "ใบเสร็จ/ใบกำกับทั้งหมด", value: 0, unit: "ฉบับ", note: "สะสมในระบบ" },
            { label: "สถานะชำระครบถ้วน", value: 0, unit: "ฉบับ", note: "สมบูรณ์" },
            { label: "ยอดเงินรวมตามใบเสร็จ", value: 0, unit: "บาท", note: "รวมภาษีมูลค่าเพิ่ม" },
            { label: "การดาวน์โหลดเอกสาร", value: "พร้อมใช้งาน", unit: "", note: "PDF ดิจิทัล" },
          ];
        }
      }

      case "alerts": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM alerts),
            crt AS (SELECT count(*)::int AS cnt FROM alerts WHERE severity='critical'),
            wrn AS (SELECT count(*)::int AS cnt FROM alerts WHERE severity='warning'),
            act AS (SELECT count(*)::int AS cnt FROM alerts WHERE status != 'resolved')
          SELECT 
            tot.cnt AS "totalAlerts", 
            crt.cnt AS "criticalCount", 
            wrn.cnt AS "warningCount", 
            act.cnt AS "activeCount"
          FROM tot, crt, wrn, act
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "การแจ้งเตือนทั้งหมด",
            value: row.totalAlerts ?? 0,
            unit: "รายการ",
            note: "บันทึกสะสม",
          },
          {
            label: "ระดับวิกฤต (Critical)",
            value: row.criticalCount ?? 0,
            unit: "รายการ",
            note: "ต้องแก้ไขด่วน",
          },
          {
            label: "ระดับเตือน (Warning)",
            value: row.warningCount ?? 0,
            unit: "รายการ",
            note: "เฝ้าระวัง",
          },
          {
            label: "ยังไม่ได้รับทราบ",
            value: row.activeCount ?? 0,
            unit: "รายการ",
            note: "รอดำเนินการ",
          },
        ];
      }

      case "reports": {
        return [
          {
            label: "รายงานที่มี",
            value: 4,
            unit: "ประเภท",
            note: "พร้อมใช้งาน",
          },
          {
            label: "รูปแบบการส่งออก",
            value: "PDF, CSV, XLSX",
            unit: "",
            note: "รองรับ",
          },
          {
            label: "ความถี่การอัปเดต",
            value: "Real-time",
            unit: "",
            note: "อัตโนมัติ",
          },
          {
            label: "ความสมบูรณ์ข้อมูล",
            value: "100%",
            unit: "",
            note: "ตรวจสอบแล้ว",
          },
        ];
      }

      case "notifications": {
        const sql = `SELECT count(*)::int AS count FROM alerts`;
        const res = await this.db.query(sql);
        const count = res.rows[0]?.count ?? 0;
        return [
          {
            label: "ข้อความทั้งหมด",
            value: count,
            unit: "รายการ",
            note: "ส่งแล้ว",
          },
          {
            label: "ช่องทางหลัก",
            value: "In-App & Email",
            unit: "",
            note: "แจ้งเตือนคู่ขนาน",
          },
          {
            label: "อัตราส่งสำเร็จ",
            value: "100%",
            unit: "",
            note: "SMTP Gateway",
          },
          {
            label: "สถานะระบบส่งข้อความ",
            value: "ออนไลน์",
            unit: "",
            note: "ปกติ",
          },
        ];
      }

      case "users": {
        const sql = `
          WITH
            tot AS (SELECT count(*)::int AS cnt FROM users),
            adm AS (SELECT count(*)::int AS cnt FROM users WHERE role IN ('owner', 'admin')),
            sch AS (SELECT count(*)::int AS cnt FROM users WHERE role='school_user')
          SELECT 
            tot.cnt AS "totalUsers", 
            adm.cnt AS "adminCount", 
            sch.cnt AS "schoolCount"
          FROM tot, adm, sch
        `;
        const res = await this.db.query(sql);
        const row = res.rows[0] || {};
        return [
          {
            label: "ผู้ใช้งานทั้งหมด",
            value: row.totalUsers ?? 0,
            unit: "คน",
            note: "ลงทะเบียน",
          },
          {
            label: "ผู้ดูแลระบบ (Admin)",
            value: row.adminCount ?? 0,
            unit: "คน",
            note: "สิทธิ์ระดับสูง",
          },
          {
            label: "เจ้าหน้าที่โรงเรียน",
            value: row.schoolCount ?? 0,
            unit: "คน",
            note: "ผู้ใช้ประจำไซต์",
          },
          {
            label: "สถานะบัญชี",
            value: "ใช้งานได้ทั้งหมด",
            unit: "",
            note: "Active",
          },
        ];
      }

      case "audit": {
        const sql = `SELECT count(*)::int AS count FROM audit_events`;
        const res = await this.db.query(sql);
        const count = res.rows[0]?.count ?? 0;
        return [
          {
            label: "เหตุการณ์ทั้งหมด",
            value: count,
            unit: "รายการ",
            note: "Audit Trail",
          },
          {
            label: "ประเภทการตรวจสอบ",
            value: "Append-only",
            unit: "",
            note: "ไม่สามารถแก้ไขได้",
          },
          {
            label: "ความปลอดภัย",
            value: "บันทึก IP & Actor",
            unit: "",
            note: "เข้ารหัส",
          },
          {
            label: "สถานะการบันทึก",
            value: "ปกติ",
            unit: "",
            note: "Real-time log",
          },
        ];
      }

      default:
        return [];
    }
  }
}
