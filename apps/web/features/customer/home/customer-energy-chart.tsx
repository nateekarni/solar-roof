"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { RefreshCw, TriangleAlert } from "lucide-react";
import type {
  CustomerPortalHomeResponse,
  CustomerPortalRange,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { loadCustomerHome } from "../api/customer-portal-api";
import { formatDate } from "./customer-home-format";
import { Button } from "@/components/ui/button";

const Renderer = dynamic(
  () =>
    import("./customer-energy-chart-renderer").then(
      (module) => module.CustomerEnergyChartRenderer,
    ),
  {
    ssr: false,
    loading: () => <div className="h-64 sm:h-72" aria-busy="true" />,
  },
);
export function CustomerEnergyChart({
  initial,
  locale,
}: {
  initial: CustomerPortalHomeResponse;
  locale: Locale;
}) {
  const t = createTranslator(locale);
  const [requestedRange, setRequestedRange] = useState(initial.range);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function select(next: CustomerPortalRange) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setRequestedRange(next);
    setLoading(true);
    setFailed(false);
    const result = await loadCustomerHome(next, controller.signal);
    if (controller.signal.aborted) return;
    setLoading(false);
    if (result.status === "ready") setData(result.data);
    else setFailed(true);
  }
  const hasReadings = data.energySeries.some((point) => point.value !== null);
  return (
    <section
      aria-labelledby="energy-title"
      className="customer-card min-w-0 rounded-3xl border border-border bg-card p-5 sm:p-8"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="energy-title" className="text-xl font-semibold">
            {t("customerPortal.home.energy")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("customerPortal.common.kwh")}
          </p>
        </div>
        <div
          role="group"
          aria-label={t("customerPortal.home.energy")}
          className="inline-flex rounded-xl bg-muted p-1"
        >
          {(["7d", "30d"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              aria-pressed={data.range === value}
              onClick={() => void select(value)}
              variant={data.range === value ? "secondary" : "ghost"}
              className="min-h-11 min-w-20 rounded-lg px-4 text-sm font-medium"
            >
              {t(
                `customerPortal.home.${value === "7d" ? "sevenDays" : "thirtyDays"}`,
              )}
            </Button>
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite" className="text-sm">
        {loading && (
          <p className="mb-3 inline-flex items-center gap-2">
            <RefreshCw size={16} aria-hidden="true" />
            {t("customerPortal.common.loading")}
          </p>
        )}
        {failed && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <TriangleAlert size={18} aria-hidden="true" />
            <p>
              {t("customerPortal.home.energyUnavailable")} ·{" "}
              {t("customerPortal.home.stale")}
            </p>
            <Button
              variant="link"
              onClick={() => void select(requestedRange)}
            >
              {t("customerPortal.common.retry")}
            </Button>
          </div>
        )}
      </div>
      <div aria-busy={loading}>
        {hasReadings ? (
          <Renderer series={data.energySeries} locale={locale} />
        ) : (
          <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground">
            <TriangleAlert size={20} aria-hidden="true" />
            <p>
              {t(
                data.energySeries.length
                  ? "customerPortal.home.energyUnavailable"
                  : "customerPortal.home.energyEmpty",
              )}
            </p>
          </div>
        )}
      </div>
      {hasReadings && (
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
            {t("customerPortal.home.energyReadings")}
          </summary>
          <div className="max-h-60 overflow-auto">
            <table className="w-full text-left">
              <caption className="sr-only">
                {t("customerPortal.home.energy")}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="py-2">
                    {t("customerPortal.common.date")}
                  </th>
                  <th scope="col">{t("customerPortal.common.kwh")}</th>
                </tr>
              </thead>
              <tbody>
                {data.energySeries.map((point) => (
                  <tr key={point.date}>
                    <th scope="row" className="py-2 font-normal">
                      {formatDate(point.date, locale)}
                    </th>
                    <td>
                      {point.value === null
                        ? t("customerPortal.common.unavailable")
                        : new Intl.NumberFormat(locale, {
                            maximumFractionDigits: 2,
                          }).format(point.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
