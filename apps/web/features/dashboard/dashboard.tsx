import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  DashboardSummaryAlert,
  DashboardSummaryResponse,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { renderStatusBadge } from "../../lib/status-badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { CollectionChart } from "./collection-chart";
import { CompareModal } from "./compare-modal";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";
import { DashboardStatsClient } from "./dashboard-stats-client";
import { PeriodPicker } from "./period-picker";
import { PowerFlowCard } from "./power-flow-card";
import { ProductionChart } from "./production-chart";
import { RankingChart } from "./ranking-chart";
import { RevenueChart } from "./revenue-chart";
import { SiteFilter } from "./site-filter";
import { SiteMap } from "./site-map";
import { GatewayStatusSummary } from "./gateway-status-summary";
import { SummaryStatus } from "./summary-status";

type DashboardData = DashboardSummaryResponse;
async function getDashboardData(
  startDate?: string,
  endDate?: string,
  month?: string,
  year?: string,
  siteId?: string,
): Promise<DashboardData> {
  const baseUrl = getApiBaseUrl();

  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  if (siteId) params.set("site_id",siteId);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await serverFetch(`${baseUrl}/v1/dashboard/summary${query}`, {
    cache: "no-store",
  });
  if (response.status === 401) {
    redirect("/login");
  }
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดข้อมูลจาก API ได้ (HTTP ${response.status})`);
  }
  return response.json() as Promise<DashboardData>;
}

export async function Dashboard({
  searchParams,
}: {
  searchParams?:
    | Promise<{
        start_date?: string;
        end_date?: string;
        month?: string;
        year?: string;
        site_id?: string;
      }>
    | undefined;
} = {}) {
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";
  const t = createTranslator(locale);

  const resolvedParams = searchParams ? await searchParams : undefined;
  const data = await getDashboardData(
    resolvedParams?.start_date,
    resolvedParams?.end_date,
    resolvedParams?.month,
    resolvedParams?.year,
    resolvedParams?.site_id,
  );

  const alerts = data.alerts || [];

  return (
    <div className="content dashboard-content w-full min-w-0 max-w-full overflow-x-hidden">
      <DashboardAutoRefresh />
      {/* Dashboard Top Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 w-full min-w-0">
        <div className="shrink-0 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground md:text-2xl whitespace-nowrap">
            {t("dashboard.homeTitle") || "หน้าแรก"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          <SiteFilter sites={data.availableSites} />
          <CompareModal sites={data.availableSites} startDate={data.range.start} endDate={data.range.end} />
          <PeriodPicker />
        </div>
      </div>

      {/* Top 6 Stat Cards (Customizable) */}
      <DashboardStatsClient stats={data.stats} totalSites={data.sites?.length} />
      <SummaryStatus model={data.energyReadModel} locale={locale} />

          {/* Recent Alerts Card */}
          <Card className="panel flex flex-col flex-1 h-full justify-between">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground">
                  {t("dashboard.liveHealth")}
                </CardTitle>
                <Link
                  href="/alerts"
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  {t("dashboard.all")}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
              {alerts.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t("dashboard.noAlerts")}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.slice(0, 5).map((alert: DashboardSummaryAlert, idx: number) => {
                    const isCritical =
                      alert.severity === "critical" ||
                      alert.status === "ออฟไลน์";
                    return (
                      <div
                        className="flex items-center justify-between gap-3 py-2"
                        key={`${alert.title}-${idx}`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div
                            className={`grid size-6 shrink-0 place-items-center rounded-md mt-0.5 ${
                              isCritical
                                ? "bg-destructive/10 text-destructive"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            <AlertTriangle className="size-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                            <span className="truncate text-xs font-semibold text-foreground leading-tight">
                              {alert.title}
                            </span>
                            <span className="truncate text-[11px] text-muted-foreground leading-tight">
                              {alert.detail}
                            </span>
                          </div>
                        </div>
                        {renderStatusBadge(alert.status, locale)}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

      <GatewayStatusSummary sites={data.sites || []} locale={locale} />

      {/* 3-Column Main Dashboard Grid */}
      <section className="dashboard-3col w-full min-w-0 max-w-full">
        {/* Left Column: All Schools Map */}
        <SiteMap sites={data.sites || []} />

        {/* Center Column: Production Chart & Revenue Chart */}
        <div className="chart-stack w-full min-w-0 max-w-full">
          <ProductionChart
            initialData={data.production}
            hasCustomRange={Boolean(
              resolvedParams?.start_date && resolvedParams?.end_date
            )}
            startDate={data.range.start}
            endDate={data.range.end}
          />
          <RevenueChart
            initialData={data.revenue}
            hasCustomRange={Boolean(
              resolvedParams?.start_date && resolvedParams?.end_date
            )}
            startDate={data.range.start}
            endDate={data.range.end}
          />
        </div>

        {/* Right Column: Recent Alerts & Collection Status */}
        <div className="right-stack w-full min-w-0 max-w-full">
          {/* Collection Status Card */}
          <CollectionChart collection={data.collection} />
        </div>
      </section>

      {/* Live Power Flow Diagram & System Overview */}
      <div className="mb-4 w-full min-w-0">
        <PowerFlowCard siteId={resolvedParams?.site_id} />
      </div>

      {/* Bottom Row: Highest Energy Producing Schools Today */}
      <section className="mt-3 w-full min-w-0 max-w-full">
        <RankingChart sites={data.rankings} />
      </section>
    </div>
  );
}
