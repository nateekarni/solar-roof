import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import type {
  DashboardSummaryAlert,
  DashboardSummaryResponse,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { Badge } from "../../components/ui/badge";
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
import { ProductionChart } from "./production-chart";
import { RankingChart } from "./ranking-chart";
import { RevenueChart } from "./revenue-chart";
import { SiteMap } from "./site-map";

async function getDashboardData(
  startDate?: string,
  endDate?: string,
  month?: string,
  year?: string,
): Promise<DashboardSummaryResponse> {
  const baseUrl = getApiBaseUrl();

  const params = new URLSearchParams();
  if (startDate) params.set("start_date", startDate);
  if (endDate) params.set("end_date", endDate);
  if (month) params.set("month", month);
  if (year) params.set("year", year);
  const query = params.toString() ? `?${params.toString()}` : "";

  const response = await serverFetch(`${baseUrl}/v1/dashboard/summary${query}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`ไม่สามารถโหลดข้อมูลจาก API ได้ (HTTP ${response.status})`);
  }
  return response.json() as Promise<DashboardSummaryResponse>;
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
  );

  const alerts = data.alerts || [];

  return (
    <main className="content">
      <DashboardAutoRefresh />
      {/* Dashboard Top Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
            {t("dashboard.title")}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <CompareModal />
          <PeriodPicker />
        </div>
      </div>

      {/* Top 6 Stat Cards (Customizable) */}
      <DashboardStatsClient stats={data.stats} />

      {/* 3-Column Main Dashboard Grid */}
      <section className="dashboard-3col">
        {/* Left Column: All Schools Map */}
        <SiteMap sites={data.sites || []} />

        {/* Center Column: Production Chart & Revenue Chart */}
        <div className="chart-stack">
          <ProductionChart initialData={data.production} />
          <RevenueChart initialData={data.revenue} />
        </div>

        {/* Right Column: Recent Alerts & Collection Status */}
        <div className="right-stack">
          {/* Recent Alerts Card */}
          <Card className="panel">
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
            <CardContent className="p-0">
              {alerts.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {t("dashboard.noAlerts")}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {alerts.slice(0, 4).map((alert: DashboardSummaryAlert, idx: number) => {
                    const isCritical =
                      alert.severity === "critical" ||
                      alert.status === "ออฟไลน์";
                    return (
                      <div
                        className="flex items-center justify-between gap-2 py-2.5"
                        key={`${alert.title}-${idx}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`grid size-6 shrink-0 place-items-center rounded-md ${
                              isCritical
                                ? "bg-destructive/10 text-destructive"
                                : "bg-warning/15 text-warning"
                            }`}
                          >
                            <AlertTriangle className="size-3.5" />
                          </div>
                          <div className="min-w-0">
                            <strong className="truncate text-xs font-semibold text-foreground">
                              {alert.title}
                            </strong>
                            <small className="truncate text-[10px] text-muted-foreground">
                              {alert.detail}
                            </small>
                          </div>
                        </div>
                        <Badge
                          variant={isCritical ? "destructive" : "secondary"}
                          className={`text-[10px] shrink-0 font-medium ${
                            !isCritical
                              ? "bg-warning/15 text-warning border-warning/30"
                              : ""
                          }`}
                        >
                          {alert.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Collection Status Card */}
          <CollectionChart collection={data.collection} />
        </div>
      </section>

      {/* Bottom Row: Highest Energy Producing Schools Today */}
      <section className="mt-4">
        <RankingChart sites={data.rankings} />
      </section>
    </main>
  );
}
