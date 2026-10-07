import { dashboardLayout } from "./dashboard-layout";
import { DashboardScope } from "./site-selection-provider";
import { SolarGenerationDiagram } from "./solar-generation-diagram";
import {DashboardAlertsCard} from "./dashboard-alerts-card";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  DashboardSummaryResponse,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { CollectionChart } from "./collection-chart";
import { CompareModal } from "./compare-modal";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";
import { DashboardStatsClient } from "./dashboard-stats-client";
import { PeriodPicker } from "./period-picker";
import { PowerFlowCard } from "./power-flow-card";
import { ProductionChart } from "./production-chart";

import { RevenueChart } from "./revenue-chart";
import { SiteFilter } from "./site-filter";
import { SiteMap } from "./site-map";
import { GatewayStatusSummary } from "./gateway-status-summary";
import { SummaryStatus } from "./summary-status";
import { BusinessDashboard } from "./business-dashboard";
import { requirePageAccess } from "../../lib/session-user";
import type { SchoolInvoice } from "./school-dashboard";

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
  const user = await requirePageAccess("/");
  const cookieStore = await cookies();
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";
  const t = createTranslator(locale);

  const resolvedParams = searchParams ? await searchParams : undefined;
  const data = await getDashboardData(
    resolvedParams?.start_date,
    resolvedParams?.end_date,
    resolvedParams?.month,
    resolvedParams?.year,
    user.role === "school_user" ? undefined : resolvedParams?.site_id,
  );

  if (user.role === "school_user") {
    const parts = new Intl.DateTimeFormat("en", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const part = (type:string) => parts.find(value=>value.type===type)?.value;
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const monthStart = `${part("year")}-${part("month")}-01`;
    const [daily, monthly, billResponse] = await Promise.all([
      data.range.start===today&&data.range.end===today ? Promise.resolve(data) : getDashboardData(today,today),
      data.range.start===monthStart&&data.range.end===today ? Promise.resolve(data) : getDashboardData(monthStart,today),
      serverFetch(`${getApiBaseUrl()}/v1/operations/billing?limit=1&sort=period&direction=desc`,{cache:"no-store"}),
    ]);
    if(billResponse.status===401) redirect("/login");
    const bills = billResponse.ok ? await billResponse.json() as {rows:SchoolInvoice[]} : null;
    return <><DashboardAutoRefresh/><BusinessDashboard data={data} role={user.role} locale={locale} todayKwh={daily.energyReadModel?.status==='preparing'?null:daily.stats.periodKwh} monthKwh={monthly.energyReadModel?.status==='preparing'?null:monthly.stats.periodKwh} invoice={bills?.rows[0] ?? null} billingUnavailable={!billResponse.ok} periodControl={<PeriodPicker/>}/></>;
  }

  const presentation=dashboardLayout(user.role);
  const alerts = data.alerts || [];

  return (
    <div className="content dashboard-content w-full min-w-0 max-w-full overflow-x-hidden space-y-4">
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

      {/* Summary Stat Cards (Customizable) */}
      <DashboardScope siteId={resolvedParams?.site_id}>
      <DashboardStatsClient role={user.role} stats={data.stats} totalSites={data.sites?.length} />
      <SummaryStatus model={data.energyReadModel} locale={locale} />
      </DashboardScope>



      {/* 3-Column Main Dashboard Grid */}
      <section className="dashboard-main-grid w-full min-w-0 max-w-full">
        {/* Left Column: All Schools Map */}
        <SiteMap sites={data.sites || []} availableSites={data.availableMapSites} dataSiteId={resolvedParams?.site_id} />

        {/* Center Column: Production Chart & Revenue Chart */}
        <div className="dashboard-chart-grid w-full min-w-0 max-w-full">
          <DashboardScope siteId={resolvedParams?.site_id} className="dashboard-energy">
          <ProductionChart
            initialData={data.production}
            hasCustomRange={Boolean(
              resolvedParams?.start_date && resolvedParams?.end_date
            )}
            startDate={data.range.start}
            endDate={data.range.end}
          />
          </DashboardScope>
          <DashboardScope siteId={resolvedParams?.site_id} className="dashboard-revenue">
          <RevenueChart
            initialData={data.revenue}
            hasCustomRange={Boolean(
              resolvedParams?.start_date && resolvedParams?.end_date
            )}
            startDate={data.range.start}
            endDate={data.range.end}
          />
          </DashboardScope>
          <DashboardScope siteId={resolvedParams?.site_id} className="dashboard-collection">
          <CollectionChart collection={data.collection} startDate={data.range.start} endDate={data.range.end} />
          </DashboardScope>
        </div>
      </section>

      {/* Live Power Flow Diagram & System Overview */}
      <DashboardScope siteId={resolvedParams?.site_id} className="mb-4 w-full min-w-0">
        <SolarGenerationDiagram key={`solar-${resolvedParams?.site_id||'all'}`} locale={locale} siteId={resolvedParams?.site_id} />
        {presentation.meteredPower && <PowerFlowCard key={`meter-${resolvedParams?.site_id||'all'}`} siteId={resolvedParams?.site_id} summaryMw={data.stats.currentMw}/>}
      </DashboardScope>

      <DashboardScope siteId={resolvedParams?.site_id} className={`grid grid-cols-1 items-stretch gap-4 ${presentation.gateway?"lg:grid-cols-2":""}`}>
          <DashboardAlertsCard alerts={alerts} role={user.role} locale={locale}/>


      {presentation.gateway && <GatewayStatusSummary sites={data.sites || []} locale={locale} />}
      </DashboardScope>
    </div>
  );
}
