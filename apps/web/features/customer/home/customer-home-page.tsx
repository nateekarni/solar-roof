"use client";

import { TriangleAlert } from "lucide-react";
import type { CustomerProductionHistory as ProductionHistory } from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import type { CustomerHomeState } from "../api/customer-portal-api";
import { CurrentBillHero } from "./current-bill-hero";
import { CustomerEnergyChart } from "./customer-energy-chart";
import { CustomerPowerFlow } from "./customer-power-flow";
import { RecentFinancialRecords } from "./recent-financial-records";
import { useLocale } from "../../../providers/locale-provider";
import { CustomerProductionHistory } from "../production/customer-production-history";

export function CustomerHomePage({
  initial,
  production = null,
  locale: initialLocale,
}: {
  initial: CustomerHomeState;
  production?: ProductionHistory | null | undefined;
  locale: Locale;
}) {
  const locale = useLocale(initialLocale);
  const t = createTranslator(locale);
  const data = initial.status === "ready" ? initial.data : null;
  const accountState = !data ? (
    <section
      role="alert"
      data-dashboard-area="bill"
      className="customer-dashboard-panel border border-border bg-card p-5"
    >
      <TriangleAlert aria-hidden="true" className="mb-4" />
      <h2 className="text-xl font-semibold">
        {t("customerPortal.home.unavailable")}
      </h2>
      <a
        href="/"
        className="mt-5 inline-flex min-h-11 items-center underline"
      >
        {t("customerPortal.common.retry")}
      </a>
    </section>
  ) : !data.site ? (
    <section data-dashboard-area="bill" className="customer-dashboard-panel border border-border bg-card p-5">
      <h2 className="text-xl font-semibold">
        {t("customerPortal.home.noSite")}
      </h2>
    </section>
  ) : data.focusedBill ? (
    <CurrentBillHero
      bill={data.focusedBill}
      additionalOpenBillCount={data.additionalOpenBillCount}
      canPay={data.capabilities.canPay}
      locale={locale}
    />
  ) : null;

  return (
    <div
      data-customer-dashboard-board="true"
      data-has-bill={Boolean(data?.focusedBill)}
      className="customer-dashboard-board"
    >
      <CustomerProductionHistory
        initial={production}
        locale={locale}
        customerName={data?.site?.customerName}
        afterHeader={
          <>
            {accountState}
            {data?.site && <CustomerPowerFlow locale={locale} measurements={null} />}
          </>
        }
      />
      {data?.site && (
        <>
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
