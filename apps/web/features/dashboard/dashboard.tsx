import { dashboardLayout } from "./dashboard-layout";
import { DashboardScope } from "./site-selection-provider";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type {
  DashboardSummaryResponse,
} from "@solar/api-contracts";
import { createTranslator, type Locale } from "@solar/i18n";
import { serverFetch, getApiBaseUrl } from "../../lib/server-fetch";
import { DeferredCompareModal } from "./deferred-compare-modal";
import { DashboardAutoRefresh } from "./dashboard-auto-refresh";
import { DashboardStatsClient } from "./dashboard-stats-client";
import { SelectedSiteSummary } from "./selected-site-summary";
import { PeriodPicker } from "./period-picker";
import { SiteFilter } from "./site-filter";
import { SummaryStatus } from "./summary-status";
import { DeferredDashboardDetails } from "./deferred-dashboard-details";
import { requirePageAccess } from "../../lib/session-user";
import { CustomerHomePage } from "../customer/home/customer-home-page";
import { loadCustomerHomeServer } from "../customer/api/customer-portal-server-api";

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
  const resolvedParams = searchParams ? await searchParams : undefined;
  const [user,cookieStore] = await Promise.all([
    requirePageAccess("/"),
    cookies(),
  ]);
  const locale = (cookieStore.get("locale")?.value as Locale) || "th";
  const t = createTranslator(locale);

  if (user.role === "customer_user") {
    return <CustomerHomePage initial={await loadCustomerHomeServer()} locale={locale}/>;
  }

  const data = await getDashboardData(
    resolvedParams?.start_date,
    resolvedParams?.end_date,
    resolvedParams?.month,
    resolvedParams?.year,
    resolvedParams?.site_id,
  );

  const presentation=dashboardLayout(user.role);
  const selectedSite=resolvedParams?.site_id?data.sites.find(site=>site.id===resolvedParams.site_id):undefined;

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
          <DeferredCompareModal sites={data.availableSites} startDate={data.range.start} endDate={data.range.end} />
          <PeriodPicker />
        </div>
      </div>

      {/* Summary Stat Cards (Customizable) */}
      <DashboardScope siteId={resolvedParams?.site_id}>
      {selectedSite?<SelectedSiteSummary site={selectedSite} detail={data.selectedSite} locale={locale} showTechnical={user.role==='owner'||user.role==='admin'||user.role==='operator'}/>:<DashboardStatsClient role={user.role} stats={data.stats} totalSites={data.sites?.length} />}
      <SummaryStatus model={data.energyReadModel} locale={locale} />
      </DashboardScope>

      <DeferredDashboardDetails
        data={data}
        siteId={resolvedParams?.site_id}
        role={user.role}
        locale={locale}
        hasCustomRange={Boolean(resolvedParams?.start_date && resolvedParams?.end_date)}
        showMeteredPower={presentation.meteredPower}
        showGateway={presentation.gateway}
      />
    </div>
  );
}
