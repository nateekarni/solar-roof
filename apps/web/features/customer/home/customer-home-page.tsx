"use client";

import { TriangleAlert } from "lucide-react";
import { createTranslator, type Locale } from "@solar/i18n";
import type { CustomerHomeState } from "../api/customer-portal-api";
import { BillBreakdown } from "./bill-breakdown";
import { CurrentBillHero } from "./current-bill-hero";
import { CustomerEnergyChart } from "./customer-energy-chart";
import { RecentFinancialRecords } from "./recent-financial-records";
import { useLocale } from "../../../providers/locale-provider";

export function CustomerHomePage({
  initial,
  locale: initialLocale,
}: {
  initial: CustomerHomeState;
  locale: Locale;
}) {
  const locale = useLocale(initialLocale);
  const t = createTranslator(locale);
  if (initial.status === "unavailable")
    return (
      <section
        role="alert"
        className="rounded-3xl border border-border bg-card p-8"
      >
        <TriangleAlert aria-hidden="true" className="mb-4" />
        <h1 className="text-xl font-semibold">
          {t("customerPortal.home.unavailable")}
        </h1>
        <a
          href="/"
          className="mt-5 inline-flex min-h-11 items-center underline"
        >
          {t("customerPortal.common.retry")}
        </a>
      </section>
    );
  const { data } = initial;
  return (
    <div className="space-y-7 sm:space-y-9">
      <header>
        <p className="text-sm text-muted-foreground">
          {t("customerPortal.home.title")}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {data.site
            ? t("customerPortal.home.welcome", { name: data.site.customerName })
            : t("customerPortal.home.noSite")}
        </h1>
        {data.site && (
          <p className="mt-2 text-sm text-muted-foreground">{data.site.name}</p>
        )}
      </header>
      {data.site && (
        <>
          <div
            className={`grid min-w-0 gap-5 ${data.focusedBill ? "md:grid-cols-2" : ""}`}
          >
            <CurrentBillHero
              bill={data.focusedBill}
              additionalOpenBillCount={data.additionalOpenBillCount}
              canPay={data.capabilities.canPay}
              locale={locale}
            />
            {data.focusedBill && (
              <BillBreakdown bill={data.focusedBill} locale={locale} />
            )}
          </div>
          <CustomerEnergyChart initial={data} locale={locale} />
          <RecentFinancialRecords
            records={data.recentFinancialRecords}
            locale={locale}
            canPay={data.capabilities.canPay}
            canViewDocuments={data.capabilities.canViewDocuments}
          />
        </>
      )}
    </div>
  );
}
