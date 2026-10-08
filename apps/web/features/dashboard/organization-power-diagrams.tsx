"use client";
import { useScopedPowerFlow } from "./use-scoped-power-flow";
import {
  generationTotal,
  isFreshGeneration,
  type GenerationSite,
} from "./generation-readings";
import { SolarPowerDiagramView } from "./solar-power-diagram-view";
export function OrganizationPowerDiagrams({
  locale,
  siteId,
}: {
  locale: "th" | "en";
  siteId?: string | undefined;
}) {
  const { sites, error, now } = useScopedPowerFlow<GenerationSite>(siteId);
  return (
    <OrganizationPowerDiagramsView
      locale={locale}
      sites={sites}
      error={error}
      now={now}
    />
  );
}
export function OrganizationPowerDiagramsView({
  locale,
  sites,
  error,
  now,
}: {
  locale: "th" | "en";
  sites: GenerationSite[] | null;
  error: boolean;
  now: number;
}) {
  const text = (th: string, en: string) => (locale === "th" ? th : en);
  return (
    <section
      className="space-y-4"
      aria-label={text("พลังงานแต่ละไซต์งาน", "Power by site")}
    >
      <article className="rounded-xl border bg-card p-4">
        <h2 className="text-sm text-muted-foreground">
          {text(
            "กำลังผลิตโซลาร์รวมที่วัดได้",
            "Measured aggregate solar power",
          )}
        </h2>
        <p className="mt-2 text-2xl font-semibold">
          {generationTotal(sites, now)?.toLocaleString(locale, {
            maximumFractionDigits: 2,
          }) ?? text("ยังไม่มีข้อมูล", "Unavailable")}{" "}
          <span className="text-xs font-normal">kW</span>
        </p>
      </article>
      {error ? (
        <p role="alert">
          {text("โหลดข้อมูลพลังงานไม่สำเร็จ", "Unable to load power data")}
        </p>
      ) : !sites ? (
        <p role="status">
          {text("รอข้อมูลวัดล่าสุด", "Waiting for the latest measured power")}
        </p>
      ) : sites.length === 0 ? (
        <p>{text("ยังไม่มีข้อมูลไซต์งาน", "No site readings available")}</p>
      ) : (
        sites.map((site) => (
          <article key={site.siteId} className="rounded-xl border bg-card p-4">
            <h2 className="font-semibold">{site.siteName}</h2>
            <SolarPowerDiagramView
              locale={locale}
              measurements={{
                generationKw: isFreshGeneration(site, now)
                  ? site.generationKw
                  : null,
                buildingLoadKw: null,
                solarToBuildingKw: null,
                gridImportKw: null,
                gridExportKw: null,
              }}
            />
          </article>
        ))
      )}
    </section>
  );
}
