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
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const request = useRef<{
    controller: AbortController;
    range: CustomerPortalRange;
  } | null>(null);
  useEffect(() => () => request.current?.controller.abort(), []);
  async function select(next: CustomerPortalRange) {
    if (
      request.current?.range === next &&
      !request.current.controller.signal.aborted
    )
      return;
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { controller, range: next };
    setRequestedRange(next);
    setLoading(true);
    setFailed(false);
    const result = await loadCustomerHome(next, controller.signal);
    if (controller.signal.aborted) return;
    request.current = null;
    setLoading(false);
    if (result.status === "ready") setData(result.data);
    else setFailed(true);
  }
  const measured = data.energySeries.filter(
    (point) => point.value !== null && Number.isFinite(point.value) && point.value >= 0,
  );
  const hasReadings = measured.length > 0;
  const latest = [...measured].sort((a, b) => b.date.localeCompare(a.date))[0];
  const measuredTotal = measured.reduce((sum, point) => sum + (point.value ?? 0), 0);
  const energyNumber = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const panelContent = (
    <>
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
            <Button variant="link" onClick={() => void select(requestedRange)}>
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
      {measured.length > 0 && (
        <div data-energy-range-summary="true" className="mt-3 divide-y divide-border/70 border-t border-border/70 text-sm">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-muted-foreground">
              {locale === "th" ? "วันที่มีข้อมูลล่าสุด" : "Latest measured day"}
              <span className="block text-[11px]">{formatDate(latest!.date, locale)}</span>
            </span>
            <strong className="font-mono tabular-nums text-[var(--customer-link)]">{energyNumber.format(latest!.value!)} <span className="text-xs font-normal">{t("customerPortal.common.kwh")}</span></strong>
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-muted-foreground">
              {locale === "th" ? "รวมพลังงานที่บันทึกในช่วงนี้" : "Recorded energy in this range"}
              <span className="block text-[11px]">{measured.length}/{data.energySeries.length} {locale === "th" ? "วัน" : "days"}</span>
            </span>
            <strong className="font-mono tabular-nums">{energyNumber.format(measuredTotal)} <span className="text-xs font-normal">{t("customerPortal.common.kwh")}</span></strong>
          </div>
        </div>
      )}
      {hasReadings && (
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" className="mt-3 min-h-11 rounded-md text-xs">
              {t("customerPortal.home.energyReadings")}
            </Button>
          </DialogTrigger>
          <DialogContent className="customer-portal sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("customerPortal.home.energyReadings")}</DialogTitle>
              <DialogDescription>{locale === "th" ? "ค่าพลังงานรายวันที่บันทึกได้ในช่วงที่เลือก" : "Recorded daily energy for the selected range"}</DialogDescription>
            </DialogHeader>
            <DialogBody className="max-h-[60vh] overflow-auto">
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
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
  return (
    <section
      aria-labelledby="energy-title"
      data-dashboard-area="trend"
      className="customer-dashboard-panel min-w-0 border border-primary/30 bg-card p-4 sm:p-5"
    >
      <Tabs
        value={data.range}
        onValueChange={(value) => {
          if (value === "7d" || value === "30d") void select(value);
        }}
        className="gap-0"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="energy-title" className="text-base font-semibold sm:text-lg">
              {t("customerPortal.home.energy")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("customerPortal.common.kwh")}
            </p>
          </div>
          <TabsList
            aria-label={t("customerPortal.home.energy")}
            className="rounded-lg bg-muted p-1"
          >
            {(["7d", "30d"] as const).map((value) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-11! min-w-16 rounded-md px-3 text-xs font-medium data-[state=inactive]:text-foreground/80"
              >
                {t(
                  `customerPortal.home.${value === "7d" ? "sevenDays" : "thirtyDays"}`,
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {(["7d", "30d"] as const).map((value) => (
          <TabsContent
            key={value}
            value={value}
            forceMount
            className="mt-0 data-[state=inactive]:hidden"
          >
            {value === data.range ? panelContent : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
