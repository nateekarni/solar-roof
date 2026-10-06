import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  FileText,
  Receipt,
  Sun,
  Zap,
  Check,
  Clock,
  Upload,
  Hourglass,
} from "lucide-react";
import type { DashboardSummaryResponse } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from "../../components/ui/empty";
import { formatAppDateRange, formatAppDateTime } from "../../lib/date-format";
import { SchoolEnergyScene } from "./school-energy-scene";
import { SchoolProductionChart } from "./school-production-chart";

export type SchoolInvoice = {
  id: string;
  amount?: string | number | null;
  period?: string;
  status?: string;
  paymentStatus?: string;
  invoiceNumber?: string | null;
};
export type SchoolDashboardProps = {
  data: DashboardSummaryResponse;
  locale: Locale;
  periodControl?: ReactNode;
  todayKwh?: number | null;
  monthKwh?: number | null;
  invoice?: SchoolInvoice | null;
  billingUnavailable?: boolean;
};

export function SchoolDashboard({
  data,
  locale,
  periodControl,
  todayKwh,
  monthKwh,
  invoice,
  billingUnavailable = false,
}: SchoolDashboardProps) {
  const th = locale === "th";
  const text = (thai: string, english: string) => (th ? thai : english);
  const number = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value)
      ? text("ยังไม่มีข้อมูล", "Unavailable")
      : value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const power = data.stats.currentMw;
  const knownPower = power !== null && Number.isFinite(power);
  const producing = knownPower && power > 0;
  const schoolName =
    data.sites[0]?.schoolName ||
    text(
      "ยังไม่มีข้อมูลโรงเรียนที่ได้รับมอบหมาย",
      "School assignment unavailable",
    );
  const paid = invoice?.status === "paid" || invoice?.paymentStatus === "paid";
  const submitted =
    paid ||
    invoice?.paymentStatus === "pending_verification" ||
    invoice?.status === "pending_verification";
  const canPay =
    !!invoice && !["draft", "cancelled"].includes(invoice.status ?? "");
  const currentStep = canPay && !paid ? (submitted ? 2 : 1) : -1;
  const billingStatus = paid
    ? text("ชำระแล้ว", "Paid")
    : invoice?.status === "cancelled"
      ? text("ยกเลิกแล้ว", "Cancelled")
      : invoice?.status === "draft"
        ? text("กำลังจัดทำ", "Being prepared")
        : invoice?.paymentStatus === "rejected"
          ? text("กรุณาตรวจสอบหลักฐาน", "Please review payment proof")
          : submitted
            ? text("รอตรวจสอบ", "Awaiting verification")
            : text("รอชำระ", "Awaiting payment");
  const timestamp = data.sites
    .map((site) => site.lastUpdated)
    .filter(
      (value): value is string => !!value && Number.isFinite(Date.parse(value)),
    )
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];
  const amount =
    invoice?.amount == null || String(invoice.amount).trim() === ""
      ? null
      : Number(invoice.amount);
  return (
    <div className="content flex w-full min-w-0 flex-col gap-5 pb-4">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">{schoolName}</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {text("พลังงานของโรงเรียน", "Your school’s solar energy")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {text(
              "ดูพลังงานและจัดการเอกสารได้ในที่เดียว",
              "Energy and documents, all in one place",
            )}
          </p>
        </div>
      </header>
      {data.energyReadModel?.enabled &&
        data.energyReadModel.status === "preparing" && (
          <p role="status" className="rounded-xl bg-muted p-4 text-sm">
            {text(
              "กำลังอัปเดตยอดพลังงาน ยอดที่แสดงอาจยังไม่ครบ",
              "Energy totals are updating and may be incomplete.",
            )}
          </p>
        )}
      <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-wrap items-center justify-between gap-3 py-4">
              <CardTitle className="text-base">
                {text("ภาพรวมพลังงานตอนนี้", "Energy right now")}
              </CardTitle>
              <Badge variant="secondary" className="gap-1.5">
                <span
                  className={`size-1.5 rounded-full ${producing ? "bg-primary" : "bg-muted-foreground"}`}
                />
                {knownPower
                  ? producing
                    ? text("กำลังผลิตไฟฟ้า", "Producing solar power")
                    : text(
                        "ยังไม่มีการผลิตไฟฟ้าขณะนี้",
                        "No power being generated",
                      )
                  : text(
                      "ยังไม่มีข้อมูลการผลิตล่าสุด",
                      "No recent production reading",
                    )}
              </Badge>
            </CardHeader>
            <CardContent className="relative overflow-hidden px-0">
              <div className="relative w-full aspect-[1.15] min-h-80 sm:aspect-[1.6] sm:min-h-96">
                <div className="absolute inset-0">
                  <SchoolEnergyScene />
                </div>
                <div className="absolute left-[34%] top-[23%] flex w-[32%] flex-col items-center rounded-2xl border border-white/80 bg-white/95 px-2 py-3 text-center text-slate-900 shadow-sm">
                  <span className="text-[10px] sm:text-xs">
                    {text("กำลังผลิตขณะนี้", "Solar power now")}
                  </span>
                  <p
                    className={`mt-1 font-semibold tracking-tight ${knownPower ? "text-2xl sm:text-4xl" : "text-sm sm:text-lg"}`}
                  >
                    {number(knownPower ? power * 1000 : null)}
                    <span className="ml-1 text-xs font-normal sm:text-sm">
                      {knownPower ? "kW" : ""}
                    </span>
                  </p>
                </div>
                <div className="absolute bottom-4 left-4 right-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-white/80 bg-white/90 p-3 text-slate-900 backdrop-blur-sm">
                    <p className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Sun className="size-4" />
                      {text("ผลิตวันนี้", "Generated today")}
                    </p>
                    <p className="mt-1 text-lg font-semibold sm:text-2xl">
                      {number(todayKwh)}{" "}
                      <span className="text-xs font-normal">
                        {todayKwh != null && Number.isFinite(todayKwh)
                          ? "kWh"
                          : ""}
                      </span>
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/80 bg-white/90 p-3 text-slate-900 backdrop-blur-sm">
                    <p className="flex items-center gap-1.5 text-xs text-slate-600">
                      <Zap className="size-4" />
                      {text("ผลิตเดือนนี้", "Generated this month")}
                    </p>
                    <p className="mt-1 text-lg font-semibold sm:text-2xl">
                      {number(monthKwh)}{" "}
                      <span className="text-xs font-normal">
                        {monthKwh != null && Number.isFinite(monthKwh)
                          ? "kWh"
                          : ""}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col items-start gap-2 py-4 text-xs text-muted-foreground">
              <p>
                {text(
                  "เส้นทางพลังงาน: แสงอาทิตย์ → แผงโซลาร์ → อินเวอร์เตอร์ → โรงเรียน",
                  "Energy route: sunlight → solar panels → inverter → school",
                )}
              </p>
              <p className="flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {timestamp
                  ? `${text("โรงเรียนเชื่อมต่อล่าสุด", "Last school connection")}: ${formatAppDateTime(timestamp, locale)}`
                  : text(
                      "รอข้อมูลวัดล่าสุดจากโรงเรียน",
                      "Waiting for the latest school reading",
                    )}
              </p>
            </CardFooter>
          </Card>
          <Card className="gap-5 py-5">
            <CardHeader className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {text("พลังงานที่ผลิต", "Generated energy")}
                </CardTitle>
                <CardDescription className="mt-1">
                  {formatAppDateRange(data.range.start, data.range.end, locale)}{" "}
                  · kWh
                </CardDescription>
              </div>
              <div className="max-w-full">{periodControl}</div>
            </CardHeader>
            <CardContent>
              <SchoolProductionChart points={data.production} locale={locale} />
              <p className="mt-3 text-xs text-muted-foreground">
                {text(
                  "พลังงานรายวันจากช่วงเวลาที่มีการวัด หากข้อมูลขาด ยอดรวมอาจไม่ครบ",
                  "Daily energy from measured intervals. Missing readings may make totals incomplete.",
                )}
              </p>
            </CardContent>
            <CardFooter>
              <Button
                variant="outline"
                asChild
                className="min-h-11 w-full sm:w-auto"
              >
                <Link href="/production">
                  {text("ดูการผลิตไฟฟ้า", "View production")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="gap-5 py-5">
            <CardHeader>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="size-5 shrink-0 text-primary" />
                  {text("ใบแจ้งหนี้ล่าสุด", "Latest invoice")}
                </CardTitle>
                {invoice && (
                  <Badge
                    variant="outline"
                    className={`max-w-36 gap-1.5 whitespace-normal rounded-full px-2.5 py-1 text-center text-[11px] ${paid ? "border-success/20 bg-success/10 text-success" : canPay ? "border-warning/30 bg-warning/10 text-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    <span
                      className={`size-1.5 shrink-0 rounded-full ${paid ? "bg-success" : canPay ? "bg-warning" : "bg-muted-foreground"}`}
                    />
                    {billingStatus}
                  </Badge>
                )}
              </div>
              <CardDescription>
                {text("ค่าไฟฟ้า", "Electricity charges")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              {invoice ? (
                <>
                  <div>
                    {(invoice.invoiceNumber || invoice.period) && (
                      <dl className="mb-4 flex flex-col gap-2 pb-4 text-xs">
                        {invoice.invoiceNumber && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">
                              {text("เลขที่เอกสาร", "Document number")}
                            </dt>
                            <dd className="break-all text-right font-medium">
                              {invoice.invoiceNumber}
                            </dd>
                          </div>
                        )}
                        {invoice.period && (
                          <div className="flex justify-between gap-3">
                            <dt className="text-muted-foreground">
                              {text(
                                "รอบบิลค่าพลังงาน",
                                "Energy billing period",
                              )}
                            </dt>
                            <dd className="font-medium">{invoice.period}</dd>
                          </div>
                        )}
                      </dl>
                    )}
                    <div className="rounded-2xl border bg-muted/40 p-4">
                      <p className="mb-1 text-xs text-muted-foreground">
                        {text(
                          "ยอดชำระตามสัญญารอบนี้",
                          "Amount for this billing period",
                        )}
                      </p>
                      <p className="text-3xl font-semibold tracking-tight">
                        {number(amount)}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          {amount !== null && Number.isFinite(amount)
                            ? text("บาท", "THB")
                            : ""}
                        </span>
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <Empty className="p-5">
                  <EmptyHeader>
                    <EmptyTitle>
                      {billingUnavailable
                        ? text(
                            "โหลดใบแจ้งหนี้ไม่สำเร็จ",
                            "Billing is unavailable",
                          )
                        : text("ยังไม่มีใบแจ้งหนี้", "No billing records")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {billingUnavailable
                        ? text(
                            "ลองเปิดหน้าใบแจ้งหนี้อีกครั้ง",
                            "Please try the invoices page again.",
                          )
                        : text(
                            "ใบแจ้งหนี้ของโรงเรียนจะแสดงที่นี่เมื่อมีการออกเอกสาร",
                            "Your school’s invoices will appear here when issued.",
                          )}
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              <section
                aria-label={text("ขั้นตอนการชำระเงิน", "Payment steps")}
                className="pt-4"
              >
                <h3 className="mb-4 hidden text-sm font-semibold sm:block">
                  {text("ขั้นตอนการชำระเงิน", "Payment steps")}
                </h3>
                <ol className="grid grid-cols-3 text-center text-[10.5px] sm:text-xs">
                  {[
                    text("ตรวจบิล", "Review invoice"),
                    text("แนบสลิป", "Upload proof"),
                    paid
                      ? text("ตรวจสอบแล้ว", "Payment verified")
                      : text("รอตรวจสอบ", "Awaiting verification"),
                  ].map((label, index) => {
                    const complete =
                      canPay &&
                      (index === 0 ||
                        (index === 1 && submitted) ||
                        (index === 2 && paid));
                    const active = index === currentStep;
                    return (
                      <li
                        key={index}
                        aria-current={active ? "step" : undefined}
                        data-state={
                          complete ? "complete" : active ? "current" : "pending"
                        }
                        className="relative flex min-w-0 flex-col items-center gap-1.5 px-1"
                      >
                        {index < 2 && (
                          <span
                            aria-hidden="true"
                            className={`absolute left-1/2 top-2.5 h-0.5 w-full sm:top-4 ${complete && (index === 0 ? submitted : paid) ? "bg-success" : "bg-border"}`}
                          />
                        )}
                        <span
                          className={`relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full ring-4 ring-card sm:size-8 ${complete ? "bg-success text-success-foreground" : active ? "border-2 border-warning bg-warning/15 text-foreground" : "border bg-muted text-muted-foreground"}`}
                        >
                          {complete ? (
                            <Check className="size-3 sm:size-4" />
                          ) : (
                            <>
                              <span className="sm:hidden">{index + 1}</span>
                              {index === 1 ? (
                                <Upload className="hidden size-4 sm:block" />
                              ) : index === 2 ? (
                                <Hourglass className="hidden size-4 sm:block" />
                              ) : (
                                <span className="hidden sm:block">1</span>
                              )}
                            </>
                          )}
                        </span>
                        <span
                          className={`relative z-10 ${complete ? "font-medium text-success" : active ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                        >
                          {label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </section>
            </CardContent>
            <CardFooter>
              <Button asChild className="min-h-11 w-full rounded-full">
                <Link
                  href={
                    invoice
                      ? `/records/billing/${encodeURIComponent(invoice.id)}`
                      : "/billing"
                  }
                >
                  {text("ดูใบแจ้งหนี้", "View invoice")}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
          <Card className="gap-5 py-5">
            <CardHeader>
              <CardTitle>
                {text("เอกสารของโรงเรียน", "School documents")}
              </CardTitle>
              <CardDescription>
                {text(
                  "เข้าถึงเอกสารสำคัญได้ง่าย",
                  "Everything you need, easy to find",
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {[
                {
                  href: "/contracts",
                  label: text("สัญญา", "Contracts"),
                  icon: FileText,
                },
                {
                  href: "/billing",
                  label: text("ใบแจ้งหนี้", "Invoices"),
                  icon: Zap,
                },
                {
                  href: "/receipts",
                  label: text("ใบเสร็จรับเงิน", "Receipts"),
                  icon: Receipt,
                },
              ].map((item) => (
                <Button
                  key={item.href}
                  variant="ghost"
                  asChild
                  className="h-auto min-h-12 w-full justify-start px-3"
                >
                  <Link href={item.href}>
                    <item.icon className="size-4 text-primary" />
                    <span className="flex-1 text-left">{item.label}</span>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
