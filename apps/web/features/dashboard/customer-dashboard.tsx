import {SiteContext} from './site-context';
import {SelectedSiteSummary} from './selected-site-summary';
import type { ReactNode } from "react";
import Link from "next/link";
import type { DashboardSummaryResponse } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import { formatAppDateRange } from "../../lib/date-format";
import { formatOrganizationMonth } from "../organization/organization-month-format";
import { CustomerProductionChart } from "./customer-production-chart";
import { OrganizationPowerDiagrams } from "./organization-power-diagrams";
import {
  outstandingInvoices,
  type OrganizationDocument,
} from "../organization/organization-document-model";
export type CustomerInvoice = OrganizationDocument;
export type CustomerDashboardProps = {
  data: DashboardSummaryResponse;
  locale: Locale;
  periodControl?: ReactNode;
  siteControl?: ReactNode;
  siteId?: string | undefined;
  todayKwh?: number | null;
  monthKwh?: number | null;
  invoice?: CustomerInvoice | null;
  invoices?: CustomerInvoice[];
  billingUnavailable?: boolean;
  billingHasMore?: boolean;
};
export function CustomerDashboard({
  data,
  locale,
  periodControl,
  siteControl,
  siteId,
  todayKwh,
  monthKwh,
  invoice,
  invoices,
  billingUnavailable = false,
  billingHasMore = false,
}: CustomerDashboardProps) {
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  const number = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value)
      ? text("ยังไม่มีข้อมูล", "Unavailable")
      : value.toLocaleString(locale, { maximumFractionDigits: 2 });
  const bills = outstandingInvoices(invoices ?? (invoice ? [invoice] : []));
  const preparing = data.energyReadModel?.status === "preparing";
  const selectedSite=siteId?data.sites.find(site=>site.id===siteId):undefined;
  const metrics = [
    {
      label: text("ผลิตวันนี้", "Generated today"),
      value: todayKwh,
      unit: "kWh",
    },
    {
      label: text("ผลิตเดือนนี้", "Generated this month"),
      value: monthKwh,
      unit: "kWh",
    },
    {
      label: text("พลังงานที่ผลิต", "Generated energy"),
      value: preparing ? null : data.stats.periodKwh,
      unit: "kWh",
    },
    {
      label: text("ยอดวางบิลในช่วงเวลา", "Billed amount in period"),
      value: data.stats.billCount ? data.stats.periodAmount : null,
      unit: "THB",
    },
  ];
  return (
    <div className="content w-full min-w-0 space-y-5 pb-4">
      {!selectedSite&&<SiteContext sites={data.sites} siteId={siteId} locale={locale} showGateway={false}/>}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{text("หน้าแรก", "Home")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {Array.from(
              new Set(
                data.sites.map((site) => site.customerName).filter(Boolean),
              ),
            ).join(" · ") ||
              text(
                "ยังไม่มีข้อมูลองค์กรที่ได้รับมอบหมาย",
                "Organization assignment unavailable",
              )}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatAppDateRange(data.range.start, data.range.end, locale)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {siteControl}
          {periodControl}
        </div>
      </header>
      {preparing && (
        <p role="status">
          {text(
            "กำลังอัปเดตยอดพลังงาน ยอดที่แสดงอาจยังไม่ครบ",
            "Energy totals are updating and may be incomplete.",
          )}
        </p>
      )}
      {selectedSite?<SelectedSiteSummary site={selectedSite} detail={data.selectedSite} locale={locale} showTechnical={false}/>:<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article key={metric.label} className="rounded-xl border bg-card p-4">
            <h2 className="text-sm text-muted-foreground">{metric.label}</h2>
            <p className="mt-3 text-2xl font-semibold">
              {number(metric.value)}{" "}
              <span className="text-xs font-normal">
                {metric.value != null && Number.isFinite(metric.value)
                  ? metric.unit
                  : ""}
              </span>
            </p>
          </article>
        ))}
      </section>}
      <OrganizationPowerDiagrams locale={locale} siteId={siteId} />
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 font-semibold">
          {text("พลังงานที่ผลิต", "Generated energy")}
        </h2>
        <CustomerProductionChart points={data.production} locale={locale} />
        <p className="mt-3 text-xs text-muted-foreground">
          {text(
            "ข้อมูลจากช่วงเวลาที่มีการวัด หากข้อมูลขาด ยอดรวมอาจไม่ครบ",
            "Based on measured intervals. Missing readings may make totals incomplete.",
          )}
        </p>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">
          {text("ใบวางบิลที่ยังไม่ชำระ", "Outstanding invoices")}
        </h2>
        {billingUnavailable ? (
          <p role="alert">
            {text("โหลดใบวางบิลไม่สำเร็จ", "Billing is unavailable")}
          </p>
        ) : bills.length === 0 ? (
          <p>
            {text(
              "ไม่มีใบวางบิลที่ยังไม่ชำระในรายการที่โหลด",
              "No outstanding invoices in the loaded records",
            )}
          </p>
        ) : (
          <ul className="divide-y">
            {bills.map((bill) => (
              <li
                key={bill.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium">
                    {bill.invoiceNumber ||
                      (bill.period
                        ? formatOrganizationMonth(bill.period, locale)
                        : bill.id)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {bill.siteName} ·{" "}
                    {bill.paymentStatus === "pending_verification" ||
                    bill.status === "pending_verification"
                      ? text("รอตรวจสอบ", "Awaiting verification")
                      : bill.paymentStatus === "rejected" ||
                          bill.status === "rejected"
                        ? text(
                            "กรุณาตรวจสอบหลักฐาน",
                            "Please review payment proof",
                          )
                        : text("รอชำระ", "Awaiting payment")}
                  </p>
                </div>
                <p>
                  {number(
                    bill.amount == null || String(bill.amount).trim() === ""
                      ? null
                      : Number(bill.amount),
                  )}{" "}
                  THB
                </p>
                <Link
                  className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
                  href={`/records/billing/${encodeURIComponent(bill.id)}`}
                >
                  {text(
                    "ดูใบวางบิล / แนบหลักฐาน",
                    "Review invoice / Upload proof",
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {billingHasMore && (
          <p className="text-sm text-muted-foreground">
            {text(
              "แสดงเพียงรายการล่าสุด อาจมีใบวางบิลเพิ่มเติม",
              "Showing recent records. More invoices may be available.",
            )}
          </p>
        )}
        <Link
          className="inline-flex min-h-11 items-center text-foreground underline underline-offset-4"
          href="/billing"
        >
          {text("ดูเอกสารทั้งหมด", "See all documents")} →
        </Link>
      </section>
    </div>
  );
}

