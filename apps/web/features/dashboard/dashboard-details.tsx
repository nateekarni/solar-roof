"use client";

import type { DashboardSummaryResponse } from "@solar/api-contracts";
import type { Locale } from "@solar/i18n";
import { AgingCard } from "./aging-card";
import { CollectionChart } from "./collection-chart";
import { DashboardAlertsCard } from "./dashboard-alerts-card";
import { DashboardScope } from "./site-selection-provider";
import { DeferredSiteMap } from "./deferred-site-map";
import { GatewayStatusSummary } from "./gateway-status-summary";
import { PowerFlowCard } from "./power-flow-card";
import { ProductionChart } from "./production-chart";
import { SolarGenerationDiagram } from "./solar-generation-diagram";

export function DashboardDetails({
  data,
  siteId,
  role,
  locale,
  hasCustomRange,
  showMeteredPower,
  showGateway,
}: {
  data: DashboardSummaryResponse;
  siteId?: string | undefined;
  role: string;
  locale: Locale;
  hasCustomRange: boolean;
  showMeteredPower: boolean;
  showGateway: boolean;
}) {
  return (
    <>
      <section className="dashboard-main-grid w-full min-w-0 max-w-full">
        <DeferredSiteMap
          sites={data.sites || []}
          availableSites={data.availableMapSites}
          dataSiteId={siteId}
        />
        <div className="dashboard-chart-grid w-full min-w-0 max-w-full">
          <DashboardScope siteId={siteId} className="dashboard-energy">
            <ProductionChart
              initialData={data.production}
              hasCustomRange={hasCustomRange}
              startDate={data.range.start}
              endDate={data.range.end}
            />
          </DashboardScope>
          <DashboardScope siteId={siteId} className="dashboard-revenue">
            <AgingCard
              insights={data.financialInsights}
              locale={locale}
              startDate={data.range.start}
              endDate={data.range.end}
            />
          </DashboardScope>
          <DashboardScope siteId={siteId} className="dashboard-collection">
            <CollectionChart
              siteId={siteId}
              collection={data.collection}
              startDate={data.range.start}
              endDate={data.range.end}
            />
          </DashboardScope>
        </div>
      </section>

      <DashboardScope siteId={siteId} className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
        <SolarGenerationDiagram key={`solar-${siteId || "all"}`} locale={locale} siteId={siteId} />
        <DashboardAlertsCard alerts={data.alerts || []} role={role} locale={locale} />
      </DashboardScope>
      <DashboardScope siteId={siteId} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {showMeteredPower ? (
          <PowerFlowCard key={`meter-${siteId || "all"}`} siteId={siteId} summaryMw={data.stats.currentMw} />
        ) : null}
        {showGateway ? <GatewayStatusSummary sites={data.sites || []} locale={locale} /> : null}
      </DashboardScope>
    </>
  );
}
