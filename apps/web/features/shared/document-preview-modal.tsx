"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { useLocale } from "../../providers/locale-provider";
import { formatAppDate } from "../../lib/date-format";
import {
  Download,
  Printer,
  FileText,
  FileCheck,
  Calendar,
  Layers,
  ChevronDown,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";

export type DocumentType = "contract" | "invoice" | "receipt";

export interface DocumentPreviewData {
  type: DocumentType;
  title?: string;
  documentNumber?: string;
  schoolName?: string;
  siteName?: string;
  period?: string;
  issueDate?: string;
  dueDate?: string;
  consumedKwh?: number | string;
  rate?: number | string;
  amount?: number | string;
  status?: string;
  signers?: string;
  version?: string;
  capacityMwp?: number | string;
}

interface DocumentPreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DocumentPreviewData | null;
}

const AVAILABLE_PERIODS = [
  { value: "2026-08", labelTh: "สิงหาคม 2569 (2026-08)", labelEn: "August 2026 (2026-08)", kwh: 2450.5, amount: 10414.63 },
  { value: "2026-07", labelTh: "กรกฎาคม 2569 (2026-07)", labelEn: "July 2026 (2026-07)", kwh: 2680.0, amount: 11390.00 },
  { value: "2026-06", labelTh: "มิถุนายน 2569 (2026-06)", labelEn: "June 2026 (2026-06)", kwh: 2520.0, amount: 10710.00 },
  { value: "2026-05", labelTh: "พฤษภาคม 2569 (2026-05)", labelEn: "May 2026 (2026-05)", kwh: 2890.2, amount: 12283.35 },
  { value: "2026-04", labelTh: "เมษายน 2569 (2026-04)", labelEn: "April 2026 (2026-04)", kwh: 3100.8, amount: 13178.40 },
  { value: "2026-03", labelTh: "มีนาคม 2569 (2026-03)", labelEn: "March 2026 (2026-03)", kwh: 2950.0, amount: 12537.50 },
  { value: "2026-02", labelTh: "กุมภาพันธ์ 2569 (2026-02)", labelEn: "February 2026 (2026-02)", kwh: 2410.0, amount: 10242.50 },
  { value: "2026-01", labelTh: "มกราคม 2569 (2026-01)", labelEn: "January 2026 (2026-01)", kwh: 2550.0, amount: 10837.50 },
];

export function DocumentPreviewModal({
  open,
  onOpenChange,
  data,
}: DocumentPreviewModalProps) {
  const locale = useLocale();

  const [selectedPeriod, setSelectedPeriod] = React.useState<string>("2026-08");

  // Keep internal preview state when user switches period
  const [activeDoc, setActiveDoc] = React.useState<DocumentPreviewData | null>(data);

  React.useEffect(() => {
    if (data) {
      setActiveDoc(data);
      if (data.period) {
        setSelectedPeriod(data.period);
      }
    }
  }, [data]);

  if (!activeDoc) return null;

  const handlePeriodChange = (newPeriod: string) => {
    setSelectedPeriod(newPeriod);
    const periodMeta = AVAILABLE_PERIODS.find((p) => p.value === newPeriod);
    if (periodMeta && activeDoc) {
      const rateNum = Number(activeDoc.rate || 4.25);
      const computedAmount = periodMeta.amount || (periodMeta.kwh * rateNum);
      const docCode = activeDoc.type === "receipt" ? "RCT" : "INV";
      setActiveDoc({
        ...activeDoc,
        period: newPeriod,
        consumedKwh: periodMeta.kwh,
        amount: computedAmount,
        documentNumber: `${docCode}${newPeriod.replace("-", "")}0001`,
        issueDate: `${newPeriod}-01`,
        dueDate: `${newPeriod}-25`,
      });
    }
  };

  const formatNumber = (val: any) => {
    const num = Number(val);
    if (isNaN(num)) return val || "-";
    return new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  };

  const amountNum = Number(activeDoc.amount) || 0;
  const subtotal = amountNum > 0 ? amountNum / 1.07 : 0;
  const vat = amountNum > 0 ? amountNum - subtotal : 0;

  const handlePrint = () => {
    window.print();
  };

  const isContract = activeDoc.type === "contract";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl lg:sm:max-w-5xl w-full max-h-[92vh] overflow-y-auto p-0 sm:rounded-2xl border-border bg-card">
        {/* Modal Top Bar */}
        <DialogHeader className="p-3.5 sm:p-4 border-b border-border/60 flex flex-row items-center justify-between gap-3 sticky top-0 bg-card/95 backdrop-blur-xs z-10">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              {isContract ? <FileCheck className="size-5" /> : <FileText className="size-5" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-sm sm:text-base font-bold text-foreground truncate">
                {isContract
                  ? locale === "th"
                    ? "เอกสารสัญญาซื้อขายไฟฟ้า (PPA Draft Preview)"
                    : "Power Purchase Agreement (PPA Draft Preview)"
                  : activeDoc.type === "invoice"
                  ? locale === "th"
                    ? "ใบแจ้งหนี้ / ใบเรียกเก็บเงิน"
                    : "Invoice / Billing Notice"
                  : locale === "th"
                  ? "ใบเสร็จรับเงิน / ใบกำกับภาษี"
                  : "Receipt / Tax Invoice"}
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground font-mono truncate">
                {activeDoc.documentNumber || "-"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pr-6 shrink-0">
            {/* Period Selector (Only for Invoices / Receipts) */}
            {!isContract && (
              <div className="flex items-center gap-1.5">
                <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
                  <SelectTrigger className="h-9 text-xs gap-1.5 bg-background border-border w-[170px] sm:w-[200px]">
                    <Calendar className="size-3 text-primary shrink-0" />
                    <SelectValue placeholder="เลือกรอบเดือน" />
                  </SelectTrigger>
                  <SelectContent align="end" className="text-xs">
                    {AVAILABLE_PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value} className="text-xs">
                        {locale === "th" ? p.labelTh : p.labelEn}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handlePrint}
              className="h-9 gap-1.5 text-xs border-border bg-background hover:bg-accent cursor-pointer hidden sm:flex"
            >
              <Printer className="size-3.5" />
              <span>{locale === "th" ? "พิมพ์" : "Print"}</span>
            </Button>
            <Button
              size="sm"
              onClick={handlePrint}
              className="h-9 gap-1.5 text-xs font-semibold bg-[#EAB308] text-[#0F172A] hover:bg-[#EAB308]/90 cursor-pointer"
            >
              <Download className="size-3.5" />
              <span className="hidden sm:inline">{locale === "th" ? "ดาวน์โหลด PDF" : "Download PDF"}</span>
              <span className="sm:hidden">PDF</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Paper Document Preview Container */}
        <div className="p-3 sm:p-6 bg-muted/20 print:p-0">
          <div className="mx-auto max-w-3xl bg-background border border-border rounded-xl shadow-md p-5 sm:p-10 space-y-6 text-foreground text-xs leading-relaxed print:border-none print:shadow-none print:p-0">
            {/* ============================================================== */}
            {/* CONTRACT PPA A4 DRAFT VIEW                                     */}
            {/* ============================================================== */}
            {isContract ? (
              <div className="space-y-6">
                {/* Official PPA Document Header */}
                <div className="text-center border-b border-border/80 pb-5 space-y-2 relative">
                  <div className="absolute left-0 top-0 hidden sm:flex size-12 items-center justify-center rounded-xl bg-[#EAB308]/15 text-[#EAB308] font-black text-xl border border-[#EAB308]/30">
                    ☀️
                  </div>
                  <div className="space-y-1">
                    <Badge variant="outline" className="text-[10px] tracking-widest uppercase border-[#EAB308]/40 bg-[#EAB308]/10 text-foreground font-semibold px-2.5 py-0.5">
                      {locale === "th" ? "เอกสารร่างสัญญาพร้อมลงนาม (DRAFT PPA)" : "DRAFT PPA AGREEMENT"}
                    </Badge>
                    <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight">
                      สัญญาซื้อขายไฟฟ้าจากระบบผลิตพลังงานแสงอาทิตย์บนหลังคา
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Solar Rooftop Power Purchase Agreement (PPA) • สัญญาเลขที่: <span className="font-mono font-semibold text-foreground">{activeDoc.documentNumber || "CNT-0001"}</span>
                    </p>
                  </div>
                </div>

                {/* Contract Metadata Box */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-lg bg-muted/40 border border-border/60 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "เวอร์ชันสัญญา" : "Version"}</span>
                    <strong className="font-mono text-xs">{activeDoc.version || "v1.0 (Official Draft)"}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "วันที่มีผลบังคับใช้" : "Effective Date"}</span>
                    <strong className="text-xs">{activeDoc.issueDate ? formatAppDate(activeDoc.issueDate, locale) : "1 มกราคม 2567"}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "อายุสัญญาผูกพัน" : "Term"}</span>
                    <strong className="text-xs">20 {locale === "th" ? "ปีเต็ม" : "Years"}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground block">{locale === "th" ? "สถานะสัญญา" : "Status"}</span>
                    <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                      {activeDoc.status || "ใช้งานอยู่"}
                    </Badge>
                  </div>
                </div>

                {/* Section 1: Parties */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>{locale === "th" ? "ข้อที่ 1. คู่สัญญาแห่งสัญญานี้" : "Article 1. The Contracting Parties"}</span>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                      <span className="text-[11px] font-semibold text-primary block">
                        {locale === "th" ? "ฝ่ายที่ 1: ผู้ให้บริการและผู้ลงทุนระบบ (Provider)" : "Party 1: System Provider & Investor"}
                      </span>
                      <p className="font-bold text-foreground">บริษัท โซลาร์ รูฟท็อป เอนเนอร์ยี่ จำกัด</p>
                      <p className="text-muted-foreground text-[11px]">เลขทะเบียนนิติบุคคล: 0105562089412</p>
                      <p className="text-muted-foreground text-[11px]">สำนักงาน: 88 อาคารโซลาร์ทาวเวอร์ ชั้น 18 สุขุมวิท กรุงเทพฯ</p>
                    </div>
                    <div className="p-3.5 rounded-lg border border-border/70 bg-card/60 space-y-1">
                      <span className="text-[11px] font-semibold text-primary block">
                        {locale === "th" ? "ฝ่ายที่ 2: สถานศึกษาและคู่สัญญา (Client Institution)" : "Party 2: Educational Institution"}
                      </span>
                      <p className="font-bold text-foreground">{activeDoc.schoolName || "สถานศึกษาในโครงการ"}</p>
                      <p className="text-muted-foreground text-[11px]">สังกัดสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)</p>
                      <p className="text-muted-foreground text-[11px]">สถานที่ติดตั้ง: {activeDoc.siteName || "อาคารเรียนหลักและอาคารอเนกประสงค์"}</p>
                    </div>
                  </div>
                </div>

                {/* Section 2: Technical Specifications & PPA Tariff */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span>{locale === "th" ? "ข้อที่ 2. ขอบเขตเทคนิคและข้อกำหนดราคาค่าไฟฟ้า (Tariff Specifications)" : "Article 2. Technical & Tariff Specifications"}</span>
                  </h3>
                  <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                    <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                      <tr>
                        <th className="p-2.5 text-left font-semibold">{locale === "th" ? "หัวข้อข้อกำหนด" : "Provision / Specification"}</th>
                        <th className="p-2.5 text-right font-semibold">{locale === "th" ? "รายละเอียดและเงื่อนไข" : "Terms & Values"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="p-2.5 text-muted-foreground">{locale === "th" ? "กำลังการติดตั้งระบบโซลาร์เซลล์รวม (Capacity)" : "Total Installed Capacity"}</td>
                        <td className="p-2.5 text-right font-semibold font-mono text-foreground">{Number(activeDoc.capacityMwp || 0.45).toFixed(3)} MWp</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-muted-foreground">{locale === "th" ? "อัตราค่าไฟฟ้าคงที่ตลอดสัญญา (Fixed PPA Tariff)" : "Fixed PPA Tariff"}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400 font-mono">฿{formatNumber(activeDoc.rate || 4.25)} / kWh</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-muted-foreground">{locale === "th" ? "มาตรฐานอุปกรณ์แผงโซลาร์และอินเวอร์เตอร์" : "Hardware & Standards"}</td>
                        <td className="p-2.5 text-right font-medium text-foreground">Tier-1 Monocrystalline PV & Smart Grid Inverters</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-muted-foreground">{locale === "th" ? "ระบบตรวจวัดโทรมาตรและมาตรวัดพลังงาน" : "Revenue Metering & Telemetry"}</td>
                        <td className="p-2.5 text-right font-medium text-foreground">Industrial Modbus Gateway & Bi-directional Meter (Piloted)</td>
                      </tr>
                      <tr>
                        <td className="p-2.5 text-muted-foreground">{locale === "th" ? "เงื่อนไขรอบการชำระเงินรายเดือน" : "Monthly Payment Terms"}</td>
                        <td className="p-2.5 text-right font-medium text-foreground">{locale === "th" ? "ชำระภายใน 30 วันนับแต่วันที่ได้รับใบแจ้งหนี้" : "Net 30 Days"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Section 3: Operation & Maintenance */}
                <div className="p-3.5 rounded-xl border border-border/70 bg-card/40 space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                  <h4 className="font-semibold text-foreground">
                    {locale === "th" ? "ข้อที่ 3. ความรับผิดชอบด้านการบำรุงรักษา (O&M Scope)" : "Article 3. Operation & Maintenance"}
                  </h4>
                  <p>
                    {locale === "th"
                      ? "ผู้ให้บริการตกลงเป็นผู้รับผิดชอบค่าใช้จ่ายในการประกันภัย การทำความสะอาดแผงเซลล์แสงอาทิตย์ และการซ่อมบำรุงรักษาอุปกรณ์ทั้งหมดตลอดระยะเวลา 20 ปี โดยสถานศึกษาไม่ต้องแบกรับค่าใช้จ่ายด้านการลงทุนใดๆ ทั้งสิ้น"
                      : "The Provider assumes full financial and operational responsibility for insurance, module cleaning, inverter servicing, and IoT maintenance throughout the 20-year term without capital expenditure from the school."}
                  </p>
                </div>

                {/* Formal Signature Area with Draft Badge */}
                <div className="pt-6 border-t border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {locale === "th" ? "การลงนามรับรองข้อตกลงสัญญา" : "Execution & Signatures"}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                      {locale === "th" ? "รอลงนามบันทึกข้อตกลง" : "Pending Official Signature"}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2 text-center text-xs">
                    {/* Provider Signatory Box */}
                    <div className="p-5 rounded-xl border border-dashed border-border/80 bg-muted/10 space-y-8">
                      <p className="font-semibold text-foreground">
                        {locale === "th" ? "ในนาม บริษัท โซลาร์ รูฟท็อป เอนเนอร์ยี่ จำกัด (ผู้ให้บริการ)" : "For Solar Rooftop Energy Co., Ltd."}
                      </p>
                      <div className="space-y-1">
                        <div className="border-t border-border pt-2 text-muted-foreground w-48 mx-auto font-mono text-[11px]">
                          ( Solar Platform Operations Team )
                        </div>
                        <p className="text-[10px] text-muted-foreground">กรรมการผู้จัดการ / ผู้มีอำนาจลงนาม</p>
                        <p className="text-[10px] text-muted-foreground">วันที่: ____ / ________ / ________</p>
                      </div>
                    </div>

                    {/* School Signatory Box */}
                    <div className="p-5 rounded-xl border border-dashed border-border/80 bg-muted/10 space-y-8">
                      <p className="font-semibold text-foreground">
                        {locale === "th" ? `ในนาม ${activeDoc.schoolName || "สถานศึกษาคู่สัญญา"}` : "For Client Institution"}
                      </p>
                      <div className="space-y-1">
                        <div className="border-t border-border pt-2 text-muted-foreground w-48 mx-auto font-mono text-[11px]">
                          ( ............................................................ )
                        </div>
                        <p className="text-[10px] text-muted-foreground">ผู้อำนวยการสถานศึกษา / ผู้แทนสถานศึกษา</p>
                        <p className="text-[10px] text-muted-foreground">วันที่: ____ / ________ / ________</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ============================================================== */
              /* INVOICE & RECEIPT VIEW                                         */
              /* ============================================================== */
              <div className="space-y-6">
                {/* Document Header */}
                <div className="flex items-start justify-between border-b border-border pb-6">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex size-6 items-center justify-center rounded-md bg-[#EAB308] text-[#0F172A] font-black text-xs">
                        ☀️
                      </span>
                      <span className="font-bold text-sm tracking-tight text-foreground">
                        SOLAR ROOFTOP ENERGY CO., LTD.
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      88 อาคารโซลาร์ทาวเวอร์ ชั้น 18 ถนนสุขุมวิท กรุงเทพฯ 10110
                      <br />
                      เลขประจำตัวผู้เสียภาษี: 0105562089412 | โทร: 02-555-9000
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 rounded bg-primary/10 text-primary font-bold text-xs uppercase tracking-wider mb-1.5">
                      {activeDoc.type === "invoice" ? "INVOICE" : "TAX INVOICE / RECEIPT"}
                    </span>
                    <p className="font-mono font-bold text-sm text-foreground">
                      {activeDoc.documentNumber || "-"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {locale === "th" ? "วันที่ออกเอกสาร: " : "Issue Date: "}
                      {activeDoc.issueDate ? formatAppDate(activeDoc.issueDate, locale) : formatAppDate(new Date(), locale)}
                    </p>
                  </div>
                </div>

                {/* Bill To / Contract Details Meta */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/40 border border-border/60 text-xs">
                  <div>
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {locale === "th" ? "ผู้รับใบเรียกเก็บเงิน" : "Billed To"}
                    </span>
                    <p className="font-bold text-sm text-foreground mt-0.5">
                      {activeDoc.schoolName || "โรงเรียนในโครงการ"}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      {activeDoc.siteName ? `${locale === "th" ? "ไซต์งาน: " : "Site: "}${activeDoc.siteName}` : "อาคารเรียนหลัก"}
                    </p>
                    <p className="text-muted-foreground">
                      สังกัดสำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)
                    </p>
                  </div>

                  <div className="space-y-1 text-right">
                    {activeDoc.period && (
                      <div>
                        <span className="text-muted-foreground">{locale === "th" ? "รอบการใช้พลังงาน: " : "Billing Period: "}</span>
                        <strong className="text-foreground font-mono">{activeDoc.period}</strong>
                      </div>
                    )}
                    {activeDoc.dueDate && (
                      <div>
                        <span className="text-muted-foreground">{locale === "th" ? "วันครบกำหนดชำระ: " : "Due Date: "}</span>
                        <strong className="text-foreground">{formatAppDate(activeDoc.dueDate, locale)}</strong>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">{locale === "th" ? "สถานะเอกสาร: " : "Status: "}</span>
                      <Badge variant="secondary" className="ml-1 text-[10px] font-semibold">
                        {activeDoc.status || (locale === "th" ? "ใช้งานอยู่" : "Active")}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Invoice / Receipt Breakdown Table */}
                <div className="space-y-3">
                  <table className="w-full text-xs border border-border">
                    <thead>
                      <tr className="bg-muted text-left border-b border-border">
                        <th className="p-2.5 font-semibold text-foreground">#</th>
                        <th className="p-2.5 font-semibold text-foreground">{locale === "th" ? "รายการ" : "Description"}</th>
                        <th className="p-2.5 font-semibold text-foreground text-right">{locale === "th" ? "พลังงาน (kWh)" : "Energy (kWh)"}</th>
                        <th className="p-2.5 font-semibold text-foreground text-right">{locale === "th" ? "อัตรา (฿/kWh)" : "Rate (THB)"}</th>
                        <th className="p-2.5 font-semibold text-foreground text-right">{locale === "th" ? "จำนวนเงิน (บาท)" : "Amount (THB)"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="p-2.5 text-muted-foreground font-mono">1</td>
                        <td className="p-2.5">
                          <strong className="text-foreground">
                            {locale === "th" ? "ค่าพลังงานไฟฟ้าพลังงานแสงอาทิตย์" : "Solar Rooftop Energy Consumption"}
                          </strong>
                          <p className="text-[11px] text-muted-foreground">
                            {activeDoc.period ? `${locale === "th" ? "ประจำรอบบิล " : "Billing period "}${activeDoc.period}` : ""}
                          </p>
                        </td>
                        <td className="p-2.5 text-right font-mono font-medium">{formatNumber(activeDoc.consumedKwh || 2450.5)}</td>
                        <td className="p-2.5 text-right font-mono font-medium">฿{formatNumber(activeDoc.rate || 4.25)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-foreground">฿{formatNumber(subtotal)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Calculation Summary */}
                  <div className="flex justify-end pt-2">
                    <div className="w-64 space-y-1.5 text-xs">
                      <div className="flex justify-between text-muted-foreground">
                        <span>{locale === "th" ? "มูลค่าก่อนภาษี (Subtotal):" : "Subtotal:"}</span>
                        <span className="font-mono">฿{formatNumber(subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{locale === "th" ? "ภาษีมูลค่าเพิ่ม (VAT 7%):" : "VAT 7%:"}</span>
                        <span className="font-mono">฿{formatNumber(vat)}</span>
                      </div>
                      <div className="flex justify-between border-t border-border pt-1.5 font-bold text-foreground text-sm">
                        <span>{locale === "th" ? "ยอดเงินรวมทั้งสิ้น:" : "Total Amount:"}</span>
                        <span className="font-mono text-[#EAB308] dark:text-[#FACC15]">฿{formatNumber(amountNum)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signature and Confirmation Block */}
                <div className="pt-8 border-t border-border grid grid-cols-2 gap-8 text-center text-xs">
                  <div className="space-y-10">
                    <p className="font-semibold text-foreground">
                      {locale === "th" ? "ผู้ออกเอกสาร (ผู้ให้บริการ)" : "Authorized Issuer"}
                    </p>
                    <div className="border-t border-dashed border-border pt-2 text-muted-foreground">
                      <p className="font-medium text-foreground">Solar Platform Operations Team</p>
                      <p className="text-[10px]">Solar Rooftop Energy Co., Ltd.</p>
                    </div>
                  </div>
                  <div className="space-y-10">
                    <p className="font-semibold text-foreground">
                      {locale === "th" ? "ผู้รับมอบ / ผู้ตรวจสอบ (สถานศึกษา)" : "Recipient / Verified By"}
                    </p>
                    <div className="border-t border-dashed border-border pt-2 text-muted-foreground">
                      <p className="font-medium text-foreground">{activeDoc.schoolName || "ผู้อำนวยการสถานศึกษา"}</p>
                      <p className="text-[10px]">{locale === "th" ? "ผู้ตรวจสอบความถูกต้องของรอบบิล" : "School Representative"}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
